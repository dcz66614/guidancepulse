#!/usr/bin/env node
/**
 * Formal freeze (`npm run release:build`, P025 T014, spec v1.1.0).
 *
 * Freezes the frozen commit's source (the `02_source/` subtree) +
 * runnable distribution:
 *
 *   1. Resolves the frozen commit. The freeze is PINNED by the
 *      manifest: if release/RELEASE_MANIFEST.json already exists
 *      and names a commit that exists in this repo, that commit is
 *      re-frozen (re-running the build regenerates byte-identical
 *      artifacts); otherwise the frozen commit is HEAD. The pin
 *      exists so a later release commit (which adds release/ itself
 *      to the tree) can never make the archive swallow the previous
 *      release artifacts into source.zip.
 *      A commit cannot contain its own hash, so the manifest names
 *      the frozen (source) commit and the release artifacts +
 *      freeze report are committed ON TOP of it (P023 T014
 *      convention). `release:verify` checks the pinned commit's
 *      tree against source.zip, never HEAD.
 *   2. The tracked tree must be clean, and the working tree must
 *      match the frozen commit everywhere except release/.
 *      Nothing uncommitted is ever packaged.
 *   3. `git archive <frozen> -- 02_source` (tar) → deterministic
 *      STORE zip (scripts/release-zip.mjs: fixed 1980-01-01
 *      timestamps, sorted entries, Unix modes from git preserved
 *      so bin/guidancepulse stays +x after extraction) with prefix
 *      `guidancepulse/` → release/source.zip. The frozen commit must carry S0 gate
 *      PASS with the known canonical replay hash, the latest T013
 *      final re-review resolvable + parsable from the frozen commit
 *      (FIX-R5: its verdict — PASS or FAIL — is recorded as-is in
 *      the manifest and never blocks a re-freeze), and the MIT LICENSE (Sam decided
 *      2026-11-13 that ALL project licenses are MIT; the LICENSE
 *      content hash is pinned below and must match the canonical
 *      text, byte-identical to P021/P023). No symlinks may exist
 *      in the frozen 02_source tree (none do; the build fails if
 *      one appears, instead of silently flattening it).
 *   4. Fresh `npm run build` → deterministic STORE dist.zip
 *      containing the runnable distribution: package.json,
 *      package-lock.json, README.md, LICENSE,
 *      THIRD_PARTY_NOTICES.md, guidancepulse.example.yaml,
 *      index.html, vite.config.ts, tsconfig.json at the root, the
 *      whole dist/ tree (vite UI build), bin/ (CLI launcher),
 *      src/ (TypeScript CLI + hooks, run via vite-node),
 *      scripts/hook-entry.ts (the hook build compiles it with
 *      tsc), schemas/ and docs/. No tests/, artifacts/,
 *      node_modules/ or release/. After `npm ci` the zip runs on
 *      its own (smoke-tested below).
 *   5. S0 evidence bound to the exact frozen commit (R1-P1-01):
 *      the in-tree S0_GATE.json can never record the frozen commit
 *      itself — a commit cannot contain its own hash, so its
 *      environment.git_commit is always the previous commit. The
 *      build therefore opens a clean detached git worktree at the
 *      frozen commit (temp dir under $TMPDIR — point TMPDIR at a
 *      persistent disk, not /tmp, which this VM clears on
 *      restart), links the repo node_modules into it (same
 *      no-network deviation as the clean-room), runs the full
 *      `npm run s0:gate` there (retried on Vitest worker RPC
 *      flakiness, F-29), and requires verdict PASS with
 *      environment.git_commit === frozen commit. The worktree's
 *      evidence (S0_GATE.json/.md, fixture/oracle/perf-hook/
 *      repeat-hashes/privacy/network scans, logs/s0-gate.log) is
 *      copied to release/s0-evidence/, hashed into
 *      RELEASE_MANIFEST.json's `s0_evidence` block, and covered
 *      by SHA256SUMS.txt. The manifest also records the verbatim
 *      `git diff --stat` / `--name-only` from the in-tree S0
 *      gate's commit to the frozen commit as diff proof.
 *      Determinism note: a re-run re-executes S0, so
 *      s0_evidence.generated_at_utc, the evidence file hashes and
 *      the evidence-dependent manifest/SHA256SUMS lines change
 *      per run; everything else in the manifest keeps the old
 *      determinism contract, and source.zip/dist.zip stay
 *      byte-identical for the same frozen commit.
 *   6. Clean-room rebuild: extract source.zip to a temp dir,
 *      install dependencies with a real `npm ci --offline
 *      --ignore-scripts` from the local npm cache (no network is
 *      available or used; --ignore-scripts is kept as a harmless
 *      belt-and-braces flag — better-sqlite3@13.2.0 has no install
 *      script, so `npm ci` never triggers a node-gyp rebuild, and
 *      the package ships an N-API prebuilt binary in prebuilds/,
 *      which loads fine without scripts; the vite-node/vitest
 *      binaries are in node_modules/.bin),
 *      `npm run build` there, and run the CLI smoke (init →
 *      install → status → uninstall, foreign temp project, no
 *      NODE_PATH) through the extracted bin. The install must
 *      vendor the hook deps and the uninstall must remove
 *      `.build/` (F-27 behaviour).
 *   7. dist.zip smoke run: extract dist.zip to a temp dir, run the
 *      same real `npm ci --offline --ignore-scripts` there, and
 *      run the same CLI smoke from the extracted dist/ — the
 *      distributed build itself must run, not just the rebuilt
 *      one.
 *   8. release/SOURCE_MANIFEST.csv (every source.zip file: zip
 *      path, bytes, content SHA-256, git blob SHA) and
 *      release/RELEASE_MANIFEST.json (fully deterministic given
 *      the frozen commit — the timestamp recorded is the frozen
 *      commit's committer date, never wall-clock time — except
 *      the s0_evidence block, which records the fresh S0 run's
 *      generated_at_utc and file hashes; see step 5). The
 *      manifest's top-level s0_gate block takes its
 *      verdict/p95/canonical/full-tests/generated_at_utc from
 *      that same frozen-evidence run (FIX-R2, 终审 R2 §六), not
 *      from the in-tree gate — the two must never disagree
 *      again; release-verify.mjs §7b checks the equality.
 *   9. release/SHA256SUMS.txt over source.zip, dist.zip,
 *      RELEASE_MANIFEST.json, SOURCE_MANIFEST.csv and every file
 *      under release/s0-evidence/ (entries prefixed `release/`,
 *      so `sha256sum -c release/SHA256SUMS.txt` runs from the
 *      02_source root); `unzip -t` on both zips.
 *
 * This script writes release/ only. The freeze report
 * (release/T014_FREEZE_REPORT.md) is written separately and
 * committed together with release/ afterwards. Exit 0 only when
 * every check passes.
 */

import { execFileSync, spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readZipEntries, writeZip } from "./release-zip.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(ROOT, "..");
export const RELEASE_DIR = path.join(ROOT, "release");
export const MANIFEST_FILE = path.join(RELEASE_DIR, "RELEASE_MANIFEST.json");
export const SOURCE_PREFIX = "guidancepulse/";
export const SOURCE_SUBTREE = "02_source";
// Canonical replay SHA-256 (100 runs, one hash) — stable across
// every S0 PASS run of this spec version (IMPLEMENTATION_PLAN §8.4).
export const EXPECTED_CANONICAL_SHA256 =
  "ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50";
// Canonical MIT LICENSE text (Copyright (c) 2026 dcz66614),
// byte-identical to P021/P023's LICENSE.
export const EXPECTED_LICENSE_SHA256 =
  "50b8b302ffcb53aec1866ad4b94721c200400e6aac8cee12db03b85f24e39ed2";

// S0 evidence files (R1-P1-01), relative to artifacts/s0/ in the
// S0 worktree and to release/s0-evidence/ in the release dir.
export const S0_EVIDENCE_FILES = [
  "S0_GATE.json",
  "S0_GATE.md",
  "fixture-results.json",
  "oracle-results.json",
  "perf-hook.json",
  "repeat-hashes.json",
  "privacy-scan.json",
  "network-scan.json",
  "logs/s0-gate.log",
];
export const S0_EVIDENCE_DIR = path.join(RELEASE_DIR, "s0-evidence");
// Vitest worker RPC flakiness (F-29) is still OPEN: a failed S0 run
// is retried this many times before the build fails. 3 proved too
// few when another S0 run overlaps on this 4-CPU VM (three
// consecutive attempts all died in `npm test` with 393 passed / 0
// failed but exit 1); 5 gives the flake room to clear without
// weakening the gate — the verdict must still be PASS.
export const S0_EVIDENCE_MAX_ATTEMPTS = 5;

/**
 * Run the full S0 gate in a clean detached git worktree at exactly
 * the frozen commit, and copy its evidence into release/s0-evidence/.
 * Returns the manifest `s0_evidence` block. Throws on any failure:
 * worktree setup, a non-PASS verdict after all retries, a gate whose
 * environment.git_commit is not the frozen commit, or a missing
 * evidence file. The worktree is always removed afterwards.
 *
 * The repo node_modules is symlinked into the worktree (S0 needs it;
 * same documented no-network deviation as the clean-room). $TMPDIR
 * (via os.tmpdir()) must point at a persistent disk for this step —
 * /tmp is cleared when this VM restarts.
 */
export function runFrozenS0Evidence(frozenCommit, inTreeGitCommit) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "guidancepulse-s0-evidence-"));
  const treeDir = path.join(base, "tree");
  const s0Root = path.join(treeDir, "02_source");
  try {
    const add = spawnSync("git", ["worktree", "add", "--detach", treeDir, frozenCommit], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (add.status !== 0) {
      throw new Error(`git worktree add --detach ${frozenCommit} failed: ${(add.stderr ?? "").slice(0, 300)}`);
    }
    note(`S0 evidence worktree at ${frozenCommit} in ${treeDir}`);
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(s0Root, "node_modules"), "dir");
    let lastErr = "";
    let gate = null;
    for (let attempt = 1; attempt <= S0_EVIDENCE_MAX_ATTEMPTS; attempt += 1) {
      note(`S0 evidence run, attempt ${attempt}/${S0_EVIDENCE_MAX_ATTEMPTS}`);
      const s0run = spawnSync("npm", ["run", "s0:gate"], {
        cwd: s0Root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (s0run.status === 0) {
        gate = JSON.parse(fs.readFileSync(path.join(s0Root, "artifacts", "s0", "S0_GATE.json"), "utf8"));
        break;
      }
      // Diagnose from the gate's own log, not from npm's (often
      // empty) stderr: the informative line is e.g. "npm test
      // exit=1 passed=393 failed=0". (stderr ?? stdout used to
      // print empty here because stderr is "" rather than null.)
      let detail = ((s0run.stderr || s0run.stdout || "").toString()).slice(-500);
      try {
        const gateLog = fs.readFileSync(path.join(s0Root, "artifacts", "s0", "logs", "s0-gate.log"), "utf8");
        const tail = gateLog.slice(-1200);
        if (tail.trim()) detail = `s0-gate.log tail: ${tail}`;
      } catch {
        // No gate log yet (failed before the gate started logging).
      }
      lastErr = `exit ${s0run.status}: ${detail}`;
      note(`S0 evidence run attempt ${attempt} failed — ${lastErr}`);
    }
    if (gate === null) {
      throw new Error(`npm run s0:gate failed ${S0_EVIDENCE_MAX_ATTEMPTS} time(s) in the frozen-commit worktree: ${lastErr}`);
    }
    if (gate.verdict !== "PASS") {
      throw new Error(`frozen-commit S0 verdict is ${gate.verdict}, not PASS`);
    }
    const evidenceCommit = gate.environment?.git_commit;
    if (evidenceCommit !== frozenCommit) {
      throw new Error(`evidence S0_GATE environment.git_commit ${evidenceCommit} !== frozen commit ${frozenCommit}`);
    }
    if (gate.canonical_replay_sha256 !== EXPECTED_CANONICAL_SHA256) {
      throw new Error(`evidence S0 canonical replay hash is not the known value: ${gate.canonical_replay_sha256}`);
    }
    if (gate.supporting_evidence?.test_full?.failed !== 0) {
      throw new Error(
        `evidence S0 full tests failed: ${gate.supporting_evidence?.test_full?.passed} passed / ${gate.supporting_evidence?.test_full?.failed} failed`,
      );
    }
    // Diff proof: in-tree S0 gate commit → frozen commit, verbatim.
    // (The in-tree gate always records the previous commit — a
    // commit cannot contain its own hash — so this diff is the
    // evidence that nothing but the recorded changes separate the
    // two runs.)
    const stat = gitOut(["diff", "--stat", inTreeGitCommit, frozenCommit]);
    const nameOnly = gitOut(["diff", "--name-only", inTreeGitCommit, frozenCommit]);
    const files = [];
    for (const name of S0_EVIDENCE_FILES) {
      const src = path.join(s0Root, "artifacts", "s0", name);
      if (!fs.existsSync(src)) throw new Error(`S0 evidence file missing from worktree run: artifacts/s0/${name}`);
      const dest = path.join(S0_EVIDENCE_DIR, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const data = fs.readFileSync(src);
      fs.writeFileSync(dest, data);
      files.push({ name, bytes: data.length, sha256: sha256Hex(data) });
    }
    const p95 = (gate.gates ?? []).find((g) => g.gate === "hook end-to-end p95")?.measured ?? null;
    // FIX-R2 (R2 §六): the manifest's top-level s0_gate block now
    // takes its values from this frozen-evidence run, not from the
    // in-tree gate (which records the previous commit) — so carry
    // the full-test counts along with the other evidence values.
    const testFull = gate.supporting_evidence?.test_full ?? null;
    return {
      frozen_commit: frozenCommit,
      git_commit: evidenceCommit,
      generated_at_utc: gate.generated_at_utc,
      verdict: gate.verdict,
      p95,
      canonical_replay_sha256: gate.canonical_replay_sha256,
      full_tests:
        testFull !== null
          ? { passed: testFull.passed, failed: testFull.failed, files: testFull.files }
          : null,
      files,
      diff_proof: {
        from_commit: inTreeGitCommit,
        to_commit: frozenCommit,
        stat,
        name_only: nameOnly,
      },
    };
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", treeDir], { cwd: REPO_ROOT, encoding: "utf8" });
    spawnSync("git", ["worktree", "prune"], { cwd: REPO_ROOT, encoding: "utf8" });
    fs.rmSync(base, { recursive: true, force: true });
  }
}

const failures = [];
const log = [];
function note(line) {
  log.push(line);
  console.log(line);
}
function check(name, ok, detail = "") {
  note(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) {
    failures.push(name);
  }
  return ok;
}
export function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
export function sha256File(file) {
  return sha256Hex(fs.readFileSync(file));
}
function run(cmd, args, opts = {}) {
  const spawned = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  return {
    exitCode: spawned.status ?? 4,
    stdout: spawned.stdout ?? "",
    stderr: spawned.stderr ?? "",
  };
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
 * FIX-R5 (R5-P2-03): the T013 review reference is parameterized.
 * The latest review is the reviews/T013_FINAL_REVIEW_R*.md file
 * with the largest round number — never a hard-coded round.
 * parseT013ReviewReport reads the verdict (结论：PASS/FAIL), the
 * P0/P1/P2 counts and, when the report header states it, the
 * commit the review examined. It throws on an unparsable report
 * (verdict or counts missing); a FAIL verdict is a valid parse,
 * never an error — FAIL must not block a re-freeze.
 */
export function parseT013ReviewReport(report) {
  const verdictMatch = report.match(/结论：(PASS|FAIL)/);
  if (!verdictMatch) {
    throw new Error("T013 verdict (结论：PASS/FAIL) not found in review report");
  }
  const counts = report.match(/P0\s*=\s*(\d+)[\s\S]{0,40}?P1\s*=\s*(\d+)[\s\S]{0,40}?P2\s*=\s*(\d+)/);
  if (!counts) {
    throw new Error("P0/P1/P2 counts not found in T013 review report");
  }
  const reviewed = report.match(/审查对象[^`\n]*`([0-9a-f]{7,40})`/);
  return {
    verdict: verdictMatch[1],
    p0: Number(counts[1]),
    p1: Number(counts[2]),
    p2: Number(counts[3]),
    reviewedCommit: reviewed ? reviewed[1] : null,
  };
}

/** Latest T013 review among repo-relative "reviews/T013_FINAL_REVIEW_R<N>.md" paths, or null. */
export function latestT013ReviewFile(files) {
  let best = null;
  for (const f of files) {
    const m = f.match(/^reviews\/T013_FINAL_REVIEW_R(\d+)\.md$/);
    if (!m) continue;
    const round = Number(m[1]);
    if (best === null || round > best.round) best = { round, file: f };
  }
  return best;
}

/**
 * Resolve the latest T013 review from a commit's tree (the frozen
 * commit, for release:build — the manifest may only cite a review
 * that exists in the frozen commit). Returns { round, file, report }
 * plus the parsed verdict/counts/reviewed_commit. Throws when no
 * review file exists in the commit or the report does not parse.
 */
export function resolveLatestT013ReviewFromCommit(commit) {
  const names = gitOut(["ls-tree", "-r", "--name-only", commit, "--", "reviews"])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const latest = latestT013ReviewFile(names);
  if (latest === null) {
    throw new Error(`no reviews/T013_FINAL_REVIEW_R*.md file in commit ${commit}`);
  }
  const report = gitOut(["show", `${commit}:${latest.file}`]);
  return { ...latest, report, ...parseT013ReviewReport(report) };
}

/** Resolve the frozen commit: existing manifest pin, else HEAD. */
export function resolveFrozenCommit() {
  if (fs.existsSync(MANIFEST_FILE)) {
    try {
      const pinned = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")).frozen_commit;
      if (typeof pinned === "string" && /^[0-9a-f]{40}$/.test(pinned)) {
        const exists = git(["cat-file", "-t", pinned]);
        if (exists.exitCode === 0 && exists.stdout.trim() === "commit") {
          return { commit: pinned, pinned: true };
        }
      }
    } catch {
      // Fall through to the throw below: a corrupt manifest is a
      // failure of the build, not a silent re-freeze.
    }
    throw new Error(
      "release/RELEASE_MANIFEST.json exists but has no valid frozen_commit — " +
        "delete release/ for a fresh freeze or restore the manifest",
    );
  }
  return { commit: gitOut(["rev-parse", "HEAD"]).trim(), pinned: false };
}

/** Every tracked file of a commit under 02_source: [{ path, bytes, sha256, blob }]. */
export function fileListFromCommit(commit) {
  const ls = gitOut(["ls-tree", "-r", "-l", commit, "--", SOURCE_SUBTREE]);
  const files = [];
  for (const line of ls.split("\n")) {
    if (!line.trim()) continue;
    // "<mode> blob <sha> <size>\t<path>" (size "-" for submodules; none here)
    const tab = line.indexOf("\t");
    const meta = line.slice(0, tab).split(/\s+/);
    const mode = meta[0];
    const blob = meta[2];
    const size = Number(meta[3]);
    const repoPath = line.slice(tab + 1);
    if (mode === "120000") {
      throw new Error(`symlink in frozen tree, unsupported by the deterministic zip: ${repoPath}`);
    }
    const content = execFileSync("git", ["cat-file", "-p", blob], {
      cwd: REPO_ROOT,
      maxBuffer: 256 * 1024 * 1024,
    });
    files.push({
      repoPath,
      path: SOURCE_PREFIX + repoPath.slice(SOURCE_SUBTREE.length + 1),
      bytes: content.length,
      sha256: sha256Hex(content),
      blob,
      lsSize: size,
      // Git mode ("100644" / "100755") as a full st_mode, so the
      // deterministic zip preserves the executable bit (the CLI
      // launcher bin/guidancepulse MUST stay +x after extraction).
      mode: parseInt(mode, 8),
    });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

export function fileListCsv(files) {
  const rows = ["path,bytes,sha256,git_blob_sha"];
  for (const f of files) rows.push(`${f.path},${f.bytes},${f.sha256},${f.blob}`);
  return `${rows.join("\n")}\n`;
}

/** Directory entries (trailing "/") for every parent dir of the file list. */
export function directoryEntries(files) {
  const dirs = new Set();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i < parts.length - 1; i += 1) {
      dirs.add(`${parts.slice(0, i + 1).join("/")}/`);
    }
  }
  return [...dirs].sort().map((p) => ({ path: p, data: Buffer.alloc(0), mode: 0o40755 }));
}

/** Normalize a disk st_mode to the git model for dist.zip (R1-P2-02):
 * any exec bit → 0o100755, no exec bit → 0o100644, directories →
 * 0o40755. The raw disk mode (e.g. 0770 from a shared/umask checkout)
 * must never leak into the distributed launcher's permissions:
 * bin/guidancepulse has to be 0755, exactly like source.zip's git
 * mode for the same file. */
export function normalizeDistMode(mode, isDir = false) {
  if (isDir) return 0o40755;
  return (mode & 0o111) !== 0 ? 0o100755 : 0o100644;
}

/** Runtime entries for dist.zip, from the working tree (post-build). */
export function collectDistEntries() {
  const entries = [];
  const walk = (dir, prefix) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const rel = `${prefix}${name}`;
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs, `${rel}/`);
      else entries.push({ path: rel, data: fs.readFileSync(abs), mode: normalizeDistMode(st.mode) });
    }
  };
  for (const rootFile of [
    "package.json",
    "package-lock.json",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "guidancepulse.example.yaml",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
  ]) {
    const abs = path.join(ROOT, rootFile);
    entries.push({ path: rootFile, data: fs.readFileSync(abs), mode: normalizeDistMode(fs.statSync(abs).mode) });
  }
  walk(path.join(ROOT, "dist"), "dist/");
  walk(path.join(ROOT, "bin"), "bin/");
  walk(path.join(ROOT, "src"), "src/");
  entries.push({
    path: "scripts/hook-entry.ts",
    data: fs.readFileSync(path.join(ROOT, "scripts", "hook-entry.ts")),
    mode: normalizeDistMode(fs.statSync(path.join(ROOT, "scripts", "hook-entry.ts")).mode),
  });
  walk(path.join(ROOT, "schemas"), "schemas/");
  walk(path.join(ROOT, "docs"), "docs/");
  return entries;
}

/**
 * CLI smoke: init → install → status → uninstall in a foreign temp
 * project, through the given launcher, with NODE_PATH removed.
 * Returns { ok, detail }. Never throws on a spawn failure: a failed
 * spawn yields status null AND stderr null, so every stderr access
 * is null-guarded (an unguarded `.slice` here once swallowed the
 * real error behind the finally block's exit path).
 */
function cliSmoke(launcherAbs, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gp-freeze-${tag}-`));
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

function environmentInfo() {
  const cpu = os.cpus()[0];
  return {
    node: process.version,
    npm: run("npm", ["-v"]).stdout.trim(),
    python: run("python3", ["--version"]).stdout.trim(),
    git: run("git", ["--version"]).stdout.trim(),
    platform: `${os.platform()} ${os.arch()}`,
    cpu_model: cpu ? cpu.model : "unknown",
    cpu_count: os.cpus().length,
    total_memory_bytes: os.totalmem(),
  };
}

function main() {
  const startedUtc = new Date().toISOString();
  note(`release:build started ${startedUtc}`);

  // 0. Resolve + guard the frozen commit.
  let frozen;
  try {
    frozen = resolveFrozenCommit();
  } catch (err) {
    check("resolve frozen commit", false, err.message);
    process.exit(1);
  }
  const frozenCommit = frozen.commit;
  note(`frozen commit: ${frozenCommit}${frozen.pinned ? " (pinned by existing manifest)" : " (HEAD)"}`);
  check("frozen commit exists in git", git(["cat-file", "-t", frozenCommit]).stdout.trim() === "commit");

  const status = gitOut(["status", "--short"]).trim();
  const dirtyTracked = status
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.startsWith("??"));
  check("tracked tree clean at freeze", dirtyTracked.length === 0, dirtyTracked.join("; "));

  const diff = git(["diff", "--quiet", frozenCommit, "--", ".", ":!02_source/release"]);
  check(
    "working tree matches frozen commit (except release/)",
    diff.exitCode === 0,
    "uncommitted changes outside release/ — commit them first",
  );

  // Frozen-commit gates: S0 gate, T013 re-review, MIT LICENSE.
  let s0 = null;
  let review = null;
  try {
    const gateJson = JSON.parse(gitOut(["show", `${frozenCommit}:02_source/artifacts/s0/S0_GATE.json`]));
    s0 = {
      verdict: gateJson.verdict,
      canonical: gateJson.canonical_replay_sha256,
      p95: (gateJson.gates ?? []).find((g) => g.gate === "hook end-to-end p95")?.measured ?? null,
      fullPassed: gateJson.supporting_evidence?.test_full?.passed ?? null,
      fullFailed: gateJson.supporting_evidence?.test_full?.failed ?? null,
      fullFiles: gateJson.supporting_evidence?.test_full?.files ?? null,
      generatedAt: gateJson.generated_at_utc,
      // The commit the in-tree gate itself recorded. It is always
      // the commit BEFORE the frozen one (a commit cannot contain
      // its own hash) — the diff proof in s0_evidence bridges it.
      inTreeCommit: gateJson.environment?.git_commit ?? null,
    };
    check("frozen S0 gate verdict PASS", s0.verdict === "PASS", `verdict ${s0.verdict}`);
    check(
      "frozen S0 canonical replay hash is the known value",
      s0.canonical === EXPECTED_CANONICAL_SHA256,
      s0.canonical,
    );
    check("frozen S0 full tests: 0 failed", s0.fullFailed === 0, `${s0.fullPassed} passed / ${s0.fullFailed} failed`);
  } catch (err) {
    check("read frozen S0 gate", false, err.message);
  }
  try {
    // FIX-R5 (R5-P2-03): the review reference is parameterized —
    // resolve the latest T013 review from the frozen commit's tree
    // instead of hard-coding a round. A FAIL verdict is recorded
    // faithfully and must NOT block a re-freeze (the next review
    // round only happens after a re-freeze); the only failures
    // here are a missing review file or an unparsable report.
    const latest = resolveLatestT013ReviewFromCommit(frozenCommit);
    review = {
      round: latest.round,
      file: latest.file,
      verdict: latest.verdict,
      p0: latest.p0,
      p1: latest.p1,
      p2: latest.p2,
      reviewedCommit: latest.reviewedCommit,
    };
    check(`latest T013 review (R${latest.round}) resolves in the frozen commit`, true, latest.file);
    check(
      `latest T013 review (R${latest.round}) verdict parses`,
      latest.verdict === "PASS" || latest.verdict === "FAIL",
      `verdict ${latest.verdict}`,
    );
    check(
      `latest T013 review (R${latest.round}) P0/P1/P2 counts parse`,
      true,
      `P0=${latest.p0} P1=${latest.p1} P2=${latest.p2}`,
    );
    note(
      `frozen T013 review: R${latest.round} ${latest.verdict}, P0=${latest.p0} P1=${latest.p1} P2=${latest.p2}, reviewed commit ${latest.reviewedCommit ?? "not stated"} (recorded as-is; FAIL does not block re-freeze)`,
    );
  } catch (err) {
    check("read latest frozen T013 review", false, err.message);
  }
  const treeNames = gitOut(["ls-tree", "-r", "--name-only", frozenCommit, "--", SOURCE_SUBTREE])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const licenseSha = (() => {
    try {
      const content = execFileSync("git", ["show", `${frozenCommit}:02_source/LICENSE`], {
        cwd: REPO_ROOT,
        maxBuffer: 64 * 1024 * 1024,
      });
      return sha256Hex(content);
    } catch {
      return null;
    }
  })();
  check(
    "MIT LICENSE exists in frozen commit with the canonical content hash",
    treeNames.includes("02_source/LICENSE") && licenseSha === EXPECTED_LICENSE_SHA256,
    `LICENSE present: ${treeNames.includes("02_source/LICENSE")}, sha256 ${licenseSha}`,
  );
  check(
    "release scripts exist in frozen commit",
    ["02_source/scripts/release-build.mjs", "02_source/scripts/release-verify.mjs", "02_source/scripts/release-zip.mjs"].every((f) =>
      treeNames.includes(f),
    ),
  );

  // S0 evidence bound to the exact frozen commit (R1-P1-01): a
  // clean detached worktree at the frozen commit re-runs the full
  // gate; its evidence lands in release/s0-evidence/ and in the
  // manifest's s0_evidence block. Runs after the frozen-commit
  // gates above and before any packaging.
  let s0Evidence = null;
  if (s0 !== null && typeof s0.inTreeCommit === "string" && /^[0-9a-f]{40}$/.test(s0.inTreeCommit)) {
    try {
      s0Evidence = runFrozenS0Evidence(frozenCommit, s0.inTreeCommit);
      check(
        "frozen-commit S0 evidence (clean worktree re-run at the exact frozen commit)",
        true,
        `verdict ${s0Evidence.verdict}, git_commit ${s0Evidence.git_commit.slice(0, 12)}…, ${s0Evidence.files.length} files`,
      );
    } catch (err) {
      check("frozen-commit S0 evidence (clean worktree re-run at the exact frozen commit)", false, err.message);
    }
  } else {
    check(
      "frozen-commit S0 evidence (clean worktree re-run at the exact frozen commit)",
      false,
      "in-tree S0 gate has no readable environment.git_commit to diff from",
    );
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "guidancepulse-freeze-"));
  const sourceZipTmp = path.join(work, "source.zip");
  const distZipTmp = path.join(work, "dist.zip");
  let sourceSize = 0;
  let distSize = 0;
  let sourceSha = "";
  let distSha = "";
  let distEntryCount = 0;
  let fileList = [];
  try {
    // 1. Source zip from the frozen commit (02_source subtree).
    try {
      fileList = fileListFromCommit(frozenCommit);
    } catch (err) {
      check("file list from frozen commit", false, err.message);
      fileList = [];
    }
    check("file list covers every frozen-commit 02_source file", fileList.length === treeNames.length, `${fileList.length} files`);
    const sizeMismatch = fileList.filter((f) => f.bytes !== f.lsSize);
    check("file list sizes match git ls-tree sizes", sizeMismatch.length === 0, sizeMismatch.map((f) => f.path).join("; "));
    if (fileList.length > 0) {
      // git archive (tar) → extract → deterministic zip with prefix.
      const extractDir = path.join(work, "archive");
      fs.mkdirSync(extractDir, { recursive: true });
      const archive = spawnSync(
        "git",
        ["archive", "--format=tar", frozenCommit, "--", SOURCE_SUBTREE],
        { cwd: REPO_ROOT, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
      );
      check("git archive frozen commit (02_source subtree)", archive.status === 0, (archive.stderr ?? Buffer.alloc(0)).toString("utf8").slice(0, 300));
      if (archive.status === 0) {
        const tar = spawnSync("tar", ["-x", "-C", extractDir], { input: archive.stdout });
        check("extract git archive to temp dir", tar.status === 0, (tar.stderr ?? "").toString().slice(0, 300));
      }
      const entries = [];
      for (const f of fileList) {
        const abs = path.join(extractDir, f.repoPath);
        if (!fs.existsSync(abs)) {
          check(`archived file present: ${f.path}`, false, "missing after extract");
          continue;
        }
        entries.push({ path: f.path, data: fs.readFileSync(abs), mode: f.mode });
      }
      // Cross-check: every archived byte equals the blob bytes.
      const byteMismatch = entries.filter((e, i) => sha256Hex(e.data) !== fileList[i].sha256);
      check("archived bytes match frozen blob hashes", byteMismatch.length === 0, byteMismatch.map((e) => e.path).join("; "));
      for (const d of directoryEntries(fileList)) entries.push(d);
      fs.writeFileSync(sourceZipTmp, writeZip(entries));
      sourceSize = fs.statSync(sourceZipTmp).size;
      sourceSha = sha256File(sourceZipTmp);
      check("source.zip non-empty", sourceSize > 0, `${sourceSize} bytes, ${entries.length} entries (${fileList.length} files)`);
    }

    // 2. Fresh build → deterministic dist zip.
    const build = run("npm", ["run", "build"]);
    check("npm run build (fresh)", build.exitCode === 0, build.stderr.slice(0, 300));
    const distEntries = collectDistEntries();
    distEntryCount = distEntries.length;
    check("dist.zip entries include built UI", distEntries.some((e) => e.path === "dist/index.html"));
    check("dist.zip entries include CLI launcher + source", distEntries.some((e) => e.path === "bin/guidancepulse") && distEntries.some((e) => e.path === "src/cli/main.ts"));
    check("dist.zip entries include hook-entry.ts + tsconfig (hook build inputs)", distEntries.some((e) => e.path === "scripts/hook-entry.ts") && distEntries.some((e) => e.path === "tsconfig.json"));
    check(
      "dist.zip entries include runtime schemas + docs",
      distEntries.some((e) => e.path.startsWith("schemas/")) && distEntries.some((e) => e.path.startsWith("docs/")),
    );
    const forbiddenInDist = distEntries.filter((e) => /^(tests|artifacts|node_modules|release)\//.test(e.path));
    check("no tests/artifacts/node_modules/release in dist.zip", forbiddenInDist.length === 0, forbiddenInDist.map((e) => e.path).join("; "));
    fs.writeFileSync(distZipTmp, writeZip(distEntries));
    distSize = fs.statSync(distZipTmp).size;
    distSha = sha256File(distZipTmp);
    check("dist.zip non-empty", distSize > 0, `${distSize} bytes, ${distEntryCount} entries`);
    // R1-P2-02: the launcher must be 0755 in the zip itself (not
    // just after unzip), and no file entry may carry group/other
    // write bits.
    const distZipEntries = readZipEntries(fs.readFileSync(distZipTmp));
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
      "dist.zip file entries are all 0644 or 0755",
      badModeEntries.length === 0,
      badModeEntries.map((e) => `${e.path}=${e.mode?.toString(8) ?? "none"}`).join("; "),
    );
    const distLicense = distEntries.find((e) => e.path === "LICENSE");
    check(
      "dist.zip contains MIT LICENSE with the canonical content hash",
      distLicense !== undefined && sha256Hex(distLicense.data) === EXPECTED_LICENSE_SHA256,
      distLicense ? `sha256 ${sha256Hex(distLicense.data)}` : "LICENSE entry missing",
    );
    const distPkg = JSON.parse(distEntries.find((e) => e.path === "package.json").data.toString("utf8"));
    check('dist package.json claims "license": "MIT"', distPkg.license === "MIT", `license ${distPkg.license}`);
    const distReadme = distEntries.find((e) => e.path === "README.md").data.toString("utf8");
    const readmeHasMit = /MIT/.test(distReadme);
    check("dist README mentions MIT", readmeHasMit, readmeHasMit ? "" : "no MIT mention in README");

    // 3. Clean-room rebuild + CLI smoke from source.zip.
    const cleanDir = path.join(work, "clean");
    fs.mkdirSync(cleanDir, { recursive: true });
    const extract = run("unzip", ["-q", sourceZipTmp, "-d", cleanDir]);
    check("extract source.zip to clean dir", extract.exitCode === 0, extract.stderr.slice(0, 300));
    const cleanRoot = path.join(cleanDir, "guidancepulse");
    check(
      "clean tree has package.json + src + tests + bin",
      fs.existsSync(path.join(cleanRoot, "package.json")) &&
        fs.existsSync(path.join(cleanRoot, "src")) &&
        fs.existsSync(path.join(cleanRoot, "tests")) &&
        fs.existsSync(path.join(cleanRoot, "bin", "guidancepulse")),
    );
    const forbiddenInZip = ["node_modules/", ".git/", "release/"].filter((p) =>
      fs.existsSync(path.join(cleanRoot, p)),
    );
    check("no node_modules/.git/release in source.zip", forbiddenInZip.length === 0, forbiddenInZip.join("; "));
    // No network: install dependencies for real from the local npm
    // cache (`npm ci --offline --ignore-scripts`). --ignore-scripts
    // is kept as a harmless belt-and-braces flag: better-sqlite3
    // @13.2.0 has no install script, so `npm ci` never triggers a
    // node-gyp rebuild — the package ships an N-API prebuilt binary
    // in prebuilds/ which loads fine without scripts, and the
    // vite-node/vitest binaries are in node_modules/.bin. A
    // failure here fails the build: no silent fallback to a
    // symlinked node_modules (R1-P2-03).
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

    // 4. dist.zip smoke run: the distributed build itself must run.
    const distDir = path.join(work, "dist-test");
    fs.mkdirSync(distDir, { recursive: true });
    const distExtract = run("unzip", ["-q", distZipTmp, "-d", distDir]);
    check("extract dist.zip to temp dir", distExtract.exitCode === 0, distExtract.stderr.slice(0, 300));
    // Same real offline install as the clean-room (R1-P2-03): the
    // distributed build must run on its own dependencies, not on a
    // symlink to the repo's node_modules.
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
  } catch (err) {
    // An exception inside the try must be recorded as a failed
    // check, not swallowed: the finally below calls process.exit
    // when failures is non-empty, which would otherwise hide the
    // real error (this exact swallow hid a TypeError from the first
    // T014 build attempt).
    check("release build completed without exception", false, `${err.message}`);
    console.error(err.stack ?? err.message);
  } finally {
    // Publish the artifacts (even on partial failure, so the failure
    // is inspectable; the exit code still reports FAIL).
    fs.mkdirSync(RELEASE_DIR, { recursive: true });
    if (fs.existsSync(sourceZipTmp)) fs.copyFileSync(sourceZipTmp, path.join(RELEASE_DIR, "source.zip"));
    if (fs.existsSync(distZipTmp)) fs.copyFileSync(distZipTmp, path.join(RELEASE_DIR, "dist.zip"));
    fs.writeFileSync(path.join(RELEASE_DIR, "SOURCE_MANIFEST.csv"), fileListCsv(fileList), "utf8");
    const frozenDate = gitOut(["show", "-s", "--format=%cI", frozenCommit]).trim();
    const manifest = {
      schema: "guidancepulse.release-manifest/v1",
      project: "P025 GuidancePulse",
      spec_version: "1.1.0",
      license: "MIT",
      frozen_commit: frozenCommit,
      frozen_commit_date: frozenDate,
      source_root: SOURCE_SUBTREE,
      source_prefix: SOURCE_PREFIX,
      // FIX-R2 (终审 R2 §六): the top-level s0_gate values used to
      // come from the in-tree gate (previous commit: 213.76ms) while
      // `evidence` pointed at the fresh frozen-commit run
      // (301.09ms). Unify the reference: the top-level values ARE
      // the frozen-evidence run's. Fall back to the in-tree gate
      // only if the evidence run is unavailable (the build has
      // already failed its checks by then).
      s0_gate: {
        verdict: s0Evidence ? s0Evidence.verdict : s0?.verdict ?? null,
        p95: s0Evidence ? s0Evidence.p95 : s0?.p95 ?? null,
        canonical_replay_sha256: s0Evidence ? s0Evidence.canonical_replay_sha256 : s0?.canonical ?? null,
        full_tests: s0Evidence
          ? s0Evidence.full_tests
          : s0
            ? { passed: s0.fullPassed, failed: s0.fullFailed, files: s0.fullFiles }
            : null,
        generated_at_utc: s0Evidence ? s0Evidence.generated_at_utc : s0?.generatedAt ?? null,
        evidence:
          "release/s0-evidence/S0_GATE.json (generated in a clean git worktree at the exact frozen commit; see s0_evidence — the values above ARE this run)",
        in_tree_evidence:
          "02_source/artifacts/s0/S0_GATE.json (in the frozen commit; its environment.git_commit is the previous commit — a commit cannot contain its own hash — it is the pre-freeze run, bridged to the frozen commit by s0_evidence.diff_proof; it is NOT the source of the values above)",
      },
      // R1-P1-01: S0 evidence bound to the exact frozen commit.
      // generated_at_utc is the evidence run's own timestamp (never
      // wall-clock time at manifest write), so a re-run changes
      // this block, the evidence file hashes and the SHA256SUMS
      // evidence lines — everything else in the manifest stays
      // deterministic for the frozen commit.
      s0_evidence: s0Evidence,
      // FIX-R5 (R5-P2-03): the review block cites the latest T013
      // review in the frozen commit (file/round/verdict/counts/
      // reviewed_commit), never a hard-coded round. A FAIL verdict
      // is recorded as-is — it must not be rewritten as PASS and
      // does not block a re-freeze.
      review: {
        task: review ? `T013 final re-review (R${review.round})` : "T013 final re-review",
        file: review ? review.file : null,
        round: review ? review.round : null,
        verdict: review ? review.verdict : null,
        p0: review ? review.p0 : null,
        p1: review ? review.p1 : null,
        p2: review ? review.p2 : null,
        reviewed_commit: review ? review.reviewedCommit : null,
        evidence: review
          ? `${review.file} (in the frozen commit; the latest T013 review at freeze time — recorded as-is, FAIL does not block re-freeze)`
          : null,
      },
      generated_by: "npm run release:build (scripts/release-build.mjs)",
      generation: {
        source_zip: `git archive --format=tar ${frozenCommit} -- 02_source, extracted and repacked as a deterministic STORE zip (scripts/release-zip.mjs: fixed 1980-01-01 timestamps, entries sorted by path) with prefix guidancepulse/; directory entries included for every parent dir`,
        dist_zip:
          "npm run build (fresh, immediately before packaging) + deterministic STORE zip " +
          "(scripts/release-zip.mjs); entries are package.json, package-lock.json, README.md, LICENSE, " +
          "THIRD_PARTY_NOTICES.md, guidancepulse.example.yaml, index.html, vite.config.ts and tsconfig.json at the root, " +
          "dist/<path> (vite UI build), bin/<path> (CLI launcher), src/<path> (TypeScript CLI + hooks, run via vite-node), " +
          "scripts/hook-entry.ts (the hook build compiles it with tsc), schemas/<path> and docs/<path>; " +
          "entry modes are normalized to the git model (0755 iff any exec bit, else 0644; R1-P2-02), so " +
          "bin/guidancepulse is 0755 regardless of the checkout's disk mode; " +
          "LICENSE content hash is pinned to 50b8b302… and package.json claims MIT",
        note:
          "Re-running release:build re-freezes the manifest-pinned frozen commit; " +
          "source.zip and dist.zip regenerate byte-identical, but the manifest's " +
          "s0_evidence block, release/s0-evidence/ and the SHA256SUMS evidence lines " +
          "change per run because they embed a fresh S0 re-run at the exact frozen " +
          "commit (R1-P1-01) — delete release/ for a fresh freeze of HEAD. " +
          "FIX-R2: the manifest's top-level s0_gate block takes its verdict/p95/" +
          "canonical/full-tests/generated_at_utc from that same frozen-evidence run, " +
          "not from the in-tree gate (which records the previous commit); " +
          "release-verify.mjs §7b checks the two blocks agree. " +
          "FIX-R5: the manifest's review block cites the latest T013 review in the frozen " +
          "commit (file/round/verdict/counts/reviewed_commit), never a hard-coded round; " +
          "a FAIL verdict is recorded as-is and does not block re-freeze. " +
          "The clean-room rebuild and the dist smoke install dependencies with a real " +
          "`npm ci --offline --ignore-scripts` from the local npm cache (no network; " +
          "--ignore-scripts is kept as a harmless belt-and-braces flag — better-sqlite3@13.2.0 " +
          "has no install script, so npm ci never triggers a node-gyp rebuild; the package " +
          "ships an N-API prebuilt binary in prebuilds/). " +
          "A commit cannot contain its own hash, so the manifest names the frozen (source) commit and the " +
          "release artifacts + freeze report are committed on top of it (P023 T014 convention); " +
          "release:verify checks the pinned commit's tree against source.zip, never HEAD.",
      },
      source_zip: { file: "source.zip", bytes: sourceSize, sha256: sourceSha, file_count: fileList.length },
      dist_zip: { file: "dist.zip", bytes: distSize, sha256: distSha, entry_count: distEntryCount },
      environment: environmentInfo(),
    };
    fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const manifestSha = sha256File(MANIFEST_FILE);
    const csvSha = sha256File(path.join(RELEASE_DIR, "SOURCE_MANIFEST.csv"));
    // SHA256SUMS.txt entries are prefixed with `release/` so the
    // acceptance command `sha256sum -c release/SHA256SUMS.txt` runs
    // from the 02_source root (the T014 card's literal command).
    // R1-P1-01: every release/s0-evidence/ file is covered too.
    const evidenceSumLines = (s0Evidence?.files ?? []).map(
      (f) => `${f.sha256}  release/s0-evidence/${f.name}\n`,
    );
    fs.writeFileSync(
      path.join(RELEASE_DIR, "SHA256SUMS.txt"),
      `${sourceSha}  release/source.zip\n${distSha}  release/dist.zip\n${manifestSha}  release/RELEASE_MANIFEST.json\n${csvSha}  release/SOURCE_MANIFEST.csv\n${evidenceSumLines.join("")}`,
      "utf8",
    );
    // Basic integrity of what was just written.
    const testSource = run("unzip", ["-t", path.join(RELEASE_DIR, "source.zip")]);
    check("unzip -t release/source.zip", testSource.exitCode === 0, testSource.stdout.split("\n").slice(-2).join(" "));
    const testDist = run("unzip", ["-t", path.join(RELEASE_DIR, "dist.zip")]);
    check("unzip -t release/dist.zip", testDist.exitCode === 0, testDist.stdout.split("\n").slice(-2).join(" "));
    const sums = spawnSync("sha256sum", ["-c", "release/SHA256SUMS.txt"], { cwd: ROOT, encoding: "utf8" });
    check("sha256sum -c release/SHA256SUMS.txt", sums.status === 0, (sums.stdout ?? "").trim());
    fs.rmSync(work, { recursive: true, force: true });
    note(`release:build ${failures.length === 0 ? "PASS" : "FAIL"} — frozen ${frozenCommit}`);
    note(`source.zip ${sourceSize} B sha256 ${sourceSha}`);
    note(`dist.zip ${distSize} B sha256 ${distSha}`);
    if (failures.length > 0) {
      console.error(`release:build FAILED — ${failures.join("; ")}`);
      process.exit(1);
    }
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`release:build FAILED with exception: ${err.message}`);
    process.exit(1);
  }
}
