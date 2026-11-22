/**
 * Store tests — P025 GuidancePulse, T007.
 *
 * Covers: schema/WAL setup, event + lease atomic persistence,
 * reopen durability, lease snapshot parity with the T004 in-memory
 * machine, write-check lazy-expiry persistence, edit-budget
 * persistence, batch atomicity, contract validation, error-code-only
 * failures, and session delete. All data is synthetic; temp dirs are
 * removed after each test.
 */

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyGuidanceEvent,
  canonicalLeaseSnapshot,
  createEmptyLeaseStore,
  leaseKey,
} from "../../src/core/index.js";
import type { GuidancePulseEvent } from "../../src/contracts/index.js";
import { GuidancePulseStore, StoreError } from "../../src/store/index.js";
import { EVENT_COLUMNS, LEASE_COLUMNS } from "../../src/store/schema.js";

const SESSION = "synthetic-session-001";
const AGENT = "main";
const GUIDANCE = "synthetic-guidance-auth";
const TS = "2026-11-15T10:14:03Z";
const TS2 = "2026-11-15T10:15:00Z";

function readEvent(cwdPathId: string): GuidancePulseEvent {
  return {
    type: "READ_SUCCEEDED",
    sessionScopeId: SESSION,
    agentScopeId: AGENT,
    guidanceId: GUIDANCE,
    pathId: cwdPathId,
    timestampUtc: TS,
  };
}

function compactEvent(): GuidancePulseEvent {
  return { type: "PRE_COMPACT", sessionScopeId: SESSION, agentScopeId: AGENT, timestampUtc: TS2 };
}

const READ_OPTIONS = { phaseId: "implementation", cwdPathId: "hmac:" + "a".repeat(64), maxSuccessfulEdits: 5 };

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gp-t007-store-"));
  dbPath = join(dir, "state.sqlite");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("open / schema / WAL", () => {
  it("creates the file with WAL mode and schema version 1", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      expect(existsSync(dbPath)).toBe(true);
      expect(store.journalMode().toLowerCase()).toBe("wal");
      expect(store.schemaVersion()).toBe(1);
      expect(store.countEvents()).toBe(0);
      expect(store.countLeases()).toBe(0);
    } finally {
      store.close();
    }
  });

  it("creates the parent directory when missing", () => {
    const nested = join(dir, "a", "b", "state.sqlite");
    const store = GuidancePulseStore.open(nested);
    try {
      expect(existsSync(nested)).toBe(true);
    } finally {
      store.close();
    }
  });

  it("creates exactly the allowlisted tables and columns, no raw-JSON column", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      const raw = new Database(dbPath, { readonly: true });
      try {
        const tables = raw
          .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
          .all() as { name: string }[];
        // sqlite_sequence is SQLite's own AUTOINCREMENT bookkeeping.
        expect(tables.map((t) => t.name).sort()).toEqual([
          "events",
          "leases",
          "meta",
          "sqlite_sequence",
        ]);
        const eventCols = raw.prepare("PRAGMA table_info(events)").all() as { name: string }[];
        expect(eventCols.map((c) => c.name)).toEqual([...EVENT_COLUMNS]);
        const leaseCols = raw.prepare("PRAGMA table_info(leases)").all() as { name: string }[];
        expect(leaseCols.map((c) => c.name)).toEqual([...LEASE_COLUMNS]);
        const eventSql = raw
          .prepare("SELECT sql FROM sqlite_master WHERE name='events'")
          .get() as { sql: string };
        expect(eventSql.sql.toLowerCase()).not.toContain("json");
        expect(eventSql.sql.toLowerCase()).not.toContain("prompt");
        expect(eventSql.sql.toLowerCase()).not.toContain("content");
      } finally {
        raw.close();
      }
    } finally {
      store.close();
    }
  });

  it("reopening a populated database keeps its data and version", () => {
    const first = GuidancePulseStore.open(dbPath);
    first.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
    first.close();
    const second = GuidancePulseStore.open(dbPath);
    try {
      expect(second.schemaVersion()).toBe(1);
      expect(second.countEvents()).toBe(1);
      const lease = second.getLease(SESSION, AGENT, GUIDANCE);
      expect(lease?.state).toBe("FRESH");
      expect(lease?.remainingSuccessfulEdits).toBe(5);
    } finally {
      second.close();
    }
  });

  it("refuses a database with a newer schema version", () => {
    const raw = new Database(dbPath);
    raw.pragma("user_version = 99");
    raw.close();
    expect(() => GuidancePulseStore.open(dbPath)).toThrowError(StoreError);
    try {
      GuidancePulseStore.open(dbPath);
    } catch (error) {
      expect((error as StoreError).code).toBe("STORE_UNSUPPORTED_SCHEMA");
    }
  });
});

describe("event + lease persistence", () => {
  it("persists a READ_SUCCEEDED event and its FRESH lease atomically", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      const after = store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      expect(store.countEvents()).toBe(1);
      expect(store.countLeases()).toBe(1);
      const lease = store.getLease(SESSION, AGENT, GUIDANCE);
      expect(lease).toMatchObject({
        state: "FRESH",
        phaseId: "implementation",
        cwdPathId: READ_OPTIONS.cwdPathId,
        remainingSuccessfulEdits: 5,
        maxSuccessfulEdits: 5,
        reason: null,
        lastConfirmedReadUtc: TS,
      });
      expect(after).toBeDefined();
      const [event] = store.listEvents();
      expect(event).toEqual(readEvent(READ_OPTIONS.cwdPathId!));
    } finally {
      store.close();
    }
  });

  it("persisted leases match the in-memory machine snapshot exactly", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      const events: GuidancePulseEvent[] = [
        readEvent(READ_OPTIONS.cwdPathId!),
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          guidanceId: "synthetic-guidance-second",
          pathId: "hmac:" + "b".repeat(64),
          timestampUtc: TS,
        },
      ];
      let memory = createEmptyLeaseStore();
      for (const event of events) {
        memory = applyGuidanceEvent(memory, event, READ_OPTIONS);
      }
      for (const event of events) store.recordEvent(event, READ_OPTIONS);
      const reloaded = store.listAllLeases();
      const memoryLeases = [...memory.values()];
      expect(reloaded).toEqual(memoryLeases);
      // Canonical snapshot over reloaded leases == in-memory snapshot.
      const reloadedStore = new Map(
        reloaded.map((l) => [leaseKey(l.sessionScopeId, l.agentScopeId, l.guidanceId), l]),
      );
      expect(canonicalLeaseSnapshot(reloadedStore)).toBe(canonicalLeaseSnapshot(memory));
    } finally {
      store.close();
    }
  });

  it("PRE_COMPACT expires the persisted lease (CONTEXT_COMPACTION)", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      store.recordEvent(compactEvent());
      const lease = store.getLease(SESSION, AGENT, GUIDANCE);
      expect(lease?.state).toBe("EXPIRED");
      expect(lease?.reason).toBe("CONTEXT_COMPACTION");
      expect(store.countEvents()).toBe(2);
    } finally {
      store.close();
    }
  });

  it("re-reading after EXPIRED restores FRESH with a full budget", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      store.recordEvent(compactEvent());
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      const lease = store.getLease(SESSION, AGENT, GUIDANCE);
      expect(lease?.state).toBe("FRESH");
      expect(lease?.remainingSuccessfulEdits).toBe(5);
      expect(lease?.reason).toBeNull();
    } finally {
      store.close();
    }
  });

  it("persists WRITE_CHECKED output records without changing leases", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      const checked: GuidancePulseEvent = {
        type: "WRITE_CHECKED",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        guidanceId: GUIDANCE,
        pathId: "hmac:" + "c".repeat(64),
        decision: "ALLOW",
        state: "FRESH",
        timestampUtc: TS2,
      };
      store.recordEvent(checked);
      expect(store.countEvents()).toBe(2);
      expect(store.getLease(SESSION, AGENT, GUIDANCE)?.state).toBe("FRESH");
      expect(store.listEvents({ type: "WRITE_CHECKED" })).toEqual([checked]);
    } finally {
      store.close();
    }
  });
});

describe("write check and edit budget persistence", () => {
  it("checkWriteAndPersist persists lazy cwd-mismatch expiry", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      const otherCwd = "hmac:" + "d".repeat(64);
      const result = store.checkWriteAndPersist(
        {
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          cwdPathId: otherCwd,
          phaseId: "implementation",
          rules: [{ id: GUIDANCE, mode: "block" }],
        },
        TS2,
      );
      expect(result.decision).toBe("DENY");
      expect(result.perRule[0]).toMatchObject({ state: "EXPIRED", expiredReason: "CWD_MISMATCH" });
      // Persisted, not just in-memory: reopen and re-check.
      store.close();
      const reopened = GuidancePulseStore.open(dbPath);
      try {
        expect(reopened.getLease(SESSION, AGENT, GUIDANCE)?.state).toBe("EXPIRED");
        expect(reopened.getLease(SESSION, AGENT, GUIDANCE)?.reason).toBe("CWD_MISMATCH");
      } finally {
        reopened.close();
      }
    } finally {
      if (store.isOpen()) store.close();
    }
  });

  it("successful writes spend budget; the 5th expires the lease", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      for (let i = 1; i <= 4; i++) {
        const lease = store.recordWriteOutcomeAndPersist(SESSION, AGENT, GUIDANCE, "success", TS2);
        expect(lease?.state).toBe("FRESH");
        expect(lease?.remainingSuccessfulEdits).toBe(5 - i);
      }
      const last = store.recordWriteOutcomeAndPersist(SESSION, AGENT, GUIDANCE, "success", TS2);
      expect(last?.state).toBe("EXPIRED");
      expect(last?.reason).toBe("EDIT_BUDGET_EXHAUSTED");
      expect(last?.remainingSuccessfulEdits).toBe(0);
      // Failed writes never spend budget (lease already expired here,
      // so use a fresh guidance to prove the failure path).
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          guidanceId: "synthetic-guidance-third",
          pathId: "hmac:" + "e".repeat(64),
          timestampUtc: TS,
        },
        READ_OPTIONS,
      );
      const untouched = store.recordWriteOutcomeAndPersist(
        SESSION,
        AGENT,
        "synthetic-guidance-third",
        "failure",
        TS2,
      );
      expect(untouched?.remainingSuccessfulEdits).toBe(5);
    } finally {
      store.close();
    }
  });

  it("checkWrite with no matched rules allows without touching leases", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      const result = store.checkWriteAndPersist({
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        cwdPathId: READ_OPTIONS.cwdPathId,
        phaseId: "implementation",
        rules: [],
      });
      expect(result.decision).toBe("ALLOW");
      expect(store.getLease(SESSION, AGENT, GUIDANCE)?.state).toBe("FRESH");
    } finally {
      store.close();
    }
  });
});

describe("atomicity", () => {
  it("a batch with one invalid record persists nothing", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      const bad = {
        type: "READ_SUCCEEDED",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        guidanceId: GUIDANCE,
        // Not a path id: contract validation must reject the batch.
        pathId: "not-a-path-id",
        timestampUtc: TS,
      } as unknown as GuidancePulseEvent;
      expect(() =>
        store.recordEvents([
          { event: readEvent(READ_OPTIONS.cwdPathId!), options: READ_OPTIONS },
          { event: bad, options: READ_OPTIONS },
        ]),
      ).toThrowError(StoreError);
      expect(store.countEvents()).toBe(0);
      expect(store.countLeases()).toBe(0);
    } finally {
      store.close();
    }
  });

  it("a READ_SUCCEEDED with an invalid edit budget persists neither event nor lease", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      expect(() =>
        store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), {
          phaseId: "implementation",
          cwdPathId: READ_OPTIONS.cwdPathId,
          maxSuccessfulEdits: -1,
        }),
      ).toThrowError(StoreError);
      expect(store.countEvents()).toBe(0);
      expect(store.countLeases()).toBe(0);
    } finally {
      store.close();
    }
  });

  it("a valid batch persists every event and lease together", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      const after = store.recordEvents([
        { event: readEvent(READ_OPTIONS.cwdPathId!), options: READ_OPTIONS },
        { event: compactEvent() },
      ]);
      expect(store.countEvents()).toBe(2);
      expect(store.countLeases()).toBe(1);
      expect(after.get(leaseKey(SESSION, AGENT, GUIDANCE))?.state).toBe("EXPIRED");
    } finally {
      store.close();
    }
  });
});

describe("validation and error codes", () => {
  it("rejects a non-contract event with INVALID_EVENT and no payload echo", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      const bad = {
        type: "READ_SUCCEEDED",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        guidanceId: GUIDANCE,
        pathId: "hmac:" + "a".repeat(64),
        timestampUtc: TS,
        prompt: "SYNTHETIC-SECRET-PROMPT-CANARY-7Q3Z",
      } as unknown as GuidancePulseEvent;
      let caught: unknown;
      try {
        store.appendEvent(bad);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(StoreError);
      expect((caught as StoreError).code).toBe("INVALID_EVENT");
      expect((caught as Error).message).not.toContain("SYNTHETIC-SECRET-PROMPT-CANARY-7Q3Z");
      expect((caught as Error).message).not.toContain("prompt");
      expect(store.countEvents()).toBe(0);
    } finally {
      store.close();
    }
  });

  it("requires options for READ_SUCCEEDED (MISSING_READ_OPTIONS)", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      let caught: unknown;
      try {
        store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(StoreError);
      expect((caught as StoreError).code).toBe("MISSING_READ_OPTIONS");
      expect(store.countEvents()).toBe(0);
    } finally {
      store.close();
    }
  });

  it("a read-only store fails writes with STORE_READONLY, code only", () => {
    const writer = GuidancePulseStore.open(dbPath);
    writer.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
    writer.close();
    const reader = GuidancePulseStore.open(dbPath, { readonly: true });
    try {
      let caught: unknown;
      try {
        reader.appendEvent(compactEvent());
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(StoreError);
      expect((caught as StoreError).code).toBe("STORE_READONLY");
      expect((caught as Error).message).not.toContain(dbPath);
    } finally {
      reader.close();
    }
  });

  it("operations after close throw STORE_CLOSED", () => {
    const store = GuidancePulseStore.open(dbPath);
    store.close();
    expect(() => store.countEvents()).toThrowError(StoreError);
    try {
      store.countEvents();
    } catch (error) {
      expect((error as StoreError).code).toBe("STORE_CLOSED");
    }
    expect(() => store.close()).not.toThrow();
  });
});

describe("session delete", () => {
  it("deleteSession removes only that session's rows", () => {
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(readEvent(READ_OPTIONS.cwdPathId!), READ_OPTIONS);
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: "synthetic-session-002",
          agentScopeId: AGENT,
          guidanceId: GUIDANCE,
          pathId: "hmac:" + "f".repeat(64),
          timestampUtc: TS,
        },
        READ_OPTIONS,
      );
      const result = store.deleteSession(SESSION);
      expect(result).toEqual({ eventsDeleted: 1, leasesDeleted: 1 });
      expect(store.countEvents()).toBe(1);
      expect(store.countLeases()).toBe(1);
      expect(store.getLease(SESSION, AGENT, GUIDANCE)).toBeUndefined();
      expect(store.getLease("synthetic-session-002", AGENT, GUIDANCE)?.state).toBe("FRESH");
    } finally {
      store.close();
    }
  });
});
