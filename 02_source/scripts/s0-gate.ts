/**
 * S0 Gate — P025 GuidancePulse, T010.
 *
 * Runs every S0 hard gate from PROJECT_BOOK §9.5/§9.6 /
 * IMPLEMENTATION_PLAN §8.3/§8.6 (T010, spec v1.1.0) and writes
 * `artifacts/s0/`:
 *
 *   S0_GATE.json        machine-readable verdicts + measured values
 *   S0_GATE.md          human-readable summary
 *   fixture-results.json  per-fixture production vs Golden vs Oracle
 *   oracle-results.json   Oracle --verify-golden / --self-test + per-fixture
 *   perf-hook.json        end-to-end Hook p95 (see scripts/perf-hook.ts)
 *   repeat-hashes.json    100-run canonical hashes
 *   privacy-scan.json     canary leak scan (0 hits required)
 *   network-scan.json     static network call-site scan (0 required)
 *   logs/s0-gate.log      full command transcript
 *
 * Usage: `npm run s0:gate`
 *
 * Exit code 0 iff S0 = PASS (all seven hard gates pass). Any hard
 * gate failure makes S0 = FAIL and the exit code 1 — the report is
 * still written in full, because a FAIL with evidence is the
 * correct outcome, not a reason to hide the numbers. Thresholds
 * are never lowered, fixtures are never deleted, and measurement
 * calibres are never changed to make a gate pass.
 *
 * The seven hard gates (all must pass simultaneously):
 *   1. production / Oracle parity 48/48
 *   2. 32/32 planted errors detected
 *   3. 16/16 controls without false alarms
 *   4. Hook end-to-end p95 < 500 ms (incl. Node subprocess startup;
 *      cold-start sample inside the 100 timed runs, v1.1.0)
 *   5. 100 full replays -> exactly one canonical SHA-256
 *   6. network requests 0 (static scan of product src + the
 *      shipped hook entry scripts/hook-entry.ts + deps)
 *   7. Prompt / source persistence leaks 0 (canary scan in three
 *      rounds, all of which must be 0: round 1 over persisted
 *      outputs, round 2 over the draft S0_GATE.json/.md bytes, and
 *      a final byte scan over the exact bytes written to disk —
 *      FIX-T013, old F-07; R1 P1-R1-02)
 *
 * Supporting evidence (recorded, not gates by themselves):
 * typecheck 0 errors; full `npm test` with 0 failures.
 *
 * No network is used. All data is synthetic. This script never
 * modifies production semantics, Golden Expected, or the Oracle.
 */

import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalEqual,
  goldenLeasesComparable,
  loadFixtures,
  loadGolden,
  replayAll,
  summarizeReplay,
  S0_ORACLE_PATH,
  type FixtureExpected,
  type ReplayResult,
} from "./s0-replay.js";
import {
  CANARIES,
  measureHookPerf,
  PERF_THRESHOLD_MS,
} from "./perf-hook.js";
import { repeatReplay } from "./repeat-s0.js";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const ARTIFACTS = join(ROOT, "artifacts", "s0");
const LOGS = join(ARTIFACTS, "logs");
const LOG_PATH = join(LOGS, "s0-gate.log");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

interface CommandRecord {
  command: string;
  exit_code: number | null;
  duration_ms: number;
  stdout_tail: string;
  stderr_tail: string;
}

interface GateResult {
  gate: string;
  measured: string;
  threshold: string;
  verdict: "PASS" | "FAIL";
  evidence: string;
}

const commands: CommandRecord[] = [];
const logLines: string[] = [];

function log(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  logLines.push(stamped);
  console.log(stamped);
  try {
    mkdirSync(LOGS, { recursive: true });
    appendFileSync(LOG_PATH, stamped + "\n", "utf-8");
  } catch {
    // Logging must never fail the gate.
  }
}

function tail(text: string, maxChars = 2000): string {
  return text.length <= maxChars ? text : `...[truncated]...\n${text.slice(-maxChars)}`;
}

function runCommand(command: string, args: string[], cwd: string = ROOT): CommandRecord {
  const start = process.hrtime.bigint();
  const res = spawnSync(command, args, { cwd, encoding: "utf-8", timeout: 600000 });
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const record: CommandRecord = {
    command: `${command} ${args.join(" ")}`,
    exit_code: res.status,
    duration_ms: Math.round(durationMs * 100) / 100,
    stdout_tail: tail(res.stdout ?? ""),
    stderr_tail: tail(res.stderr ?? ""),
  };
  commands.push(record);
  return record;
}

function parseVitestCounts(output: string): { passed: number; failed: number; files: number } {
  const tests = output.match(/Tests\s+(\d+) passed(?: \((\d+)\))?/);
  const failed = output.match(/(\d+) failed/);
  const files = output.match(/Test Files\s+(\d+) passed/);
  return {
    passed: tests ? Number(tests[1]) : -1,
    failed: failed ? Number(failed[1]) : 0,
    files: files ? Number(files[1]) : -1,
  };
}

interface NetworkHit {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

const NETWORK_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "axios", re: /\baxios\b/ },
  { name: "node:http import", re: /from\s+["']node:http["']/ },
  { name: "node:https import", re: /from\s+["']node:https["']/ },
  { name: "node:net import", re: /from\s+["']node:net["']/ },
  { name: "node:dgram import", re: /from\s+["']node:dgram["']/ },
  { name: "node:dns import", re: /from\s+["']node:dns["']/ },
  { name: "WebSocket(", re: /\bWebSocket\s*\(/ },
  { name: "http.request", re: /\bhttps?\.request\s*\(/ },
  { name: "http.get", re: /\bhttps?\.get\s*\(/ },
  { name: "net.connect", re: /\bnet\.connect\s*\(/ },
  { name: "XMLHttpRequest", re: /\bXMLHttpRequest\b/ },
  { name: "http url literal", re: /https?:\/\/[a-z0-9.-]+/i },
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function scanNetwork(): { hits: NetworkHit[]; urlLiterals: NetworkHit[]; filesScanned: number } {
  const hits: NetworkHit[] = [];
  const urlLiterals: NetworkHit[] = [];
  // FIX-T013 (old F-07): the shipped runtime entry
  // scripts/hook-entry.ts is the process Claude Code actually
  // starts — it is production runtime code, not a dev script, so
  // it is scanned alongside src/. (The T012 offline test already
  // scanned it; the S0 gate itself did not.)
  const files = [...walkTsFiles(join(ROOT, "src")), join(ROOT, "scripts", "hook-entry.ts")];
  for (const file of files) {
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((text, idx) => {
      const trimmed = text.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return; // doc comment, not code
      for (const { name, re } of NETWORK_PATTERNS) {
        if (!re.test(text)) continue;
        const hit = { file: file.slice(ROOT.length + 1), line: idx + 1, pattern: name, text: trimmed.slice(0, 160) };
        if (name === "http url literal") urlLiterals.push(hit);
        else hits.push(hit);
      }
    });
  }
  return { hits, urlLiterals, filesScanned: files.length };
}

function countCanaryBytes(buf: Buffer, canary: string): number {
  const needle = Buffer.from(canary, "utf-8");
  let count = 0;
  let from = 0;
  for (;;) {
    const at = buf.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

interface PrivacyFileScan {
  path: string;
  bytes: number;
  sha256: string;
  hits: Record<string, number>;
}

function walkAllFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkAllFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function scanPrivacy(dirsAndFiles: string[]): { files: PrivacyFileScan[]; totalHits: number } {
  const files: PrivacyFileScan[] = [];
  let totalHits = 0;
  const all: string[] = [];
  for (const target of dirsAndFiles) {
    if (!existsSync(target)) continue;
    if (statSync(target).isDirectory()) all.push(...walkAllFiles(target));
    else all.push(target);
  }
  for (const file of [...new Set(all)].sort()) {
    const buf = readFileSync(file);
    const hits: Record<string, number> = {};
    for (const canary of CANARIES) {
      const n = countCanaryBytes(buf, canary);
      hits[canary] = n;
      totalHits += n;
    }
    files.push({ path: file.slice(ROOT.length + 1), bytes: buf.length, sha256: sha256Buffer(buf), hits });
  }
  return { files, totalHits };
}

/**
 * Numeric-only canary scan over in-memory bytes (R1 P1-R1-02).
 *
 * Unlike scanPrivacy (round 1), this never keys anything by a
 * canary string: the result is counts only, so it is safe to embed
 * in S0_GATE.json/.md. Used for round 2 (draft report bytes) and
 * the final byte scan (exact bytes written to disk).
 */
interface PrivacyByteScanFile {
  path: string;
  /**
   * Byte length of the scanned bytes. Omitted for the final pass:
   * a file cannot embed its own byte length — the final lengths
   * are verified instead by the read-back SHA check and logged.
   */
  bytes?: number;
  total_hits: number;
}

interface PrivacyByteScan {
  files: PrivacyByteScanFile[];
  totalHits: number;
}

function scanPrivacyBytes(files: { path: string; bytes: Buffer }[]): PrivacyByteScan {
  const out: PrivacyByteScanFile[] = [];
  let totalHits = 0;
  for (const { path, bytes } of files) {
    let n = 0;
    for (const canary of CANARIES) n += countCanaryBytes(bytes, canary);
    totalHits += n;
    out.push({ path, bytes: bytes.length, total_hits: n });
  }
  return { files: out, totalHits };
}

interface OracleFixtureResult {
  id: string;
  oracle: { decisions: FixtureExpected["decisions"]; leases: FixtureExpected["leases"] };
  matches_production: boolean;
  matches_golden: boolean;
  detail: string | null;
}

function oracleFixtureResult(id: string, production: ReplayResult, golden: Record<string, FixtureExpected>): OracleFixtureResult {
  const raw = execFileSync(
    "python3",
    [S0_ORACLE_PATH, "--fixture", id, "--json"],
    { cwd: ROOT, encoding: "utf-8", timeout: 60000 },
  ) as string;
  const oracle = JSON.parse(raw) as {
    decisions: FixtureExpected["decisions"];
    leases: FixtureExpected["leases"];
  };
  const oracleLeasesComparable = goldenLeasesComparable(oracle.leases);
  const productionLeases = [...production.leases].sort((a, b) =>
    a.session !== b.session
      ? a.session < b.session
        ? -1
        : 1
      : a.agent !== b.agent
        ? a.agent < b.agent
          ? -1
          : 1
        : a.guidance_id < b.guidance_id
          ? -1
          : 1,
  );
  const matchesProduction =
    canonicalEqual(oracle.decisions, production.decisions) &&
    canonicalEqual(oracleLeasesComparable, productionLeases);
  const expected = golden[id] as FixtureExpected;
  const matchesGolden =
    canonicalEqual(oracle.decisions, expected.decisions) &&
    canonicalEqual(oracleLeasesComparable, goldenLeasesComparable(expected.leases));
  return {
    id,
    oracle,
    matches_production: matchesProduction,
    matches_golden: matchesGolden,
    detail: matchesProduction && matchesGolden ? null : "oracle differs from production and/or golden",
  };
}

async function main(): Promise<number> {
  mkdirSync(ARTIFACTS, { recursive: true });
  mkdirSync(LOGS, { recursive: true });
  writeFileSync(LOG_PATH, "", "utf-8");
  log("S0 gate start (P025 GuidancePulse, SPEC_VERSION 1.1.0)");

  const gates: GateResult[] = [];
  let overallFailReason = "";

  // ---- environment -------------------------------------------------
  let gitCommit = "unknown";
  try {
    gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: join(ROOT, ".."), encoding: "utf-8" }).trim();
  }
  const lockfileSha = existsSync(join(ROOT, "package-lock.json"))
    ? sha256File(join(ROOT, "package-lock.json"))
    : "missing";
  const envInfo = {
    node: process.version,
    npm: (() => {
      try {
        return execFileSync("npm", ["--version"], { encoding: "utf-8" }).trim();
      } catch {
        return "unknown";
      }
    })(),
    python3: (() => {
      try {
        return execFileSync("python3", ["--version"], { encoding: "utf-8" }).trim();
      } catch {
        return "unknown";
      }
    })(),
    platform: `${process.platform}-${process.arch}`,
    cpus: (() => {
      try {
        return Number(execFileSync("nproc", { encoding: "utf-8" }).trim());
      } catch {
        return -1;
      }
    })(),
    git_commit: gitCommit,
    lockfile_sha256: lockfileSha,
  };
  log(`env node=${envInfo.node} npm=${envInfo.npm} ${envInfo.python3} platform=${envInfo.platform} commit=${gitCommit.slice(0, 7)}`);

  // ---- supporting evidence: typecheck + tests ----------------------
  const typecheck = runCommand("npm", ["run", "typecheck"]);
  log(`typecheck exit=${typecheck.exit_code}`);
  const goldenTest = runCommand("npm", ["run", "test:golden"]);
  const goldenCounts = parseVitestCounts(goldenTest.stdout_tail + goldenTest.stderr_tail);
  log(`test:golden exit=${goldenTest.exit_code} passed=${goldenCounts.passed} failed=${goldenCounts.failed}`);
  const oracleTest = runCommand("npm", ["run", "test:oracle"]);
  log(`test:oracle exit=${oracleTest.exit_code}`);
  const fullTest = runCommand("npm", ["test"]);
  const fullCounts = parseVitestCounts(fullTest.stdout_tail + fullTest.stderr_tail);
  log(`npm test exit=${fullTest.exit_code} passed=${fullCounts.passed} failed=${fullCounts.failed} files=${fullCounts.files}`);
  const typecheckOk = typecheck.exit_code === 0;
  const testsOk =
    goldenTest.exit_code === 0 && oracleTest.exit_code === 0 && fullTest.exit_code === 0 && fullCounts.failed === 0;
  if (!typecheckOk || !testsOk) overallFailReason += "supporting-evidence(typecheck/tests) failed; ";

  // ---- gate 1-3: replay vs golden + oracle parity ------------------
  let summary: ReturnType<typeof summarizeReplay> | null = null;
  let oraclePerFixture: OracleFixtureResult[] = [];
  let oracleVerify: CommandRecord | null = null;
  try {
    const fixtures = loadFixtures();
    const golden = loadGolden();
    const results = replayAll(fixtures);
    summary = summarizeReplay(fixtures, results, golden);
    log(`replay parity=${summary.parity} control=${summary.controlClean}/${summary.controlTotal} detected=${summary.errorDetected}/${summary.errorTotal}`);

    oracleVerify = runCommand("python3", [S0_ORACLE_PATH, "--verify-golden"]);
    log(`oracle --verify-golden exit=${oracleVerify.exit_code}: ${(oracleVerify.stdout_tail.trim().split("\n").pop() ?? "").trim()}`);

    oraclePerFixture = results.map((r) => oracleFixtureResult(r.id, r, golden));
    const oracleProdMatch = oraclePerFixture.filter((o) => o.matches_production).length;
    const oracleGoldenMatch = oraclePerFixture.filter((o) => o.matches_golden).length;
    log(`oracle per-fixture vs production=${oracleProdMatch}/48 vs golden=${oracleGoldenMatch}/48`);

    writeFileSync(
      join(ARTIFACTS, "fixture-results.json"),
      JSON.stringify({ summary, per_fixture: results.map((r) => ({ ...r, golden: golden[r.id] })) }, null, 2) + "\n",
      "utf-8",
    );
    writeFileSync(
      join(ARTIFACTS, "oracle-results.json"),
      JSON.stringify(
        {
          verify_golden: { exit_code: oracleVerify.exit_code, stdout: oracleVerify.stdout_tail },
          per_fixture: oraclePerFixture,
          oracle_vs_production: `${oracleProdMatch}/48`,
          oracle_vs_golden: `${oracleGoldenMatch}/48`,
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );

    const parityPass =
      summary.parityMatched === 48 && oracleProdMatch === 48 && oracleGoldenMatch === 48 && oracleVerify.exit_code === 0;
    gates.push({
      gate: "production/oracle parity",
      measured: `production==golden ${summary.parity}, oracle==production ${oracleProdMatch}/48, oracle==golden ${oracleGoldenMatch}/48`,
      threshold: "48/48 on all three comparisons",
      verdict: parityPass ? "PASS" : "FAIL",
      evidence: "artifacts/s0/fixture-results.json, artifacts/s0/oracle-results.json",
    });
    gates.push({
      gate: "planted-error detection",
      measured: `${summary.errorDetected}/${summary.errorTotal}`,
      threshold: "32/32",
      verdict: summary.errorDetected === 32 ? "PASS" : "FAIL",
      evidence: "artifacts/s0/fixture-results.json (per_fixture errorDetected)",
    });
    gates.push({
      gate: "control no false alarms",
      measured: `${summary.controlClean}/${summary.controlTotal}`,
      threshold: "16/16",
      verdict: summary.controlClean === 16 ? "PASS" : "FAIL",
      evidence: "artifacts/s0/fixture-results.json (per_fixture controlClean)",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`replay/oracle step FAILED with error: ${msg}`);
    gates.push({ gate: "production/oracle parity", measured: `error: ${msg}`, threshold: "48/48", verdict: "FAIL", evidence: "see logs/s0-gate.log" });
    gates.push({ gate: "planted-error detection", measured: "not measured (replay error)", threshold: "32/32", verdict: "FAIL", evidence: "see logs/s0-gate.log" });
    gates.push({ gate: "control no false alarms", measured: "not measured (replay error)", threshold: "16/16", verdict: "FAIL", evidence: "see logs/s0-gate.log" });
    overallFailReason += "replay/oracle error; ";
  }

  // ---- gate 4: hook end-to-end p95 (keep temp dirs for the scan) ---
  let perfVerdict: "PASS" | "FAIL" = "FAIL";
  let perfP95 = -1;
  try {
    const perf = await measureHookPerf({ runs: 100, warmup: 5, keepTemp: true });
    perfP95 = perf.stats.p95_ms;
    perfVerdict = perf.verdict;
    log(
      `perf p50=${perf.stats.p50_ms.toFixed(2)}ms p95=${perf.stats.p95_ms.toFixed(2)}ms ` +
        `p99=${perf.stats.p99_ms.toFixed(2)}ms min=${perf.stats.min_ms.toFixed(2)}ms ` +
        `max=${perf.stats.max_ms.toFixed(2)}ms cold_start=${perf.cold_start_ms.toFixed(2)}ms ` +
        `cold_start_sample_index=${perf.cold_start_sample_index} ` +
        `failures=${perf.failures.length} verdict=${perf.verdict}`,
    );
    gates.push({
      gate: "hook end-to-end p95",
      measured: `p95=${perf.stats.p95_ms.toFixed(2)}ms (n=${perf.stats.n}, p50=${perf.stats.p50_ms.toFixed(2)}ms, p99=${perf.stats.p99_ms.toFixed(2)}ms, min=${perf.stats.min_ms.toFixed(2)}ms, max=${perf.stats.max_ms.toFixed(2)}ms, cold_start=${perf.cold_start_ms.toFixed(2)}ms, cold_start_sample_index=${perf.cold_start_sample_index}, run_failures=${perf.failures.length})`,
      threshold: `p95 < ${PERF_THRESHOLD_MS}ms (fresh node subprocess per run, incl. startup + SQLite read)`,
      verdict: perfVerdict,
      evidence: "artifacts/s0/perf-hook.json",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`perf measurement FAILED with error: ${msg}`);
    gates.push({ gate: "hook end-to-end p95", measured: `error: ${msg}`, threshold: `p95 < ${PERF_THRESHOLD_MS}ms`, verdict: "FAIL", evidence: "see logs/s0-gate.log" });
    overallFailReason += "perf measurement error; ";
  }

  // ---- gate 5: 100-run determinism ---------------------------------
  let repeatHash: string | null = null;
  try {
    const repeat = repeatReplay(100);
    repeatHash = repeat.canonical_hash;
    writeFileSync(join(ARTIFACTS, "repeat-hashes.json"), JSON.stringify(repeat, null, 2) + "\n", "utf-8");
    log(`repeat runs=${repeat.runs} unique_hashes=${repeat.unique_hash_count} hash=${repeat.canonical_hash ?? repeat.unique_hashes.join(",")} verdict=${repeat.verdict}`);
    gates.push({
      gate: "100-run determinism (one canonical SHA-256)",
      measured: `${repeat.unique_hash_count} unique hash(es) over ${repeat.runs} runs${repeat.canonical_hash ? `; sha256=${repeat.canonical_hash}` : ""}`,
      threshold: "exactly 1 unique hash",
      verdict: repeat.verdict,
      evidence: "artifacts/s0/repeat-hashes.json",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`repeat step FAILED with error: ${msg}`);
    gates.push({ gate: "100-run determinism (one canonical SHA-256)", measured: `error: ${msg}`, threshold: "exactly 1 unique hash", verdict: "FAIL", evidence: "see logs/s0-gate.log" });
    overallFailReason += "repeat error; ";
  }

  // ---- gate 6: network 0 (static scan) ------------------------------
  const net = scanNetwork();
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
    dependencies?: Record<string, string>;
  };
  const networkHits = net.hits.length;
  writeFileSync(
    join(ARTIFACTS, "network-scan.json"),
    JSON.stringify(
      {
        scope: "src/**/*.ts(x) product code + scripts/hook-entry.ts (shipped runtime entry) + package.json dependencies (dev scripts excluded; check-ui-offline.mjs runs a 127.0.0.1-only test server)",
        files_scanned: net.filesScanned,
        dependencies: Object.keys(pkg.dependencies ?? {}),
        call_site_hits: net.hits,
        url_literals_in_code: net.urlLiterals,
        total_call_site_hits: networkHits,
        verdict: networkHits === 0 ? "PASS" : "FAIL",
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  log(`network scan files=${net.filesScanned} call_site_hits=${networkHits} url_literals=${net.urlLiterals.length}`);
  gates.push({
    gate: "network requests 0",
    measured: `${networkHits} network call-sites in src/ + scripts/hook-entry.ts (${net.filesScanned} files); ${net.urlLiterals.length} URL literal(s) in code (informational, not requests)`,
    threshold: "0 network call-sites",
    verdict: networkHits === 0 ? "PASS" : "FAIL",
    evidence: "artifacts/s0/network-scan.json",
  });

  // ---- gate 7: privacy 0 (canary scan over persisted outputs) -------
  // Scan targets: the perf fixture dir (state.sqlite + WAL + config +
  // key file — everything the Hook subprocesses wrote) and every
  // gate artifact written so far, plus the gate log as it stands.
  // Lines appended to the log AFTER this scan are verdict/count
  // lines only and never contain hook input.
  const privacyTargets = [
    join(ARTIFACTS, ".perf-fixture"),
    join(ARTIFACTS, "fixture-results.json"),
    join(ARTIFACTS, "oracle-results.json"),
    join(ARTIFACTS, "perf-hook.json"),
    join(ARTIFACTS, "repeat-hashes.json"),
    join(ARTIFACTS, "network-scan.json"),
    LOG_PATH,
  ];
  const privacy = scanPrivacy(privacyTargets);
  writeFileSync(
    join(ARTIFACTS, "privacy-scan.json"),
    JSON.stringify(
      {
        canaries: CANARIES,
        scope: "perf fixture dir (SQLite + WAL + config + key) and gate artifacts + gate log as of scan time; post-scan log appends are verdict/count lines only. Rounds 2 and 3 scan the S0_GATE.json/.md bytes (draft, then the exact final bytes) and are recorded, numeric-only, in S0_GATE.json privacy_second_pass and in logs/s0-gate.log — not in this file, so this file's hash stays final once written. privacy-scan.json itself is not byte-scanned in rounds 2/3 because its `canaries` field intentionally lists the searched strings",
        files: privacy.files,
        total_hits: privacy.totalHits,
        verdict: privacy.totalHits === 0 ? "PASS" : "FAIL",
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  log(`privacy scan files=${privacy.files.length} total_canary_hits=${privacy.totalHits}`);
  gates.push({
    gate: "prompt/source persistence leaks 0",
    measured: `${privacy.totalHits} canary hit(s) across ${privacy.files.length} persisted file(s)`,
    threshold: "0 canary hits",
    verdict: privacy.totalHits === 0 ? "PASS" : "FAIL",
    evidence: "artifacts/s0/privacy-scan.json",
  });

  // ---- cleanup of perf temp dirs (evidence is in the JSON files) ----
  rmSync(join(ARTIFACTS, ".hook-build"), { recursive: true, force: true });
  rmSync(join(ARTIFACTS, ".perf-fixture"), { recursive: true, force: true });

  // ---- verdict -------------------------------------------------------
  const allGatesPass = gates.every((g) => g.verdict === "PASS");
  const supportingOk = typecheckOk && testsOk;
  let overall: "PASS" | "FAIL" = allGatesPass && supportingOk ? "PASS" : "FAIL";
  if (!allGatesPass) overallFailReason += gates.filter((g) => g.verdict === "FAIL").map((g) => g.gate).join("; ") + "; ";
  log(`supporting evidence: typecheck=${typecheckOk ? "PASS" : "FAIL"} tests=${testsOk ? "PASS" : "FAIL"} (full=${fullCounts.passed} passed/${fullCounts.failed} failed)`);
  log(`S0 overall verdict: ${overall}${overallFailReason ? ` — ${overallFailReason.trim()}` : ""}`);

  const artifactNames = [
    "fixture-results.json",
    "oracle-results.json",
    "perf-hook.json",
    "repeat-hashes.json",
    "privacy-scan.json",
    "network-scan.json",
  ];
  const artifactHashes: Record<string, string> = {};
  for (const name of artifactNames) {
    const p = join(ARTIFACTS, name);
    if (existsSync(p)) artifactHashes[name] = sha256File(p);
  }

  const gateDoc = {
    project: "P025 GuidancePulse",
    spec_version: "1.1.0",
    gate: "S0",
    verdict: overall,
    generated_at_utc: new Date().toISOString(),
    environment: envInfo,
    gates,
    supporting_evidence: {
      typecheck: { exit_code: typecheck.exit_code, verdict: typecheckOk ? "PASS" : "FAIL" },
      test_golden: { exit_code: goldenTest.exit_code, passed: goldenCounts.passed, failed: goldenCounts.failed },
      test_oracle: { exit_code: oracleTest.exit_code },
      test_full: { exit_code: fullTest.exit_code, passed: fullCounts.passed, failed: fullCounts.failed, files: fullCounts.files },
      verdict: supportingOk ? "PASS" : "FAIL",
    },
    canonical_replay_sha256: repeatHash,
    commands,
    // Defensive copy: gateDoc must never share the mutable
    // artifactHashes object (R1 P1-R1-02 / old F-26 aliasing bug),
    // and S0_GATE.json itself is never added to it — no self-hash.
    // The final S0_GATE.json SHA-256 is recorded only in
    // logs/s0-gate.log, never in the file itself.
    artifacts_sha256: { ...artifactHashes },
    // R1 P1-R1-02: filled in below by the privacy second pass
    // (draft bytes) and the final byte scan (exact final bytes),
    // both numeric-only — no canary string is ever embedded here.
    privacy_second_pass: null as {
      second_pass: {
        files: PrivacyByteScanFile[];
        total_hits: number;
        verdict: "PASS" | "FAIL";
      };
      final_pass: {
        files: PrivacyByteScanFile[];
        total_hits: number;
        verdict: "PASS" | "FAIL";
      };
      verdict: "PASS" | "FAIL";
    } | null,
    notes: [
      "S0_GATE.json and S0_GATE.md are never in artifacts_sha256 (no self-hash); their SHA-256 values are recorded only in logs/s0-gate.log.",
      "generated_at_utc is report metadata only; it is NOT part of the canonical replay hash (IMPLEMENTATION_PLAN §8.4).",
      "Perf p95 is measured on fresh node subprocesses (one process per timed run, incl. startup + SQLite read); the pure state machine is never substituted.",
      "The perf fixture dir and hook build dir are removed after the privacy scan; re-running `npm run s0:gate` reproduces them and all evidence.",
      "Privacy gate 7 requires three simultaneous zeros: round-1 scan of persisted outputs, round-2 scan of the draft S0_GATE.json/.md bytes, and a final byte scan of the exact bytes written to disk. Rounds 2/3 record counts only, never canary strings; the final scan happens before any byte is written, and the written files are read back and SHA-verified against the scanned bytes.",
    ],
  };

  // The report files are serialised in memory first (see the
  // privacy second/final passes below); nothing is written to
  // disk until the final byte scan has passed on those exact bytes.
  // buildGateMd renders the current gateDoc: once for the draft
  // bytes (privacy_second_pass still null, section omitted), and
  // again for the final bytes (with the pass results embedded).
  const buildGateMd = (): string =>
    [
      "# S0 Gate — P025 GuidancePulse",
      "",
      `**Verdict: ${gateDoc.verdict}**`,
      "",
      `Generated: ${gateDoc.generated_at_utc} | Git commit: ${gitCommit} | Node: ${envInfo.node} | Platform: ${envInfo.platform}`,
      "",
      "## Hard gates (all must pass)",
      "",
      "| Gate | Measured | Threshold | Verdict |",
      "|---|---|---|---|",
      ...gates.map((g) => `| ${g.gate} | ${g.measured} | ${g.threshold} | **${g.verdict}** |`),
      "",
      "## Supporting evidence",
      "",
      `- typecheck: exit ${typecheck.exit_code} (${typecheckOk ? "PASS" : "FAIL"})`,
      `- test:golden: exit ${goldenTest.exit_code}, ${goldenCounts.passed} passed / ${goldenCounts.failed} failed`,
      `- test:oracle: exit ${oracleTest.exit_code}`,
      `- npm test (full): exit ${fullTest.exit_code}, ${fullCounts.passed} passed / ${fullCounts.failed} failed, ${fullCounts.files} files`,
      "",
      `Canonical replay SHA-256 (100 runs): \`${repeatHash ?? "n/a"}\``,
      "",
      ...(gateDoc.privacy_second_pass === null
        ? []
        : [
            "## Privacy second + final passes (S0_GATE.json/.md bytes)",
            "",
            `Second pass (draft report bytes): ${gateDoc.privacy_second_pass.second_pass.total_hits} canary hit(s) across ${gateDoc.privacy_second_pass.second_pass.files.length} file(s) — **${gateDoc.privacy_second_pass.second_pass.verdict}**.`,
            `Final byte scan (exact bytes written to disk): ${gateDoc.privacy_second_pass.final_pass.total_hits} canary hit(s) across ${gateDoc.privacy_second_pass.final_pass.files.length} file(s) — **${gateDoc.privacy_second_pass.final_pass.verdict}**.`,
            "",
          ]),
      "## Artifacts (sha256)",
      "",
      ...Object.entries(artifactHashes).map(([name, hash]) => `- \`${name}\`: \`${hash}\``),
      "",
      ...(gateDoc.verdict === "FAIL"
        ? ["## Failure", "", `S0 = FAIL. Failing gate(s): ${gates.filter((g) => g.verdict === "FAIL").map((g) => g.gate).join("; ")}. T011/T012/T014 are BLOCKED. The p95 threshold applied is the v1.1.0 spec value (p95 < 500ms); no fixture was changed and no measurement calibre was altered to reach this verdict.`, ""]
        : []),
    ].join("\n");
  // ---- privacy second pass (FIX-T013, old F-07; R1 P1-R1-02) -----
  // Round 2 scans the DRAFT report bytes in memory (gateDoc with
  // privacy_second_pass still null — the same bytes that would
  // have been written first). A hit here is a real leak in the
  // report files and flips gate 7 (and the overall verdict) to
  // FAIL. privacy-scan.json itself is not byte-scanned in this
  // round: its `canaries` field intentionally lists the searched
  // strings, so a byte scan would self-flag.
  const serializeGateJson = (): string => JSON.stringify(gateDoc, null, 2) + "\n";
  let gateJsonText = serializeGateJson();
  let gateMdText = buildGateMd();
  const secondPass = scanPrivacyBytes([
    { path: "artifacts/s0/S0_GATE.json", bytes: Buffer.from(gateJsonText, "utf-8") },
    { path: "artifacts/s0/S0_GATE.md", bytes: Buffer.from(gateMdText, "utf-8") },
  ]);
  log(`privacy second pass (draft bytes) files=${secondPass.files.length} total_canary_hits=${secondPass.totalHits}`);
  // The final pass below is embedded optimistically as 0/PASS:
  // the final byte scan verifies that claim on the exact bytes
  // before anything is written. If it does not hold, the verdicts
  // are flipped, the bytes are rebuilt with the true counts, and
  // the rebuilt bytes are scanned once more before writing.
  // (The final pass records per-file hit counts but no byte
  // lengths: a file cannot embed its own byte length — the
  // lengths are verified instead by the read-back SHA check below
  // and logged.)
  const privacySecondPass: NonNullable<typeof gateDoc.privacy_second_pass> = {
    second_pass: {
      files: secondPass.files,
      total_hits: secondPass.totalHits,
      verdict: secondPass.totalHits === 0 ? "PASS" : "FAIL",
    },
    final_pass: {
      files: [
        { path: "artifacts/s0/S0_GATE.json", total_hits: 0 },
        { path: "artifacts/s0/S0_GATE.md", total_hits: 0 },
      ],
      total_hits: 0,
      verdict: "PASS",
    },
    verdict: secondPass.totalHits === 0 ? "PASS" : "FAIL",
  };
  gateDoc.privacy_second_pass = privacySecondPass;
  const flipPrivacyGate = (reason: string): void => {
    const privacyGate = gates.find((g) => g.gate === "prompt/source persistence leaks 0");
    if (privacyGate !== undefined) {
      privacyGate.verdict = "FAIL";
      privacyGate.measured += `; ${reason}`;
    }
    overall = "FAIL";
    gateDoc.verdict = "FAIL";
    overallFailReason += `${reason}; `;
  };
  if (secondPass.totalHits > 0) {
    flipPrivacyGate(`second pass over S0_GATE.json/.md found ${secondPass.totalHits} canary hit(s)`);
  }

  // ---- privacy final byte scan (R1 P1-R1-02) ----------------------
  // Serialise the FINAL report bytes in memory — byte-identical
  // to what will be written (JSON.stringify(..., null, 2) + "\n";
  // the .md is built from the same gateDoc) — and scan those
  // exact bytes. Only 0 hits may be written to disk.
  gateJsonText = serializeGateJson();
  gateMdText = buildGateMd();
  let finalScan = scanPrivacyBytes([
    { path: "artifacts/s0/S0_GATE.json", bytes: Buffer.from(gateJsonText, "utf-8") },
    { path: "artifacts/s0/S0_GATE.md", bytes: Buffer.from(gateMdText, "utf-8") },
  ]);
  log(`privacy final byte scan files=${finalScan.files.length} total_canary_hits=${finalScan.totalHits}`);
  if (finalScan.totalHits > 0) {
    // The optimistic final-pass claim did not hold: flip the
    // verdicts, rebuild the bytes with the true counts, and scan
    // the rebuilt bytes once more. The flip only changes
    // verdict/count text, so it cannot introduce a canary — but
    // the rebuilt bytes are still verified by the rescan, whose
    // result is logged, not silently assumed.
    flipPrivacyGate(`final byte scan over S0_GATE.json/.md found ${finalScan.totalHits} canary hit(s)`);
    privacySecondPass.final_pass = {
      files: finalScan.files.map((f) => ({ path: f.path, total_hits: f.total_hits })),
      total_hits: finalScan.totalHits,
      verdict: "FAIL",
    };
    privacySecondPass.verdict = "FAIL";
    gateJsonText = serializeGateJson();
    gateMdText = buildGateMd();
    const rescan = scanPrivacyBytes([
      { path: "artifacts/s0/S0_GATE.json", bytes: Buffer.from(gateJsonText, "utf-8") },
      { path: "artifacts/s0/S0_GATE.md", bytes: Buffer.from(gateMdText, "utf-8") },
    ]);
    log(`privacy final byte rescan after FAIL flip files=${rescan.files.length} total_canary_hits=${rescan.totalHits}`);
    finalScan = rescan;
  }
  if (secondPass.totalHits > 0 || finalScan.totalHits > 0) {
    log(`privacy second/final pass FAILED: overall verdict flipped to FAIL — ${overallFailReason.trim()}`);
  }

  // ---- write the scanned bytes, then verify by reading back ------
  // privacy-scan.json is NOT touched after this point: it reached
  // its final bytes before gateDoc was built, so the hash recorded
  // in artifacts_sha256 still matches its final bytes.
  writeFileSync(join(ARTIFACTS, "S0_GATE.json"), gateJsonText, "utf-8");
  writeFileSync(join(ARTIFACTS, "S0_GATE.md"), gateMdText, "utf-8");
  const jsonReadBack = readFileSync(join(ARTIFACTS, "S0_GATE.json"));
  const mdReadBack = readFileSync(join(ARTIFACTS, "S0_GATE.md"));
  const jsonSha = sha256Buffer(jsonReadBack);
  const mdSha = sha256Buffer(mdReadBack);
  const readBackOk =
    jsonSha === sha256Text(gateJsonText) && mdSha === sha256Text(gateMdText);
  if (!readBackOk) {
    // Verify only, never rewrite: a mismatch means the disk bytes
    // are not the scanned bytes, so the gate cannot PASS.
    log(`ERROR: read-back SHA mismatch for S0_GATE.json/.md (disk bytes differ from scanned bytes)`);
    overall = "FAIL";
  }
  // The S0_GATE.json/.md SHA-256 values are recorded ONLY here in
  // the log (with their byte lengths), never inside the files
  // themselves — no self-hash (R1 P1-R1-02 / old F-26).
  log(`wrote artifacts/s0/S0_GATE.json bytes=${jsonReadBack.length} sha256=${jsonSha} read_back_match=${readBackOk}`);
  log(`wrote artifacts/s0/S0_GATE.md bytes=${mdReadBack.length} sha256=${mdSha} read_back_match=${readBackOk}`);
  log(`S0 gate done: ${overall}`);
  return overall === "PASS" && readBackOk ? 0 : 1;
}

/**
 * s0:gate entry — run unconditionally. This file is only ever
 * executed as the gate entry (nothing imports it); the repo's
 * script pattern is a top-level main() call (cf.
 * scripts/demo-report.ts). Note vite-node does not put the entry
 * file in process.argv, so an argv-based "am I the entry" check
 * would never fire — that is why the imported libraries
 * (s0-replay, perf-hook, repeat-s0) carry no CLI block of their
 * own.
 */
main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`s0:gate failed with uncaught error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
