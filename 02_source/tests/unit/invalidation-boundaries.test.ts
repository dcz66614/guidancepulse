/**
 * Invalidation-boundary tests — P025 GuidancePulse, T006.
 *
 * Four boundary event families, each in its own independent fixture
 * (fresh temp SQLite store per test, synthetic ids only, fixed
 * timestamps): PreCompact, CwdChanged, SubagentStart,
 * InstructionsLoaded. Plus the async-race fallback: the synchronous
 * PreToolUse check (`checkWrite`) still expires a stale lease even
 * when no CwdChanged observation was ever processed.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CWD_CHANGED_CAN_BLOCK,
  CWD_REQUIRES_SYNCHRONOUS_RECHECK,
  handleCwdChanged,
} from "../../src/hooks/cwd-changed.js";
import {
  handleInstructionsLoaded,
  INSTRUCTIONS_LOADED_CAN_BLOCK,
} from "../../src/hooks/instructions-loaded.js";
import { exitCodeForPreCompact, handlePreCompact } from "../../src/hooks/pre-compact.js";
import { handleSubagentStart } from "../../src/hooks/subagent-start.js";
import { checkWrite, leaseKey, type LeaseStore } from "../../src/core/index.js";
import type { GuidancePulseEvent } from "../../src/contracts/index.js";
import { GuidancePulseStore } from "../../src/store/index.js";

const SESSION = "synthetic-session-t006";
const OTHER_SESSION = "synthetic-session-t006-other";
const AGENT = "main";
const SUBAGENT = "synthetic-subagent-001";
const GUIDE_A = "synthetic-guidance-a";
const GUIDE_B = "synthetic-guidance-b";
const TS = "2026-11-15T10:14:03Z";
const TS2 = "2026-11-15T10:15:00Z";
const TS3 = "2026-11-15T10:16:00Z";
const OLD_CWD = "hmac:" + "a".repeat(64);
const NEW_CWD = "hmac:" + "b".repeat(64);

function readEvent(
  guidanceId: string,
  agentScopeId = AGENT,
  sessionScopeId = SESSION,
  timestampUtc = TS,
): GuidancePulseEvent {
  return {
    type: "READ_SUCCEEDED",
    sessionScopeId,
    agentScopeId,
    guidanceId,
    pathId: "hmac:" + "c".repeat(64),
    timestampUtc,
  };
}

function readOptions(cwdPathId: string, phaseId = "implementation") {
  return { phaseId, cwdPathId, maxSuccessfulEdits: 5 };
}

let dir: string;
let dbPath: string;
let store: GuidancePulseStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gp-t006-"));
  dbPath = join(dir, "state.sqlite");
  store = GuidancePulseStore.open(dbPath);
});

afterEach(() => {
  if (store.isOpen()) store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Seed one FRESH lease for a guidance id in a scope. */
function seedFresh(
  guidanceId: string,
  cwdPathId: string,
  agentScopeId = AGENT,
  sessionScopeId = SESSION,
) {
  store.recordEvent(readEvent(guidanceId, agentScopeId, sessionScopeId), readOptions(cwdPathId));
}

describe("PreCompact", () => {
  it("atomically expires every FRESH lease in the scope, and only that scope", () => {
    seedFresh(GUIDE_A, OLD_CWD);
    seedFresh(GUIDE_B, OLD_CWD);
    seedFresh(GUIDE_A, OLD_CWD, AGENT, OTHER_SESSION);

    const result = handlePreCompact(store, {
      type: "PRE_COMPACT",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      timestampUtc: TS2,
    });

    expect(result.persisted).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.expiredCount).toBe(2);
    expect(result.invalidatedGuidanceIds.sort()).toEqual([GUIDE_A, GUIDE_B]);
    expect(exitCodeForPreCompact(result)).toBe(0);
    for (const id of [GUIDE_A, GUIDE_B]) {
      const lease = store.getLease(SESSION, AGENT, id);
      expect(lease?.state).toBe("EXPIRED");
      expect(lease?.reason).toBe("CONTEXT_COMPACTION");
    }
    // Other scope untouched.
    expect(store.getLease(OTHER_SESSION, AGENT, GUIDE_A)?.state).toBe("FRESH");
    // Event row persisted.
    expect(store.listEvents({ type: "PRE_COMPACT" })).toHaveLength(1);
  });

  it("is durable across reopen: EXPIRED survives a restart", () => {
    seedFresh(GUIDE_A, OLD_CWD);
    handlePreCompact(store, {
      type: "PRE_COMPACT",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      timestampUtc: TS2,
    });
    store.close();
    const reopened = GuidancePulseStore.open(dbPath);
    try {
      expect(reopened.getLease(SESSION, AGENT, GUIDE_A)?.state).toBe("EXPIRED");
      expect(reopened.getLease(SESSION, AGENT, GUIDE_A)?.reason).toBe("CONTEXT_COMPACTION");
    } finally {
      reopened.close();
    }
  });

  it("is a no-op success on a scope with no FRESH leases", () => {
    const result = handlePreCompact(store, {
      type: "PRE_COMPACT",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      timestampUtc: TS2,
    });
    expect(result).toEqual({
      persisted: true,
      blocked: false,
      invalidatedGuidanceIds: [],
      expiredCount: 0,
      errorCode: null,
    });
  });

  it("strict mode blocks the compaction when the invalidation cannot be persisted", () => {
    seedFresh(GUIDE_A, OLD_CWD);
    store.close(); // every later store call fails with STORE_CLOSED
    const result = handlePreCompact(
      store,
      { type: "PRE_COMPACT", sessionScopeId: SESSION, agentScopeId: AGENT, timestampUtc: TS2 },
      { strictMode: true },
    );
    expect(result.persisted).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.errorCode).toBe("STORE_CLOSED");
    expect(exitCodeForPreCompact(result)).toBe(2);
  });

  it("non-strict mode reports the failure without blocking", () => {
    seedFresh(GUIDE_A, OLD_CWD);
    store.close();
    const result = handlePreCompact(
      store,
      { type: "PRE_COMPACT", sessionScopeId: SESSION, agentScopeId: AGENT, timestampUtc: TS2 },
      { strictMode: false },
    );
    expect(result.persisted).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.errorCode).toBe("STORE_CLOSED");
    expect(exitCodeForPreCompact(result)).toBe(0);
  });

  it("rejects a non-PRE_COMPACT event", () => {
    expect(() =>
      handlePreCompact(store, {
        type: "CWD_CHANGED",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        oldPathId: OLD_CWD,
        newPathId: NEW_CWD,
        timestampUtc: TS2,
      }),
    ).toThrow(/INVALID_EVENT_TYPE/);
  });
});

describe("CwdChanged (async observation only)", () => {
  it("expires leases issued under the old cwd, keeps leases issued under the new cwd", () => {
    seedFresh(GUIDE_A, OLD_CWD);
    seedFresh(GUIDE_B, NEW_CWD);

    const result = handleCwdChanged(store, {
      type: "CWD_CHANGED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      oldPathId: OLD_CWD,
      newPathId: NEW_CWD,
      timestampUtc: TS2,
    });

    expect(CWD_CHANGED_CAN_BLOCK).toBe(false);
    expect(CWD_REQUIRES_SYNCHRONOUS_RECHECK).toBe(true);
    expect(result.persisted).toBe(true);
    expect(result.blocking).toBe(false);
    expect(result.invalidatedGuidanceIds).toEqual([GUIDE_A]);
    expect(result.survivingGuidanceIds).toEqual([GUIDE_B]);
    expect(store.getLease(SESSION, AGENT, GUIDE_A)?.reason).toBe("CWD_MISMATCH");
    expect(store.getLease(SESSION, AGENT, GUIDE_B)?.state).toBe("FRESH");
  });

  it("a re-read under the new cwd after the observation restores FRESH", () => {
    seedFresh(GUIDE_A, OLD_CWD);
    handleCwdChanged(store, {
      type: "CWD_CHANGED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      oldPathId: OLD_CWD,
      newPathId: NEW_CWD,
      timestampUtc: TS2,
    });
    expect(store.getLease(SESSION, AGENT, GUIDE_A)?.state).toBe("EXPIRED");
    store.recordEvent(readEvent(GUIDE_A, AGENT, SESSION, TS3), readOptions(NEW_CWD));
    const lease = store.getLease(SESSION, AGENT, GUIDE_A);
    expect(lease?.state).toBe("FRESH");
    expect(lease?.reason).toBeNull();
  });

  it("race fallback: the synchronous PreToolUse check expires a stale lease even when no CwdChanged observation was ever processed", () => {
    // The observation never arrives (or arrives late): no CWD_CHANGED
    // row exists at all, yet the write check must still fail closed.
    seedFresh(GUIDE_A, OLD_CWD);
    expect(store.listEvents({ type: "CWD_CHANGED" })).toHaveLength(0);

    const result = checkWrite(loadStore(), {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      cwdPathId: NEW_CWD, // live cwd differs from issuance cwd
      phaseId: "implementation",
      rules: [{ id: GUIDE_A, mode: "block" }],
    });
    expect(result.decision).toBe("DENY");
    expect(result.perRule[0]?.state).toBe("EXPIRED");
    expect(result.perRule[0]?.expiredReason).toBe("CWD_MISMATCH");
    // And the lazy expiry was persisted by the check path.
    const persisted = store.checkWriteAndPersist({
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      cwdPathId: NEW_CWD,
      phaseId: "implementation",
      rules: [{ id: GUIDE_A, mode: "block" }],
    });
    expect(persisted.decision).toBe("DENY");
    expect(store.getLease(SESSION, AGENT, GUIDE_A)?.reason).toBe("CWD_MISMATCH");
  });

  it("reports a persistence failure without blocking", () => {
    store.close();
    const result = handleCwdChanged(store, {
      type: "CWD_CHANGED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      oldPathId: OLD_CWD,
      newPathId: NEW_CWD,
      timestampUtc: TS2,
    });
    expect(result.persisted).toBe(false);
    expect(result.blocking).toBe(false);
    expect(result.errorCode).toBe("STORE_CLOSED");
  });
});

describe("SubagentStart", () => {
  it("establishes a new UNSEEN scope and leaves parent leases untouched", () => {
    seedFresh(GUIDE_A, OLD_CWD);
    seedFresh(GUIDE_B, OLD_CWD);

    const result = handleSubagentStart(store, {
      type: "SUBAGENT_STARTED",
      sessionScopeId: SESSION,
      agentScopeId: SUBAGENT,
      timestampUtc: TS2,
    });

    expect(result.persisted).toBe(true);
    expect(result.scope).toEqual({ sessionScopeId: SESSION, agentScopeId: SUBAGENT });
    expect(result.initialState).toBe("UNSEEN");
    expect(result.inheritedGuidanceIds).toEqual([]);
    expect(result.parentLeasesUntouched).toBe(true);
    // New scope: no lease rows at all (absence means UNSEEN).
    expect(store.getLease(SESSION, SUBAGENT, GUIDE_A)).toBeUndefined();
    expect(store.getLease(SESSION, SUBAGENT, GUIDE_B)).toBeUndefined();
    expect(store.listLeasesForScope(SESSION, SUBAGENT)).toHaveLength(0);
    // Parent scope still FRESH.
    expect(store.getLease(SESSION, AGENT, GUIDE_A)?.state).toBe("FRESH");
    expect(store.getLease(SESSION, AGENT, GUIDE_B)?.state).toBe("FRESH");
    expect(store.listEvents({ type: "SUBAGENT_STARTED" })).toHaveLength(1);
  });

  it("a subagent's own read issues a lease only in its own scope", () => {
    handleSubagentStart(store, {
      type: "SUBAGENT_STARTED",
      sessionScopeId: SESSION,
      agentScopeId: SUBAGENT,
      timestampUtc: TS2,
    });
    store.recordEvent(readEvent(GUIDE_A, SUBAGENT, SESSION, TS3), readOptions(OLD_CWD));
    expect(store.getLease(SESSION, SUBAGENT, GUIDE_A)?.state).toBe("FRESH");
    expect(store.getLease(SESSION, AGENT, GUIDE_A)).toBeUndefined();
  });
});

describe("InstructionsLoaded (observation only, never a block)", () => {
  it("credentials the loaded guidance (FRESH) and can never block", () => {
    expect(INSTRUCTIONS_LOADED_CAN_BLOCK).toBe(false);
    const result = handleInstructionsLoaded(store, [
      { event: readEvent(GUIDE_A), options: readOptions(OLD_CWD) },
      { event: readEvent(GUIDE_B), options: readOptions(OLD_CWD) },
    ]);
    expect(result.persisted).toBe(true);
    expect(result.blocking).toBe(false);
    expect(result.credentialedGuidanceIds.sort()).toEqual([GUIDE_A, GUIDE_B]);
    expect(store.getLease(SESSION, AGENT, GUIDE_A)?.state).toBe("FRESH");
    expect(store.getLease(SESSION, AGENT, GUIDE_B)?.state).toBe("FRESH");
  });

  it("a persistence failure is reported and still never blocks", () => {
    store.close();
    const result = handleInstructionsLoaded(store, [
      { event: readEvent(GUIDE_A), options: readOptions(OLD_CWD) },
    ]);
    expect(result.persisted).toBe(false);
    expect(result.blocking).toBe(false);
    expect(result.errorCode).toBe("STORE_CLOSED");
  });

  it("rejects a non-READ_SUCCEEDED event in the batch", () => {
    expect(() =>
      handleInstructionsLoaded(store, [
        {
          event: {
            type: "PRE_COMPACT",
            sessionScopeId: SESSION,
            agentScopeId: AGENT,
            timestampUtc: TS2,
          },
          options: readOptions(OLD_CWD),
        },
      ]),
    ).toThrow(/INVALID_EVENT_TYPE/);
    expect(store.countEvents()).toBe(0);
  });
});

/** Load the persisted leases back into an in-memory store (T004 API). */
function loadStore(): LeaseStore {
  const map = new Map();
  for (const lease of store.listAllLeases()) {
    map.set(leaseKey(lease.sessionScopeId, lease.agentScopeId, lease.guidanceId), lease);
  }
  return map;
}
