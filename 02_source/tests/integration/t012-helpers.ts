/**
 * Shared helpers for T012 integration / E2E tests — P025 GuidancePulse.
 *
 * Everything here drives the REAL installed artifacts: `installProject`
 * (real `tsc` hook build) and the generated `.guidancepulse/hooks/*.js`
 * launcher scripts, spawned as plain `node` subprocesses exactly as
 * Claude Code would invoke them. No mocks of the gate, store, or
 * adapter. All data is synthetic; no network, no real user config.
 *
 * Temp project dirs live INSIDE the repo tree (`.tmp-t012-*`).
 * That used to be required so the compiled hook entry could resolve
 * `better-sqlite3` from the tree's `node_modules`; since FIX-T013
 * (F-17) `install` vendors the runtime dependencies into
 * `.build/node_modules/`, the in-tree location is no longer a
 * resolution crutch — foreign-project coverage lives in
 * `tests/integration/fix-t013.test.ts`. They are removed in
 * `teardownChainProject` and gitignored.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installProject } from "../../src/cli/install.js";
import type { GuidanceLease } from "../../src/core/index.js";
import type { Canary } from "../../src/privacy/index.js";
import { assertNoCanariesInFile } from "../../src/privacy/index.js";
import { GuidancePulseStore } from "../../src/store/index.js";

export const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SESSION = "synthetic-session-t012";
export const AGENT = "main";
export const GUIDANCE = "auth-change-safety";
export const PHASE = "implementation";
export const WRITE_TARGET = "src/auth/login.ts";

/** Fixed, increasing timestamps so the chain is deterministic. */
export const T = {
  t0: "2026-11-15T10:00:00Z",
  t1: "2026-11-15T10:01:00Z",
  t2: "2026-11-15T10:02:00Z",
  t3: "2026-11-15T10:03:00Z",
  t4: "2026-11-15T10:04:00Z",
  t5: "2026-11-15T10:05:00Z",
  t6: "2026-11-15T10:06:00Z",
} as const;

/** Synthetic canaries (labelled, never real user data). */
export const CANARIES: readonly Canary[] = [
  { label: "prompt", value: "CANARY-PROMPT-T012-SYNTHETIC-DO-NOT-USE" },
  { label: "source", value: "CANARY-SOURCE-T012 function syntheticSecret() { return 42; }" },
  { label: "cwd", value: "/synthetic-canary-home/t012-secret-project" },
  { label: "api-key", value: "CANARY-API-KEY-T012-SYNTHETIC-0000-0000" },
  { label: "transcript", value: "/synthetic-canary-home/transcript-T012.jsonl" },
];

export function canaryValue(label: string): string {
  const found = CANARIES.find((c) => c.label === label);
  if (found === undefined) throw new Error(`unknown canary label: ${label}`);
  return found.value;
}

export interface ChainProject {
  dir: string;
  dbPath: string;
  configPath: string;
  hooksDir: string;
  settingsPath: string;
}

/**
 * Create a temp project dir and run the real installer (with the real
 * `tsc` hook build). Returns the project paths. The caller must call
 * `teardownChainProject` in a `finally` block.
 */
export function setupChainProject(tag: string): ChainProject {
  const dir = mkdtempSync(join(process.cwd(), `.tmp-t012-${tag}-`));
  const result = installProject(dir, { sourceRoot: SOURCE_ROOT, buildHooks: true });
  if (result.hookBuild?.status !== "built") {
    throw new Error(`hook build failed in ${dir}: ${JSON.stringify(result.hookBuild)}`);
  }
  if (result.added !== 6) {
    throw new Error(`install added ${result.added} hooks, expected 6`);
  }
  return {
    dir,
    dbPath: join(dir, ".guidancepulse", "state.sqlite"),
    configPath: join(dir, ".guidancepulse", "config.yaml"),
    hooksDir: join(dir, ".guidancepulse", "hooks"),
    settingsPath: join(dir, ".claude", "settings.local.json"),
  };
}

export function teardownChainProject(project: ChainProject): void {
  rmSync(project.dir, { recursive: true, force: true });
}

export interface HookRun {
  status: number | null;
  stdout: string;
  stderr: string;
  json: unknown;
}

/**
 * Run one synthetic Hook JSON object through an installed launcher
 * script as a plain `node` subprocess — the exact invocation shape
 * Claude Code uses (stdin JSON in, one JSON object on stdout, exit
 * code out). `GP_PHASE` is the live phase; `GP_NOW` freezes the
 * clock for determinism.
 */
export function runHook(
  project: ChainProject,
  launcherFile: string,
  event: Record<string, unknown>,
  now: string,
  extraEnv: Record<string, string> = {},
): HookRun {
  const run = spawnSync("node", [join(project.hooksDir, launcherFile)], {
    input: JSON.stringify(event),
    encoding: "utf-8",
    timeout: 60000,
    env: { ...process.env, GP_PHASE: PHASE, GP_NOW: now, ...extraEnv },
  });
  let json: unknown = null;
  const trimmed = (run.stdout ?? "").trim();
  if (trimmed.length > 0) {
    try {
      json = JSON.parse(trimmed) as unknown;
    } catch {
      json = null;
    }
  }
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "", json };
}

/** Read the lease for (SESSION, main, GUIDANCE) via a read-only store open. */
export function readLease(project: ChainProject): GuidanceLease | undefined {
  const store = GuidancePulseStore.open(project.dbPath, { readonly: true });
  try {
    return store
      .listLeasesForScope(SESSION, AGENT)
      .find((lease) => lease.guidanceId === GUIDANCE);
  } finally {
    store.close();
  }
}

/** All WRITE_CHECKED decisions recorded in the store, in order. */
export function writeDecisions(project: ChainProject): string[] {
  const store = GuidancePulseStore.open(project.dbPath, { readonly: true });
  try {
    return store
      .listEvents({ sessionScopeId: SESSION })
      .filter((event) => event.type === "WRITE_CHECKED")
      .map((event) => (event.type === "WRITE_CHECKED" ? event.decision : ""));
  } finally {
    store.close();
  }
}

/** All persisted event types recorded in the store, in order. */
export function eventTypes(project: ChainProject): string[] {
  const store = GuidancePulseStore.open(project.dbPath, { readonly: true });
  try {
    return store.listEvents({ sessionScopeId: SESSION }).map((event) => event.type);
  } finally {
    store.close();
  }
}

/**
 * Assert none of the canaries (and not the absolute project path)
 * occur in any persisted file the chain writes: the SQLite file, its
 * WAL/sidecar files, the config, and the installed settings file.
 * The compiled hook entry under `.build/` is excluded: it is code,
 * not persisted Hook data.
 */
export function assertNoCanariesPersisted(project: ChainProject): void {
  const targets = [
    project.dbPath,
    `${project.dbPath}-wal`,
    `${project.dbPath}-shm`,
    project.configPath,
    project.settingsPath,
  ].filter((path) => existsSync(path));
  for (const target of targets) {
    assertNoCanariesInFile(target, CANARIES);
  }
  for (const target of targets) {
    const bytes = readFileSync(target);
    if (bytes.indexOf(Buffer.from(project.dir, "utf-8")) !== -1) {
      throw new Error(`absolute project path leaked into persisted file: ${target}`);
    }
  }
}

/** Assert a captured hook stdout/stderr pair contains no canary value. */
export function assertOutputHasNoCanaries(run: HookRun, step: string): void {
  for (const canary of CANARIES) {
    if (run.stdout.includes(canary.value) || run.stderr.includes(canary.value)) {
      throw new Error(`canary ${canary.label} leaked into hook output at step ${step}`);
    }
  }
}

/** Base Hook fields shared by every synthetic event in the chain. */
export function baseEvent(
  project: ChainProject,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    session_id: SESSION,
    cwd: project.dir,
    transcript_path: canaryValue("transcript"),
    prompt: canaryValue("prompt"),
    ...overrides,
  };
}

/** A PreToolUse Write event for the protected target (with a canary body). */
export function writeEvent(project: ChainProject): Record<string, unknown> {
  return baseEvent(project, {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: {
      file_path: join(project.dir, WRITE_TARGET),
      content: canaryValue("source"),
    },
  });
}

/** An InstructionsLoaded event that loads the guidance source file. */
export function readEvent(project: ChainProject): Record<string, unknown> {
  return baseEvent(project, {
    hook_event_name: "InstructionsLoaded",
    loaded_paths: ["CLAUDE.md"],
  });
}

/** A PostToolUse Read-success event for the guidance source file. */
export function postReadEvent(project: ChainProject): Record<string, unknown> {
  return baseEvent(project, {
    hook_event_name: "PostToolUse",
    tool_name: "Read",
    tool_input: { file_path: join(project.dir, "CLAUDE.md") },
    tool_response: {
      success: true,
      stdout: canaryValue("source"),
      content: canaryValue("api-key"),
    },
  });
}

/** A PreCompact event. */
export function preCompactEvent(project: ChainProject): Record<string, unknown> {
  return baseEvent(project, {
    hook_event_name: "PreCompact",
  });
}

/** Scratch dir helper for tests that do not need a hook build. */
export function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
