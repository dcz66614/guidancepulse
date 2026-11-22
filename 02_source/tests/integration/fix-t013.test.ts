/**
 * FIX-T013 regression tests — P025 GuidancePulse (spec v1.1.0).
 *
 * Every test here runs in a project dir under `os.tmpdir()`, i.e.
 * OUTSIDE the source tree, with no `node_modules` above it and no
 * `NODE_PATH` in the spawned environment — the exact shape the T013
 * final review showed was broken (F-17) and that the T011/T012
 * suites never covered (their temp dirs lived inside the repo tree
 * so the compiled entry resolved `better-sqlite3` from the tree's
 * own `node_modules`).
 *
 * Covered:
 *   - F-17 (P1): foreign install vendors `yaml` + `better-sqlite3`
 *     into `.build/node_modules/`; the installed launchers return
 *     real decisions (Read → FRESH, Write → allow, PreCompact →
 *     EXPIRED, Write → deny) instead of HOOK_ENTRY_FAILED; uninstall
 *     removes the vendored `.build/` again.
 *   - F-18: `phase set <undeclared>` is rejected when a config
 *     exists (CLI level, via the real `bin/guidancepulse`); a
 *     declared phase still works; with no config the CLI warns.
 *   - F-19: a failed install restores the exact settings bytes the
 *     run read at its start, not the earliest backup file.
 *   - F-20: malformed Hook input exits 2 with one code-only stderr
 *     line and no stdout JSON (documented fail-closed contract).
 *   - F-21: first `init` reports `reportsCreated: true` (and the
 *     CLI lists `reports/`); a second `init` reports nothing new.
 *
 * All data is synthetic; no network, no real user config. Each
 * install runs the real `tsc` hook build plus the real dependency
 * vendoring, so these tests are slow (generous per-test timeouts).
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installProject } from "../../src/cli/install.js";
import { initProject } from "../../src/cli/init.js";
import { uninstallProject } from "../../src/cli/uninstall.js";
import {
  GUIDANCE,
  PHASE,
  T,
  postReadEvent,
  preCompactEvent,
  readLease,
  runHook,
  writeEvent,
  type ChainProject,
} from "./t012-helpers.js";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAUNCHER = join(SOURCE_ROOT, "bin", "guidancepulse");

/** A temp project OUTSIDE the source tree (os.tmpdir()). */
function foreignDir(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `gp-fix-t013-${tag}-`));
  // Guard the premise: no node_modules anywhere above the project.
  expect(existsSync(join(dir, "node_modules"))).toBe(false);
  expect(existsSync(join(dirname(dir), "node_modules"))).toBe(false);
  return dir;
}

function installForeign(dir: string) {
  const result = installProject(dir, { sourceRoot: SOURCE_ROOT, buildHooks: true });
  expect(result.hookBuild?.status).toBe("built");
  expect(result.hookBuild?.dependenciesVendored).toEqual(["yaml", "better-sqlite3"]);
  expect(result.added).toBe(6);
  const project: ChainProject = {
    dir,
    dbPath: join(dir, ".guidancepulse", "state.sqlite"),
    configPath: join(dir, ".guidancepulse", "config.yaml"),
    hooksDir: join(dir, ".guidancepulse", "hooks"),
    settingsPath: join(dir, ".claude", "settings.local.json"),
  };
  return { result, project };
}

/**
 * Spawn an installed launcher as plain `node`, exactly as Claude
 * Code would, with NODE_PATH explicitly removed — the hook must
 * work from its vendored `.build/node_modules/`, not from any
 * environment escape hatch.
 */
function runForeignHook(
  project: ChainProject,
  launcherFile: string,
  input: string,
  now: string,
): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env, GP_PHASE: PHASE, GP_NOW: now };
  delete (env as Record<string, string | undefined>).NODE_PATH;
  const run = spawnSync("node", [join(project.hooksDir, launcherFile)], {
    input,
    encoding: "utf-8",
    timeout: 60000,
    env,
  });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(LAUNCHER, args, { cwd, encoding: "utf-8", timeout: 180000 });
}

describe("FIX-T013 F-17: installed hooks work in a project outside the source tree", () => {
  it("foreign install vendors deps and the full chain returns real decisions", () => {
    const dir = foreignDir("chain");
    try {
      const { project } = installForeign(dir);
      const buildDir = join(dir, ".guidancepulse", "hooks", ".build");
      expect(existsSync(join(buildDir, "node_modules", "yaml", "dist", "index.js"))).toBe(true);
      expect(existsSync(join(buildDir, "node_modules", "better-sqlite3", "lib", "index.js"))).toBe(true);
      const prebuilds = readdirSync(join(buildDir, "node_modules", "better-sqlite3", "prebuilds"));
      expect(prebuilds.filter((f) => f.endsWith(".node")).length).toBeGreaterThan(0);

      // PostToolUse Read → FRESH lease (was HOOK_ENTRY_FAILED before the fix).
      const r1 = runForeignHook(project, "post-tool-use.js", JSON.stringify(postReadEvent(project)), T.t1);
      expect(r1.status).toBe(0);
      expect(r1.stderr).not.toContain("HOOK_ENTRY_FAILED");
      expect(r1.stderr).not.toContain("Cannot find package");
      const lease1 = readLease(project);
      expect(lease1?.state).toBe("FRESH");

      // PreToolUse Write on a FRESH lease → allow, exit 0.
      const w1 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t2);
      expect(w1.status).toBe(0);
      const w1out = w1.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w1out.hookSpecificOutput?.permissionDecision).toBe("allow");

      // PreCompact → EXPIRED, exit 0 (not blocked in warn mode).
      const c1 = runHook(project, "pre-compact.js", preCompactEvent(project), T.t3);
      expect(c1.status).toBe(0);
      const c1out = c1.json as { persisted?: boolean; blocked?: boolean };
      expect(c1out.persisted).toBe(true);
      expect(c1out.blocked).toBe(false);
      expect(readLease(project)?.state).toBe("EXPIRED");

      // Write on the EXPIRED lease → deny, exit 2.
      const w2 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t4);
      expect(w2.status).toBe(2);
      const w2out = w2.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w2out.hookSpecificOutput?.permissionDecision).toBe("deny");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);

  it("uninstall removes the vendored .build/ but keeps config, DB and path key", () => {
    const dir = foreignDir("uninstall");
    try {
      const userSettings = {
        permissions: { allow: ["Bash(npm test)"] },
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo", args: ["hi"] }] }] },
      };
      mkdirSync(join(dir, ".claude"), { recursive: true });
      writeFileSync(
        join(dir, ".claude", "settings.local.json"),
        JSON.stringify(userSettings, null, 2),
        "utf-8",
      );
      installForeign(dir);
      expect(existsSync(join(dir, ".guidancepulse", "hooks", ".build", "node_modules", "yaml"))).toBe(true);
      const result = uninstallProject(dir);
      expect(result.changed).toBe(true);
      expect(result.removed).toBe(6);
      expect(result.hookBuildRemoved).toBe(true);
      expect(existsSync(join(dir, ".guidancepulse", "hooks", ".build"))).toBe(false);
      expect(existsSync(join(dir, ".guidancepulse", "hooks", "pre-tool-use.js"))).toBe(true);
      expect(existsSync(join(dir, ".guidancepulse", "config.yaml"))).toBe(true);
      expect(existsSync(join(dir, ".guidancepulse", "state.sqlite"))).toBe(true);
      expect(existsSync(join(dir, ".guidancepulse", "path-key.bin"))).toBe(true);
      const restored = JSON.parse(
        readFileSync(join(dir, ".claude", "settings.local.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect(restored).toEqual(userSettings);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});

describe("FIX-T013 F-18: phase set rejects undeclared phases (CLI level)", () => {
  it("phase set bogus fails when a config declares the phases; a declared phase works", () => {
    const dir = foreignDir("phase");
    try {
      installForeign(dir);
      const bogus = runCli(dir, ["phase", "set", "bogus"]);
      expect(bogus.status).toBe(1);
      expect(bogus.stderr).toContain("not declared");
      expect(bogus.stderr).toContain("implementation");
      const ok = runCli(dir, ["phase", "set", "implementation"]);
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain("phase set to implementation");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);

  it("phase set with no config warns instead of silently accepting", () => {
    const dir = foreignDir("phase-noconfig");
    try {
      initProject(dir);
      rmSync(join(dir, ".guidancepulse", "config.yaml"));
      const run = runCli(dir, ["phase", "set", "bogus"]);
      expect(run.status).toBe(0);
      expect(run.stderr).toContain("warning");
      expect(run.stderr).toContain("not checked against declared phases");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});

describe("FIX-T013 F-19: failed install restores this run's pre-run bytes, not the earliest backup", () => {
  it("a build failure after user edits restores the edited settings, not the first-install backup", () => {
    const dir = foreignDir("rollback");
    try {
      // First install (no build): writes the earliest backup.
      mkdirSync(join(dir, ".claude"), { recursive: true });
      const original = JSON.stringify(
        { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo", args: ["orig"] }] }] } },
        null,
        2,
      );
      writeFileSync(join(dir, ".claude", "settings.local.json"), original, "utf-8");
      installProject(dir, { buildHooks: false });
      const backupPath = join(dir, ".claude", "settings.local.json.guidancepulse-backup.json");
      expect(readFileSync(backupPath, "utf-8")).toBe(original);

      // User edits the settings after the first install.
      const edited = JSON.stringify(
        {
          permissions: { allow: ["Bash(npm test)"] },
          hooks: {
            SessionStart: [{ hooks: [{ type: "command", command: "echo", args: ["orig"] }] }],
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: "node", args: ["/home/user/my-linter.js"] }],
              },
            ],
          },
        },
        null,
        2,
      );
      writeFileSync(join(dir, ".claude", "settings.local.json"), edited, "utf-8");

      // Second install with a source tree whose hook entry does not
      // compile: the build fails AFTER the backup step.
      const brokenRoot = mkdtempSync(join(tmpdir(), "gp-fix-t013-broken-"));
      try {
        mkdirSync(join(brokenRoot, "scripts"), { recursive: true });
        writeFileSync(join(brokenRoot, "scripts", "hook-entry.ts"), "this is not valid typescript !!!", "utf-8");
        expect(() => installProject(dir, { sourceRoot: brokenRoot, buildHooks: true })).toThrow(
          /HOOK_BUILD_FAILED/,
        );
      } finally {
        rmSync(brokenRoot, { recursive: true, force: true });
      }

      // Rollback must restore the EDITED bytes, not the earliest backup.
      expect(readFileSync(join(dir, ".claude", "settings.local.json"), "utf-8")).toBe(edited);
      expect(readFileSync(backupPath, "utf-8")).toBe(original);
      expect(existsSync(join(dir, ".guidancepulse", "install-failure.log"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});

describe("FIX-T013 F-20: malformed hook input fails closed with exit 2", () => {
  it("malformed envelopes exit 2 with no stdout JSON and one code-only stderr line", () => {
    const dir = foreignDir("malformed");
    try {
      const { project } = installForeign(dir);
      const malformed = ["{}", '{"hook_event_name":123}', "[]", '{"hook_event_name":"PreToolUse"}'];
      for (const input of malformed) {
        const run = runForeignHook(project, "pre-tool-use.js", input, T.t0);
        expect(run.status).toBe(2);
        expect(run.stdout).toBe("");
        const lines = run.stderr.trim().split("\n");
        expect(lines).toHaveLength(1);
        const err = JSON.parse(lines[0] as string) as Record<string, unknown>;
        expect(Object.keys(err)).toEqual(["hook_entry_error"]);
        expect(typeof err.hook_entry_error).toBe("string");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});

describe("FIX-T013 F-21: init reports reports/ as created on first run", () => {
  it("first init returns reportsCreated true and the CLI lists reports/", () => {
    const dir = foreignDir("init");
    try {
      const first = initProject(dir);
      expect(first.created).toBe(true);
      expect(first.configCreated).toBe(true);
      expect(first.dbCreated).toBe(true);
      expect(first.pathKeyCreated).toBe(true);
      expect(first.reportsCreated).toBe(true);
      const second = initProject(dir);
      expect(second.created).toBe(false);
      expect(second.reportsCreated).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI init output lists reports/ on first run", () => {
    const dir = foreignDir("init-cli");
    try {
      const run = runCli(dir, ["init"]);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("reports/");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});

// Keep the suite honest about its own premise: the foreign dir used
// above really has no ancestor node_modules to resolve from.
describe("FIX-T013 premise guard", () => {
  it("the temp parent has no node_modules (foreign means foreign)", () => {
    expect(existsSync(join(tmpdir(), "node_modules"))).toBe(false);
    expect(process.env.NODE_PATH ?? "").toBe("");
    expect(GUIDANCE).toBe("auth-change-safety");
  });
});
