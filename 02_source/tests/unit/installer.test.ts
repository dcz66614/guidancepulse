/**
 * Installer tests — P025 GuidancePulse, T011 (spec v1.1.0).
 *
 * Covers the T011 acceptance standard with real files in temp
 * project dirs (no mocks of the merge logic):
 *   - install is idempotent (second run changes nothing);
 *   - install backs up `.claude/settings.local.json` before writing,
 *     and a re-install never overwrites the earliest backup;
 *   - only GuidancePulse's own Hooks are merged; user Hooks survive;
 *   - uninstall removes only own entries; user Hooks survive;
 *   - the generated Hook config carries `onFailure: "block"` and
 *     `timeout: 10` on PreToolUse / PreCompact (§7.1);
 *   - a failed install (invalid existing settings) leaves the
 *     user's file untouched and writes a failure log;
 *   - a full install with the real `tsc` hook build writes runnable
 *     launcher scripts (one synthetic PreToolUse event through the
 *     generated launcher returns the expected allow).
 *   - FIX-T011 regression: the real `bin/guidancepulse` launcher
 *     invoked from a foreign cwd installs into that directory for
 *     both `--project .` and the no-flag default, and never touches
 *     02_source/.claude; uninstall restores the original settings.
 *
 * All data is synthetic; no network, no real user config.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  countOwnHooks,
  GUIDANCEPULSE_HOOKS,
  installProject,
  isGuidancePulseHookEntry,
  mergeOwnHooks,
  removeOwnHooks,
} from "../../src/cli/install.js";
import { initProject, statusProject } from "../../src/cli/init.js";
import { uninstallProject } from "../../src/cli/uninstall.js";

const SOURCE_ROOT = process.cwd(); // vitest runs with cwd = 02_source/

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gp-t011-installer-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeSettings(obj: unknown): void {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "settings.local.json"), JSON.stringify(obj, null, 2), "utf-8");
}

function readSettings(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf-8")) as Record<
    string,
    unknown
  >;
}

/** A realistic pre-existing user configuration with foreign hooks. */
function userSettings(): Record<string, unknown> {
  return {
    permissions: { allow: ["Bash(npm test)"] },
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            { type: "command", command: "node", args: ["/home/user/my-linter.js"], timeout: 30 },
          ],
        },
      ],
      SessionStart: [
        { hooks: [{ type: "command", command: "echo", args: ["hello"] }] },
      ],
    },
  };
}

describe("mergeOwnHooks / removeOwnHooks (pure)", () => {
  it("adds all six own entries with onFailure:block + timeout:10 on PreToolUse/PreCompact", () => {
    const { hooks, changed, added, alreadyPresent } = mergeOwnHooks(undefined);
    expect(changed).toBe(true);
    expect(added).toBe(6);
    expect(alreadyPresent).toBe(0);
    expect(countOwnHooks(hooks)).toBe(6);
    const preToolUse = hooks.PreToolUse[0].hooks[0];
    expect(hooks.PreToolUse[0].matcher).toBe("Write|Edit");
    expect(preToolUse.onFailure).toBe("block");
    expect(preToolUse.timeout).toBe(10);
    expect(preToolUse.args).toEqual([
      "${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-tool-use.js",
    ]);
    const preCompact = hooks.PreCompact[0].hooks[0];
    expect(preCompact.onFailure).toBe("block");
    expect(preCompact.timeout).toBe(10);
    const postToolUse = hooks.PostToolUse[0].hooks[0];
    expect(postToolUse.onFailure).toBeUndefined();
    expect(postToolUse.timeout).toBe(10);
  });

  it("is idempotent: merging twice adds nothing the second time", () => {
    const first = mergeOwnHooks(undefined);
    const second = mergeOwnHooks(first.hooks);
    expect(second.changed).toBe(false);
    expect(second.added).toBe(0);
    expect(second.alreadyPresent).toBe(6);
    expect(JSON.stringify(second.hooks)).toBe(JSON.stringify(first.hooks));
  });

  it("preserves foreign hooks and merges into an existing matcher group", () => {
    const before = userSettings();
    const { hooks, added } = mergeOwnHooks((before as Record<string, unknown>).hooks);
    expect(added).toBe(6);
    // Foreign PreToolUse/Bash group untouched, own Write|Edit group appended.
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.PreToolUse[0].matcher).toBe("Bash");
    expect(hooks.PreToolUse[0].hooks).toHaveLength(1);
    expect(hooks.PreToolUse[0].hooks[0].args).toEqual(["/home/user/my-linter.js"]);
    expect(hooks.SessionStart).toHaveLength(1);
    expect((before as Record<string, unknown>).permissions).toBeDefined();
  });

  it("removeOwnHooks removes only own entries and drops emptied groups", () => {
    const merged = mergeOwnHooks(userSettings().hooks);
    const pruned = removeOwnHooks(merged.hooks);
    expect(pruned.changed).toBe(true);
    expect(pruned.removed).toBe(6);
    expect(countOwnHooks(pruned.hooks)).toBe(0);
    // User hooks survive byte-for-byte.
    expect(pruned.hooks.PreToolUse).toHaveLength(1);
    expect(pruned.hooks.PreToolUse[0].matcher).toBe("Bash");
    expect(pruned.hooks.SessionStart).toHaveLength(1);
    // Events that only held own entries are gone entirely.
    expect(pruned.hooks.PostToolUse).toBeUndefined();
    expect(pruned.hooks.PreCompact).toBeUndefined();
  });

  it("isGuidancePulseHookEntry does not claim a user's own node hook", () => {
    expect(
      isGuidancePulseHookEntry({ type: "command", command: "node", args: ["/home/user/x.js"] }),
    ).toBe(false);
    expect(
      isGuidancePulseHookEntry({
        type: "command",
        command: "node",
        args: ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-tool-use.js"],
      }),
    ).toBe(true);
    expect(isGuidancePulseHookEntry({ type: "command", command: "echo", args: ["x"] })).toBe(false);
    expect(isGuidancePulseHookEntry(null)).toBe(false);
  });
});

describe("installProject / uninstallProject (real files)", () => {
  it("installs into an empty project, backs up nothing, and is idempotent", () => {
    const first = installProject(dir, { buildHooks: false });
    expect(first.settingsExisted).toBe(false);
    expect(first.backupPath).toBeNull();
    expect(first.changed).toBe(true);
    expect(first.added).toBe(6);
    expect(countOwnHooks(readSettings().hooks)).toBe(6);
    expect(existsSync(join(dir, ".guidancepulse", "config.yaml"))).toBe(true);
    expect(existsSync(join(dir, ".guidancepulse", "state.sqlite"))).toBe(true);
    expect(existsSync(join(dir, ".guidancepulse", "path-key.bin"))).toBe(true);

    const second = installProject(dir, { buildHooks: false });
    expect(second.changed).toBe(false);
    expect(second.added).toBe(0);
    expect(second.alreadyPresent).toBe(6);
    expect(second.backupWritten).toBe(false);
    // A no-change re-install must not snapshot the installed config
    // as a "pre-install" backup.
    expect(existsSync(join(dir, ".claude", "settings.local.json.guidancepulse-backup.json"))).toBe(
      false,
    );
    expect(JSON.stringify(readSettings())).toBe(JSON.stringify(readSettings()));
  });

  it("backs up pre-existing settings first and never overwrites the earliest backup", () => {
    writeSettings(userSettings());
    const original = readFileSync(join(dir, ".claude", "settings.local.json"), "utf-8");
    const first = installProject(dir, { buildHooks: false });
    expect(first.settingsExisted).toBe(true);
    expect(first.backupWritten).toBe(true);
    const backupPath = join(dir, ".claude", "settings.local.json.guidancepulse-backup.json");
    expect(readFileSync(backupPath, "utf-8")).toBe(original);
    // User's foreign hooks and permissions survive the merge.
    const after = readSettings();
    expect(after.permissions).toEqual({ allow: ["Bash(npm test)"] });
    expect(countOwnHooks(after.hooks)).toBe(6);

    const second = installProject(dir, { buildHooks: false });
    expect(second.backupWritten).toBe(false);
    expect(readFileSync(backupPath, "utf-8")).toBe(original);
  });

  it("uninstall removes only own entries and keeps user hooks", () => {
    writeSettings(userSettings());
    installProject(dir, { buildHooks: false });
    const result = uninstallProject(dir);
    expect(result.changed).toBe(true);
    expect(result.removed).toBe(6);
    const after = readSettings();
    expect(countOwnHooks(after.hooks)).toBe(0);
    expect(after.permissions).toEqual({ allow: ["Bash(npm test)"] });
    expect(after.hooks).toEqual((userSettings().hooks as Record<string, unknown>));

    // Second uninstall is a no-op.
    const again = uninstallProject(dir);
    expect(again.changed).toBe(false);
    expect(again.removed).toBe(0);
  });

  it("uninstall deletes a settings file install created when it is left empty", () => {
    installProject(dir, { buildHooks: false });
    const result = uninstallProject(dir);
    expect(result.settingsDeleted).toBe(true);
    expect(existsSync(join(dir, ".claude", "settings.local.json"))).toBe(false);
    // .guidancepulse state is kept for audit / re-install.
    expect(existsSync(join(dir, ".guidancepulse", "state.sqlite"))).toBe(true);
  });

  it("uninstall on a project with no settings file is a no-op", () => {
    const result = uninstallProject(dir);
    expect(result.changed).toBe(false);
    expect(result.settingsExisted).toBe(false);
  });

  it("a failed install leaves user settings untouched and writes a failure log", () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "settings.local.json"), "{ not valid json", "utf-8");
    expect(() => installProject(dir, { buildHooks: false })).toThrow(/INVALID_SETTINGS/);
    expect(readFileSync(join(dir, ".claude", "settings.local.json"), "utf-8")).toBe(
      "{ not valid json",
    );
    const log = readFileSync(join(dir, ".guidancepulse", "install-failure.log"), "utf-8");
    expect(log).toContain("install");
    expect(log).toContain("INVALID_SETTINGS");
  });

  it("status reports installed state and is read-only", () => {
    const before = statusProject(dir);
    expect(before.installed).toBe(false);
    expect(before.ownHooksPresent).toBe(0);
    installProject(dir, { buildHooks: false });
    const after = statusProject(dir);
    expect(after.installed).toBe(true);
    expect(after.ownHooksPresent).toBe(6);
    expect(after.initialised).toBe(true);
    expect(after.events).toBe(0);
    expect(after.scopes).toEqual([]);
    uninstallProject(dir);
    const uninstalled = statusProject(dir);
    expect(uninstalled.installed).toBe(false);
    expect(uninstalled.ownHooksPresent).toBe(0);
  });

  it("init is idempotent and never regenerates the path key", () => {
    const first = initProject(dir);
    expect(first.created).toBe(true);
    const keyBefore = readFileSync(join(dir, ".guidancepulse", "path-key.bin"));
    expect(keyBefore.length).toBe(32);
    const second = initProject(dir);
    expect(second.created).toBe(false);
    expect(readFileSync(join(dir, ".guidancepulse", "path-key.bin")).equals(keyBefore)).toBe(true);
  });
});

describe("hook entry build (real tsc compile)", () => {
  it("builds launchers and the compiled entry; a synthetic PreToolUse runs through the launcher", () => {
    // The launcher + compiled entry resolve their runtime
    // dependencies from the vendored `.build/node_modules/` (FIX-T013
    // F-17), so this project dir no longer needs to live inside the
    // repo tree to run. It still does (historical T011 shape);
    // foreign-project coverage is in
    // tests/integration/fix-t013.test.ts.
    const repoDir = mkdtempSync(join(process.cwd(), ".tmp-t011-launcher-"));
    try {
      const result = installProject(repoDir, { sourceRoot: SOURCE_ROOT, buildHooks: true });
      expect(result.hookBuild?.status).toBe("built");
      expect(result.hookBuild?.launchers).toHaveLength(6);
      for (const own of GUIDANCEPULSE_HOOKS) {
        expect(existsSync(join(repoDir, ".guidancepulse", "hooks", own.file))).toBe(true);
      }
      expect(existsSync(join(repoDir, ".guidancepulse", "hooks", ".build", "scripts", "hook-entry.js"))).toBe(
        true,
      );

      // Synthetic PreToolUse Write to an unprotected path: no rule
      // matches, so the gate allows (exit 0, ignored:true). This
      // proves the launcher + compiled entry actually execute; it is
      // NOT a claim about live Claude Code triggering (T001: not installed).
      const event = {
        hook_event_name: "PreToolUse",
        session_id: "synthetic-t011",
        cwd: repoDir,
        tool_name: "Write",
        tool_input: { file_path: join(repoDir, "src", "unrelated.txt") },
      };
      const run = spawnSync(
        "node",
        [join(repoDir, ".guidancepulse", "hooks", "pre-tool-use.js")],
        { input: JSON.stringify(event), encoding: "utf-8", timeout: 60000 },
      );
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("ignored");
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  }, 180000);
});

describe("launcher preserves caller cwd (FIX-T011 regression)", () => {
  // The T011 launcher did `cd "$SOURCE_DIR"` before exec, so
  // `process.cwd()` inside the CLI was always 02_source and
  // `--project .` (and the no-flag default) installed into 02_source
  // instead of the caller's project. The existing tests above all
  // call installProject() with absolute paths, so they never caught
  // it. These tests invoke the real `bin/guidancepulse` script
  // itself from a foreign temp directory and assert the install
  // lands there — never in 02_source.
  const LAUNCHER = join(SOURCE_ROOT, "bin", "guidancepulse");

  function runLauncher(cwd: string, args: string[]) {
    return spawnSync(LAUNCHER, args, { cwd, encoding: "utf-8", timeout: 180000 });
  }

  /** Snapshot of 02_source/.claude (null when absent) to prove it is untouched. */
  function snapshotSourceClaude(): string | null {
    const claudeDir = join(SOURCE_ROOT, ".claude");
    if (!existsSync(claudeDir)) return null;
    return readdirSync(claudeDir)
      .sort()
      .map((f: string) => `${f}\n${readFileSync(join(claudeDir, f), "utf-8")}`)
      .join("\n");
  }

  it("install --project . from a foreign cwd installs into that directory, not 02_source", () => {
    const foreign = mkdtempSync(join(tmpdir(), "gp-fix-t011-dot-"));
    const before = snapshotSourceClaude();
    try {
      const original = userSettings();
      mkdirSync(join(foreign, ".claude"), { recursive: true });
      writeFileSync(
        join(foreign, ".claude", "settings.local.json"),
        JSON.stringify(original, null, 2),
        "utf-8",
      );
      const install = runLauncher(foreign, ["install", "--project", "."]);
      expect(install.status).toBe(0);
      expect(install.stdout).toContain(`installed at ${foreign}`);
      const settings = JSON.parse(
        readFileSync(join(foreign, ".claude", "settings.local.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect(countOwnHooks(settings.hooks)).toBe(6);
      expect(existsSync(join(foreign, ".guidancepulse", "config.yaml"))).toBe(true);
      // The user's pre-existing hooks survive the merge: the
      // SessionStart group is untouched and the foreign Bash matcher
      // group in PreToolUse is still first.
      const hooks = settings.hooks as Record<string, Array<Record<string, unknown>>>;
      expect(hooks.SessionStart).toEqual(
        (original.hooks as Record<string, unknown>).SessionStart,
      );
      expect(hooks.PreToolUse[0]).toEqual(
        (original.hooks as Record<string, Array<Record<string, unknown>>>).PreToolUse[0],
      );
      expect(snapshotSourceClaude()).toBe(before);
      expect(existsSync(join(SOURCE_ROOT, ".claude"))).toBe(before !== null);

      const status = runLauncher(foreign, ["status", "--project", "."]);
      expect(status.status).toBe(0);
      expect(status.stdout).toContain(`project: ${foreign}`);
      expect(status.stdout).toContain("own hooks: 6/6");

      const uninstall = runLauncher(foreign, ["uninstall", "--project", "."]);
      expect(uninstall.status).toBe(0);
      expect(uninstall.stdout).toContain(`uninstalled at ${foreign}`);
      const restored = JSON.parse(
        readFileSync(join(foreign, ".claude", "settings.local.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect(restored).toEqual(original);
      expect(snapshotSourceClaude()).toBe(before);
    } finally {
      rmSync(foreign, { recursive: true, force: true });
    }
  }, 180000);

  it("install with no --project flag defaults to the caller's cwd, not 02_source", () => {
    const foreign = mkdtempSync(join(tmpdir(), "gp-fix-t011-default-"));
    const before = snapshotSourceClaude();
    try {
      const install = runLauncher(foreign, ["install"]);
      expect(install.status).toBe(0);
      expect(install.stdout).toContain(`installed at ${foreign}`);
      const settings = JSON.parse(
        readFileSync(join(foreign, ".claude", "settings.local.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect(countOwnHooks(settings.hooks)).toBe(6);
      expect(existsSync(join(foreign, ".guidancepulse", "config.yaml"))).toBe(true);
      expect(snapshotSourceClaude()).toBe(before);

      const uninstall = runLauncher(foreign, ["uninstall"]);
      expect(uninstall.status).toBe(0);
      expect(uninstall.stdout).toContain(`uninstalled at ${foreign}`);
      // Install created the settings file and uninstall empties it back out.
      expect(existsSync(join(foreign, ".claude", "settings.local.json"))).toBe(false);
      expect(snapshotSourceClaude()).toBe(before);
    } finally {
      rmSync(foreign, { recursive: true, force: true });
    }
  }, 180000);
});
