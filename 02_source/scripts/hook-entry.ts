/**
 * Hook subprocess entry — P025 GuidancePulse, T010.
 *
 * Thin stdin/stdout runner for the production Hook handlers
 * (T003 adapter, T005 PreToolUse gate, T006 boundary handlers,
 * T007 SQLite store). It adds NO semantics of its own: it only
 * wires environment configuration into the existing functions and
 * translates their results to the Claude Code Hook protocol
 * (JSON on stdout, exit code 2 = deny/block, 0 otherwise).
 *
 * This is the process the S0 performance gate measures
 * (IMPLEMENTATION_PLAN §8.3, v1.1.0):
 * Claude Code starts `node <compiled-entry>.js`, feeds one Hook
 * JSON object on stdin, and reads the decision from stdout before
 * the process exits. The gate compiles this file with `tsc` into
 * `artifacts/s0/.hook-build/` and spawns plain `node` against the
 * compiled output — never vite-node — so the measured time is the
 * real Hook subprocess cost (Node startup, better-sqlite3 load,
 * JSON parse, SQLite read, path match, decision output).
 *
 * Environment (all paths are local; no network is touched):
 *   GP_CONFIG     path to a guidancepulse config YAML file
 *   GP_DB         path to the SQLite state file
 *   GP_PATH_KEY   path to the path-key file (raw bytes)
 *   GP_PHASE      live phase id (CLI-managed); empty = unknown
 *                 (fails closed inside handlePreToolUse)
 *   GP_NOW        optional fixed ISO timestamp (determinism aid;
 *                 unset = wall clock, as in production)
 *
 * Input: exactly one Hook JSON object on stdin.
 * Output: exactly one JSON object on stdout, then exit.
 *
 * Exit codes: 2 when the Hook decision denies/blocks the triggering
 * action (PreToolUse DENY, PreCompact blocked in strict mode, or an
 * internal error that must fail closed); 0 otherwise. An internal
 * error also writes a one-line `{"hook_entry_error": "<CODE>"}` to
 * stderr — error code only, never raw input or raw error text
 * (no Prompt / source / path may leak through the error path).
 *
 * All data handled here is synthetic in tests; the entry itself
 * never logs, persists, or transmits raw Hook input.
 */

import { readFileSync } from "node:fs";
import { adaptHookEvent, AdapterError } from "../src/hooks/adapter.js";
import { handlePreToolUse } from "../src/hooks/pre-tool-use.js";
import { exitCodeForPreCompact, handlePreCompact } from "../src/hooks/pre-compact.js";
import { handleCwdChanged } from "../src/hooks/cwd-changed.js";
import { handleSubagentStart } from "../src/hooks/subagent-start.js";
import { handleInstructionsLoaded, type LoadedGuidanceRecord } from "../src/hooks/instructions-loaded.js";
import { parseConfigYaml } from "../src/config/index.js";
import { computePathId, sanitizeHookInput, SanitizeError } from "../src/privacy/sanitize.js";
import { GuidancePulseStore } from "../src/store/index.js";
import type { ApplyEventOptions } from "../src/core/index.js";
import type { GuidancePulseEvent } from "../src/contracts/index.js";

function fail(code: string): never {
  process.stderr.write(JSON.stringify({ hook_entry_error: code }) + "\n");
  process.exit(2);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function main(): void {
  const configPath = process.env.GP_CONFIG;
  const dbPath = process.env.GP_DB;
  const pathKeyPath = process.env.GP_PATH_KEY;
  if (!configPath || !dbPath || !pathKeyPath) {
    fail("HOOK_ENTRY_MISSING_ENV");
  }
  const livePhaseId = process.env.GP_PHASE === undefined || process.env.GP_PHASE === ""
    ? null
    : process.env.GP_PHASE;
  const now = process.env.GP_NOW === undefined || process.env.GP_NOW === "" ? undefined : process.env.GP_NOW;

  readStdin()
    .then((text) => {
      let input: unknown;
      try {
        input = JSON.parse(text) as unknown;
      } catch {
        fail("HOOK_ENTRY_INVALID_JSON");
      }
      let config;
      let pathKey: Buffer;
      let store: GuidancePulseStore;
      try {
        config = parseConfigYaml(readFileSync(configPath as string, "utf-8"));
        pathKey = readFileSync(pathKeyPath as string);
        store = GuidancePulseStore.open(dbPath as string);
      } catch {
        fail("HOOK_ENTRY_INIT_FAILED");
      }
      try {
        run(input, config, pathKey, store, livePhaseId, now);
      } catch (err) {
        // FIX-T013 F-20: sanitize/adapter failures used to escape
        // as an uncaught exception (exit 1, no stdout JSON, Node
        // stack on stderr), contradicting this file's documented
        // contract (exit 2 + one code-only stderr line for any
        // internal error that must fail closed). Malformed input is
        // a distinct code; any other throw inside run() is a
        // fail-closed internal error. The store is closed before
        // fail() exits, because process.exit() does not unwind the
        // finally below.
        try {
          store.close();
        } catch {
          // Close is best-effort; the failure report below stands.
        }
        fail(
          err instanceof SanitizeError || err instanceof AdapterError
            ? "HOOK_ENTRY_INVALID_INPUT"
            : "HOOK_ENTRY_FAILED",
        );
      } finally {
        try {
          store.close();
        } catch {
          // Close is best-effort; the decision/output above stands.
        }
      }
    })
    .catch(() => fail("HOOK_ENTRY_STDIN_FAILED"));
}

/**
 * Dispatch one parsed Hook JSON object. Emits exactly one JSON
 * object on stdout and exits with the Hook exit code.
 */
function run(
  input: unknown,
  config: ReturnType<typeof parseConfigYaml>,
  pathKey: Buffer,
  store: GuidancePulseStore,
  livePhaseId: string | null,
  now: string | undefined,
): void {
  const sanitized = sanitizeHookInput(input);
  const adapted = adaptHookEvent(input, { config, pathKey, now });

  if (adapted.kind === "write-check") {
    const result = handlePreToolUse(input, { config, store, pathKey, livePhaseId, now });
    process.stdout.write(JSON.stringify(result.hookOutput) + "\n");
    process.exit(result.exitCode);
  }

  if (adapted.kind === "ignored") {
    process.stdout.write(JSON.stringify({ ignored: true, reason: adapted.reason }) + "\n");
    process.exit(0);
  }

  // Observation / boundary events: persist through the T006
  // handlers (or the store directly for PreCompact's event), with
  // the issuance context a READ_SUCCEEDED lease needs.
  const events = adapted.events;
  const issuanceOptions = (
    event: Extract<GuidancePulseEvent, { type: "READ_SUCCEEDED" }>,
  ): ApplyEventOptions => {
    const rule = config.rules.find((r) => r.id === event.guidanceId);
    return {
      phaseId: livePhaseId,
      cwdPathId: computePathId(sanitized.cwd, pathKey),
      maxSuccessfulEdits: rule?.max_successful_edits ?? config.defaults.max_successful_edits,
    };
  };

  // PreCompact is the only boundary event with a blocking outcome.
  const preCompact = events.find((event) => event.type === "PRE_COMPACT");
  if (preCompact !== undefined) {
    const result = handlePreCompact(store, preCompact);
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exit(exitCodeForPreCompact(result));
  }

  const outputs: unknown[] = [];
  for (const event of events) {
    if (event.type === "READ_SUCCEEDED") {
      const result = handleInstructionsLoaded(store, [
        { event, options: issuanceOptions(event) } as LoadedGuidanceRecord,
      ]);
      outputs.push(result);
    } else if (event.type === "CWD_CHANGED") {
      outputs.push(handleCwdChanged(store, event));
    } else if (event.type === "SUBAGENT_STARTED") {
      outputs.push(handleSubagentStart(store, event));
    } else {
      store.recordEvent(event);
      outputs.push({ persisted: true, type: event.type });
    }
  }
  process.stdout.write(JSON.stringify(outputs.length === 1 ? outputs[0] : outputs) + "\n");
  process.exit(0);
}

main();
