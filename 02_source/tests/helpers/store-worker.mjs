/**
 * Concurrency worker — P025 GuidancePulse, T007.
 *
 * Spawned as a SEPARATE OS PROCESS by tests/unit/concurrency.test.ts,
 * one process per simulated Hook subprocess. Each worker opens its
 * OWN store connection against the shared database file and writes
 * its share of events, exactly like concurrent PreToolUse /
 * PostToolUse hook invocations.
 *
 * Usage:
 *   node store-worker.mjs <distDir> <dbPath> <keyDir> <workerId> <count> <mode>
 *
 * Modes:
 *   read    — <count> READ_SUCCEEDED events in a worker-private session
 *   compact — <count> PRE_COMPACT events in the shared session
 *             "concurrency-session-shared"
 *
 * On failure it prints ONLY an error code to stderr and exits 1;
 * raw input is never printed. All data is synthetic.
 */

import { pathToFileURL } from "node:url";
import { join } from "node:path";

const [distDir, dbPath, keyDir, workerId, countArg, mode] = process.argv.slice(2);
const count = Number.parseInt(countArg, 10);

const storeModule = await import(pathToFileURL(join(distDir, "store", "index.js")).href);
const pathIdModule = await import(pathToFileURL(join(distDir, "privacy", "path-id.js")).href);
const { GuidancePulseStore } = storeModule;
const { computePathIdForKey, loadOrCreatePathKey } = pathIdModule;

const { key } = loadOrCreatePathKey(keyDir);
const store = GuidancePulseStore.open(dbPath);

try {
  if (mode === "read") {
    const session = `concurrency-session-${workerId}`;
    const cwdId = computePathIdForKey(`/synthetic-cwd-worker-${workerId}`, key);
    for (let i = 0; i < count; i++) {
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: session,
          agentScopeId: "main",
          guidanceId: `guidance-${workerId}-${i}`,
          pathId: computePathIdForKey(`src/worker${workerId}/file${i}.ts`, key),
          timestampUtc: "2026-11-15T10:14:03Z",
        },
        { phaseId: "implementation", cwdPathId: cwdId, maxSuccessfulEdits: 5 },
      );
    }
  } else if (mode === "compact") {
    for (let i = 0; i < count; i++) {
      store.recordEvent({
        type: "PRE_COMPACT",
        sessionScopeId: "concurrency-session-shared",
        agentScopeId: "main",
        timestampUtc: "2026-11-15T10:16:00Z",
      });
    }
  } else {
    console.error("WORKER_BAD_MODE");
    process.exit(1);
  }
  console.log(`OK ${workerId} ${count}`);
} catch (error) {
  const code =
    error !== null && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "WORKER_ERROR";
  console.error(code);
  process.exitCode = 1;
} finally {
  store.close();
}
