/**
 * Lease state machine tests — P025 GuidancePulse, T004.
 * PROJECT_BOOK §6.1–§6.5: UNSEEN -> FRESH -> EXPIRED, scope isolation,
 * edit budget, write-check algorithm, determinism. All data synthetic;
 * cwd path ids are HMACs under a fixed synthetic key (T003
 * `computePathId`); timestamps are fixed strings — no clock, no I/O.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyGuidanceEvent,
  canonicalLeaseSnapshot,
  checkWrite,
  createEmptyLeaseStore,
  getLease,
  LeaseError,
  leaseKey,
  leasesForScope,
  listLeases,
  recordWriteOutcome,
  type ApplyEventOptions,
  type GuidanceLease,
  type LeaseStore,
} from "../../src/core/lease-machine.js";
import type { GuidancePulseEvent } from "../../src/contracts/events.js";
import { computePathId } from "../../src/privacy/sanitize.js";

const KEY = "synthetic-test-path-key-001";
const S = "sess-001";
const S2 = "sess-002";
const A = "main";
const A2 = "subagent-7";
const G = "auth-change-safety";
const G2 = "docs-style";
const CWD_A = computePathId("/proj", KEY);
const CWD_B = computePathId("/other", KEY);
const TS1 = "2026-11-15T10:14:03Z";
const TS2 = "2026-11-15T10:15:00Z";

const OPTS: ApplyEventOptions = {
  phaseId: "implementation",
  cwdPathId: CWD_A,
  maxSuccessfulEdits: 5,
};

function readEvent(
  guidanceId: string = G,
  sessionScopeId: string = S,
  agentScopeId: string = A,
  timestampUtc: string = TS1,
): GuidancePulseEvent {
  return {
    type: "READ_SUCCEEDED",
    sessionScopeId,
    agentScopeId,
    guidanceId,
    pathId: computePathId("CLAUDE.md", KEY),
    timestampUtc,
  };
}

function freshStore(options: ApplyEventOptions = OPTS): LeaseStore {
  return applyGuidanceEvent(createEmptyLeaseStore(), readEvent(), options);
}

function freshLease(store: LeaseStore): GuidanceLease {
  const lease = getLease(store, S, A, G);
  expect(lease).toBeDefined();
  return lease as GuidanceLease;
}

describe("issuance: successful Read -> FRESH, no Read -> UNSEEN", () => {
  it("READ_SUCCEEDED issues FRESH with full budget, phase, cwd, timestamp", () => {
    const lease = freshLease(freshStore());
    expect(lease.state).toBe("FRESH");
    expect(lease.remainingSuccessfulEdits).toBe(5);
    expect(lease.maxSuccessfulEdits).toBe(5);
    expect(lease.phaseId).toBe("implementation");
    expect(lease.cwdPathId).toBe(CWD_A);
    expect(lease.reason).toBeNull();
    expect(lease.lastConfirmedReadUtc).toBe(TS1);
  });

  it("no read means no lease; checkWrite reports UNSEEN per mode", () => {
    const store = createEmptyLeaseStore();
    expect(getLease(store, S, A, G)).toBeUndefined();
    for (const [mode, decision] of [
      ["warn", "WARN"],
      ["ask", "ASK"],
      ["block", "DENY"],
    ] as const) {
      const result = checkWrite(store, {
        sessionScopeId: S,
        agentScopeId: A,
        cwdPathId: CWD_A,
        phaseId: "implementation",
        rules: [{ id: G, mode }],
      });
      expect(result.decision).toBe(decision);
      expect(result.perRule).toEqual([
        { guidanceId: G, mode, state: "UNSEEN", expiredReason: null },
      ]);
      expect(result.updatedStore).toBe(store);
    }
  });

  it("maxSuccessfulEdits 0 issues an immediately-EXPIRED lease", () => {
    const lease = freshLease(freshStore({ ...OPTS, maxSuccessfulEdits: 0 }));
    expect(lease.state).toBe("EXPIRED");
    expect(lease.reason).toBe("EDIT_BUDGET_EXHAUSTED");
    expect(lease.remainingSuccessfulEdits).toBe(0);
  });

  it("re-read after EXPIRED restores FRESH with a full budget and cleared reason", () => {
    let store = freshStore();
    store = applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    expect(freshLease(store).state).toBe("EXPIRED");
    store = applyGuidanceEvent(store, readEvent(G, S, A, TS2), OPTS);
    const lease = freshLease(store);
    expect(lease.state).toBe("FRESH");
    expect(lease.remainingSuccessfulEdits).toBe(5);
    expect(lease.reason).toBeNull();
    expect(lease.lastConfirmedReadUtc).toBe(TS2);
  });

  it("re-reading a FRESH lease refreshes it (budget reset after partial spend)", () => {
    let store = freshStore();
    store = recordWriteOutcome(store, S, A, G, "success");
    expect(freshLease(store).remainingSuccessfulEdits).toBe(4);
    store = applyGuidanceEvent(store, readEvent(G, S, A, TS2), OPTS);
    const lease = freshLease(store);
    expect(lease.state).toBe("FRESH");
    expect(lease.remainingSuccessfulEdits).toBe(5);
    expect(lease.lastConfirmedReadUtc).toBe(TS2);
  });

  it("a read for another guidance does not touch existing leases", () => {
    let store = freshStore();
    store = applyGuidanceEvent(store, readEvent(G2), OPTS);
    expect(freshLease(store).remainingSuccessfulEdits).toBe(5);
    const other = getLease(store, S, A, G2);
    expect(other?.state).toBe("FRESH");
  });

  it("same agent+guidance in another session is a separate lease", () => {
    let store = freshStore();
    store = applyGuidanceEvent(store, readEvent(G, S2, A), OPTS);
    expect(getLease(store, S, A, G)?.state).toBe("FRESH");
    expect(getLease(store, S2, A, G)?.state).toBe("FRESH");
    store = applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    expect(getLease(store, S, A, G)?.state).toBe("EXPIRED");
    expect(getLease(store, S2, A, G)?.state).toBe("FRESH");
  });

  it("rejects a malformed event and an invalid edit budget (fail closed)", () => {
    const store = createEmptyLeaseStore();
    expect(() =>
      applyGuidanceEvent(store, { type: "NOPE" } as unknown as GuidancePulseEvent, OPTS),
    ).toThrow(LeaseError);
    expect(() =>
      applyGuidanceEvent(store, readEvent(), { ...OPTS, maxSuccessfulEdits: -1 }),
    ).toThrow(LeaseError);
    expect(() =>
      applyGuidanceEvent(store, readEvent(), { ...OPTS, maxSuccessfulEdits: 1.5 }),
    ).toThrow(LeaseError);
  });
});

describe("invalidation boundaries", () => {
  it("PRE_COMPACT expires FRESH leases in scope (CONTEXT_COMPACTION), keeping budget", () => {
    let store = freshStore();
    store = applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    const lease = freshLease(store);
    expect(lease.state).toBe("EXPIRED");
    expect(lease.reason).toBe("CONTEXT_COMPACTION");
    expect(lease.remainingSuccessfulEdits).toBe(5);
  });

  it("PRE_COMPACT leaves other sessions and other agent scopes untouched", () => {
    let store = freshStore();
    store = applyGuidanceEvent(store, readEvent(G, S2, A), OPTS);
    store = applyGuidanceEvent(store, readEvent(G, S, A2), OPTS);
    store = applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    expect(getLease(store, S, A, G)?.state).toBe("EXPIRED");
    expect(getLease(store, S2, A, G)?.state).toBe("FRESH");
    expect(getLease(store, S, A2, G)?.state).toBe("FRESH");
  });

  it("PRE_COMPACT on a scope with no leases changes nothing", () => {
    const store = createEmptyLeaseStore();
    const next = applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    expect(next).toBe(store);
    expect(next.size).toBe(0);
  });

  it("CWD_CHANGED expires leases issued under the old cwd, keeps the new-cwd lease", () => {
    let store = freshStore();
    store = applyGuidanceEvent(
      store,
      { type: "CWD_CHANGED", sessionScopeId: S, agentScopeId: A, oldPathId: CWD_A, newPathId: CWD_B, timestampUtc: TS2 },
      OPTS,
    );
    const lease = freshLease(store);
    expect(lease.state).toBe("EXPIRED");
    expect(lease.reason).toBe("CWD_MISMATCH");

    let store2 = freshStore({ ...OPTS, cwdPathId: CWD_B });
    store2 = applyGuidanceEvent(
      store2,
      { type: "CWD_CHANGED", sessionScopeId: S, agentScopeId: A, oldPathId: CWD_A, newPathId: CWD_B, timestampUtc: TS2 },
      OPTS,
    );
    expect(freshLease(store2).state).toBe("FRESH");
  });

  it("CWD_CHANGED expires a lease issued with unknown cwd (fail closed)", () => {
    let store = freshStore({ ...OPTS, cwdPathId: null });
    store = applyGuidanceEvent(
      store,
      { type: "CWD_CHANGED", sessionScopeId: S, agentScopeId: A, oldPathId: CWD_A, newPathId: CWD_B, timestampUtc: TS2 },
      OPTS,
    );
    expect(freshLease(store).state).toBe("EXPIRED");
    expect(freshLease(store).reason).toBe("CWD_MISMATCH");
  });

  it("PHASE_CHANGED expires leases issued under another phase, keeps same-phase leases", () => {
    let store = freshStore();
    store = applyGuidanceEvent(
      store,
      { type: "PHASE_CHANGED", sessionScopeId: S, agentScopeId: A, phaseId: "review", timestampUtc: TS2 },
      OPTS,
    );
    const lease = freshLease(store);
    expect(lease.state).toBe("EXPIRED");
    expect(lease.reason).toBe("PHASE_MISMATCH");

    let store2 = freshStore();
    store2 = applyGuidanceEvent(
      store2,
      { type: "PHASE_CHANGED", sessionScopeId: S, agentScopeId: A, phaseId: "implementation", timestampUtc: TS2 },
      OPTS,
    );
    expect(freshLease(store2).state).toBe("FRESH");
  });

  it("PHASE_CHANGED expires a lease issued with unknown phase (fail closed)", () => {
    let store = freshStore({ ...OPTS, phaseId: null });
    store = applyGuidanceEvent(
      store,
      { type: "PHASE_CHANGED", sessionScopeId: S, agentScopeId: A, phaseId: "review", timestampUtc: TS2 },
      OPTS,
    );
    expect(freshLease(store).state).toBe("EXPIRED");
    expect(freshLease(store).reason).toBe("PHASE_MISMATCH");
  });

  it("SUBAGENT_STARTED is a store no-op: new scope UNSEEN, parent lease untouched", () => {
    const store = freshStore();
    const next = applyGuidanceEvent(
      store,
      { type: "SUBAGENT_STARTED", sessionScopeId: S, agentScopeId: A2, timestampUtc: TS2 },
      OPTS,
    );
    expect(next).toBe(store);
    expect(getLease(next, S, A2, G)).toBeUndefined();
    expect(getLease(next, S, A, G)?.state).toBe("FRESH");
  });

  it("WRITE_CHECKED is an output record, not a state input: ignored", () => {
    const store = freshStore();
    const next = applyGuidanceEvent(
      store,
      {
        type: "WRITE_CHECKED",
        sessionScopeId: S,
        agentScopeId: A,
        guidanceId: G,
        pathId: computePathId("src/auth/login.ts", KEY),
        decision: "ALLOW",
        state: "FRESH",
        timestampUtc: TS2,
      },
      OPTS,
    );
    expect(next).toBe(store);
  });
});

describe("edit budget", () => {
  it("five successful writes spend the budget; the fifth expires the lease", () => {
    let store = freshStore();
    for (let i = 4; i >= 1; i -= 1) {
      store = recordWriteOutcome(store, S, A, G, "success");
      expect(freshLease(store).state).toBe("FRESH");
      expect(freshLease(store).remainingSuccessfulEdits).toBe(i);
    }
    store = recordWriteOutcome(store, S, A, G, "success");
    const lease = freshLease(store);
    expect(lease.state).toBe("EXPIRED");
    expect(lease.reason).toBe("EDIT_BUDGET_EXHAUSTED");
    expect(lease.remainingSuccessfulEdits).toBe(0);
  });

  it("failed writes never decrement the budget", () => {
    let store = freshStore();
    for (let i = 0; i < 7; i += 1) {
      store = recordWriteOutcome(store, S, A, G, "failure");
    }
    expect(freshLease(store).state).toBe("FRESH");
    expect(freshLease(store).remainingSuccessfulEdits).toBe(5);
  });

  it("writes against a missing or EXPIRED lease change nothing", () => {
    const empty = createEmptyLeaseStore();
    expect(recordWriteOutcome(empty, S, A, G, "success")).toBe(empty);
    let store = freshStore();
    store = applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    const before = canonicalLeaseSnapshot(store);
    const after = recordWriteOutcome(store, S, A, G, "success");
    expect(after).toBe(store);
    expect(canonicalLeaseSnapshot(after)).toBe(before);
  });
});

describe("checkWrite (§6.4 algorithm)", () => {
  const input = {
    sessionScopeId: S,
    agentScopeId: A,
    cwdPathId: CWD_A,
    phaseId: "implementation",
    rules: [{ id: G, mode: "warn" as const }],
  };

  it("all FRESH -> ALLOW; no rules -> ALLOW with no per-rule results", () => {
    const store = freshStore();
    const result = checkWrite(store, input);
    expect(result.decision).toBe("ALLOW");
    expect(result.perRule).toEqual([
      { guidanceId: G, mode: "warn", state: "FRESH", expiredReason: null },
    ]);
    expect(result.updatedStore).toBe(store);
    const empty = checkWrite(store, { ...input, rules: [] });
    expect(empty.decision).toBe("ALLOW");
    expect(empty.perRule).toEqual([]);
  });

  it("aggregates the strictest non-FRESH mode: block > ask > warn", () => {
    const store = createEmptyLeaseStore();
    const rules = [
      { id: G, mode: "warn" as const },
      { id: G2, mode: "ask" as const },
    ];
    expect(checkWrite(store, { ...input, rules }).decision).toBe("ASK");
    const withBlock = [...rules, { id: "third-rule", mode: "block" as const }];
    expect(checkWrite(store, { ...input, rules: withBlock }).decision).toBe("DENY");
    const fresh = freshStore();
    // One FRESH rule + one UNSEEN warn rule -> WARN (only non-FRESH modes count).
    expect(checkWrite(fresh, { ...input, rules }).decision).toBe("ASK");
    expect(checkWrite(fresh, { ...input, rules: [rules[0] as { id: string; mode: "warn" }] }).decision).toBe("ALLOW");
  });

  it("per-rule results keep input rule order", () => {
    const store = createEmptyLeaseStore();
    const rules = [
      { id: G2, mode: "block" as const },
      { id: G, mode: "warn" as const },
    ];
    const result = checkWrite(store, { ...input, rules });
    expect(result.perRule.map((r) => r.guidanceId)).toEqual([G2, G]);
    expect(result.decision).toBe("DENY");
  });

  it("lazy expiry: cwd mismatch at check time expires the lease in updatedStore", () => {
    const store = freshStore();
    const result = checkWrite(store, { ...input, cwdPathId: CWD_B });
    expect(result.decision).toBe("WARN");
    expect(result.perRule).toEqual([
      { guidanceId: G, mode: "warn", state: "EXPIRED", expiredReason: "CWD_MISMATCH" },
    ]);
    expect(getLease(result.updatedStore, S, A, G)?.state).toBe("EXPIRED");
    expect(getLease(result.updatedStore, S, A, G)?.reason).toBe("CWD_MISMATCH");
    // Input store is never mutated.
    expect(getLease(store, S, A, G)?.state).toBe("FRESH");
  });

  it("lazy expiry: phase mismatch and unknown live cwd/phase fail closed", () => {
    const store = freshStore();
    const phase = checkWrite(store, { ...input, phaseId: "review" });
    expect(phase.perRule[0]?.expiredReason).toBe("PHASE_MISMATCH");
    expect(phase.decision).toBe("WARN");
    const noCwd = checkWrite(store, { ...input, cwdPathId: null });
    expect(noCwd.perRule[0]?.expiredReason).toBe("CWD_MISMATCH");
    const noPhase = checkWrite(store, { ...input, phaseId: null });
    expect(noPhase.perRule[0]?.expiredReason).toBe("PHASE_MISMATCH");
  });

  it("lazy expiry: a FRESH lease with zero remaining edits expires (defensive)", () => {
    const lease = freshLease(freshStore());
    const broken: LeaseStore = new Map([
      [leaseKey(S, A, G), { ...lease, remainingSuccessfulEdits: 0 }],
    ]);
    const result = checkWrite(broken, input);
    expect(result.perRule[0]?.state).toBe("EXPIRED");
    expect(result.perRule[0]?.expiredReason).toBe("EDIT_BUDGET_EXHAUSTED");
    expect(result.decision).toBe("WARN");
  });

  it("an already-EXPIRED lease keeps its stored reason; expiredReason stays null", () => {
    let store = freshStore();
    store = applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    const result = checkWrite(store, input);
    expect(result.perRule).toEqual([
      { guidanceId: G, mode: "warn", state: "EXPIRED", expiredReason: null },
    ]);
    expect(result.decision).toBe("WARN");
    expect(result.updatedStore).toBe(store);
  });

  it("a subagent scope never inherits the parent lease", () => {
    const store = freshStore();
    const result = checkWrite(store, { ...input, agentScopeId: A2 });
    expect(result.decision).toBe("WARN");
    expect(result.perRule[0]?.state).toBe("UNSEEN");
  });
});

describe("immutability and determinism", () => {
  it("applyGuidanceEvent never mutates its input store", () => {
    const store = freshStore();
    const before = canonicalLeaseSnapshot(store);
    applyGuidanceEvent(store, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    expect(canonicalLeaseSnapshot(store)).toBe(before);
    expect(getLease(store, S, A, G)?.state).toBe("FRESH");
  });

  it("the same event sequence yields the same canonical snapshot", () => {
    const run = (): string => {
      let store = createEmptyLeaseStore();
      store = applyGuidanceEvent(store, readEvent(), OPTS);
      store = applyGuidanceEvent(store, readEvent(G2, S, A, TS1), OPTS);
      store = recordWriteOutcome(store, S, A, G, "success");
      store = recordWriteOutcome(store, S, A, G, "failure");
      store = applyGuidanceEvent(store, { type: "PHASE_CHANGED", sessionScopeId: S, agentScopeId: A, phaseId: "review", timestampUtc: TS2 }, OPTS);
      return canonicalLeaseSnapshot(store);
    };
    expect(run()).toBe(run());
  });

  it("a different event sequence yields a different canonical snapshot", () => {
    const base = freshStore();
    const compacted = applyGuidanceEvent(base, { type: "PRE_COMPACT", sessionScopeId: S, agentScopeId: A, timestampUtc: TS2 }, OPTS);
    expect(canonicalLeaseSnapshot(compacted)).not.toBe(canonicalLeaseSnapshot(base));
  });

  it("insertion order does not change the canonical snapshot", () => {
    let a = createEmptyLeaseStore();
    a = applyGuidanceEvent(a, readEvent(G), OPTS);
    a = applyGuidanceEvent(a, readEvent(G2), OPTS);
    let b = createEmptyLeaseStore();
    b = applyGuidanceEvent(b, readEvent(G2), OPTS);
    b = applyGuidanceEvent(b, readEvent(G), OPTS);
    expect(canonicalLeaseSnapshot(a)).toBe(canonicalLeaseSnapshot(b));
    expect(listLeases(a).map((l) => l.guidanceId)).toEqual([G2, G].sort());
    expect(leasesForScope(a, S, A).map((l) => l.guidanceId)).toEqual([G2, G].sort());
  });

  it("the canonical snapshot carries no raw path (only HMAC ids)", () => {
    const snapshot = canonicalLeaseSnapshot(freshStore());
    expect(snapshot).not.toContain("/proj");
    expect(snapshot).not.toContain("CLAUDE.md");
    expect(snapshot).toContain(CWD_A);
  });
});

describe("leaseKey separator (R1-P2-01)", () => {
  it("joins the three components with U+001F (unit separator), never NUL", () => {
    expect(leaseKey(S, A, G)).toBe(`${S}\u001F${A}\u001F${G}`);
    expect(leaseKey(S, A, G)).not.toContain("\x00");
    expect(leaseKey(S, A, G).split("\u001F")).toEqual([S, A, G]);
  });

  it("keeps distinct triples distinct", () => {
    const keys = new Set([
      leaseKey(S, A, G),
      leaseKey(S, A, G2),
      leaseKey(S2, A, G),
      leaseKey(S, A2, G),
    ]);
    expect(keys.size).toBe(4);
  });

  it("the lease-machine source file contains no NUL byte", () => {
    const source = readFileSync(new URL("../../src/core/lease-machine.ts", import.meta.url));
    expect(source.indexOf(0)).toBe(-1);
  });
});
