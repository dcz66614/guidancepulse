/**
 * `guidancepulse install` — P025 GuidancePulse, T011 (spec v1.1.0).
 *
 * Source of truth: IMPLEMENTATION_PLAN.md v1.1.0 §7.1 (Hook 配置目标形
 * 态 — the six Hook entries below are verbatim from that table, with
 * `onFailure: "block"` on PreToolUse / PreCompact and `timeout: 10`
 * on the synchronous hooks) and §7.2 (`install --project .` — 备份并
 * 合并 Claude Code Hook), PROJECT_BOOK.md v1.1.0 §5.1/§5.2 (init
 * layout `.guidancepulse/`; install backs up and merges
 * `.claude/settings.local.json`), and HANDOFF_T001.md (Claude Code
 * ≥ v2.1.295 is the version gate for `onFailure: "block"`; this VM
 * has no Claude Code installed, so live Hook triggering is NOT
 * verified here — see 00_control/HANDOFF_T001.md and
 * docs/environment/T001_ENVIRONMENT.md).
 *
 * Safety contract (the T011 card's acceptance standard):
 *
 *   1. 安装幂等 — re-running install over an already-installed
 *      configuration changes nothing (`changed: false`).
 *   2. 先备份 — before the settings file is touched, its current
 *      bytes are copied to
 *      `.claude/settings.local.json.guidancepulse-backup.json`.
 *      The backup is written only when the merge will actually
 *      change the file and no backup exists yet, so a re-install
 *      never snapshots the already-installed config as the
 *      "pre-install" backup, and never overwrites the true
 *      pre-install original.
 *   3. 只合并自有 Hook — merge only adds the six entries in
 *      `GUIDANCEPULSE_HOOKS`; every other key, matcher group and
 *      hook entry in the user's file is copied through untouched.
 *      An entry is "ours" iff it is a `node` command whose first
 *      arg is `${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/*.js`
 *      (`isGuidancePulseHookEntry`). A pre-existing entry that is
 *      deep-equal to one of ours counts as already installed.
 *   4. 失败回退 — any failure after the backup is written restores
 *      the settings file to the exact bytes this run read at its
 *      start (NOT the earliest backup file — the backup is only the
 *      user's manual-restore copy; see FIX-T013 F-19), or deletes
 *      it when it did not exist before install. A failure log line
 *      is appended to `.guidancepulse/install-failure.log`. The
 *      settings file is never left half-merged, and user
 *      configuration is never overwritten by a failed install.
 *   5. 原子写 — the merged settings are written to a temp file in
 *      the same directory and renamed over the target.
 *
 * Hook entry scripts: the settings entries point at
 * `.guidancepulse/hooks/<event>.js`. `install` materialises those
 * files. Each is a thin launcher (CommonJS/ESM-neutral, dynamic
 * `import()` only) that defaults `GP_CONFIG` / `GP_DB` /
 * `GP_PATH_KEY` to the project's `.guidancepulse/` files and then
 * imports the compiled hook entry
 * (`.guidancepulse/hooks/.build/scripts/hook-entry.js`). The
 * compiled entry is produced by compiling `scripts/hook-entry.ts`
 * with `tsc`, exactly the way the S0 perf harness does
 * (`scripts/perf-hook.ts`). FIX-T013 (F-17): after the compile,
 * `install` also vendors the entry's runtime dependencies into
 * `.guidancepulse/hooks/.build/node_modules/` (see
 * `src/cli/vendor-deps.ts`) — the compiled entry keeps bare imports
 * of `yaml` / `better-sqlite3`, and without the vendored copy Node
 * could not resolve them in any project outside the source tree.
 * The vendoring is a local offline file copy from the source
 * tree's own `node_modules`, never `npm install`. When the
 * guidancepulse source tree is not available next to the installer
 * (a foreign project without the package source), the build is
 * skipped and the launchers fail closed at runtime (stderr JSON +
 * exit 2) instead of pretending to work — a missing entry must
 * block writes, never allow them.
 *
 * This module never reads Prompt, Transcript, source code, or any
 * network. The only values it persists are the user's own settings
 * JSON (merged), the generated launcher scripts, and the compiled
 * hook entry.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { initProject } from "./init.js";
import { vendorHookDependencies } from "./vendor-deps.js";

/** Error thrown for install failures. `code` is stable; `message` carries no user config content. */
export class InstallError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "InstallError";
    this.code = code;
  }
}

/** One Claude Code hook command entry (IMPLEMENTATION_PLAN §7.1 shape). */
export interface HookCommandEntry {
  type: "command";
  command: "node";
  args: [string, ...string[]];
  onFailure?: "block";
  timeout?: number;
  async?: boolean;
}

/** One matcher group inside a Hook event array. */
export interface HookMatcherGroup {
  matcher?: string;
  hooks: HookCommandEntry[];
}

/** The `hooks` object of `.claude/settings.local.json`. */
export type HooksConfig = Record<string, HookMatcherGroup[]>;

/** One of GuidancePulse's own Hook entries, per IMPLEMENTATION_PLAN §7.1. */
export interface OwnHook {
  /** Claude Code Hook event name. */
  event: string;
  /** Matcher string, or undefined for events without a matcher. */
  matcher?: string;
  /** File name of the launcher under `.guidancepulse/hooks/`. */
  file: string;
  /** The exact command entry written into settings. */
  entry: HookCommandEntry;
}

/**
 * GuidancePulse's own Hook entries — verbatim from
 * IMPLEMENTATION_PLAN.md v1.1.0 §7.1. PreToolUse matches only
 * Write|Edit; PostToolUse matches Read; PreCompact and PreToolUse
 * carry `onFailure: "block"` (needs Claude Code ≥ v2.1.295 per
 * T001); InstructionsLoaded / CwdChanged are async observation
 * events and must never block.
 */
export const GUIDANCEPULSE_HOOKS: readonly OwnHook[] = [
  {
    event: "PreToolUse",
    matcher: "Write|Edit",
    file: "pre-tool-use.js",
    entry: {
      type: "command",
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-tool-use.js"],
      onFailure: "block",
      timeout: 10,
    },
  },
  {
    event: "PostToolUse",
    matcher: "Read",
    file: "post-tool-use.js",
    entry: {
      type: "command",
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/post-tool-use.js"],
      timeout: 10,
    },
  },
  {
    event: "PreCompact",
    file: "pre-compact.js",
    entry: {
      type: "command",
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-compact.js"],
      onFailure: "block",
      timeout: 10,
    },
  },
  {
    event: "InstructionsLoaded",
    file: "instructions-loaded.js",
    entry: {
      type: "command",
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/instructions-loaded.js"],
      async: true,
    },
  },
  {
    event: "CwdChanged",
    file: "cwd-changed.js",
    entry: {
      type: "command",
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/cwd-changed.js"],
      async: true,
    },
  },
  {
    event: "SubagentStart",
    file: "subagent-start.js",
    entry: {
      type: "command",
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/subagent-start.js"],
    },
  },
] as const;

/** File names (relative to the project root) used by install/uninstall. */
export const SETTINGS_REL_PATH = ".claude/settings.local.json";
export const BACKUP_REL_PATH = ".claude/settings.local.json.guidancepulse-backup.json";
export const GUIDANCEPULSE_DIRNAME = ".guidancepulse";
export const HOOKS_DIRNAME = "hooks";
export const FAILURE_LOG_REL_PATH = ".guidancepulse/install-failure.log";

/** Deep equality for plain JSON values (settings entries only). */
export function jsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * True when a settings hook entry is one of GuidancePulse's own:
 * a `node` command whose first arg is a
 * `${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/*.js` path. Any other
 * entry — including a user's own `node` hook pointing elsewhere —
 * is foreign and must never be touched.
 */
export function isGuidancePulseHookEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as Record<string, unknown>;
  if (e.type !== "command" || e.command !== "node") return false;
  if (!Array.isArray(e.args) || typeof e.args[0] !== "string") return false;
  const arg0 = e.args[0] as string;
  return (
    arg0.startsWith("${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/") &&
    arg0.endsWith(".js")
  );
}

/**
 * Merge GuidancePulse's own Hook entries into an existing `hooks`
 * object. Returns the merged object (a fresh object; the input is
 * not mutated), whether anything changed, and how many entries were
 * added vs already present. Foreign groups/entries pass through
 * byte-for-byte (same JSON). Throws `InstallError`
 * (`INVALID_SETTINGS`) when an event's existing value is not an
 * array — that shape is the user's data and must not be clobbered.
 */
export function mergeOwnHooks(existing: unknown): {
  hooks: HooksConfig;
  changed: boolean;
  added: number;
  alreadyPresent: number;
} {
  const hooks: HooksConfig =
    existing === undefined
      ? {}
      : (structuredClone(existing) as HooksConfig);
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    throw new InstallError("INVALID_SETTINGS", "settings.hooks is not an object");
  }
  let added = 0;
  let alreadyPresent = 0;
  for (const own of GUIDANCEPULSE_HOOKS) {
    const groups = hooks[own.event];
    if (groups === undefined) {
      hooks[own.event] = [
        own.matcher === undefined
          ? { hooks: [own.entry] }
          : { matcher: own.matcher, hooks: [own.entry] },
      ];
      added += 1;
      continue;
    }
    if (!Array.isArray(groups)) {
      throw new InstallError(
        "INVALID_SETTINGS",
        `settings.hooks.${own.event} is not an array`,
      );
    }
    let group = groups.find((g) => (g.matcher ?? undefined) === own.matcher);
    if (group === undefined) {
      group = own.matcher === undefined ? { hooks: [] } : { matcher: own.matcher, hooks: [] };
      groups.push(group);
    }
    if (!Array.isArray(group.hooks)) {
      throw new InstallError(
        "INVALID_SETTINGS",
        `settings.hooks.${own.event} matcher group has no hooks array`,
      );
    }
    if (group.hooks.some((h) => jsonEquals(h, own.entry))) {
      alreadyPresent += 1;
    } else {
      group.hooks.push(structuredClone(own.entry));
      added += 1;
    }
  }
  return { hooks, changed: added > 0, added, alreadyPresent };
}

/**
 * Remove GuidancePulse's own Hook entries from a `hooks` object.
 * Only entries matching `isGuidancePulseHookEntry` are removed; a
 * matcher group left empty by the removal is dropped, as is an
 * event left with no groups. Foreign entries are untouched.
 * Returns the pruned object, whether anything changed, and how
 * many own entries were removed.
 */
export function removeOwnHooks(existing: unknown): {
  hooks: HooksConfig;
  changed: boolean;
  removed: number;
} {
  const hooks: HooksConfig =
    existing === undefined
      ? {}
      : (structuredClone(existing) as HooksConfig);
  let removed = 0;
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    return { hooks: {}, changed: false, removed: 0 };
  }
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (group === null || typeof group !== "object" || !Array.isArray(group.hooks)) continue;
      const before = group.hooks.length;
      group.hooks = group.hooks.filter((h) => !isGuidancePulseHookEntry(h));
      removed += before - group.hooks.length;
    }
    hooks[event] = groups.filter(
      (g) => g !== null && typeof g === "object" && Array.isArray(g.hooks) && g.hooks.length > 0,
    );
    if (hooks[event].length === 0) delete hooks[event];
  }
  return { hooks, changed: removed > 0, removed };
}

/** Count GuidancePulse's own Hook entries present in a `hooks` object. */
export function countOwnHooks(existing: unknown): number {
  if (typeof existing !== "object" || existing === null || Array.isArray(existing)) return 0;
  let count = 0;
  for (const groups of Object.values(existing as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (group === null || typeof group !== "object") continue;
      const hooks = (group as Record<string, unknown>).hooks;
      if (!Array.isArray(hooks)) continue;
      for (const h of hooks) if (isGuidancePulseHookEntry(h)) count += 1;
    }
  }
  return count;
}

/** Append one failure line (timestamp, operation, code, message) to the failure log. Best-effort: never throws. */
export function appendFailureLog(projectDir: string, operation: string, error: Error): void {
  try {
    const logPath = join(projectDir, FAILURE_LOG_REL_PATH);
    mkdirSync(dirname(logPath), { recursive: true });
    const line = `${new Date().toISOString()} ${operation} ${(error as InstallError).code ?? "ERROR"} ${error.message}\n`;
    writeFileSync(logPath, line, { flag: "a", encoding: "utf-8" });
  } catch {
    // A failure log that cannot be written must not mask the original failure.
  }
}

/**
 * Launcher script written to `.guidancepulse/hooks/<event>.js`.
 * CJS/ESM-neutral (dynamic `import()` only, so it runs under plain
 * `node` whether or not the project sets `"type": "module"`).
 * The project dir is derived from the launcher's own invoked path
 * (`process.argv[1]` is `<project>/.guidancepulse/hooks/<event>.js`),
 * NOT from the working directory: Claude Code may invoke the hook
 * from any cwd, and the launcher must still find its own project's
 * config / DB / path key. Defaults GP_CONFIG/GP_DB/GP_PATH_KEY to
 * the project's `.guidancepulse/` files, then imports the compiled
 * hook entry. A missing compiled entry fails closed (stderr JSON +
 * exit 2): a PreToolUse hook that cannot run must block the write,
 * never silently allow it.
 */
export function launcherScript(): string {
  return `// Generated by \`guidancepulse install\` (P025 GuidancePulse, T011).
// Do not edit by hand — re-run \`guidancepulse install --project .\` to regenerate.
// Defaults GP_CONFIG/GP_DB/GP_PATH_KEY to this project's .guidancepulse/
// files, then runs the compiled hook entry. A missing compiled entry
// fails closed (exit 2) instead of silently allowing the action.
(async () => {
  const { existsSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  // This launcher lives at <project>/.guidancepulse/hooks/<event>.js.
  const invoked = process.argv[1];
  const projectDir =
    typeof invoked === "string" && invoked.length > 0
      ? dirname(dirname(dirname(invoked)))
      : (process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const gpDir = join(projectDir, ".guidancepulse");
  process.env.GP_CONFIG ??= join(gpDir, "config.yaml");
  process.env.GP_DB ??= join(gpDir, "state.sqlite");
  process.env.GP_PATH_KEY ??= join(gpDir, "path-key.bin");
  const entry = join(gpDir, "hooks", ".build", "scripts", "hook-entry.js");
  if (!existsSync(entry)) {
    process.stderr.write(JSON.stringify({ guidancepulse_hook_error: "HOOK_ENTRY_MISSING" }) + "\\n");
    process.exit(2);
  }
  await import(entry);
})().catch((err) => {
  process.stderr.write(JSON.stringify({ guidancepulse_hook_error: "HOOK_ENTRY_FAILED" }) + "\\n");
  if (err !== undefined && err !== null) process.stderr.write(String(err.message ?? err) + "\\n");
  process.exit(2);
});
`;
}

/** Result of building the hook entry scripts. */
export interface HookBuildResult {
  status: "built" | "skipped";
  /** Absolute path of the compiled hook entry, when built. */
  entryJs?: string;
  /** Why the build was skipped (source tree not available). */
  reason?: string;
  /** Launcher files written (relative to the project root). */
  launchers: string[];
  /**
   * Runtime dependencies vendored into `.build/node_modules/` by
   * this build (FIX-T013 F-17; empty when skipped). The installed
   * hook entry resolves `yaml` / `better-sqlite3` from there.
   */
  dependenciesVendored: string[];
}

/**
 * Compile `scripts/hook-entry.ts` (from `sourceRoot`) with `tsc`
 * into `<project>/.guidancepulse/hooks/.build/`, vendor the entry's
 * runtime dependencies into `.build/node_modules/` (FIX-T013 F-17:
 * without them the compiled entry cannot resolve `yaml` /
 * `better-sqlite3` in a project outside the source tree), and write
 * the six launcher scripts. Uses the same `tsc` invocation as the
 * S0 perf harness (`scripts/perf-hook.ts`). Throws `InstallError`
 * (`HOOK_BUILD_FAILED`) when the source tree is present but the
 * compile fails or a runtime dependency is missing from the source
 * tree's `node_modules` — the caller restores the pre-install
 * settings. When the source tree is absent, the build is skipped
 * (launchers still written, failing closed at runtime) and the
 * result says so.
 */
export function buildHookEntries(sourceRoot: string, projectDir: string): HookBuildResult {
  const hooksDir = join(projectDir, GUIDANCEPULSE_DIRNAME, HOOKS_DIRNAME);
  const buildDir = join(hooksDir, ".build");
  mkdirSync(hooksDir, { recursive: true });
  const launchers: string[] = [];
  for (const own of GUIDANCEPULSE_HOOKS) {
    const rel = `${GUIDANCEPULSE_DIRNAME}/${HOOKS_DIRNAME}/${own.file}`;
    writeFileSync(join(projectDir, rel), launcherScript(), "utf-8");
    launchers.push(rel);
  }
  const entryTs = join(sourceRoot, "scripts", "hook-entry.ts");
  if (!existsSync(entryTs)) {
    return {
      status: "skipped",
      reason: `guidancepulse source tree not found at ${sourceRoot}; compiled hook entry not built`,
      launchers,
      dependenciesVendored: [],
    };
  }
  rmSync(buildDir, { recursive: true, force: true });
  const tscArgs = [
    "tsc",
    "scripts/hook-entry.ts",
    "--outDir",
    join(projectDir, GUIDANCEPULSE_DIRNAME, HOOKS_DIRNAME, ".build"),
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
    "--skipLibCheck",
  ];
  const res = spawnSync("npx", tscArgs, { cwd: sourceRoot, encoding: "utf-8", timeout: 300000 });
  if (res.status !== 0) {
    throw new InstallError(
      "HOOK_BUILD_FAILED",
      `tsc compile of hook-entry failed (exit ${String(res.status)}): ${(res.stderr ?? "").slice(0, 500)}`,
    );
  }
  let dependenciesVendored: string[];
  try {
    dependenciesVendored = vendorHookDependencies(sourceRoot, buildDir);
  } catch (err) {
    throw new InstallError(
      "HOOK_BUILD_FAILED",
      `vendoring hook runtime dependencies failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return {
    status: "built",
    entryJs: join(buildDir, "scripts", "hook-entry.js"),
    launchers,
    dependenciesVendored,
  };
}

/** Options for `installProject`. */
export interface InstallOptions {
  /**
   * Root of the guidancepulse source tree (contains
   * `scripts/hook-entry.ts`). Defaults to the `02_source` tree this
   * module was loaded from. Unit tests pass a temp dir or set
   * `buildHooks: false` to skip the compile.
   */
  sourceRoot?: string;
  /** When false, skip the `tsc` hook-entry build (merge only). */
  buildHooks?: boolean;
}

/** Result of `installProject`. */
export interface InstallResult {
  projectDir: string;
  settingsPath: string;
  /** True when the settings file already existed before install. */
  settingsExisted: boolean;
  /** Path of the backup file, when one was (or had already been) written. */
  backupPath: string | null;
  /** True when a fresh backup was written by this run. */
  backupWritten: boolean;
  /** True when the merge added at least one own entry. */
  changed: boolean;
  added: number;
  alreadyPresent: number;
  hookBuild: HookBuildResult | null;
  /** True when `.guidancepulse/` was (re-)initialised by this run. */
  initialised: boolean;
}

/** Resolve the source root this module was loaded from (`02_source/`). */
export function defaultSourceRoot(): string {
  // src/cli/install.ts -> ../../ = 02_source/
  return resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
}

/**
 * Install GuidancePulse hooks into a project.
 *
 * Steps, in order: (1) initialise `.guidancepulse/` (config, DB,
 * path key — idempotent, never overwrites); (2) read the current
 * settings file (missing = `{}`), keeping the exact bytes this run
 * read so a later failure can restore them; (3) back it up when it
 * exists and no backup exists yet; (4) merge the six own Hook
 * entries; (5) build the hook entry scripts (compile + vendor
 * runtime dependencies); (6) atomically write the merged settings.
 * Any failure after step (2) restores the settings bytes this run
 * read (or deletes the file when it did not exist) and appends to
 * the failure log before rethrowing `InstallError`. The earliest
 * backup file is NOT the rollback source (FIX-T013 F-19): it is
 * only the user's manual-restore copy.
 */
export function installProject(projectDirArg: string, options: InstallOptions = {}): InstallResult {
  const projectDir = resolve(projectDirArg);
  const settingsPath = join(projectDir, SETTINGS_REL_PATH);
  const backupPath = join(projectDir, BACKUP_REL_PATH);
  const settingsExisted = existsSync(settingsPath);
  const backupExisted = existsSync(backupPath);
  // Exact settings bytes this run read at its start (FIX-T013
  // F-19): the failure rollback restores THESE bytes, never the
  // earliest backup file. Null until the read succeeds; when the
  // read itself fails the file was never touched, so rollback must
  // not touch it either.
  let settingsRaw: Buffer | null = null;
  let changed = false;
  try {
    const initialised = initProject(projectDir);
    let settings: Record<string, unknown> = {};
    if (settingsExisted) {
      let raw: Buffer;
      try {
        raw = readFileSync(settingsPath);
      } catch {
        throw new InstallError("SETTINGS_UNREADABLE", "cannot read existing settings file");
      }
      settingsRaw = raw;
      try {
        const parsed: unknown = JSON.parse(raw.toString("utf-8"));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new InstallError("INVALID_SETTINGS", "settings file is not a JSON object");
        }
        settings = parsed as Record<string, unknown>;
      } catch (err) {
        if (err instanceof InstallError) throw err;
        throw new InstallError("INVALID_SETTINGS", "settings file is not valid JSON");
      }
    }
    // Backup BEFORE any write, and only when this run will actually
    // change the file: a re-install over an already-installed
    // configuration changes nothing, so it must not snapshot the
    // installed config as the "pre-install" backup. The backup is
    // also written only when no backup exists yet, so the earliest
    // pre-install original is never overwritten.
    const merged = mergeOwnHooks(settings.hooks);
    let backupWritten = false;
    if (merged.changed && settingsExisted && !backupExisted) {
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(settingsPath, backupPath);
      backupWritten = true;
    }
    const nextSettings = { ...settings, hooks: merged.hooks };
    const buildHooks = options.buildHooks !== false;
    const hookBuild = buildHooks
      ? buildHookEntries(options.sourceRoot ?? defaultSourceRoot(), projectDir)
      : null;
    // Atomic write: temp file in the same directory, then rename.
    const tmpPath = join(
      dirname(settingsPath),
      `.settings.local.json.guidancepulse-tmp-${process.pid}-${randomBytes(4).toString("hex")}`,
    );
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(nextSettings, null, 2) + "\n", "utf-8");
    renameSync(tmpPath, settingsPath);
    changed = merged.changed;
    return {
      projectDir,
      settingsPath,
      settingsExisted,
      backupPath: existsSync(backupPath) ? backupPath : null,
      backupWritten,
      changed,
      added: merged.added,
      alreadyPresent: merged.alreadyPresent,
      hookBuild,
      initialised: initialised.created,
    };
  } catch (err) {
    const error = err instanceof InstallError ? err : new InstallError("INSTALL_FAILED", String(err));
    // Failure rollback (FIX-T013 F-19): restore the exact bytes
    // this run read at its start — never the earliest backup file,
    // which may predate user edits made after the first install.
    // When this run never managed to read the file, leave it alone.
    try {
      if (settingsExisted && settingsRaw !== null) {
        writeFileSync(settingsPath, settingsRaw);
      } else if (!settingsExisted && existsSync(settingsPath)) {
        rmSync(settingsPath, { force: true });
      }
    } catch {
      // Restore itself failed: the failure log below still records it.
    }
    appendFailureLog(projectDir, "install", error);
    throw error;
  }
}
