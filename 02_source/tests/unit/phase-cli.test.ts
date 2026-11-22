/**
 * Phase CLI tests — P025 GuidancePulse, T006.
 *
 * Covers `guidancepulse phase set <phase>`: different-phase and
 * SAME-phase invalidation (the T006 card carries no same-phase
 * exception — a `phase set` must expire the old leases even when
 * the new phase equals the old one, unlike T004's passive
 * PHASE_CHANGED no-op), argument parsing, phase validation, and
 * the current-phase readback. Each test uses its own temp SQLite
 * store with synthetic ids and fixed timestamps.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCurrentPhase,
  parsePhaseArgs,
  PHASE_SET_USAGE,
  setPhase,
} from "../../src/cli/phase.js";
import type { GuidancePulseEvent } from "../../src/contracts/index.js";
import { GuidancePulseStore } from "../../src/store/index.js";

const SESSION = "synthetic-session-t006-phase";
const AGENT = "main";
const GUIDE_A = "synthetic-guidance-a";
const GUIDE_B = "synthetic-guidance-b";
const TS = "2026-11-15T10:14:03Z";
const TS2 = "2026-11-15T10:15:00Z";
const TS3 = "2026-11-15T10:16:00Z";
const CWD = "hmac:" + "a".repeat(64);

let dir: string;
let dbPath: string;
let store: GuidancePulseStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gp-t006-phase-"));
  dbPath = join(dir, "state.sqlite");
  store = GuidancePulseStore.open(dbPath);
});

afterEach(() => {
  if (store.isOpen()) store.close();
  rmSync(dir, { recursive: true, force: true });
});

function seedFresh(guidanceId: string, phaseId = "implementation", timestampUtc = TS) {
  const event: GuidancePulseEvent = {
    type: "READ_SUCCEEDED",
    sessionScopeId: SESSION,
    agentScopeId: AGENT,
    guidanceId,
    pathId: "hmac:" + "c".repeat(64),
    timestampUtc,
  };
  store.recordEvent(event, { phaseId, cwdPathId: CWD, maxSuccessfulEdits: 5 });
}

describe("setPhase — different phase", () => {
  it("expires the old leases with PHASE_MISMATCH and records the new phase", () => {
    seedFresh(GUIDE_A);
    seedFresh(GUIDE_B);

    const result = setPhase(store, {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      phaseId: "review",
      timestampUtc: TS2,
    });

    expect(result.phaseId).toBe("review");
    expect(result.persisted).toBe(true);
    expect(result.samePhaseAsBefore).toBe(false);
    expect(result.expiredCount).toBe(2);
    expect(result.invalidatedGuidanceIds.sort()).toEqual([GUIDE_A, GUIDE_B]);
    for (const id of [GUIDE_A, GUIDE_B]) {
      const lease = store.getLease(SESSION, AGENT, id);
      expect(lease?.state).toBe("EXPIRED");
      expect(lease?.reason).toBe("PHASE_MISMATCH");
    }
    expect(getCurrentPhase(store, SESSION, AGENT)).toBe("review");
    expect(store.listEvents({ type: "PHASE_CHANGED" })).toHaveLength(1);
  });

  it("a re-read under the new phase restores FRESH", () => {
    seedFresh(GUIDE_A);
    setPhase(store, {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      phaseId: "review",
      timestampUtc: TS2,
    });
    seedFresh(GUIDE_A, "review", TS3);
    const lease = store.getLease(SESSION, AGENT, GUIDE_A);
    expect(lease?.state).toBe("FRESH");
    expect(lease?.phaseId).toBe("review");
    expect(lease?.reason).toBeNull();
  });
});

describe("setPhase — SAME phase (no exception per the T006 card)", () => {
  it("expires the old leases even when the new phase equals the old phase", () => {
    seedFresh(GUIDE_A);
    seedFresh(GUIDE_B);

    const result = setPhase(store, {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      phaseId: "implementation", // same as issuance phase
      timestampUtc: TS2,
    });

    expect(result.samePhaseAsBefore).toBe(true);
    expect(result.persisted).toBe(true);
    expect(result.expiredCount).toBe(2);
    expect(result.invalidatedGuidanceIds.sort()).toEqual([GUIDE_A, GUIDE_B]);
    for (const id of [GUIDE_A, GUIDE_B]) {
      const lease = store.getLease(SESSION, AGENT, id);
      expect(lease?.state).toBe("EXPIRED");
      expect(lease?.reason).toBe("PHASE_MISMATCH");
    }
    // The persisted event still carries the real phase, not a sentinel.
    const events = store.listEvents({ type: "PHASE_CHANGED" });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("PHASE_CHANGED");
    if (events[0]?.type === "PHASE_CHANGED") {
      expect(events[0].phaseId).toBe("implementation");
    }
  });

  it("is durable across reopen", () => {
    seedFresh(GUIDE_A);
    setPhase(store, {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      phaseId: "implementation",
      timestampUtc: TS2,
    });
    store.close();
    const reopened = GuidancePulseStore.open(dbPath);
    try {
      expect(reopened.getLease(SESSION, AGENT, GUIDE_A)?.state).toBe("EXPIRED");
    } finally {
      reopened.close();
    }
  });
});

describe("setPhase — validation", () => {
  it("rejects an empty phase id and leaves leases untouched", () => {
    seedFresh(GUIDE_A);
    expect(() =>
      setPhase(store, { sessionScopeId: SESSION, agentScopeId: AGENT, phaseId: "" }),
    ).toThrow(/INVALID_PHASE/);
    expect(store.getLease(SESSION, AGENT, GUIDE_A)?.state).toBe("FRESH");
    expect(store.listEvents({ type: "PHASE_CHANGED" })).toHaveLength(0);
  });

  it("rejects a malformed phase id (uppercase / spaces)", () => {
    for (const bad of ["Review", "my phase", "a/b", "-lead"]) {
      expect(() =>
        setPhase(store, { sessionScopeId: SESSION, agentScopeId: AGENT, phaseId: bad }),
      ).toThrow(/INVALID_PHASE/);
    }
    expect(store.listEvents({ type: "PHASE_CHANGED" })).toHaveLength(0);
  });

  it("rejects an undeclared phase when allowedPhases is given", () => {
    seedFresh(GUIDE_A);
    expect(() =>
      setPhase(store, {
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        phaseId: "deploy",
        allowedPhases: ["explore", "implementation", "review", "release"],
      }),
    ).toThrow(/INVALID_PHASE/);
    expect(store.getLease(SESSION, AGENT, GUIDE_A)?.state).toBe("FRESH");
  });

  it("accepts a declared phase when allowedPhases is given", () => {
    seedFresh(GUIDE_A);
    const result = setPhase(store, {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      phaseId: "review",
      timestampUtc: TS2,
      allowedPhases: ["explore", "implementation", "review", "release"],
    });
    expect(result.expiredCount).toBe(1);
  });

  it("is a no-op success on a scope with no FRESH leases", () => {
    const result = setPhase(store, {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      phaseId: "review",
      timestampUtc: TS2,
    });
    expect(result.persisted).toBe(true);
    expect(result.expiredCount).toBe(0);
    expect(getCurrentPhase(store, SESSION, AGENT)).toBe("review");
  });
});

describe("parsePhaseArgs", () => {
  it("parses `phase set <phase>` with and without the program name", () => {
    expect(parsePhaseArgs(["phase", "set", "review"])).toEqual({ phaseId: "review" });
    expect(parsePhaseArgs(["guidancepulse", "phase", "set", "implementation"])).toEqual({
      phaseId: "implementation",
    });
  });

  it("rejects missing / extra / wrong arguments with the usage text", () => {
    for (const argv of [
      ["phase", "set"],
      ["phase", "get", "review"],
      ["phase", "set", "review", "extra"],
      ["phase"],
      [],
    ]) {
      expect(() => parsePhaseArgs(argv)).toThrow(/INVALID_ARGUMENTS/);
      expect(() => parsePhaseArgs(argv)).toThrow(PHASE_SET_USAGE);
    }
  });

  it("rejects an invalid phase id at parse time", () => {
    expect(() => parsePhaseArgs(["phase", "set", "Bad Phase"])).toThrow(/INVALID_PHASE/);
  });
});

describe("getCurrentPhase", () => {
  it("returns null before any phase set, then the latest phase", () => {
    expect(getCurrentPhase(store, SESSION, AGENT)).toBeNull();
    setPhase(store, { sessionScopeId: SESSION, agentScopeId: AGENT, phaseId: "explore", timestampUtc: TS2 });
    expect(getCurrentPhase(store, SESSION, AGENT)).toBe("explore");
    setPhase(store, { sessionScopeId: SESSION, agentScopeId: AGENT, phaseId: "review", timestampUtc: TS3 });
    expect(getCurrentPhase(store, SESSION, AGENT)).toBe("review");
  });
});
