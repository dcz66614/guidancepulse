/**
 * S0 replay library — P025 GuidancePulse, T010.
 *
 * Shared by the S0 gate (`scripts/s0-gate.ts`), the 100-run
 * determinism check (`scripts/repeat-s0.ts`), and the S0 unit
 * tests. It replays the 48 hand-written S0 fixtures through the
 * PRODUCTION lease machine (T004) and compares the outcome against
 * the hand-written Golden Expected (`tests/golden/expected-v1.json`).
 *
 * This is a test harness, not production code: it never generates
 * expected values (a mismatch is a FAILURE, never silently
 * overwritten — IMPLEMENTATION_PLAN §6 T009/T010) and it never touches the
 * wall clock, randomness, or the machine's paths, so its output is
 * fully deterministic. The only time-like values in a replay are
 * the fixtures' fixed logical timestamps.
 *
 * Canonical semantic hash (IMPLEMENTATION_PLAN §8.4, v1.1.0): the replay result for all 48
 * fixtures — fixture id, write decisions (step, decision,
 * per-rule guidance/mode/state/expired_reason) and final leases
 * (session, agent, guidance, state, phase, cwd HMAC, remaining,
 * max, reason, last read) — is serialised with sorted keys,
 * UTF-8, LF newlines, and SHA-256 hashed. Wall-clock durations,
 * temporary directories, and machine paths are never part of the
 * hashed value; performance data is recorded separately.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyGuidanceEvent,
  checkWrite,
  createEmptyLeaseStore,
  listLeases,
  matchRules,
  recordWriteOutcome,
  type GuidanceLease,
  type LeaseStore,
} from "../src/core/index.js";
import type { GuidanceConfig, GuidanceRule } from "../src/config/index.js";
import { computePathId } from "../src/privacy/sanitize.js";

/** Fixed synthetic test key — must match the Oracle's TEST_PATH_KEY. */
export const S0_TEST_PATH_KEY = "guidancepulse-s0-test-key-v1";

export const S0_GROUPS = ["control", "compact", "cwd", "unread", "scope"] as const;

export const S0_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const S0_FIXTURES_DIR = join(S0_ROOT, "tests", "fixtures", "s0");
export const S0_GOLDEN_PATH = join(S0_ROOT, "tests", "golden", "expected-v1.json");
export const S0_ORACLE_PATH = join(S0_ROOT, "tests", "oracle", "reference_oracle.py");

export interface FixtureRule {
  id: string;
  source: string[];
  applies_to: string[];
  phases: string[];
  mode: "warn" | "ask" | "block";
  max_successful_edits: number;
}

export interface FixtureStep {
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

export interface FixtureExpected {
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
}

export interface Fixture {
  id: string;
  group: string;
  description: string;
  session: string;
  agent: string;
  config: { phases: string[]; rules: FixtureRule[] };
  steps: FixtureStep[];
  expected: FixtureExpected;
}

/** One fixture's production replay outcome (Golden-shaped). */
export interface ReplayResult {
  id: string;
  group: string;
  decisions: FixtureExpected["decisions"];
  leases: FixtureExpected["leases"];
  /**
   * Lease state after EVERY step (Golden-shaped, cwd as HMAC).
   * The final entry equals `leases`. Snapshots are part of the
   * replay evidence: three error fixtures (W05, S06, W07) end
   * ALLOW + FRESH, so their group mechanism is only visible in an
   * intermediate snapshot — W05/S06 must show the lease EXPIRED
   * with the boundary reason right after the boundary step and
   * FRESH again after the re-read; W07 must show the lease still
   * FRESH across a same-cwd change (no spurious expiry). A
   * decisions+final-leases-only view cannot tell these apart from
   * an implementation that ignores the boundary entirely, so the
   * snapshots are also included in the canonical replay hash.
   */
  snapshots: { step: number; leases: FixtureExpected["leases"] }[];
}

export function loadFixtures(fixturesDir: string = S0_FIXTURES_DIR): Fixture[] {
  const out: Fixture[] = [];
  for (const group of S0_GROUPS) {
    for (const file of readdirSync(join(fixturesDir, group)).sort()) {
      if (!file.endsWith(".json")) continue;
      out.push(JSON.parse(readFileSync(join(fixturesDir, group, file), "utf-8")) as Fixture);
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}

export function loadGolden(goldenPath: string = S0_GOLDEN_PATH): Record<string, FixtureExpected> {
  const doc = JSON.parse(readFileSync(goldenPath, "utf-8")) as {
    version: number;
    fixtures: Record<string, FixtureExpected>;
  };
  if (doc.version !== 1) throw new Error(`unsupported golden version: ${doc.version}`);
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
    defaults: { mode: "warn", max_successful_edits: 5, unobservable_read: "deny" },
    phases: fixture.config.phases,
    rules,
  };
}

/** Production lease -> Golden lease shape (cwd compared as HMAC). */
function leaseToGolden(lease: GuidanceLease): FixtureExpected["leases"][number] {
  return {
    session: lease.sessionScopeId,
    agent: lease.agentScopeId,
    guidance_id: lease.guidanceId,
    state: lease.state,
    phase: lease.phaseId,
    // cwdPathId is always set for leases issued by a fixture read
    // (every read step carries a cwd); "" only guards the type for
    // a lease that was never issued with a cwd, which cannot match
    // Golden and therefore fails parity rather than crashing.
    cwd: lease.cwdPathId ?? "",
    remaining: lease.remainingSuccessfulEdits,
    max: lease.maxSuccessfulEdits,
    reason: lease.reason,
    last_read: lease.lastConfirmedReadUtc,
  };
}

/**
 * Replay one fixture through the production lease machine.
 * Mirrors `tests/unit/golden.test.ts` step-for-step (the same
 * harness semantics), so the gate and the unit test cannot drift
 * apart silently: both must agree with Golden, and both are
 * checked by `npm test`.
 */
export function replayFixture(fixture: Fixture): ReplayResult {
  const config = toGuidanceConfig(fixture);
  const rulesById = new Map(config.rules.map((rule) => [rule.id, rule]));
  let store: LeaseStore = createEmptyLeaseStore();
  const session = fixture.session;
  let agent = fixture.agent;
  const decisions: FixtureExpected["decisions"] = [];
  const snapshots: ReplayResult["snapshots"] = [];
  const snapshotLeases = (): FixtureExpected["leases"] =>
    [...listLeases(store).map(leaseToGolden)].sort((a, b) =>
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
            pathId: computePathId(rule.source[0] as string, S0_TEST_PATH_KEY),
            timestampUtc: step.t,
          },
          {
            phaseId: step.phase ?? null,
            cwdPathId: step.cwd === undefined ? null : computePathId(step.cwd, S0_TEST_PATH_KEY),
            maxSuccessfulEdits: step.max_successful_edits ?? rule.max_successful_edits,
          },
        );
        break;
      }
      case "read_failed":
        break;
      case "compact":
        store = applyGuidanceEvent(
          store,
          { type: "PRE_COMPACT", sessionScopeId: session, agentScopeId: agent, timestampUtc: step.t },
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
            oldPathId: computePathId(step.old as string, S0_TEST_PATH_KEY),
            newPathId: computePathId(step.new as string, S0_TEST_PATH_KEY),
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
          { type: "SUBAGENT_STARTED", sessionScopeId: session, agentScopeId: agent, timestampUtc: step.t },
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
          cwdPathId: step.cwd === undefined ? null : computePathId(step.cwd, S0_TEST_PATH_KEY),
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
    snapshots.push({ step: idx, leases: snapshotLeases() });
  });

  const leases = [...listLeases(store).map(leaseToGolden)].sort((a, b) =>
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
  return { id: fixture.id, group: fixture.group, decisions, leases, snapshots };
}

/** Replay all fixtures, sorted by fixture id. */
export function replayAll(fixtures: Fixture[] = loadFixtures()): ReplayResult[] {
  return fixtures.map(replayFixture);
}

/**
 * Canonical JSON: object keys sorted recursively, arrays kept in
 * order, 2-space indent is NOT used — compact form with LF line
 * endings only. `undefined` values are dropped (JSON semantics).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Canonical semantic hash (IMPLEMENTATION_PLAN §8.4, v1.1.0) of a full 48-fixture replay.
 * The hashed value is the replay result: fixture id, group,
 * decisions, final leases, AND the per-step lease snapshots (cwd
 * as HMAC). No durations, no temporary directories, no machine
 * paths, no wall-clock times.
 */
export function canonicalReplayHash(results: ReplayResult[]): string {
  const payload = canonicalJson(results) + "\n";
  return createHash("sha256").update(payload, "utf-8").digest("hex");
}

/** Deep equality on canonical JSON (key order independent). */
export function canonicalEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export interface FixtureComparison {
  id: string;
  group: string;
  matchesGolden: boolean;
  /** For control fixtures: every write decision is ALLOW. */
  controlClean: boolean | null;
  /**
   * For error fixtures: the planted group mechanism demonstrably
   * fired (or, for the same-cwd case, demonstrably did NOT fire).
   * `detection_basis` names the evidence, so "32/32" is auditable
   * per fixture instead of a bare count:
   *   - "non_allow_decision": a stale write was flagged DENY/WARN/ASK;
   *   - "expired_final_lease": a lease ends EXPIRED with a reason
   *     (covers S07: the phase switch makes the rule inactive, so
   *     there is no gated write, but the lease is EXPIRED
   *     PHASE_MISMATCH);
   *   - "expired_intermediate_lease": the boundary fired mid-trace
   *     (lease EXPIRED with the boundary reason in a snapshot) and
   *     a later re-read recovered FRESH (W05 cwd, S06 phase);
   *   - "same_cwd_no_expiry": a cwd step with old == new left the
   *     lease FRESH with its last_read untouched (W07) — the guard
   *     against over-eager expiry.
   * A fixture whose replay matches Golden but shows none of these
   * would be indistinguishable from an implementation that ignores
   * the boundary, and must NOT count as detected.
   */
  errorDetected: boolean | null;
  detection_basis:
    | "non_allow_decision"
    | "expired_final_lease"
    | "expired_intermediate_lease"
    | "same_cwd_no_expiry"
    | null;
  mismatchDetail: string | null;
}

export interface ReplaySummary {
  total: number;
  parityMatched: number;
  parity: string;
  controlTotal: number;
  controlClean: number;
  errorTotal: number;
  errorDetected: number;
  perFixture: FixtureComparison[];
}

/** Compare a full production replay against Golden, per IMPLEMENTATION_PLAN §8.1 / PROJECT_BOOK §9.3 (v1.1.0). */
export function summarizeReplay(
  fixtures: Fixture[],
  results: ReplayResult[],
  golden: Record<string, FixtureExpected>,
): ReplaySummary {
  const perFixture: FixtureComparison[] = [];
  for (const fixture of fixtures) {
    const result = results.find((r) => r.id === fixture.id);
    const expected = golden[fixture.id];
    let matchesGolden = false;
    let mismatchDetail: string | null = null;
    if (result === undefined || expected === undefined) {
      mismatchDetail = result === undefined ? "missing replay result" : "missing golden expected";
    } else {
      matchesGolden =
        canonicalEqual(result.decisions, expected.decisions) &&
        canonicalEqual(result.leases, goldenLeasesComparable(expected.leases));
      if (!matchesGolden) mismatchDetail = "decisions or final leases differ from golden";
    }
    const controlClean =
      fixture.group === "control"
        ? (result?.decisions.every((d) => d.decision === "ALLOW") ?? false)
        : null;
    let detectionBasis: FixtureComparison["detection_basis"] = null;
    if (fixture.group !== "control" && result !== undefined) {
      if (result.decisions.some((d) => d.decision !== "ALLOW")) {
        detectionBasis = "non_allow_decision";
      } else if (result.leases.some((l) => l.state === "EXPIRED" && l.reason !== null)) {
        detectionBasis = "expired_final_lease";
      } else if (
        result.snapshots.some((s) => s.leases.some((l) => l.state === "EXPIRED" && l.reason !== null))
      ) {
        detectionBasis = "expired_intermediate_lease";
      } else if (
        fixture.steps.some((s) => s.kind === "cwd" && s.old !== undefined && s.old === s.new) &&
        result.snapshots.every((s) => s.leases.every((l) => l.state === "FRESH"))
      ) {
        detectionBasis = "same_cwd_no_expiry";
      }
    }
    const errorDetected = fixture.group === "control" ? null : detectionBasis !== null;
    perFixture.push({
      id: fixture.id,
      group: fixture.group,
      matchesGolden,
      controlClean,
      errorDetected,
      detection_basis: detectionBasis,
      mismatchDetail,
    });
  }
  const parityMatched = perFixture.filter((f) => f.matchesGolden).length;
  const control = perFixture.filter((f) => f.group === "control");
  const errors = perFixture.filter((f) => f.group !== "control");
  return {
    total: fixtures.length,
    parityMatched,
    parity: `${parityMatched}/${fixtures.length}`,
    controlTotal: control.length,
    // Summary counts are basis-only per IMPLEMENTATION_PLAN §8.1:
    // detection counts must NOT be derived from matchesGolden (a parity
    // failure must be reported by gate 1 alone, not misreported as a
    // detection failure). Per-fixture errorDetected / controlClean above
    // are unchanged and already basis-only.
    controlClean: control.filter((f) => f.controlClean === true).length,
    errorTotal: errors.length,
    errorDetected: errors.filter((f) => f.errorDetected === true).length,
    perFixture,
  };
}

/**
 * Golden leases carry the raw cwd path ("/proj"); production
 * replays carry the HMAC path id. Convert Golden to the comparable
 * shape before comparing.
 */
export function goldenLeasesComparable(
  leases: FixtureExpected["leases"],
): FixtureExpected["leases"] {
  return [...leases]
    .map((lease) => ({ ...lease, cwd: computePathId(lease.cwd, S0_TEST_PATH_KEY) }))
    .sort((a, b) =>
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
