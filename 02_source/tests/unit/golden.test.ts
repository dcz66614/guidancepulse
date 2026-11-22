/**
 * Golden tests — P025 GuidancePulse, T009.
 *
 * Replays the 48 hand-written S0 fixtures through the PRODUCTION
 * lease machine (T004 `applyGuidanceEvent` / `checkWrite` /
 * `recordWriteOutcome` + `matchRules`) and compares every write
 * decision and every final lease against the hand-written Golden
 * Expected (each fixture's inline `expected` AND
 * `tests/golden/expected-v1.json` — the two must agree with each
 * other as well).
 *
 * A mismatch is a FAILURE. Golden is never overwritten with
 * production output (IMPLEMENTATION_PLAN §6 T009). The independent
 * Python Oracle (`tests/oracle/reference_oracle.py --verify-golden`)
 * is the other side of the same parity check; production and Oracle
 * must both equal Golden for all 48 fixtures.
 *
 * All data is synthetic; cwd path ids are HMACs under the fixed
 * test key `guidancepulse-s0-test-key-v1` (same key the Oracle uses);
 * timestamps come from the fixture steps — no clock, no randomness.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyGuidanceEvent,
  checkWrite,
  createEmptyLeaseStore,
  listLeases,
  matchRules,
  recordWriteOutcome,
  type GuidanceLease,
  type LeaseStore,
} from "../../src/core/index.js";
import type { GuidanceConfig, GuidanceRule } from "../../src/config/index.js";
import type { GuidancePulseEvent } from "../../src/contracts/events.js";
import { computePathId } from "../../src/privacy/sanitize.js";

/** Fixed synthetic test key — must match the Oracle's TEST_PATH_KEY. */
const KEY = "guidancepulse-s0-test-key-v1";

const GROUPS = ["control", "compact", "cwd", "unread", "scope"] as const;

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "s0",
);
const GOLDEN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "golden",
  "expected-v1.json",
);

interface FixtureRule {
  id: string;
  source: string[];
  applies_to: string[];
  phases: string[];
  mode: "warn" | "ask" | "block";
  max_successful_edits: number;
}

interface FixtureStep {
  kind: string;
  guidance_id?: string;
  phase?: string;
  cwd?: string;
  max_successful_edits?: number;
  tool?: string;
  target?: string;
  outcome?: string;
  old?: string;
  new?: string;
  agent?: string;
  t: string;
}

interface Fixture {
  id: string;
  group: string;
  description: string;
  session: string;
  agent: string;
  config: { phases: string[]; rules: FixtureRule[] };
  steps: FixtureStep[];
  expected: {
    decisions: {
      step: number;
      decision: string;
      per_rule: {
        guidance_id: string;
        mode: string;
        state: string;
        expired_reason: string | null;
      }[];
    }[];
    leases: {
      session: string;
      agent: string;
      guidance_id: string;
      state: string;
      phase: string | null;
      cwd: string;
      remaining: number;
      max: number;
      reason: string | null;
      last_read: string | null;
    }[];
  };
}

function loadFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const group of GROUPS) {
    for (const file of readdirSync(join(FIXTURES_DIR, group)).sort()) {
      if (!file.endsWith(".json")) continue;
      out.push(JSON.parse(readFileSync(join(FIXTURES_DIR, group, file), "utf-8")) as Fixture);
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}

function loadGolden(): Record<string, Fixture["expected"]> {
  const doc = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8")) as {
    version: number;
    fixtures: Record<string, Fixture["expected"]>;
  };
  expect(doc.version).toBe(1);
  return doc.fixtures;
}

function toGuidanceConfig(fixture: Fixture): GuidanceConfig {
  const rules: GuidanceRule[] = fixture.config.rules.map((rule) => ({
    id: rule.id,
    source: rule.source,
    applies_to: rule.applies_to,
    phases: rule.phases,
    mode: rule.mode,
    max_successful_edits: rule.max_successful_edits,
    unobservable_read: "deny",
  }));
  return {
    version: 1,
    defaults: {
      mode: "warn",
      max_successful_edits: 5,
      unobservable_read: "deny",
    },
    phases: fixture.config.phases,
    rules,
  };
}

/** Production lease -> golden lease shape (cwd compared as HMAC). */
function leaseToGolden(lease: GuidanceLease) {
  return {
    session: lease.sessionScopeId,
    agent: lease.agentScopeId,
    guidance_id: lease.guidanceId,
    state: lease.state,
    phase: lease.phaseId,
    cwdPathId: lease.cwdPathId,
    remaining: lease.remainingSuccessfulEdits,
    max: lease.maxSuccessfulEdits,
    reason: lease.reason,
    last_read: lease.lastConfirmedReadUtc,
  };
}

function expectedLeaseToComparable(
  lease: Fixture["expected"]["leases"][number],
) {
  return {
    session: lease.session,
    agent: lease.agent,
    guidance_id: lease.guidance_id,
    state: lease.state,
    phase: lease.phase,
    cwdPathId: computePathId(lease.cwd, KEY),
    remaining: lease.remaining,
    max: lease.max,
    reason: lease.reason,
    last_read: lease.last_read,
  };
}

function sortLeases<T extends { session: string; agent: string; guidance_id: string }>(
  leases: T[],
): T[] {
  return [...leases].sort((a, b) =>
    a.session !== b.session
      ? a.session < b.session
        ? -1
        : 1
      : a.agent !== b.agent
        ? a.agent < b.agent
          ? -1
          : 1
        : a.guidance_id < b.guidance_id
          ? -1
          : 1,
  );
}

describe("S0 golden fixtures (T009)", () => {
  const fixtures = loadFixtures();
  const golden = loadGolden();

  it("has 48 fixtures with unique ids in the 16/8/8/8/8 group split", () => {
    expect(fixtures).toHaveLength(48);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(48);
    const counts = new Map<string, number>();
    for (const f of fixtures) counts.set(f.group, (counts.get(f.group) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({
      control: 16,
      compact: 8,
      cwd: 8,
      unread: 8,
      scope: 8,
    });
  });

  it("golden file covers exactly the 48 fixtures and matches each inline expected", () => {
    expect(Object.keys(golden).sort()).toEqual(fixtures.map((f) => f.id).sort());
    for (const fixture of fixtures) {
      expect(golden[fixture.id]).toEqual(fixture.expected);
    }
  });

  it("every fixture has a fixed session/agent, fixed timestamps, and a decision per write step", () => {
    for (const fixture of fixtures) {
      expect(fixture.session.length).toBeGreaterThan(0);
      expect(fixture.agent.length).toBeGreaterThan(0);
      const writeSteps = fixture.steps
        .map((step, idx) => ({ step, idx }))
        .filter(({ step }) => step.kind === "write");
      expect(writeSteps.length).toBeGreaterThan(0);
      expect(fixture.expected.decisions.map((d) => d.step)).toEqual(
        writeSteps.map(({ idx }) => idx),
      );
      for (const step of fixture.steps) {
        expect(step.t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      }
    }
  });

  it("control fixtures never expect a non-ALLOW write decision", () => {
    for (const fixture of fixtures.filter((f) => f.group === "control")) {
      for (const decision of fixture.expected.decisions) {
        expect(decision.decision).toBe("ALLOW");
      }
    }
  });

  it("each non-control fixture exercises its own group's mechanism", () => {
    // Recovery fixtures (W05/S06 re-read after the boundary, W07 same
    // cwd) legitimately end ALLOW + FRESH, so "a non-ALLOW decision"
    // is the wrong structural check. What must hold is that the
    // fixture actually drives its group's boundary: a compact step,
    // a cwd step, a subagent/phase step, or — for unread — a write
    // checked against an UNSEEN/EXPIRED lease.
    for (const fixture of fixtures.filter((f) => f.group !== "control")) {
      const kinds = new Set(fixture.steps.map((s) => s.kind));
      let exercises = false;
      if (fixture.group === "compact") exercises = kinds.has("compact");
      if (fixture.group === "cwd") {
        // W04 is the deliberate exception: no CWD_CHANGED event at
        // all — the synchronous PreToolUse check lazily expires the
        // lease, which is the mechanism under test there.
        exercises =
          kinds.has("cwd") ||
          fixture.expected.decisions.some((d) =>
            d.per_rule.some((r) => r.expired_reason === "CWD_MISMATCH"),
          );
      }
      if (fixture.group === "scope") {
        exercises = kinds.has("subagent") || kinds.has("phase");
      }
      if (fixture.group === "unread") {
        exercises = fixture.expected.decisions.some((d) =>
          d.per_rule.some((r) => r.state === "UNSEEN" || r.state === "EXPIRED"),
        );
      }
      expect(exercises, `${fixture.id} must exercise its group`).toBe(true);
    }
  });

  describe.each(fixtures)("$id ($group)", (fixture) => {
    it("production replay matches hand-written golden", () => {
      const config = toGuidanceConfig(fixture);
      const rulesById = new Map(config.rules.map((rule) => [rule.id, rule]));
      let store: LeaseStore = createEmptyLeaseStore();
      let session = fixture.session;
      let agent = fixture.agent;
      const decisions: Fixture["expected"]["decisions"] = [];

      fixture.steps.forEach((step, idx) => {
        switch (step.kind) {
          case "read":
          case "load": {
            const rule = rulesById.get(step.guidance_id as string);
            if (rule === undefined) throw new Error(`unknown guidance ${step.guidance_id}`);
            store = applyGuidanceEvent(
              store,
              {
                type: "READ_SUCCEEDED",
                sessionScopeId: session,
                agentScopeId: agent,
                guidanceId: step.guidance_id as string,
                pathId: computePathId(rule.source[0] as string, KEY),
                timestampUtc: step.t,
              },
              {
                phaseId: step.phase ?? null,
                cwdPathId: step.cwd === undefined ? null : computePathId(step.cwd, KEY),
                maxSuccessfulEdits:
                  step.max_successful_edits ?? rule.max_successful_edits,
              },
            );
            break;
          }
          case "read_failed":
            break;
          case "compact":
            store = applyGuidanceEvent(
              store,
              {
                type: "PRE_COMPACT",
                sessionScopeId: session,
                agentScopeId: agent,
                timestampUtc: step.t,
              },
              { phaseId: null, cwdPathId: null, maxSuccessfulEdits: 0 },
            );
            break;
          case "cwd":
            store = applyGuidanceEvent(
              store,
              {
                type: "CWD_CHANGED",
                sessionScopeId: session,
                agentScopeId: agent,
                oldPathId: computePathId(step.old as string, KEY),
                newPathId: computePathId(step.new as string, KEY),
                timestampUtc: step.t,
              },
              { phaseId: null, cwdPathId: null, maxSuccessfulEdits: 0 },
            );
            break;
          case "phase":
            store = applyGuidanceEvent(
              store,
              {
                type: "PHASE_CHANGED",
                sessionScopeId: session,
                agentScopeId: agent,
                phaseId: step.phase as string,
                timestampUtc: step.t,
              },
              { phaseId: null, cwdPathId: null, maxSuccessfulEdits: 0 },
            );
            break;
          case "subagent":
            store = applyGuidanceEvent(
              store,
              {
                type: "SUBAGENT_STARTED",
                sessionScopeId: session,
                agentScopeId: agent,
                timestampUtc: step.t,
              },
              { phaseId: null, cwdPathId: null, maxSuccessfulEdits: 0 },
            );
            agent = step.agent as string;
            break;
          case "agent":
            agent = step.agent as string;
            break;
          case "write": {
            const rules = matchRules(config, step.target as string, step.phase ?? null);
            const check = checkWrite(store, {
              sessionScopeId: session,
              agentScopeId: agent,
              cwdPathId: step.cwd === undefined ? null : computePathId(step.cwd, KEY),
              phaseId: step.phase ?? null,
              rules: rules.map((rule) => ({ id: rule.id, mode: rule.mode })),
            });
            store = check.updatedStore;
            decisions.push({
              step: idx,
              decision: check.decision,
              per_rule: check.perRule.map((result) => ({
                guidance_id: result.guidanceId,
                mode: result.mode,
                state: result.state,
                expired_reason: result.expiredReason,
              })),
            });
            if (step.outcome === "success") {
              for (const rule of rules) {
                store = recordWriteOutcome(store, session, agent, rule.id, "success");
              }
            }
            break;
          }
          default:
            throw new Error(`unknown step kind: ${step.kind}`);
        }
      });

      expect(decisions).toEqual(fixture.expected.decisions);
      expect(decisions).toEqual(golden[fixture.id]?.decisions);
      const actual = sortLeases(listLeases(store).map(leaseToGolden));
      const expected = sortLeases(
        fixture.expected.leases.map(expectedLeaseToComparable),
      );
      expect(actual).toEqual(expected);
      expect(actual).toEqual(
        sortLeases(
          (golden[fixture.id]?.leases ?? []).map(expectedLeaseToComparable),
        ),
      );
    });
  });
});
