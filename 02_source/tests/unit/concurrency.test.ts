/**
 * Concurrency tests — P025 GuidancePulse, T007
 * (`npm run test:concurrency`).
 *
 * Real multi-PROCESS concurrency: each simulated Hook subprocess is
 * a separate `node` process (tests/helpers/store-worker.mjs) opening
 * its own store connection against one shared SQLite file.
 *
 *   1. 8 writers x 25 READ_SUCCEEDED events in private sessions:
 *      all 200 events and 200 leases must survive, none lost, none
 *      duplicated, every lease FRESH.
 *   2. 4 writers x 1 PRE_COMPACT each against ONE shared session:
 *      the shared leases must end EXPIRED (CONTEXT_COMPACTION) and
 *      the event count must grow by exactly 4 — no lost update, no
 *      SQLITE_BUSY failure.
 *
 * The worker imports the COMPILED store (tsc output in a temp dir
 * under 02_source, so `better-sqlite3` resolves from node_modules).
 * All data is synthetic; temp dirs are removed afterwards.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuidancePulseStore } from "../../src/store/index.js";

const execFileAsync = promisify(execFile);

const WORKERS = 8;
const EVENTS_PER_WORKER = 25;
const COMPACT_WORKERS = 4;

let dir: string;
let dbPath: string;
let keyDir: string;
let distDir: string;
let tmpRoot: string;

const workerScript = new URL("../helpers/store-worker.mjs", import.meta.url).pathname;

function runWorker(workerId: string, count: number, mode: "read" | "compact"): Promise<void> {
  return execFileAsync(process.execPath, [
    workerScript,
    distDir,
    dbPath,
    keyDir,
    workerId,
    String(count),
    mode,
  ]).then(
    () => undefined,
    (error: unknown) => {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      throw new Error(
        `worker ${workerId} (${mode}) failed: exit=${err.code} ` +
          `stdout=${(err.stdout ?? "").trim()} stderr=${(err.stderr ?? "").trim()}`,
      );
    },
  );
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "gp-t007-concurrency-"));
  dbPath = join(dir, "state.sqlite");
  keyDir = join(dir, "keys");
  // Compile the production sources once, inside 02_source so the
  // compiled output resolves better-sqlite3 from node_modules.
  tmpRoot = mkdtempSync(join(process.cwd(), ".tmp-t007-"));
  distDir = join(tmpRoot, "dist");
  const tsconfigPath = join(tmpRoot, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      extends: "../tsconfig.json",
      compilerOptions: { noEmit: false, outDir: "dist" },
      include: ["../src/**/*.ts"],
    }),
  );
  await execFileAsync(process.execPath, [
    join(process.cwd(), "node_modules", "typescript", "bin", "tsc"),
    "-p",
    tsconfigPath,
  ]);
}, 120_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("multi-process concurrent writes", () => {
  it("8 Hook subprocesses x 25 events: nothing lost, nothing duplicated", async () => {
    const writers = Array.from({ length: WORKERS }, (_, i) =>
      runWorker(`w${i}`, EVENTS_PER_WORKER, "read"),
    );
    await Promise.all(writers);
    const store = GuidancePulseStore.open(dbPath);
    try {
      expect(store.countEvents()).toBe(WORKERS * EVENTS_PER_WORKER);
      expect(store.countLeases()).toBe(WORKERS * EVENTS_PER_WORKER);
      const events = store.listEvents();
      const ids = new Set(events.map((e) => `${e.sessionScopeId}|${(e as { guidanceId?: string }).guidanceId ?? ""}`));
      expect(ids.size).toBe(WORKERS * EVENTS_PER_WORKER);
      const leases = store.listAllLeases();
      expect(leases.every((lease) => lease.state === "FRESH")).toBe(true);
      expect(leases.every((lease) => lease.remainingSuccessfulEdits === 5)).toBe(true);
      const sample = store.getLease("concurrency-session-w3", "main", "guidance-w3-7");
      expect(sample?.state).toBe("FRESH");
      expect(sample?.phaseId).toBe("implementation");
    } finally {
      store.close();
    }
  }, 120_000);

  it("4 subprocesses compacting one shared session: all leases expire, 4 events land", async () => {
    // Seed one shared session with 8 FRESH leases first.
    const seed = GuidancePulseStore.open(dbPath);
    try {
      for (let i = 0; i < WORKERS; i++) {
        seed.recordEvent(
          {
            type: "READ_SUCCEEDED",
            sessionScopeId: "concurrency-session-shared",
            agentScopeId: "main",
            guidanceId: `shared-guidance-${i}`,
            pathId: `hmac:${"a".repeat(64)}`,
            timestampUtc: "2026-11-15T10:14:03Z",
          },
          { phaseId: "implementation", cwdPathId: `hmac:${"b".repeat(64)}`, maxSuccessfulEdits: 5 },
        );
      }
    } finally {
      seed.close();
    }
    const before = GuidancePulseStore.open(dbPath);
    const eventsBefore = before.countEvents();
    before.close();

    const compactors = Array.from({ length: COMPACT_WORKERS }, (_, i) =>
      runWorker(`c${i}`, 1, "compact"),
    );
    await Promise.all(compactors);

    const store = GuidancePulseStore.open(dbPath);
    try {
      expect(store.countEvents()).toBe(eventsBefore + COMPACT_WORKERS);
      const leases = store.listLeasesForScope("concurrency-session-shared", "main");
      expect(leases).toHaveLength(WORKERS);
      expect(leases.every((lease) => lease.state === "EXPIRED")).toBe(true);
      expect(leases.every((lease) => lease.reason === "CONTEXT_COMPACTION")).toBe(true);
    } finally {
      store.close();
    }
  }, 120_000);
});
