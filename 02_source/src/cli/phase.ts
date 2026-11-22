/**
 * `guidancepulse phase set <phase>` — P025 GuidancePulse, T006.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §6.5 ("阶段变化：显式
 * `phase set`，失效当前作用域旧租约") and the §6 state diagram
 * (`FRESH --> EXPIRED: phase set`), plus IMPLEMENTATION_PLAN.md
 * §7.2 (`guidancepulse phase set <id>` — "标记阶段并使旧租约失
 * 效") and §6 T006 ("`guidancepulse phase set <phase>` 使当前作用
 * 域旧租约失效").
 *
 * The same-phase rule (frozen by the T006 task card, and the one
 * place this file deliberately diverges from the T004 machine's
 * default): the plan card carries NO same-phase exception — a
 * `phase set` invalidates the current scope's old leases even when
 * the new phase equals the old phase. The T004 machine's
 * `PHASE_CHANGED` transition is a no-op for a lease whose issuance
 * phase already equals the new phase (it keeps such a lease FRESH,
 * which is correct for a *passive* phase observation), so this
 * command layer guarantees the card's semantics explicitly: after
 * recording the `PHASE_CHANGED` event, every FRESH lease still
 * standing in the scope is force-expired with reason
 * `PHASE_MISMATCH` — the same reason code T004 uses for phase
 * expiry, so the audit trail stays in one vocabulary.
 *
 * How the forced expiry is done WITHOUT touching the T004 machine
 * or the T007 store: it uses only public store APIs. For each
 * still-FRESH lease, `checkWriteAndPersist` is called with that
 * lease's own issuance cwd and a phase id constructed to differ
 * from the lease's issuance phase. `checkWrite` (§6.4) expires a
 * FRESH lease whose issuance phase differs from the supplied phase,
 * and persists the lazy expiry — that is the machine's own
 * fail-closed phase comparison, reused as the command-layer
 * invalidation. The constructed phase id is a comparison-only
 * sentinel: it is never written into any lease or event row (the
 * only persisted phase is the real new phase from the
 * `PHASE_CHANGED` event), and the sentinel is documented here so
 * a reviewer can see it is not a real phase. A dedicated
 * `store.expireScope` method would be cleaner; it was not added
 * because `src/store/store.ts` is T007-owned and `src/core` is
 * read-only for this task — see HANDOFF_T006.md known_limits, for
 * T013 to rule on.
 *
 * Interaction with T004's same-phase no-op (for T013): a passive
 * `PHASE_CHANGED` event with the same phase leaves a lease FRESH;
 * an explicit `phase set` command with the same phase expires it.
 * The difference is intent, not state: the event says "the phase
 * is (still) X", the command says "the user re-marked the phase,
 * re-read the guidance". Both behaviours are preserved — the
 * machine keeps its no-op, the command adds its forced expiry on
 * top. Do NOT "fix" the machine to expire on same-phase events;
 * that would change the Oracle parity surface for T009.
 *
 * This module never reads Prompt, Transcript, source code, or raw
 * paths; the only persisted values are the contract event and the
 * lease fields. It does not touch PreToolUse decision semantics.
 */

/** Error thrown for an invalid `phase` command or phase id. */
export class PhaseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "PhaseError";
    this.code = code;
  }
}

import type { GuidancePulseStore } from "../store/index.js";
import type { GuidancePulseEvent } from "../contracts/index.js";

/** A phase id is a slug: ^[a-z0-9][a-z0-9_-]*$ (T002 config rule). */
export const PHASE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Usage text for the `phase` command. */
export const PHASE_SET_USAGE = "guidancepulse phase set <phase>";

/** Input to `setPhase`. */
export interface SetPhaseInput {
  sessionScopeId: string;
  agentScopeId: string;
  /** The new phase id (must be a non-empty slug). */
  phaseId: string;
  /** Event timestamp (ISO 8601 UTC). Defaults to wall-clock time. */
  timestampUtc?: string;
  /**
   * Declared phases (from config, when available). When provided,
   * an undeclared phase is rejected (`INVALID_PHASE`); when
   * omitted, any well-formed slug is accepted.
   */
  allowedPhases?: readonly string[];
}

/** Result of `setPhase`. */
export interface SetPhaseResult {
  /** The phase that was set. */
  phaseId: string;
  /** True when the PHASE_CHANGED event was persisted. */
  persisted: boolean;
  /** Guidance ids whose FRESH lease expired because of this set. */
  invalidatedGuidanceIds: string[];
  /** Number of leases expired by this set. */
  expiredCount: number;
  /** True when the new phase equals the phase the leases were issued under. */
  samePhaseAsBefore: boolean;
}

/**
 * Validate a phase id: non-empty slug, and — when `allowedPhases`
 * is given — a declared phase. Throws `PhaseError`.
 */
export function validatePhaseId(
  phaseId: string,
  allowedPhases?: readonly string[],
): void {
  if (typeof phaseId !== "string" || !PHASE_ID_PATTERN.test(phaseId)) {
    throw new PhaseError(
      "INVALID_PHASE",
      "phase id must be a non-empty slug ([a-z0-9][a-z0-9_-]*)",
    );
  }
  if (allowedPhases !== undefined && !allowedPhases.includes(phaseId)) {
    throw new PhaseError("INVALID_PHASE", "phase id is not a declared phase");
  }
}

/**
 * Parse `phase` CLI arguments. Accepts exactly
 * `["phase", "set", "<phase>"]` (the leading `guidancepulse`
 * program name, when present, is stripped). Anything else throws
 * `PhaseError` (`INVALID_ARGUMENTS`) with the usage text.
 */
export function parsePhaseArgs(argv: readonly string[]): { phaseId: string } {
  const args = argv[0] === "guidancepulse" ? argv.slice(1) : argv;
  if (args.length !== 3 || args[0] !== "phase" || args[1] !== "set") {
    throw new PhaseError("INVALID_ARGUMENTS", `usage: ${PHASE_SET_USAGE}`);
  }
  validatePhaseId(args[2]);
  return { phaseId: args[2] };
}

/**
 * Read the current phase for a scope from its latest persisted
 * `PHASE_CHANGED` event. Returns null when no phase was ever set
 * for the scope.
 */
export function getCurrentPhase(
  store: GuidancePulseStore,
  sessionScopeId: string,
  agentScopeId: string,
): string | null {
  const events = store.listEvents({ sessionScopeId, agentScopeId, type: "PHASE_CHANGED" });
  const last = events[events.length - 1];
  return last !== undefined && last.type === "PHASE_CHANGED" ? last.phaseId : null;
}

/**
 * Set the phase for a scope and invalidate its old leases — even
 * when the new phase equals the old phase (see the module header).
 *
 * Steps, in order: (1) validate the phase id; (2) persist the
 * `PHASE_CHANGED` event (T004 expires leases issued under a
 * different phase); (3) force-expire any FRESH lease still standing
 * — those are exactly the same-phase leases the machine left alone
 * — via the machine's own phase comparison (see module header).
 * Step (3) is what makes `phase set` unconditional.
 *
 * Validation failures throw `PhaseError` before anything is
 * persisted, so a rejected `phase set` leaves the leases untouched.
 * Store failures propagate as `StoreError` (code only, no payload).
 */
export function setPhase(store: GuidancePulseStore, input: SetPhaseInput): SetPhaseResult {
  validatePhaseId(input.phaseId, input.allowedPhases);
  const timestampUtc = input.timestampUtc ?? new Date().toISOString();
  const before = store.listLeasesForScope(input.sessionScopeId, input.agentScopeId);
  const beforeFresh = before.filter((lease) => lease.state === "FRESH");
  const samePhaseAsBefore =
    beforeFresh.length > 0 && beforeFresh.every((lease) => lease.phaseId === input.phaseId);

  const event: GuidancePulseEvent = {
    type: "PHASE_CHANGED",
    sessionScopeId: input.sessionScopeId,
    agentScopeId: input.agentScopeId,
    phaseId: input.phaseId,
    timestampUtc,
  };
  store.recordEvent(event);

  // Forced expiry of the leases the machine left standing (the
  // same-phase ones). Comparison-only sentinel: guaranteed to differ
  // from the lease's issuance phase, never persisted anywhere.
  const invalidatedGuidanceIds: string[] = [];
  for (const lease of beforeFresh) {
    const current = store.getLease(input.sessionScopeId, input.agentScopeId, lease.guidanceId);
    if (current === undefined || current.state !== "FRESH") {
      if (current?.state === "EXPIRED" && current.reason === "PHASE_MISMATCH") {
        invalidatedGuidanceIds.push(lease.guidanceId);
      }
      continue;
    }
    const sentinelPhaseId = `__force_expire__${current.phaseId ?? "null"}`;
    store.checkWriteAndPersist({
      sessionScopeId: input.sessionScopeId,
      agentScopeId: input.agentScopeId,
      cwdPathId: current.cwdPathId,
      phaseId: sentinelPhaseId,
      rules: [{ id: current.guidanceId, mode: "block" }],
    });
    const after = store.getLease(input.sessionScopeId, input.agentScopeId, lease.guidanceId);
    if (after?.state === "EXPIRED" && after.reason === "PHASE_MISMATCH") {
      invalidatedGuidanceIds.push(lease.guidanceId);
    }
  }
  invalidatedGuidanceIds.sort();
  return {
    phaseId: input.phaseId,
    persisted: true,
    invalidatedGuidanceIds,
    expiredCount: invalidatedGuidanceIds.length,
    samePhaseAsBefore,
  };
}
