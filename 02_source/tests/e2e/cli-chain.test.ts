/**
 * CLI end-to-end test — P025 GuidancePulse, T012 (spec v1.1.0).
 *
 * Drives the REAL `bin/guidancepulse` launcher (the exact command a
 * user runs) from a temp project directory, through the full user
 * journey: init → install → status → phase set → hook round-trip
 * through the installed launchers → uninstall → status. No direct
 * calls to `installProject`/`uninstallProject` here — the launcher
 * script itself is the system under test (this is also the FIX-T011
 * path: `--project .` must resolve to the caller's cwd).
 *
 * The project dir lives inside the repo tree so the installed hook
 * launchers can resolve `better-sqlite3` (same constraint as the
 * T011 launcher test). All data is synthetic; no network, no real
 * user config.
 *
 * What this does NOT prove (blocked_external, see HANDOFF_T012.md):
 * a live Claude Code session picking up `.claude/settings.local.json`
 * and triggering these Hooks. Claude Code is not installed on this
 * machine (`claude --version` exits 127).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countOwnHooks } from "../../src/cli/install.js";
import {
  SOURCE_ROOT,
  T,
  readEvent,
  readLease,
  runHook,
  writeEvent,
} from "../integration/t012-helpers.js";

const LAUNCHER = join(SOURCE_ROOT, "bin", "guidancepulse");

function runCli(cwd: string, args: string[], extraEnv: Record<string, string> = {}) {
  const run = spawnSync(LAUNCHER, args, {
    cwd,
    encoding: "utf-8",
    timeout: 120000,
    env: { ...process.env, ...extraEnv },
  });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

function ownHookCount(projectDir: string): number {
  const raw = readFileSync(join(projectDir, ".claude", "settings.local.json"), "utf-8");
  const parsed = JSON.parse(raw) as { hooks?: unknown };
  return countOwnHooks(parsed.hooks);
}

describe("T012 E2E: CLI install → status → phase → hook round-trip → uninstall", () => {
  it("runs the user journey through bin/guidancepulse from the project cwd", () => {
    const projectDir = mkdtempSync(join(process.cwd(), ".tmp-t012-e2e-"));
    try {
      // -- init (idempotent project setup). --
      const init = runCli(projectDir, ["init"]);
      expect(init.status).toBe(0);
      expect(existsSync(join(projectDir, ".guidancepulse", "config.yaml"))).toBe(true);
      expect(existsSync(join(projectDir, ".guidancepulse", "state.sqlite"))).toBe(true);
      expect(existsSync(join(projectDir, ".guidancepulse", "path-key.bin"))).toBe(true);

      // -- install --project . (must land HERE, not in 02_source — FIX-T011). --
      const install1 = runCli(projectDir, ["install", "--project", "."]);
      expect(install1.status).toBe(0);
      expect(install1.stdout).toContain(`installed at ${projectDir}`);
      expect(ownHookCount(projectDir)).toBe(6);

      // -- re-install is idempotent. --
      const install2 = runCli(projectDir, ["install", "--project", "."]);
      expect(install2.status).toBe(0);
      expect(install2.stdout).toContain("already installed");
      expect(ownHookCount(projectDir)).toBe(6);

      // -- status reports the install. --
      const status1 = runCli(projectDir, ["status"]);
      expect(status1.status).toBe(0);
      expect(status1.stdout).toContain("installed: yes (own hooks: 6/6)");

      // -- phase set to the live phase the chain uses. --
      const phase = runCli(projectDir, ["phase", "set", "implementation"]);
      expect(phase.status).toBe(0);
      expect(phase.stdout).toContain("implementation");

      // -- hook round-trip through the installed launchers. --
      const project = {
        dir: projectDir,
        dbPath: join(projectDir, ".guidancepulse", "state.sqlite"),
        configPath: join(projectDir, ".guidancepulse", "config.yaml"),
        hooksDir: join(projectDir, ".guidancepulse", "hooks"),
        settingsPath: join(projectDir, ".claude", "settings.local.json"),
      };
      const r1 = runHook(project, "instructions-loaded.js", readEvent(project), T.t1);
      expect(r1.status).toBe(0);
      expect(readLease(project)?.state).toBe("FRESH");
      const w1 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t2);
      expect(w1.status).toBe(0);
      const w1out = w1.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w1out.hookSpecificOutput?.permissionDecision).toBe("allow");

      // -- uninstall removes only the own hooks; the install-created
      //    settings file is deleted; status reports uninstalled. --
      const uninstall = runCli(projectDir, ["uninstall", "--project", "."]);
      expect(uninstall.status).toBe(0);
      expect(existsSync(join(projectDir, ".claude", "settings.local.json"))).toBe(false);
      const status2 = runCli(projectDir, ["status"]);
      expect(status2.status).toBe(0);
      expect(status2.stdout).toContain("installed: no");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  }, 180000);
});
