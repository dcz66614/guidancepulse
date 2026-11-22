/**
 * Guidance Lease deterministic state machine — P025 GuidancePulse, T004.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §6 (state machine), §6.2
 * (lease identity and FRESH conditions), §6.3 (edit budget), §6.4
 * (write-check algorithm), §6.5 (invalidation boundaries), §7.3
 * (internal event contract) and §7.4 (persistable fields).
 *
 * Spec-reference note (same class of mismatch T002/T003 already
 * recorded for §8.2): the T004 task card cites PROJECT_BOOK §7.2 as
 * the contract, but §7.2 in v1.1.0 is the module table and the UI
 * colour/wording section is §8.2; neither contains state-machine
 * fields. The state machine lives in §6; this file follows §6
 * verbatim. No spec file was changed.
 *
 * Purity contract (IMPLEMENTATION_PLAN §5.1:
 * `src/core` holds pure deterministic algorithms only):
 *   - Every function here is pure: no I/O, no network, no clock, no
 *     randomness. Timestamps come from the caller-supplied event
 *     (`timestampUtc`); the store is an immutable `Map` — every
 *     transition returns a NEW store and never mutates its input.
 *   - No LLM judgement, no "the model seems to understand" heuristic:
 *     transitions are driven only by contract events and explicit
 *     comparisons (scope, phase, cwd path id, remaining edits).
 *   - The only persisted lease fields are the §7.4 allowlist: lease
 *     state, phase id, remaining edit count, invalidation reason code,
 *     plus the §7.3 event fields (scope ids, guidance id, HMAC path
 *     id, timestamp). No Prompt, source code, raw path, or content is
 *     ever stored here — `cwdPathId` is an opaque `hmac:<hex>` id.
 *
 * Lease identity (§6.2): (sessionScopeId, agentScopeId, guidanceId).
 * A new session or a new subagent scope starts UNSEEN; leases never
 * cross agent scopes. Absence from the store MEANS UNSEEN — there is
 * no stored UNSEEN record to create.
 *
 * FRESH requires ALL of (§6.2):
 *   1. a successful Read / confirmable load event;
 *   2. same session AND agent scope;
 *   3. current phase equals the phase at issuance;
 *   4. current cwd path id equals the cwd path id at issuance;
 *   5. remaining_successful_edits > 0;
 *   6. no invalidation boundary since issuance.
 *
 * Fail-closed choices (frozen here, flagged for review — the spec
 * fixes the comparisons but not the unknown-value cases):
 *   - A lease issued without a known cwd (`cwdPathId === null`) or
 *     without a known phase (`phaseId === null`) can never satisfy
 *     conditions 3/4, so the first boundary event or write check that
 *     would need the comparison expires it instead of guessing.
 *   - `checkWrite` with an unknown current cwd or phase (`null`)
 *     expires a FRESH lease rather than passing it.
 *   - A `maxSuccessfulEdits` of 0 issues an immediately-EXPIRED lease
 *     (`EDIT_BUDGET_EXHAUSTED`): per T002, 0 means "never FRESH for
 *     writes".
 */

import { aggregateModes } from "../config/index.js";
import {
  isGuidancePulseEvent,
  type GuidancePulseEvent,
  type InvalidationReason,
  type LeaseState,
  type WriteDecision,
} from "../contracts/events.js";
import type { GuidanceMode, GuidanceRule } from "../config/index.js";

/** Error thrown when the state machine is given an invalid input. */
export class LeaseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "LeaseError";
    this.code = code;
  }
}

/**
 * One guidance lease. Only §7.4-allowlisted fields: state, phase id,
 * remaining edit count, invalidation reason code, plus scope ids,
 * guidance id, the HMAC cwd path id at issuance, and the timestamp of
 * the last confirmed read. `phaseId` / `cwdPathId` are null only when
 * the lease was issued without that context (fail-closed on first use).
 */
export interface GuidanceLease {
  sessionScopeId: string;
  agentScopeId: string;
  guidanceId: string;
  state: LeaseState;
  /** Phase at issuance; null when issued without phase context. */
  phaseId: string | null;
  /** HMAC cwd path id at issuance; null when issued without cwd context. */
  cwdPathId: string | null;
  remainingSuccessfulEdits: number;
  maxSuccessfulEdits: number;
  /** Set only when state is EXPIRED; null for FRESH (and UNSEEN). */
  reason: InvalidationReason | null;
  /** `timestampUtc` of the READ_SUCCEEDED that issued this lease. */
  lastConfirmedReadUtc: string | null;
}

/** Immutable lease store: lease key -> lease. Absence means UNSEEN. */
export type LeaseStore = ReadonlyMap<string, GuidanceLease>;

/**
 * Deterministic lease key for (session, agent, guidance).
 *
 * Components are joined with U+001F (unit separator), written as the
 * `\u001F` escape so the source file contains no raw NUL byte
 * (R1-P2-01: raw NULs made Git treat this file as binary). The
 * separator is a control character that never occurs in a scope or
 * guidance id, so distinct triples still map to distinct keys.
 * The key is only ever used as a Map key — nothing splits or parses
 * it back into components (the Oracle uses a tuple key instead).
 */
export function leaseKey(
  sessionScopeId: string,
  agentScopeId: string,
  guidanceId: string,
): string {
  return `${sessionScopeId}\u001F${agentScopeId}\u001F${guidanceId}`;
}

/** An empty lease store (no leases; every lookup is UNSEEN). */
export function createEmptyLeaseStore(): LeaseStore {
  return new Map<string, GuidanceLease>();
}

/** Look up one lease; returns undefined when the lease is UNSEEN/absent. */
export function getLease(
  store: LeaseStore,
  sessionScopeId: string,
  agentScopeId: string,
  guidanceId: string,
): GuidanceLease | undefined {
  return store.get(leaseKey(sessionScopeId, agentScopeId, guidanceId));
}

/** All leases in a scope, sorted by guidance id (deterministic order). */
export function leasesForScope(
  store: LeaseStore,
  sessionScopeId: string,
  agentScopeId: string,
): GuidanceLease[] {
  const out: GuidanceLease[] = [];
  for (const lease of store.values()) {
    if (lease.sessionScopeId === sessionScopeId && lease.agentScopeId === agentScopeId) {
      out.push(lease);
    }
  }
  out.sort((a, b) => (a.guidanceId < b.guidanceId ? -1 : a.guidanceId > b.guidanceId ? 1 : 0));
  return out;
}

/** All leases in the store, sorted by (session, agent, guidance). */
export function listLeases(store: LeaseStore): GuidanceLease[] {
  const out = [...store.values()];
  out.sort((a, b) => (leaseSortKey(a) < leaseSortKey(b) ? -1 : 1));
  return out;
}

function leaseSortKey(lease: GuidanceLease): string {
  return leaseKey(lease.sessionScopeId, lease.agentScopeId, lease.guidanceId);
}

/**
 * Canonical snapshot of the whole store: sorted leases serialised as
 * JSON with fixed key order. The same event sequence applied to an
 * empty store always yields the same string; it is the input to the
 * S0 100-run single-hash check (IMPLEMENTATION_PLAN §8.4). Contains
 * only allowlisted fields — no raw paths, no wall-clock values.
 */
export function canonicalLeaseSnapshot(store: LeaseStore): string {
  const leases = listLeases(store).map((lease) => ({
    agentScopeId: lease.agentScopeId,
    cwdPathId: lease.cwdPathId,
    guidanceId: lease.guidanceId,
    lastConfirmedReadUtc: lease.lastConfirmedReadUtc,
    maxSuccessfulEdits: lease.maxSuccessfulEdits,
    phaseId: lease.phaseId,
    reason: lease.reason,
    remainingSuccessfulEdits: lease.remainingSuccessfulEdits,
    sessionScopeId: lease.sessionScopeId,
    state: lease.state,
  }));
  return JSON.stringify(leases);
}

/**
 * Context the caller supplies when applying an event. Only
 * READ_SUCCEEDED needs it: the phase and cwd at issuance, and the
 * rule's edit budget. Other events ignore these fields.
 */
export interface ApplyEventOptions {
  /** Phase at read time (the phase the lease is issued under). */
  phaseId: string | null;
  /** HMAC cwd path id at read time (the cwd the lease is issued under). */
  cwdPathId: string | null;
  /** The rule's `max_successful_edits` for the guidance being read. */
  maxSuccessfulEdits: number;
}

function validateMaxEdits(maxSuccessfulEdits: number): void {
  if (!Number.isInteger(maxSuccessfulEdits) || maxSuccessfulEdits < 0) {
    throw new LeaseError(
      "INVALID_MAX_EDITS",
      "maxSuccessfulEdits must be a non-negative integer",
    );
  }
}

function withLease(store: LeaseStore, lease: GuidanceLease): LeaseStore {
  const next = new Map(store);
  next.set(leaseKey(lease.sessionScopeId, lease.agentScopeId, lease.guidanceId), lease);
  return next;
}

/** Expire a FRESH lease with a reason; UNSEEN/EXPIRED leases are untouched. */
function expireLease(lease: GuidanceLease, reason: InvalidationReason): GuidanceLease {
  if (lease.state !== "FRESH") return lease;
  return { ...lease, state: "EXPIRED", reason };
}

function expireScopeLeases(
  store: LeaseStore,
  sessionScopeId: string,
  agentScopeId: string,
  reason: InvalidationReason,
  keep: (lease: GuidanceLease) => boolean,
): LeaseStore {
  let next: Map<string, GuidanceLease> | null = null;
  for (const lease of store.values()) {
    if (
      lease.sessionScopeId !== sessionScopeId ||
      lease.agentScopeId !== agentScopeId ||
      lease.state !== "FRESH" ||
      keep(lease)
    ) {
      continue;
    }
    if (next === null) next = new Map(store);
    next.set(leaseKey(lease.sessionScopeId, lease.agentScopeId, lease.guidanceId), expireLease(lease, reason));
  }
  return next ?? store;
}

/**
 * Apply one internal contract event (§7.3) to the store, returning a
 * NEW store. The input store is never mutated.
 *
 *   - READ_SUCCEEDED: (re-)issue a FRESH lease for
 *     (session, agent, guidance) with a full edit budget, recording
 *     the issuance phase/cwd and the read timestamp. Re-reading after
 *     EXPIRED restores FRESH; re-reading a FRESH lease refreshes it
 *     (full budget, new timestamp, reason cleared). A budget of 0
 *     issues an immediately-EXPIRED lease (EDIT_BUDGET_EXHAUSTED).
 *   - PRE_COMPACT: expire every FRESH lease in the event's scope
 *     (CONTEXT_COMPACTION). Other scopes are untouched.
 *   - CWD_CHANGED: expire FRESH leases in the scope whose issuance
 *     cwd differs from `newPathId` (CWD_MISMATCH). A lease issued
 *     under the new cwd stays FRESH; a lease with unknown issuance
 *     cwd expires (fail closed).
 *   - SUBAGENT_STARTED: no stored change — the new agent scope has no
 *     leases, so it starts UNSEEN by absence, and the parent scope's
 *     leases are untouched (no inheritance either way). Returns the
 *     same store instance.
 *   - PHASE_CHANGED: expire FRESH leases in the scope whose issuance
 *     phase differs from `phaseId` (PHASE_MISMATCH). A lease issued
 *     under the new phase stays FRESH; a lease with unknown issuance
 *     phase expires (fail closed).
 *   - WRITE_CHECKED: an output record, not a state-machine input —
 *     ignored. Edit-budget changes go through `recordWriteOutcome`.
 *
 * Throws LeaseError on a malformed event (not a §7.3 event) or an
 * invalid `maxSuccessfulEdits`; fail closed, never invent a lease.
 */
export function applyGuidanceEvent(
  store: LeaseStore,
  event: GuidancePulseEvent,
  options: ApplyEventOptions,
): LeaseStore {
  if (!isGuidancePulseEvent(event)) {
    throw new LeaseError("INVALID_EVENT", "event is not a valid GuidancePulseEvent");
  }
  switch (event.type) {
    case "READ_SUCCEEDED": {
      validateMaxEdits(options.maxSuccessfulEdits);
      const lease: GuidanceLease = {
        sessionScopeId: event.sessionScopeId,
        agentScopeId: event.agentScopeId,
        guidanceId: event.guidanceId,
        state: options.maxSuccessfulEdits === 0 ? "EXPIRED" : "FRESH",
        phaseId: options.phaseId,
        cwdPathId: options.cwdPathId,
        remainingSuccessfulEdits: options.maxSuccessfulEdits,
        maxSuccessfulEdits: options.maxSuccessfulEdits,
        reason: options.maxSuccessfulEdits === 0 ? "EDIT_BUDGET_EXHAUSTED" : null,
        lastConfirmedReadUtc: event.timestampUtc,
      };
      return withLease(store, lease);
    }
    case "PRE_COMPACT":
      return expireScopeLeases(
        store,
        event.sessionScopeId,
        event.agentScopeId,
        "CONTEXT_COMPACTION",
        () => false,
      );
    case "CWD_CHANGED":
      return expireScopeLeases(
        store,
        event.sessionScopeId,
        event.agentScopeId,
        "CWD_MISMATCH",
        (lease) => lease.cwdPathId === event.newPathId,
      );
    case "SUBAGENT_STARTED":
      // New scope starts UNSEEN by absence; parent leases untouched.
      return store;
    case "PHASE_CHANGED":
      return expireScopeLeases(
        store,
        event.sessionScopeId,
        event.agentScopeId,
        "PHASE_MISMATCH",
        (lease) => lease.phaseId === event.phaseId,
      );
    case "WRITE_CHECKED":
      // Output record, not a state input; budget via recordWriteOutcome.
      return store;
  }
}

/**
 * Record the outcome of one Write/Edit against a lease (§6.3):
 * a SUCCESSFUL write decrements a FRESH lease's remaining budget by
 * one; reaching 0 expires it (EDIT_BUDGET_EXHAUSTED). A FAILED write
 * never decrements. Writes against a missing, UNSEEN, or EXPIRED
 * lease change nothing (there is no budget to spend). Returns a NEW
 * store; the input store is never mutated.
 */
export function recordWriteOutcome(
  store: LeaseStore,
  sessionScopeId: string,
  agentScopeId: string,
  guidanceId: string,
  outcome: "success" | "failure",
): LeaseStore {
  if (outcome !== "success") return store;
  const lease = getLease(store, sessionScopeId, agentScopeId, guidanceId);
  if (lease === undefined || lease.state !== "FRESH") return store;
  const remaining = lease.remainingSuccessfulEdits - 1;
  const next: GuidanceLease =
    remaining <= 0
      ? { ...lease, remainingSuccessfulEdits: 0, state: "EXPIRED", reason: "EDIT_BUDGET_EXHAUSTED" }
      : { ...lease, remainingSuccessfulEdits: remaining };
  return withLease(store, next);
}

/** One rule's write-check outcome (§6.4 per-rule loop). */
export interface RuleCheckResult {
  guidanceId: string;
  mode: GuidanceMode;
  state: LeaseState;
  /** Set when the check itself expired the lease (lazy expiry). */
  expiredReason: InvalidationReason | null;
}

/** Result of a PreToolUse write check (§6.4). */
export interface WriteCheckResult {
  /** ALLOW when every matched rule is FRESH; else the aggregated mode. */
  decision: WriteDecision;
  /** Per-rule outcomes, in the same order as the input rules. */
  perRule: RuleCheckResult[];
  /** Store after lazy expiry (cwd/phase/budget mismatches persisted). */
  updatedStore: LeaseStore;
}

/** Input to `checkWrite`: the live write context plus matched rules. */
export interface CheckWriteInput {
  sessionScopeId: string;
  agentScopeId: string;
  /** HMAC cwd path id of the live PreToolUse event; null when unknown. */
  cwdPathId: string | null;
  /** Current phase id; null when unknown. */
  phaseId: string | null;
  /** Rules matching the write target (config order, from match-rules). */
  rules: readonly Pick<GuidanceRule, "id" | "mode">[];
}

/**
 * The §6.4 write-check algorithm, as a pure function. For each matched
 * rule, in order:
 *   - missing lease -> UNSEEN;
 *   - stored EXPIRED/UNSEEN -> that state (kept reason);
 *   - FRESH lease with issuance cwd != live cwd -> expire (CWD_MISMATCH);
 *   - FRESH lease with issuance phase != live phase -> expire (PHASE_MISMATCH);
 *   - FRESH lease with remaining <= 0 -> expire (EDIT_BUDGET_EXHAUSTED);
 *   - otherwise FRESH.
 * An unknown live cwd/phase (null) fails closed: it never equals an
 * issuance value, so the FRESH lease expires. Lazy expiries are
 * written into the returned `updatedStore` (the input store is never
 * mutated); the caller (T007 store) persists that store.
 *
 * Decision: no matched rules -> ALLOW (no guidance gate, §6.4);
 * every matched rule FRESH -> ALLOW; otherwise the strictest mode of
 * the non-FRESH rules, aggregated block > ask > warn (T002
 * `aggregateModes`) and mapped block -> DENY, ask -> ASK, warn -> WARN.
 */
export function checkWrite(store: LeaseStore, input: CheckWriteInput): WriteCheckResult {
  let updated: Map<string, GuidanceLease> | null = null;
  const perRule: RuleCheckResult[] = [];

  for (const rule of input.rules) {
    const lease = getLease(store, input.sessionScopeId, input.agentScopeId, rule.id);
    let state: LeaseState;
    let expiredReason: InvalidationReason | null = null;
    if (lease === undefined) {
      state = "UNSEEN";
    } else if (lease.state !== "FRESH") {
      state = lease.state;
    } else if (lease.cwdPathId !== input.cwdPathId) {
      state = "EXPIRED";
      expiredReason = "CWD_MISMATCH";
    } else if (lease.phaseId !== input.phaseId) {
      state = "EXPIRED";
      expiredReason = "PHASE_MISMATCH";
    } else if (lease.remainingSuccessfulEdits <= 0) {
      state = "EXPIRED";
      expiredReason = "EDIT_BUDGET_EXHAUSTED";
    } else {
      state = "FRESH";
    }
    if (expiredReason !== null && lease !== undefined) {
      if (updated === null) updated = new Map(store);
      updated.set(
        leaseKey(lease.sessionScopeId, lease.agentScopeId, lease.guidanceId),
        expireLease(lease, expiredReason),
      );
    }
    perRule.push({ guidanceId: rule.id, mode: rule.mode, state, expiredReason });
  }

  const updatedStore: LeaseStore = updated ?? store;
  const failing = perRule.filter((result) => result.state !== "FRESH");
  let decision: WriteDecision;
  if (failing.length === 0) {
    decision = "ALLOW";
  } else {
    const mode = aggregateModes(failing.map((result) => result.mode));
    decision = mode === "block" ? "DENY" : mode === "ask" ? "ASK" : "WARN";
  }
  return { decision, perRule, updatedStore };
}
