/**
 * `guidancepulse` CLI entry — P025 GuidancePulse, T011 (spec v1.1.0).
 *
 * Commands (IMPLEMENTATION_PLAN.md v1.1.0 §7.2):
 *
 *   guidancepulse init [--project <dir>]       initialise .guidancepulse/
 *   guidancepulse install --project <dir>      backup + merge Claude Code Hooks
 *   guidancepulse uninstall --project <dir>    remove only GuidancePulse's own Hooks
 *   guidancepulse status [--project <dir>]     installation + lease state (read-only)
 *   guidancepulse phase set <id>               (T006; see src/cli/phase.ts)
 *
 * Exit codes: 0 success, 1 usage/operation error. No network is
 * used by any command. `--project` defaults to the current working
 * directory. The `phase` command operates on the current directory's
 * store and is unchanged by T011.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { initProject, statusProject } from "./init.js";
import { InstallError, installProject } from "./install.js";
import { uninstallProject } from "./uninstall.js";
import { parsePhaseArgs, setPhase } from "./phase.js";
import { parseConfigYaml } from "../config/index.js";
import { GuidancePulseStore } from "../store/index.js";

export const CLI_USAGE = [
  "guidancepulse — local Claude Code Hooks adapter (P025 GuidancePulse)",
  "",
  "Usage:",
  "  guidancepulse init [--project <dir>]",
  "  guidancepulse install --project <dir>",
  "  guidancepulse uninstall --project <dir>",
  "  guidancepulse status [--project <dir>]",
  "  guidancepulse phase set <phase>",
  "  guidancepulse --help",
  "",
  "No command uses the network. install backs up .claude/settings.local.json",
  "before merging only GuidancePulse's own Hook entries; uninstall removes",
  "only those entries.",
].join("\n");

function parseProjectFlag(argv: string[]): { projectDir: string; rest: string[] } {
  const rest: string[] = [];
  let projectDir = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--project") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--project requires a directory argument");
      }
      projectDir = resolve(value);
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  return { projectDir, rest };
}

function printInit(result: ReturnType<typeof initProject>): void {
  if (!result.created) {
    console.log(`guidancepulse: already initialised at ${result.projectDir}`);
    return;
  }
  const created: string[] = [];
  if (result.configCreated) created.push("config.yaml");
  if (result.dbCreated) created.push("state.sqlite");
  if (result.pathKeyCreated) created.push("path-key.bin");
  if (result.reportsCreated) created.push("reports/");
  console.log(`guidancepulse: initialised ${result.projectDir} (${created.join(", ")})`);
}

function printStatus(result: ReturnType<typeof statusProject>): void {
  console.log(`project: ${result.projectDir}`);
  console.log(`initialised: ${result.initialised ? "yes" : "no"} (config: ${result.configExists ? "yes" : "no"}, db: ${result.dbExists ? "yes" : "no"}, path-key: ${result.pathKeyExists ? "yes" : "no"})`);
  console.log(
    `installed: ${result.installed ? "yes" : "no"} (own hooks: ${result.ownHooksPresent}/${result.ownHooksExpected}${result.settingsExists ? "" : ", no settings file"})`,
  );
  console.log(`events: ${result.events}`);
  if (result.scopes.length === 0) {
    console.log("scopes: none");
  } else {
    for (const s of result.scopes) {
      console.log(
        `scope ${s.sessionScopeId}/${s.agentScopeId}: phase=${s.currentPhase ?? "(none)"} leases=${s.total} (FRESH=${s.fresh}, EXPIRED=${s.expired})`,
      );
    }
  }
}

function printInstall(result: ReturnType<typeof installProject>): void {
  if (!result.changed) {
    console.log(
      `guidancepulse: already installed at ${result.projectDir} (own hooks: ${result.alreadyPresent}/${result.alreadyPresent + result.added}, no changes)`,
    );
  } else {
    console.log(
      `guidancepulse: installed at ${result.projectDir} (added ${result.added} hook entries, already present ${result.alreadyPresent})`,
    );
  }
  console.log(
    `settings: ${result.settingsPath}${result.backupWritten ? ` (backup written: ${join(result.projectDir, ".claude/settings.local.json.guidancepulse-backup.json")})` : result.backupPath !== null ? " (backup already existed, kept)" : result.changed ? " (no prior settings file, no backup needed)" : " (already installed; no backup needed)"}`,
  );
  if (result.hookBuild === null) {
    console.log("hook scripts: build skipped (--no-build)");
  } else if (result.hookBuild.status === "built") {
    console.log(`hook scripts: built (${result.hookBuild.launchers.length} launchers, entry ${result.hookBuild.entryJs})`);
  } else {
    console.log(`hook scripts: build skipped — ${result.hookBuild.reason}`);
  }
}

function printUninstall(result: ReturnType<typeof uninstallProject>): void {
  if (!result.settingsExisted) {
    console.log(
      `guidancepulse: nothing to uninstall at ${result.projectDir} (no settings file)${result.hookBuildRemoved ? "; removed stale .guidancepulse/hooks/.build/" : ""}`,
    );
    return;
  }
  if (!result.changed) {
    console.log(
      `guidancepulse: no GuidancePulse hooks found at ${result.projectDir} (nothing removed)${result.hookBuildRemoved ? "; removed stale .guidancepulse/hooks/.build/" : ""}`,
    );
    return;
  }
  console.log(
    `guidancepulse: uninstalled at ${result.projectDir} (removed ${result.removed} hook entries${result.settingsDeleted ? "; settings file deleted (was created by install and left empty)" : ""})`,
  );
}

/** Run the CLI. Returns the process exit code (0 success, 1 error). */
export function runCli(argv: readonly string[]): number {
  const args = argv[0] === "guidancepulse" ? argv.slice(1) : [...argv];
  try {
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      console.log(CLI_USAGE);
      return 0;
    }
    const [command, ...rest] = args as [string, ...string[]];
    switch (command) {
      case "init": {
        const { projectDir, rest: extra } = parseProjectFlag(rest);
        if (extra.length > 0) throw new Error(`unexpected arguments: ${extra.join(" ")}`);
        printInit(initProject(projectDir));
        return 0;
      }
      case "install": {
        const { projectDir, rest: extra } = parseProjectFlag(rest);
        if (extra.length > 0) throw new Error(`unexpected arguments: ${extra.join(" ")}`);
        printInstall(installProject(projectDir));
        return 0;
      }
      case "uninstall": {
        const { projectDir, rest: extra } = parseProjectFlag(rest);
        if (extra.length > 0) throw new Error(`unexpected arguments: ${extra.join(" ")}`);
        printUninstall(uninstallProject(projectDir));
        return 0;
      }
      case "status": {
        const { projectDir, rest: extra } = parseProjectFlag(rest);
        if (extra.length > 0) throw new Error(`unexpected arguments: ${extra.join(" ")}`);
        printStatus(statusProject(projectDir));
        return 0;
      }
      case "phase": {
        // T006: `guidancepulse phase set <id>` on the current directory's store.
        // Limitation (T011 note, not a T006 change): the CLI has no
        // scope-selection flag yet, so it operates on the single
        // default scope ("default"/"main"). Multi-scope selection is
        // a follow-up, not part of T011's acceptance commands.
        // T012 fix: `rest` here is the argv AFTER "phase", so the
        // "phase" word must be re-added — parsePhaseArgs expects
        // ["guidancepulse", "phase", "set", <id>]. Before this fix
        // every `phase set <id>` failed with INVALID_ARGUMENTS (the
        // T006 unit tests call parsePhaseArgs directly with the full
        // argv, so they never exercised this dispatch path; the T012
        // CLI E2E test caught it).
        // FIX-T013 F-18: a typo'd phase used to be accepted and then
        // silently matched no rule, disarming the whole gate. When a
        // config exists, the phase must be one it declares (PROJECT_BOOK
        // §5.1: `phases:` is the declared set); otherwise the command
        // fails before anything is persisted. With no config there is
        // nothing to check against, so the slug-only check stands and
        // the CLI warns on stderr.
        const { phaseId } = parsePhaseArgs(["guidancepulse", "phase", ...rest]);
        const configPath = join(process.cwd(), ".guidancepulse", "config.yaml");
        let allowedPhases: readonly string[] | undefined;
        if (existsSync(configPath)) {
          let config;
          try {
            config = parseConfigYaml(readFileSync(configPath, "utf-8"));
          } catch (err) {
            throw new Error(
              `cannot read .guidancepulse/config.yaml: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          allowedPhases = config.phases;
          if (!allowedPhases.includes(phaseId)) {
            throw new Error(
              `phase '${phaseId}' is not declared in .guidancepulse/config.yaml ` +
                `(declared: ${allowedPhases.join(", ")}); check the spelling — ` +
                `an undeclared phase matches no rule and would silently disable the gate`,
            );
          }
        } else {
          console.error(
            `guidancepulse: warning: no .guidancepulse/config.yaml found — ` +
              `phase '${phaseId}' was not checked against declared phases; ` +
              `a typo here matches no rule and silently disables the gate`,
          );
        }
        const dbPath = join(process.cwd(), ".guidancepulse", "state.sqlite");
        if (!existsSync(dbPath)) {
          throw new Error("no .guidancepulse/state.sqlite in the current directory — run `guidancepulse init` first");
        }
        const store = GuidancePulseStore.open(dbPath);
        try {
          const result = setPhase(store, {
            sessionScopeId: "default",
            agentScopeId: "main",
            phaseId,
            allowedPhases,
          });
          console.log(
            `guidancepulse: phase set to ${result.phaseId} (invalidated ${result.expiredCount} lease(s))`,
          );
        } finally {
          store.close();
        }
        return 0;
      }
      default:
        throw new Error(`unknown command: ${command}`);
    }
  } catch (err) {
    if (err instanceof InstallError) {
      console.error(`guidancepulse: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(`guidancepulse: ${err.message}`);
      console.error("Run `guidancepulse --help` for usage.");
    } else {
      console.error(`guidancepulse: ${String(err)}`);
    }
    return 1;
  }
}

const exitCode = runCli(process.argv.slice(2));
process.exit(exitCode);
