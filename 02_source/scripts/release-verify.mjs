#!/usr/bin/env node
/**
 * Release verification (`npm run release:verify`, P025 T014, spec v1.1.0).
 *
 * Independently re-checks everything release:build produced, from
 * the artifacts on disk and the frozen commit — it never trusts the
 * manifest's word for a hash or a count. The working-tree check
 * excludes release/, so a post-freeze re-run passes:
 *
 *   1. release/ holds source.zip, dist.zip, SHA256SUMS.txt,
 *      RELEASE_MANIFEST.json, SOURCE_MANIFEST.csv.
 *   2. The manifest parses; its frozen_commit exists in git; the
 *      manifest's recorded bytes/sha256 match the actual files;
 *      SHA256SUMS.txt matches too (`sha256sum -c`).
 *   3. `unzip -t` passes on both zips.
 *   4. source.zip parsed entry-by-entry (scripts/release-zip.mjs
 *      reader, CRC-verified): every file entry must match
 *      SOURCE_MANIFEST.csv (path, bytes, SHA-256) exactly — no
 *      missing, extra or altered file; directory entries must be
 *      exactly the parent dirs of the file list; no node_modules/,
 *      .git/ or release/ entry.
 *   5. SOURCE_MANIFEST.csv regenerated from the frozen commit
 *      must be byte-identical to the shipped one (the list really
 *      is the frozen commit's 02_source tree).
 *   6. dist.zip entries: the runtime set must be present with no
 *      unexpected entry; the LICENSE entry's SHA-256 must equal
 *      the canonical MIT hash, package.json must claim
 *      `"license": "MIT"`, and the README must mention MIT.
 *      R1-P2-02: bin/guidancepulse's zip entry mode must be 0755
 *      and every file entry's mode must be 0644 or 0755 (no
 *      group/other write bits), read from the central directory
 *      (scripts/release-zip.mjs readZipEntries), not from the
 *      filesystem after unzip.
 *   7. The frozen commit's S0 gate is PASS with the known
 *      canonical replay hash, the latest T013 review resolves and
 *      parses (FIX-R5: its verdict is recorded as-is — a FAIL
 *      verdict does not block verification), and the MIT LICENSE
 *      exists in the frozen tree with the canonical content hash.
 *   7b. S0 evidence binding (R1-P1-01): release/s0-evidence/
 *      S0_GATE.json must record environment.git_commit ===
 *      frozen_commit with verdict PASS, the known canonical
 *      replay hash and 0 full-test failures; every file listed in
 *      the manifest's s0_evidence block must exist under
 *      release/s0-evidence/ with matching bytes + SHA-256; the
 *      manifest's s0_evidence.generated_at_utc must equal the
 *      evidence gate's; SHA256SUMS.txt must cover every
 *      s0-evidence file.
 *   8. Clean-room rebuild: extract source.zip, install
 *      dependencies with a real `npm ci --offline
 *      --ignore-scripts` from the local npm cache (no network;
 *      same documented deviation as the build — see
 *      release-build.mjs), `npm run build`, CLI smoke (init →
 *      install → status → uninstall, foreign temp project, no
 *      NODE_PATH); the uninstall must remove `.build/`.
 *   9. dist.zip smoke run: extract dist.zip, run the same real
 *      `npm ci --offline --ignore-scripts`, run the same CLI
 *      smoke from the extracted dist/.
 *
 * Exit 0 only when every check passes.
 */

import { execFileSync, spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readZip, readZipEntries } from "./release-zip.mjs";
import {
  EXPECTED_CANONICAL_SHA256,
  EXPECTED_LICENSE_SHA256,
  fileListCsv,
  fileListFromCommit,
  latestT013ReviewFile,
  parseT013ReviewReport,
  MANIFEST_FILE,
  RELEASE_DIR,
  ROOT,
  REPO_ROOT,
  S0_EVIDENCE_DIR,
  S0_EVIDENCE_FILES,
  SOURCE_SUBTREE,
  sha256File,
  sha256Hex,
} from "./release-build.mjs";

const failures = [];
function note(line) {
  console.log(line);
}
function check(name, ok, detail = "") {
  note(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
  return ok;
}
function run(cmd, args, opts = {}) {
  const spawned = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  return { exitCode: spawned.status ?? 4, stdout: spawned.stdout ?? "", stderr: spawned.stderr ?? "" };
}
function git(args, opts = {}) {
  return run("git", args, { cwd: REPO_ROOT, ...opts });
}
function gitOut(args, opts = {}) {
  const r = git(args, opts);
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.slice(0, 200)}`);
  return r.stdout;
}

/**
 * CLI smoke: init → install → status → uninstall in a foreign temp
 * project, through the given launcher, with NODE_PATH removed.
 * (Duplicated from release-build.mjs on purpose: verify must not
 * depend on the build's helpers for its own evidence.)
 * Never throws on a spawn failure: a failed spawn yields status
 * null AND stderr null, so every stderr access is null-guarded.
 */
function cliSmoke(launcherAbs, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gp-verify-${tag}-`));
  try {
    const env = { ...process.env };
    delete env.NODE_PATH;
    const step = (args) =>
      spawnSync(launcherAbs, args, { cwd: dir, encoding: "utf8", timeout: 300000, env });
    const errText = (r) => (r.stderr ?? r.error?.message ?? "").toString().slice(0, 300);
    const init = step(["init", "--project", "."]);
    if (init.error) return { ok: false, detail: `init spawn failed: ${init.error.message}` };
    if (init.status !== 0) return { ok: false, detail: `init exit ${init.status}: ${errText(init)}` };
    const install = step(["install", "--project", "."]);
    if (install.error) return { ok: false, detail: `install spawn failed: ${install.error.message}` };
    if (install.status !== 0) return { ok: false, detail: `install exit ${install.status}: ${errText(install)}` };
    if (!/installed at/.test(install.stdout ?? "")) return { ok: false, detail: `install output lacks "installed at": ${(install.stdout ?? "").slice(0, 200)}` };
    const buildDir = path.join(dir, ".guidancepulse", "hooks", ".build");
    if (!fs.existsSync(path.join(buildDir, "node_modules", "yaml"))) {
      return { ok: false, detail: "install did not vendor yaml into .build/node_modules" };
    }
    const status = step(["status", "--project", "."]);
    if (status.error) return { ok: false, detail: `status spawn failed: ${status.error.message}` };
    if (status.status !== 0) return { ok: false, detail: `status exit ${status.status}: ${errText(status)}` };
    const uninstall = step(["uninstall", "--project", "."]);
    if (uninstall.error) return { ok: false, detail: `uninstall spawn failed: ${uninstall.error.message}` };
    if (uninstall.status !== 0) return { ok: false, detail: `uninstall exit ${uninstall.status}: ${errText(uninstall)}` };
    if (fs.existsSync(buildDir)) return { ok: false, detail: "uninstall left .build/ behind" };
    return { ok: true, detail: `init/install/status/uninstall exit 0 in ${dir}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  note("release:verify started");

  // 1. Presence.
  const needed = ["source.zip", "dist.zip", "SHA256SUMS.txt", "RELEASE_MANIFEST.json", "SOURCE_MANIFEST.csv"];
  for (const f of needed) {
    check(`release/${f} exists`, fs.existsSync(path.join(RELEASE_DIR, f)));
  }
  if (failures.length > 0) {
    console.error(`release:verify FAILED — ${failures.join("; ")}`);
    process.exit(1);
  }

  // 2. Manifest + hashes.
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    check("RELEASE_MANIFEST.json parses", true);
  } catch (err) {
    check("RELEASE_MANIFEST.json parses", false, err.message);
    process.exit(1);
  }
  const frozenCommit = manifest.frozen_commit;
  check(
    "manifest frozen_commit exists in git",
    typeof frozenCommit === "string" &&
      /^[0-9a-f]{40}$/.test(frozenCommit) &&
      git(["cat-file", "-t", frozenCommit]).stdout.trim() === "commit",
    String(frozenCommit),
  );
  const sourceZipPath = path.join(RELEASE_DIR, "source.zip");
  const distZipPath = path.join(RELEASE_DIR, "dist.zip");
  const csvPath = path.join(RELEASE_DIR, "SOURCE_MANIFEST.csv");
  const actualSource = { bytes: fs.statSync(sourceZipPath).size, sha256: sha256File(sourceZipPath) };
  const actualDist = { bytes: fs.statSync(distZipPath).size, sha256: sha256File(distZipPath) };
  const actualManifestSha = sha256File(MANIFEST_FILE);
  const actualCsvSha = sha256File(csvPath);
  check(
    "manifest source.zip bytes/sha256 match the file",
    manifest.source_zip?.bytes === actualSource.bytes && manifest.source_zip?.sha256 === actualSource.sha256,
    `manifest ${manifest.source_zip?.bytes} B ${String(manifest.source_zip?.sha256 ?? "").slice(0, 12)}… vs actual ${actualSource.bytes} B ${actualSource.sha256.slice(0, 12)}…`,
  );
  check(
    "manifest dist.zip bytes/sha256 match the file",
    manifest.dist_zip?.bytes === actualDist.bytes && manifest.dist_zip?.sha256 === actualDist.sha256,
    `manifest ${manifest.dist_zip?.bytes} B ${String(manifest.dist_zip?.sha256 ?? "").slice(0, 12)}… vs actual ${actualDist.bytes} B ${actualDist.sha256.slice(0, 12)}…`,
  );
  const sums = spawnSync("sha256sum", ["-c", "release/SHA256SUMS.txt"], { cwd: ROOT, encoding: "utf8" });
  check("sha256sum -c release/SHA256SUMS.txt", sums.status === 0, (sums.stdout ?? "").trim());
  const sumsText = fs.readFileSync(path.join(RELEASE_DIR, "SHA256SUMS.txt"), "utf8");
  check(
    "SHA256SUMS.txt covers source.zip, dist.zip, RELEASE_MANIFEST.json, SOURCE_MANIFEST.csv",
    ["source.zip", "dist.zip", "RELEASE_MANIFEST.json", "SOURCE_MANIFEST.csv"].every((f) => sumsText.includes(f)),
  );
  // R1-P1-01: SHA256SUMS must also cover every s0-evidence file the
  // manifest lists (checked in full against disk in section 7b).
  const evidenceNames = (manifest.s0_evidence?.files ?? []).map((f) => f.name);
  check(
    "SHA256SUMS.txt covers every manifest s0_evidence file",
    evidenceNames.length === S0_EVIDENCE_FILES.length &&
      evidenceNames.every((n) => sumsText.includes(`release/s0-evidence/${n}`)),
    `${evidenceNames.length} files listed`,
  );

  // 3. unzip -t.
  const testSource = run("unzip", ["-t", sourceZipPath]);
  check("unzip -t release/source.zip", testSource.exitCode === 0, testSource.stdout.split("\n").slice(-2).join(" "));
  const testDist = run("unzip", ["-t", distZipPath]);
  check("unzip -t release/dist.zip", testDist.exitCode === 0, testDist.stdout.split("\n").slice(-2).join(" "));

  // 4. source.zip entry-by-entry vs SOURCE_MANIFEST.csv.
  let sourceEntries;
  try {
    sourceEntries = readZip(fs.readFileSync(sourceZipPath));
    check("source.zip parses (CRC-verified)", true, `${sourceEntries.size} entries`);
  } catch (err) {
    check("source.zip parses (CRC-verified)", false, err.message);
    sourceEntries = new Map();
  }
  const csvLines = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  check("SOURCE_MANIFEST.csv has a header + one row per file", csvLines[0] === "path,bytes,sha256,git_blob_sha" && csvLines.length > 1, `${csvLines.length - 1} rows`);
  const csvRows = csvLines.slice(1).map((line) => {
    const [p, bytes, sha, blob] = line.split(",");
    return { path: p, bytes: Number(bytes), sha256: sha, blob };
  });
  check(
    "manifest source_zip.file_count matches SOURCE_MANIFEST.csv rows",
    manifest.source_zip?.file_count === csvRows.length,
    `manifest ${manifest.source_zip?.file_count} vs csv ${csvRows.length}`,
  );
  const csvPaths = new Set(csvRows.map((r) => r.path));
  const zipFileEntries = [...sourceEntries.entries()].filter(([p]) => !p.endsWith("/"));
  const zipDirEntries = [...sourceEntries.keys()].filter((p) => p.endsWith("/"));
  const missing = csvRows.filter((r) => !sourceEntries.has(r.path));
  const extra = zipFileEntries.filter(([p]) => !csvPaths.has(p));
  check("every manifest file is in source.zip (no missing)", missing.length === 0, missing.map((r) => r.path).join("; "));
  check("no extra file in source.zip", extra.length === 0, extra.map(([p]) => p).join("; "));
  const altered = csvRows.filter((r) => {
    const data = sourceEntries.get(r.path);
    return data !== undefined && (data.length !== r.bytes || sha256Hex(data) !== r.sha256);
  });
  check("every source.zip file matches manifest bytes + sha256", altered.length === 0, altered.map((r) => r.path).join("; "));
  const expectedDirs = new Set();
  for (const r of csvRows) {
    const parts = r.path.split("/");
    for (let i = 1; i < parts.length - 1; i += 1) expectedDirs.add(`${parts.slice(0, i + 1).join("/")}/`);
  }
  const dirMismatch = [...expectedDirs].filter((d) => !sourceEntries.has(d)).concat(zipDirEntries.filter((d) => !expectedDirs.has(d)));
  check("source.zip directory entries are exactly the manifest parents", dirMismatch.length === 0, dirMismatch.join("; "));
  const forbiddenZip = [...sourceEntries.keys()].filter((p) => /(^|\/)node_modules\/|(^|\/)\.git\/|(^|\/)release\//.test(p));
  check("no node_modules/.git/release entry in source.zip", forbiddenZip.length === 0, forbiddenZip.join("; "));

  // 5. SOURCE_MANIFEST.csv regenerated from the frozen commit.
  try {
    const regen = fileListFromCommit(frozenCommit);
    const regenCsv = fileListCsv(regen);
    const shippedCsv = fs.readFileSync(csvPath, "utf8");
    check("SOURCE_MANIFEST.csv regenerated from frozen commit is byte-identical", regenCsv === shippedCsv, `${regen.length} files`);
  } catch (err) {
    check("SOURCE_MANIFEST.csv regenerated from frozen commit", false, err.message);
  }

  // 6. dist.zip entries.
  let distEntries;
  let distZipEntries = [];
  try {
    distZipEntries = readZipEntries(fs.readFileSync(distZipPath));
    distEntries = new Map(distZipEntries.map((e) => [e.path, e.data]));
    check("dist.zip parses (CRC-verified)", true, `${distEntries.size} entries`);
  } catch (err) {
    check("dist.zip parses (CRC-verified)", false, err.message);
    distEntries = new Map();
  }
  check(
    "manifest dist_zip.entry_count matches dist.zip entries",
    manifest.dist_zip?.entry_count === distEntries.size,
    `manifest ${manifest.dist_zip?.entry_count} vs zip ${distEntries.size}`,
  );
  const mustHave = [
    "package.json",
    "package-lock.json",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "guidancepulse.example.yaml",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "dist/index.html",
    "bin/guidancepulse",
    "src/cli/main.ts",
    "scripts/hook-entry.ts",
  ];
  check(
    "dist.zip contains the runtime set",
    mustHave.every((f) => distEntries.has(f)) &&
      [...distEntries.keys()].some((p) => p.startsWith("schemas/")) &&
      [...distEntries.keys()].some((p) => p.startsWith("docs/")),
    mustHave.filter((f) => !distEntries.has(f)).join("; "),
  );
  const forbiddenDist = [...distEntries.keys()].filter((p) => /^(tests|artifacts|node_modules|release)\//.test(p));
  check("no tests/artifacts/node_modules/release in dist.zip", forbiddenDist.length === 0, forbiddenDist.join("; "));
  const distLicense = distEntries.get("LICENSE");
  check(
    "dist.zip LICENSE sha256 is the canonical MIT hash",
    distLicense !== undefined && sha256Hex(distLicense) === EXPECTED_LICENSE_SHA256,
    distLicense ? sha256Hex(distLicense) : "LICENSE entry missing",
  );
  try {
    const distPkg = JSON.parse(distEntries.get("package.json").toString("utf8"));
    check('dist package.json claims "license": "MIT"', distPkg.license === "MIT", `license ${distPkg.license}`);
  } catch (err) {
    check('dist package.json claims "license": "MIT"', false, err.message);
  }
  const distReadme = distEntries.get("README.md")?.toString("utf8") ?? "";
  check("dist README mentions MIT", /MIT/.test(distReadme));
  // R1-P2-02: entry modes from the zip central directory.
  const launcherEntry = distZipEntries.find((e) => e.path === "bin/guidancepulse");
  check(
    "dist.zip bin/guidancepulse mode is 0755",
    launcherEntry !== undefined && launcherEntry.mode === 0o100755,
    launcherEntry ? `mode ${launcherEntry.mode?.toString(8) ?? "none"}` : "launcher entry missing",
  );
  const badModeEntries = distZipEntries.filter(
    (e) => !e.path.endsWith("/") && e.mode !== 0o100644 && e.mode !== 0o100755,
  );
  check(
    "dist.zip file entries are all 0644 or 0755 (no group/other write bits)",
    badModeEntries.length === 0,
    badModeEntries.map((e) => `${e.path}=${e.mode?.toString(8) ?? "none"}`).join("; "),
  );

  // 7. Frozen-commit gates (read from the commit, never the manifest).
  try {
    const gateJson = JSON.parse(gitOut(["show", `${frozenCommit}:02_source/artifacts/s0/S0_GATE.json`]));
    check("frozen S0 gate verdict PASS", gateJson.verdict === "PASS", `verdict ${gateJson.verdict}`);
    check(
      "frozen S0 canonical replay hash is the known value",
      gateJson.canonical_replay_sha256 === EXPECTED_CANONICAL_SHA256,
      gateJson.canonical_replay_sha256,
    );
    check(
      "frozen S0 full tests: 0 failed",
      gateJson.supporting_evidence?.test_full?.failed === 0,
      `${gateJson.supporting_evidence?.test_full?.passed} passed / ${gateJson.supporting_evidence?.test_full?.failed} failed`,
    );
  } catch (err) {
    check("read frozen S0 gate", false, err.message);
  }
  // 7b. S0 evidence binding (R1-P1-01): the evidence must come from
  // a run at the exact frozen commit, not from the in-tree gate
  // (which always records the previous commit).
  const s0Evidence = manifest.s0_evidence ?? null;
  check("manifest has an s0_evidence block", s0Evidence !== null);
  if (s0Evidence !== null) {
    check(
      "s0_evidence.frozen_commit matches the manifest frozen_commit",
      s0Evidence.frozen_commit === frozenCommit,
      String(s0Evidence.frozen_commit),
    );
    check(
      "s0_evidence.git_commit matches the frozen commit",
      s0Evidence.git_commit === frozenCommit,
      String(s0Evidence.git_commit),
    );
    let evidenceGate = null;
    try {
      evidenceGate = JSON.parse(fs.readFileSync(path.join(S0_EVIDENCE_DIR, "S0_GATE.json"), "utf8"));
      check("release/s0-evidence/S0_GATE.json parses", true);
    } catch (err) {
      check("release/s0-evidence/S0_GATE.json parses", false, err.message);
    }
    if (evidenceGate !== null) {
      check(
        "evidence S0_GATE environment.git_commit === frozen commit",
        evidenceGate.environment?.git_commit === frozenCommit,
        String(evidenceGate.environment?.git_commit),
      );
      check("evidence S0 gate verdict PASS", evidenceGate.verdict === "PASS", `verdict ${evidenceGate.verdict}`);
      check(
        "evidence S0 canonical replay hash is the known value",
        evidenceGate.canonical_replay_sha256 === EXPECTED_CANONICAL_SHA256,
        evidenceGate.canonical_replay_sha256,
      );
      check(
        "evidence S0 full tests: 0 failed",
        evidenceGate.supporting_evidence?.test_full?.failed === 0,
        `${evidenceGate.supporting_evidence?.test_full?.passed} passed / ${evidenceGate.supporting_evidence?.test_full?.failed} failed`,
      );
      check(
        "s0_evidence.generated_at_utc matches the evidence S0_GATE.json",
        s0Evidence.generated_at_utc === evidenceGate.generated_at_utc,
        String(s0Evidence.generated_at_utc),
      );
      // FIX-R2 (终审 R2 §六): the manifest's top-level s0_gate
      // must mirror the frozen evidence, not the in-tree gate
      // (which records the previous commit and used to disagree:
      // 213.76ms vs 301.09ms).
      const evidenceP95 = (evidenceGate.gates ?? []).find((g) => g.gate === "hook end-to-end p95")?.measured ?? null;
      const topGate = manifest.s0_gate ?? null;
      check(
        "manifest top-level s0_gate matches the frozen evidence (verdict/p95/canonical/generated_at_utc)",
        topGate !== null &&
          topGate.verdict === s0Evidence.verdict &&
          topGate.p95 === evidenceP95 &&
          topGate.canonical_replay_sha256 === s0Evidence.canonical_replay_sha256 &&
          topGate.generated_at_utc === s0Evidence.generated_at_utc,
        `s0_gate p95 ${topGate?.p95 ?? "missing"} vs evidence ${evidenceP95}`,
      );
      const evidenceFull = evidenceGate.supporting_evidence?.test_full ?? null;
      check(
        "manifest top-level s0_gate.full_tests matches the evidence S0_GATE.json",
        topGate !== null &&
          evidenceFull !== null &&
          topGate.full_tests?.passed === evidenceFull.passed &&
          topGate.full_tests?.failed === evidenceFull.failed &&
          topGate.full_tests?.files === evidenceFull.files,
        `s0_gate full_tests ${JSON.stringify(topGate?.full_tests ?? null)} vs evidence ${JSON.stringify(evidenceFull)}`,
      );
    }
    const listedNames = (s0Evidence.files ?? []).map((f) => f.name);
    check(
      "s0_evidence.files lists exactly the expected evidence files",
      listedNames.length === S0_EVIDENCE_FILES.length &&
        S0_EVIDENCE_FILES.every((n) => listedNames.includes(n)),
      listedNames.join("; "),
    );
    const evidenceMismatch = [];
    for (const f of s0Evidence.files ?? []) {
      const abs = path.join(S0_EVIDENCE_DIR, f.name);
      if (!fs.existsSync(abs)) {
        evidenceMismatch.push(`${f.name} (missing)`);
        continue;
      }
      const data = fs.readFileSync(abs);
      if (data.length !== f.bytes || sha256Hex(data) !== f.sha256) {
        evidenceMismatch.push(`${f.name} (bytes/sha256 mismatch)`);
      }
    }
    check(
      "every s0_evidence file exists with matching bytes + sha256",
      evidenceMismatch.length === 0,
      evidenceMismatch.join("; "),
    );
    const sumsMissing = (s0Evidence.files ?? []).filter((f) => !sumsText.includes(`release/s0-evidence/${f.name}`));
    check(
      "SHA256SUMS.txt covers every s0_evidence file",
      sumsMissing.length === 0,
      sumsMissing.map((f) => f.name).join("; "),
    );
  }
  try {
    // FIX-R5 (R5-P2-03): resolve the latest T013 review from the
    // repo's reviews/ directory on disk — the review corpus lives
    // outside 02_source and is not part of the frozen artifacts,
    // and the frozen commit predates the latest review. A FAIL
    // verdict is recorded faithfully and must NOT block
    // verification; the only failures here are a missing review
    // file or an unparsable report. The manifest's review block is
    // NOT cross-checked against the latest report here: it is
    // rewritten at the next re-freeze (release:build), so it may
    // still cite an earlier round until then (noted below).
    const reviewFiles = fs.readdirSync(path.join(REPO_ROOT, "reviews")).map((n) => `reviews/${n}`);
    const latest = latestT013ReviewFile(reviewFiles);
    if (latest === null) throw new Error("no reviews/T013_FINAL_REVIEW_R*.md file found");
    const parsed = parseT013ReviewReport(fs.readFileSync(path.join(REPO_ROOT, latest.file), "utf8"));
    check(`latest T013 review (R${latest.round}) resolves`, true, latest.file);
    check(
      `latest T013 review (R${latest.round}) verdict parses`,
      parsed.verdict === "PASS" || parsed.verdict === "FAIL",
      `verdict ${parsed.verdict}`,
    );
    check(
      `latest T013 review (R${latest.round}) P0/P1/P2 counts parse`,
      true,
      `P0=${parsed.p0} P1=${parsed.p1} P2=${parsed.p2}`,
    );
    note(
      `latest T013 review: R${latest.round} ${parsed.verdict}, P0=${parsed.p0} P1=${parsed.p1} P2=${parsed.p2}, reviewed commit ${parsed.reviewedCommit ?? "not stated"} (recorded as-is; FAIL does not block verification)`,
    );
    if (manifest.review?.file && manifest.review.file !== latest.file) {
      note(
        `manifest review block still cites ${manifest.review.file} (verdict ${manifest.review.verdict ?? "unknown"}); it will be updated to ${latest.file} at the next re-freeze`,
      );
    } else if (!manifest.review?.file) {
      note(
        `manifest review block predates FIX-R5 (no file field; cites ${manifest.review?.task ?? "unknown"}); it will be updated to ${latest.file} at the next re-freeze`,
      );
    }
  } catch (err) {
    check("read latest T013 review", false, err.message);
  }
  try {
    const content = execFileSync("git", ["show", `${frozenCommit}:02_source/LICENSE`], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
    check("frozen MIT LICENSE content hash is canonical", sha256Hex(content) === EXPECTED_LICENSE_SHA256);
  } catch {
    check("frozen MIT LICENSE content hash is canonical", false, "LICENSE not readable from frozen commit");
  }
  const treeNames = gitOut(["ls-tree", "-r", "--name-only", frozenCommit, "--", SOURCE_SUBTREE])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  check(
    "release scripts exist in frozen commit",
    ["02_source/scripts/release-build.mjs", "02_source/scripts/release-verify.mjs", "02_source/scripts/release-zip.mjs"].every((f) =>
      treeNames.includes(f),
    ),
  );
  const diff = git(["diff", "--quiet", frozenCommit, "--", ".", ":!02_source/release"]);
  check("working tree matches frozen commit (except release/)", diff.exitCode === 0);

  // 8+9. Clean-room rebuild + both smokes.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "guidancepulse-verify-"));
  try {
    const cleanDir = path.join(work, "clean");
    fs.mkdirSync(cleanDir, { recursive: true });
    const extract = run("unzip", ["-q", sourceZipPath, "-d", cleanDir]);
    check("extract source.zip to clean dir", extract.exitCode === 0, extract.stderr.slice(0, 300));
    const cleanRoot = path.join(cleanDir, "guidancepulse");
    // Real offline install from the local npm cache (R1-P2-03) —
    // no symlink to the repo's node_modules, no silent fallback.
    const cleanCi = run("npm", ["ci", "--offline", "--ignore-scripts"], { cwd: cleanRoot });
    check("clean-room npm ci --offline (independent install from local cache)", cleanCi.exitCode === 0, cleanCi.stderr.slice(0, 300));
    check(
      "clean-room node_modules is a real directory (not a symlink to the repo)",
      fs.existsSync(path.join(cleanRoot, "node_modules")) &&
        !fs.lstatSync(path.join(cleanRoot, "node_modules")).isSymbolicLink(),
    );
    const cleanBuild = run("npm", ["run", "build"], { cwd: cleanRoot });
    check("clean-room npm run build (independent node_modules)", cleanBuild.exitCode === 0, cleanBuild.stderr.slice(0, 300));
    const cleanSmoke = cliSmoke(path.join(cleanRoot, "bin", "guidancepulse"), "clean");
    check("clean-room CLI smoke (init/install/status/uninstall, foreign project)", cleanSmoke.ok, cleanSmoke.detail);
    note(`clean-room smoke: ${cleanSmoke.detail}`);

    const distDir = path.join(work, "dist-test");
    fs.mkdirSync(distDir, { recursive: true });
    const distExtract = run("unzip", ["-q", distZipPath, "-d", distDir]);
    check("extract dist.zip to temp dir", distExtract.exitCode === 0, distExtract.stderr.slice(0, 300));
    const distCi = run("npm", ["ci", "--offline", "--ignore-scripts"], { cwd: distDir });
    check("dist.zip npm ci --offline (independent install from local cache)", distCi.exitCode === 0, distCi.stderr.slice(0, 300));
    check(
      "dist node_modules is a real directory (not a symlink to the repo)",
      fs.existsSync(path.join(distDir, "node_modules")) &&
        !fs.lstatSync(path.join(distDir, "node_modules")).isSymbolicLink(),
    );
    const distSmoke = cliSmoke(path.join(distDir, "bin", "guidancepulse"), "dist");
    check("dist.zip CLI smoke (init/install/status/uninstall, foreign project)", distSmoke.ok, distSmoke.detail);
    note(`dist smoke: ${distSmoke.detail}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  note(`release:verify ${failures.length === 0 ? "PASS" : "FAIL"} — frozen ${frozenCommit}`);
  if (failures.length > 0) {
    console.error(`release:verify FAILED — ${failures.join("; ")}`);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`release:verify FAILED with exception: ${err.message}`);
    process.exit(1);
  }
}
