/**
 * FIX-T014 regression tests for F-27 — P025 GuidancePulse (spec v1.1.0).
 *
 * F-27 (P2, T013 final re-review R2): `uninstall` left
 * `.guidancepulse/hooks/.build/` (~19 MB compiled entry + vendored
 * runtime deps) behind on its two early-return paths — settings file
 * missing, and no own Hook registered (the user edited the settings
 * by hand) — while reporting "nothing removed" / "nothing to
 * uninstall". FIX-T014 chose the code fix (not the doc narrowing):
 * both early returns now call `removeHookBuild()` and report
 * `hookBuildRemoved` honestly; the CLI prints the removal instead
 * of claiming nothing was removed.
 *
 * These two tests live in their own file on purpose: the FIX-T013
 * file had grown to ~66 s of heavy `tsc` + `vite-node` spawns in a
 * single worker, and the full suite then failed 9 times in a row
 * with the known vitest worker RPC flake (F-29: `[vitest-worker]:
 * Timeout calling "onTaskUpdate"`, 392/392 passed, 0 failed) while
 * the same suite without that file passed cleanly (381/381, exit 0).
 * Splitting the slow integration tests across workers keeps each
 * worker's continuous spawn load down; the tests themselves are
 * unchanged, only the file organisation. F-29 itself stays OPEN as
 * a runner-robustness P2.
 *
 * Every test here runs in a project dir under `os.tmpdir()`, i.e.
 * OUTSIDE the source tree, with no `node_modules` above it and no
 * `NODE_PATH` in the spawned environment. All data is synthetic; no
 * network, no real user config.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installProject } from "../../src/cli/install.js";
import { uninstallProject } from "../../src/cli/uninstall.js";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A temp project OUTSIDE the source tree (os.tmpdir()). */
function foreignDir(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `gp-fix-t014-${tag}-`));
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
  return result;
}

describe("FIX-T014 F-27: uninstall removes .build/ on the early-return paths", () => {
  it("manually emptied settings hooks still uninstalls .build/ (no-own-hooks path)", () => {
    const dir = foreignDir("f27-nohooks");
    try {
      installForeign(dir);
      const buildDir = join(dir, ".guidancepulse", "hooks", ".build");
      expect(existsSync(join(buildDir, "node_modules", "yaml"))).toBe(true);
      // Simulate the user deleting all Hook entries by hand.
      writeFileSync(
        join(dir, ".claude", "settings.local.json"),
        JSON.stringify({ hooks: {} }, null, 2),
        "utf-8",
      );
      const result = uninstallProject(dir);
      expect(result.changed).toBe(false);
      expect(result.removed).toBe(0);
      // F-27: the stale compiled entry must not survive the report
      // of "nothing removed".
      expect(result.hookBuildRemoved).toBe(true);
      expect(existsSync(buildDir)).toBe(false);
      // Launchers and state stay (contract: only .build/ goes).
      expect(existsSync(join(dir, ".guidancepulse", "hooks", "pre-tool-use.js"))).toBe(true);
      expect(existsSync(join(dir, ".guidancepulse", "config.yaml"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);

  it("manually deleted settings file still uninstalls .build/ (settings-missing path)", () => {
    const dir = foreignDir("f27-nosettings");
    try {
      installForeign(dir);
      const buildDir = join(dir, ".guidancepulse", "hooks", ".build");
      expect(existsSync(join(buildDir, "node_modules", "yaml"))).toBe(true);
      // Simulate the user deleting the whole settings file by hand.
      rmSync(join(dir, ".claude", "settings.local.json"), { force: true });
      const result = uninstallProject(dir);
      expect(result.settingsExisted).toBe(false);
      expect(result.changed).toBe(false);
      // F-27: the stale compiled entry must not survive the report
      // of "nothing to uninstall".
      expect(result.hookBuildRemoved).toBe(true);
      expect(existsSync(buildDir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});

// Keep the suite honest about its own premise: the foreign dir used
// above really has no ancestor node_modules to resolve from.
describe("FIX-T014 premise guard", () => {
  it("the temp parent has no node_modules (foreign means foreign)", () => {
    expect(existsSync(join(tmpdir(), "node_modules"))).toBe(false);
    expect(process.env.NODE_PATH ?? "").toBe("");
  });
});
