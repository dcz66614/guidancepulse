/**
 * Hook end-to-end performance measurement — P025 GuidancePulse, T010.
 *
 * Measures the REAL Hook subprocess cost per IMPLEMENTATION_PLAN
 * §8.3 (v1.1.0): from Claude Code starting the Hook subprocess to the Hook
 * printing its decision and exiting — including Node process
 * startup, better-sqlite3 load, JSON parse, SQLite read, path
 * match, and decision output. The pure in-memory state machine is
 * NEVER substituted for this measurement.
 *
 * Method:
 *   1. Compile `scripts/hook-entry.ts` with `tsc` into
 *      `artifacts/s0/.hook-build/` (plain `node` runs the compiled
 *      output; vite-node is never in the measured path), then vendor
 *      the entry's runtime dependencies (`yaml`, `better-sqlite3`)
 *      into `.hook-build/node_modules/` exactly as `install` does
 *      for a real project (FIX-T013 F-17) — the measured entry must
 *      resolve its dependencies the way an installed entry does,
 *      not via the source tree's `node_modules` above it.
 *   2. Build a synthetic `.guidancepulse`-style fixture dir
 *      (`artifacts/s0/.perf-fixture/`): config YAML taken from
 *      fixture C01, a fixed test path key, and a SQLite state file.
 *   3. Seed one FRESH lease with a PostToolUse Read subprocess call
 *      (the first-ever spawn = the cold start). v1.1.0
 *      (PROJECT_BOOK §9.6; IMPLEMENTATION_PLAN §8.3) requires the
 *      cold-start sample to be INSIDE the 100 timed samples, so
 *      the seed duration is timed sample #1
 *      (`cold_start_sample_index` 0) AND is also reported
 *      separately as `cold_start_ms`; it is never excluded from
 *      the p95 sample. The seed must come first: no Write call can
 *      return ALLOW before a lease exists, so the first spawn
 *      cannot be a warm-up. The seed is a fresh `node` subprocess
 *      like every other sample (startup, module load, SQLite,
 *      parse, match, decision, output, exit).
 *   4. Run exactly `warmup` (5) untimed PreToolUse Write calls,
 *      then `runs - 1` further timed PreToolUse Write calls,
 *      sequentially, each in a fresh `node` process — so the timed
 *      sample is exactly `runs` (100), including the cold start.
 *      Every timed input carries the S0 canary Prompt / source /
 *      token strings (see CANARIES) so the same runs also prove the
 *      privacy gate: the canaries must appear 0 times in the state
 *      dir afterwards (checked by `scripts/s0-gate.ts`).
 *   5. Report min / mean / p50 / p95 / p99 / max. p95 is the value
 *      at index ceil(0.95*n)-1 of the sorted durations.
 *
 * The S0 threshold is p95 < 500 ms (PROJECT_BOOK §9.5/§9.6;
 * IMPLEMENTATION_PLAN §8.3/§8.6, v1.1.0; strict: p95 == 500 ms is
 * FAIL). This script
 * is a measurement tool: it exits 0 when the measurement itself
 * completed and produced a valid report, even when p95 misses the
 * threshold. The verdict lives in `S0_GATE.json`, written by the
 * gate — a slow measurement must never be re-labelled by changing
 * what is measured.
 *
 * No network is used. All data is synthetic. Temporary build and
 * fixture dirs are removed at the end of a successful measurement
 * (use `--keep-temp` to keep them for debugging); the evidence is
 * `artifacts/s0/perf-hook.json`.
 */

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import { loadFixtures, S0_TEST_PATH_KEY } from "./s0-replay.js";
import { vendorHookDependencies } from "../src/cli/vendor-deps.js";

/**
 * S0 hard threshold (v1.1.0: PROJECT_BOOK §9.5/§9.6;
 * IMPLEMENTATION_PLAN §8.3/§8.6): Hook end-to-end p95 < 500 ms,
 * strict — p95 == 500 ms is FAIL. Revised from <10 ms by spec
 * v1.1.0; the code applies the spec value, it never lowers it.
 */
export const PERF_THRESHOLD_MS = 500;

/** Synthetic canaries (T003 pattern, S0-gate values). Must never persist. */
export const CANARY_PROMPT = "CANARY-S0GATE-PROMPT-5c1e8a04-syn-101";
export const CANARY_SOURCE = "CANARY-S0GATE-SOURCE-7d2b9f31-syn-102";
export const CANARY_TOKEN = "CANARY-S0GATE-TOKEN-3a9e6c58-syn-103";
export const CANARIES: readonly string[] = [CANARY_PROMPT, CANARY_SOURCE, CANARY_TOKEN];

/** Fixed logical timestamp for the seeded lease (determinism aid). */
export const PERF_FIXED_NOW = "2026-11-15T10:00:00Z";
export const PERF_SESSION = "sess-s0-perf";
export const PERF_CWD = "/proj";
export const PERF_PHASE = "implementation";

export interface PerfStats {
  n: number;
  min_ms: number;
  mean_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
}

export interface PerfResult {
  threshold_ms: number;
  verdict: "PASS" | "FAIL";
  node_version: string;
  platform: string;
  runs: number;
  warmup_runs: number;
  stats: PerfStats;
  durations_ms: number[];
  cold_start_ms: number;
  /**
   * Index of the cold-start sample inside durations_ms (always 0:
   * the seed spawn). v1.1.0 (IMPLEMENTATION_PLAN §8.5) requires
   * the cold-start sample marker in perf-hook.json.
   */
  cold_start_sample_index: number;
  seed: { exit_code: number; persisted: boolean };
  build: { entry_sha256: string; tsc_command: string; tsc_ms: number; entry_js: string; dependencies_vendored: string[] };
  fixture: { fixture_id: string; session: string; cwd: string; phase: string };
  failures: string[];
}

export interface MeasureOptions {
  runs?: number;
  warmup?: number;
  root?: string;
  outPath?: string | null;
  keepTemp?: boolean;
}

/** p-quantile of sorted samples; index ceil(p/100*n)-1, clamped. */
export function percentile(sortedMs: readonly number[], p: number): number {
  if (sortedMs.length === 0) throw new Error("percentile of empty sample");
  const idx = Math.min(sortedMs.length - 1, Math.max(0, Math.ceil((p / 100) * sortedMs.length) - 1));
  return sortedMs[idx] as number;
}

export function computeStats(durationsMs: readonly number[]): PerfStats {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const mean = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length;
  return {
    n: durationsMs.length,
    min_ms: sorted[0] as number,
    mean_ms: mean,
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    p99_ms: percentile(sorted, 99),
    max_ms: sorted[sorted.length - 1] as number,
  };
}

interface SpawnOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function spawnHook(entryJs: string, env: NodeJS.ProcessEnv, stdinText: string): Promise<SpawnOutcome> {
  const start = process.hrtime.bigint();
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [entryJs], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolvePromise({ code, stdout, stderr, durationMs });
    });
    child.stdin.end(stdinText);
  });
}

/** Config YAML for the perf fixture, taken verbatim from fixture C01. */
export function perfConfigYaml(): string {
  const c01 = loadFixtures().find((f) => f.id === "C01");
  if (c01 === undefined) throw new Error("fixture C01 not found");
  return stringifyYaml({
    version: 1,
    defaults: { mode: "warn", max_successful_edits: 5, unobservable_read: "deny" },
    phases: c01.config.phases,
    rules: c01.config.rules.map((rule) => ({
      id: rule.id,
      source: rule.source,
      applies_to: rule.applies_to,
      phases: rule.phases,
      mode: rule.mode,
      max_successful_edits: rule.max_successful_edits,
    })),
  });
}

function seedInput(): string {
  return JSON.stringify({
    hook_event_name: "PostToolUse",
    session_id: PERF_SESSION,
    cwd: PERF_CWD,
    tool_name: "Read",
    tool_input: { file_path: `${PERF_CWD}/CLAUDE.md` },
    tool_response: { success: true },
  });
}

/** Timed PreToolUse Write input; carries all three S0 canaries. */
export function timedInput(): string {
  return JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: PERF_SESSION,
    cwd: PERF_CWD,
    tool_name: "Write",
    tool_input: { file_path: `${PERF_CWD}/src/auth/login.ts`, content: CANARY_SOURCE },
    prompt: CANARY_PROMPT,
    tool_response: { prompt: CANARY_PROMPT },
    transcript_path: `/tmp/synthetic/${CANARY_PROMPT}.jsonl`,
    env: { SYNTHETIC_API_KEY: CANARY_TOKEN },
  });
}

function hookEnv(fixtureDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GP_CONFIG: join(fixtureDir, "config.yaml"),
    GP_DB: join(fixtureDir, "state.sqlite"),
    GP_PATH_KEY: join(fixtureDir, "path-key.bin"),
    GP_PHASE: PERF_PHASE,
    GP_NOW: PERF_FIXED_NOW,
  };
}

export async function measureHookPerf(options: MeasureOptions = {}): Promise<PerfResult> {
  const runs = options.runs ?? 100;
  if (runs < 1) throw new Error("runs must be >= 1: the cold-start seed is timed sample #1");
  const warmup = options.warmup ?? 5;
  const root = resolve(options.root ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const outPath = options.outPath ?? join(root, "artifacts", "s0", "perf-hook.json");
  const buildDir = join(root, "artifacts", "s0", ".hook-build");
  const fixtureDir = join(root, "artifacts", "s0", ".perf-fixture");
  const failures: string[] = [];

  rmSync(buildDir, { recursive: true, force: true });
  rmSync(fixtureDir, { recursive: true, force: true });
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(join(fixtureDir, "config.yaml"), perfConfigYaml(), "utf-8");
  writeFileSync(join(fixtureDir, "path-key.bin"), Buffer.from(S0_TEST_PATH_KEY, "utf-8"));
  const entryTs = join(root, "scripts", "hook-entry.ts");
  const entrySha = createHash("sha256").update(readFileSync(entryTs)).digest("hex");

  // 1. Compile the hook entry with tsc (plain node runs the output).
  const tscArgs = [
    "tsc",
    "scripts/hook-entry.ts",
    "--outDir",
    "artifacts/s0/.hook-build",
    "--module",
    "nodenext",
    "--moduleResolution",
    "nodenext",
    "--target",
    "es2022",
    "--lib",
    "es2022,dom,dom.iterable",
    "--types",
    "node",
    "--jsx",
    "react-jsx",
    "--esModuleInterop",
    "--skipLibCheck",
    "--strict",
    "--resolveJsonModule",
    "--forceConsistentCasingInFileNames",
  ];
  const tscStart = process.hrtime.bigint();
  try {
    execFileSync("npx", tscArgs, { cwd: root, stdio: "pipe", encoding: "utf-8" });
  } catch (error) {
    const detail = error instanceof Error ? (error as { stdout?: string }).stdout ?? error.message : String(error);
    throw new Error(`tsc compile of hook-entry failed: ${detail}`);
  }
  const tscMs = Number(process.hrtime.bigint() - tscStart) / 1e6;
  const entryJs = join(buildDir, "scripts", "hook-entry.js");
  if (!existsSync(entryJs)) throw new Error(`compiled hook entry missing: ${entryJs}`);
  // Vendor the runtime dependencies into the measured build dir,
  // exactly as install does (FIX-T013 F-17): the timed entry must
  // resolve yaml / better-sqlite3 from .hook-build/node_modules/,
  // the way an installed entry does — not from the source tree
  // above it. Vendoring happens once, before any timed spawn, so
  // it is not part of the measured per-call cost.
  const dependenciesVendored = vendorHookDependencies(root, buildDir);

  const env = hookEnv(fixtureDir);
  try {
    // 2. Seed one FRESH lease (first-ever spawn = cold start).
    // v1.1.0 (PROJECT_BOOK §9.6; IMPLEMENTATION_PLAN §8.3): the
    // cold-start sample MUST be inside the 100 timed samples, so
    // the seed duration is timed sample #1 (durations[0]) as well
    // as being reported separately as cold_start_ms. It is never
    // excluded from the p95 sample; a failed seed still counts
    // (failures fail the verdict, never silently drop a sample).
    const seed = await spawnHook(entryJs, env, seedInput());
    const coldStartMs = seed.durationMs;
    const durations: number[] = [coldStartMs];
    // The seed Read of CLAUDE.md credentials every rule sourced
    // from it (auth-change-safety AND api-contract in fixture C01),
    // so the entry prints one result per credentialed guidance
    // (an array when >1). Persisted = every result persisted.
    let seedPersisted = false;
    try {
      const parsed: unknown = JSON.parse(seed.stdout);
      const results = Array.isArray(parsed) ? parsed : [parsed];
      seedPersisted =
        results.length > 0 &&
        results.every(
          (r) => typeof r === "object" && r !== null && (r as { persisted?: boolean }).persisted === true,
        );
    } catch {
      seedPersisted = false;
    }
    if (seed.code !== 0 || !seedPersisted) {
      failures.push(`seed run failed: exit=${seed.code} stdout=${seed.stdout.slice(0, 200)} stderr=${seed.stderr.slice(0, 200)}`);
    }

    // 3. Warm-up runs (exactly 5, untimed, excluded from the p95 sample).
    for (let i = 0; i < warmup; i++) {
      const run = await spawnHook(entryJs, env, timedInput());
      if (run.code !== 0) failures.push(`warmup run ${i} exit=${run.code} stderr=${run.stderr.slice(0, 200)}`);
    }

    // 4. Timed runs 2..runs, sequential, each in a fresh node
    // process (timed sample #1 is the seed above, so the sample
    // is exactly `runs` including the cold start).
    for (let i = 1; i < runs; i++) {
      const run = await spawnHook(entryJs, env, timedInput());
      if (run.code !== 0) {
        failures.push(`timed run ${i} exit=${run.code} stderr=${run.stderr.slice(0, 200)}`);
        continue;
      }
      let allow = false;
      try {
        const out = JSON.parse(run.stdout) as {
          hookSpecificOutput?: { permissionDecision?: string };
        };
        allow = out.hookSpecificOutput?.permissionDecision === "allow";
      } catch {
        allow = false;
      }
      if (!allow) failures.push(`timed run ${i} did not return allow: stdout=${run.stdout.slice(0, 200)}`);
      durations.push(run.durationMs);
    }
    if (durations.length === 0) throw new Error("no timed runs produced a measurement");

    const stats = computeStats(durations);
    const result: PerfResult = {
      threshold_ms: PERF_THRESHOLD_MS,
      verdict: stats.p95_ms < PERF_THRESHOLD_MS && failures.length === 0 ? "PASS" : "FAIL",
      node_version: process.version,
      platform: `${process.platform}-${process.arch}`,
      runs,
      warmup_runs: warmup,
      stats,
      durations_ms: durations,
      cold_start_ms: coldStartMs,
      cold_start_sample_index: 0,
      seed: { exit_code: seed.code ?? -1, persisted: seedPersisted },
      build: { entry_sha256: entrySha, tsc_command: `npx ${tscArgs.join(" ")}`, tsc_ms: tscMs, entry_js: entryJs, dependencies_vendored: dependenciesVendored },
      fixture: { fixture_id: "C01", session: PERF_SESSION, cwd: PERF_CWD, phase: PERF_PHASE },
      failures,
    };
    if (outPath !== null) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
    }
    return result;
  } finally {
    if (!options.keepTemp) {
      rmSync(buildDir, { recursive: true, force: true });
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  }
}

export function parsePerfArgs(argv: readonly string[]): { runs: number; out: string | null; keepTemp: boolean } {
  let runs = 100;
  let out: string | null = null;
  let keepTemp = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs" && argv[i + 1] !== undefined) {
      runs = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--out" && argv[i + 1] !== undefined) {
      out = argv[i + 1] as string;
      i += 1;
    } else if (argv[i] === "--keep-temp") {
      keepTemp = true;
    }
  }
  return { runs, out, keepTemp };
}

