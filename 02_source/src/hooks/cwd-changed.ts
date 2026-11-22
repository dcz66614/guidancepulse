/**
 * CwdChanged observation — P025 GuidancePulse, T006.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §6.5 ("CwdChanged：异步失
 * 效旧 cwd 租约；PreToolUse 同步复核当前 cwd，防止异步竞态") and
 * IMPLEMENTATION_PLAN.md §6 T006 ("CwdChanged 只作为异步观察，
 * PreToolUse 还需同步比较当前 cwd") and §6 T006 failure rollback
 * ("如果异步事件存在竞态，强制检查必须回到同步 PreToolUse，不允许
 * 以等待异步事件完成作为前置条件").
 *
 * Semantics: this event is ASYNC OBSERVATION ONLY. The T003 adapter
 * already turns it into one `CWD_CHANGED` event carrying HMAC path
 * ids (never raw paths); this handler persists that event, and the
 * T004 machine expires FRESH leases in the scope whose issuance cwd
 * differs from the new cwd (`CWD_MISMATCH`). A lease issued under
 * the new cwd survives. That is the whole effect — the handler
 * returns no gate decision, blocks nothing, and never waits for
 * anything.
 *
 * The race this design accepts, and how it is closed: a
 * CwdChanged observation is async, so a Write could in principle
 * reach PreToolUse before the observation is persisted. That is why
 * the observation is NOT the enforcement point. Enforcement is
 * T005's synchronous PreToolUse check (`checkWrite` in
 * `src/core/lease-machine.ts`), which compares the LIVE cwd from
 * the write event against each lease's issuance cwd on every write
 * and lazily expires mismatches (`CWD_MISMATCH`) — no async event
 * needs to have arrived first. `requiresSynchronousRecheck` is
 * named here so the invariant is assertable: a CwdChanged
 * observation is a courtesy record, the synchronous check is the
 * gate. Nothing in this module waits for an async event to
 * complete, and no caller may treat this handler's return as a
 * precondition for a write decision.
 */

import type { GuidancePulseStore } from "../store/index.js";
import { StoreError } from "../store/index.js";
import type { GuidancePulseEvent } from "../contracts/index.js";
import { InvalidationError } from "./pre-compact.js";

/** CwdChanged never gates a write: the synchronous check does. */
export const CWD_CHANGED_CAN_BLOCK = false as const;

/**
 * True by construction: every write must still be re-checked
 * synchronously at PreToolUse time (live cwd vs issuance cwd),
 * because this observation may arrive late or never.
 */
export const CWD_REQUIRES_SYNCHRONOUS_RECHECK = true as const;

/** Result of `handleCwdChanged`. */
export interface CwdChangedResult {
  /** True when the observation was persisted (event + leases). */
  persisted: boolean;
  /** Always false: this observation never blocks or gates a write. */
  blocking: false;
  /** Guidance ids whose FRESH lease expired (issued under the old cwd). */
  invalidatedGuidanceIds: string[];
  /** Guidance ids whose FRESH lease survived (issued under the new cwd). */
  survivingGuidanceIds: string[];
  /** Store error code when `persisted` is false; null otherwise. */
  errorCode: string | null;
}

/**
 * Persist a `CWD_CHANGED` event and expire the scope's FRESH leases
 * issued under a different cwd. Store failures are reported in the
 * result, never thrown, and never block.
 *
 * Throws `InvalidationError` (`INVALID_EVENT_TYPE`) when the event
 * is not a `CWD_CHANGED` event.
 */
export function handleCwdChanged(
  store: GuidancePulseStore,
  event: GuidancePulseEvent,
): CwdChangedResult {
  if (event.type !== "CWD_CHANGED") {
    throw new InvalidationError(
      "INVALID_EVENT_TYPE",
      "handleCwdChanged requires a CWD_CHANGED event",
    );
  }
  try {
    const before = store.listLeasesForScope(event.sessionScopeId, event.agentScopeId);
    const beforeFresh = before.filter((lease) => lease.state === "FRESH");
    store.recordEvent(event);
    const after = store.listLeasesForScope(event.sessionScopeId, event.agentScopeId);
    const byId = new Map(after.map((lease) => [lease.guidanceId, lease]));
    const invalidatedGuidanceIds: string[] = [];
    const survivingGuidanceIds: string[] = [];
    for (const lease of beforeFresh) {
      const next = byId.get(lease.guidanceId);
      if (next?.state === "EXPIRED" && next.reason === "CWD_MISMATCH") {
        invalidatedGuidanceIds.push(lease.guidanceId);
      } else if (next?.state === "FRESH") {
        survivingGuidanceIds.push(lease.guidanceId);
      }
    }
    return {
      persisted: true,
      blocking: false,
      invalidatedGuidanceIds,
      survivingGuidanceIds,
      errorCode: null,
    };
  } catch (error) {
    return {
      persisted: false,
      blocking: false,
      invalidatedGuidanceIds: [],
      survivingGuidanceIds: [],
      errorCode: error instanceof StoreError ? error.code : "STORE_ERROR",
    };
  }
}
