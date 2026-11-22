/**
 * PreCompact invalidation boundary — P025 GuidancePulse, T006.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §6.5 ("PreCompact：原子失效
 * 当前作用域租约；无法持久化失效状态时，严格模式阻止压缩") and
 * IMPLEMENTATION_PLAN.md §6 T006 ("PreCompact 原子使当前作用域租约
 * EXPIRED；若失效状态无法持久化，严格模式阻止压缩").
 *
 * Spec-reference note (same class of mismatch T002–T004 already
 * recorded): the T006 task card cites PROJECT_BOOK §7.2 as the
 * contract, but §7.2 in v1.1.0 is the module table and the UI
 * colour/wording section is §8.2. The invalidation contract lives
 * in §6.5; this file follows §6.5. No spec file was changed.
 *
 * How it works: the handler takes one adapted `PRE_COMPACT` event
 * (T003 `adaptHookEvent`) and persists it through
 * `GuidancePulseStore.recordEvent` (T007), which commits the event
 * row and the lease transition in ONE `BEGIN IMMEDIATE` transaction.
 * The T004 machine expires every FRESH lease in the event's scope
 * with reason `CONTEXT_COMPACTION`; other scopes are untouched. So
 * "atomic" here is the store's transaction, not a second mechanism
 * in this file — this file only decides what a persistence failure
 * means for the compaction itself.
 *
 * Strict-mode fail-closed rule (§6.5, PROJECT_BOOK §10 risk
 * "PreCompact 失效状态未持久化", P1): when the invalidation cannot
 * be persisted, strict mode BLOCKS the compaction — the handler
 * returns `blocked: true` and `exitCodeForPreCompact` is 2, the same
 * exit-code convention the T005 gate uses for `deny` (block the
 * triggering action instead of letting a stale lease survive a
 * compaction the store never recorded). In non-strict mode the
 * failure is reported (`persisted: false`, `errorCode`) but the
 * compaction is not blocked; the caller decides. Either way the
 * failure is never silent and never reported as a successful
 * invalidation.
 *
 * This module never reads Prompt, Transcript, source code, or raw
 * paths: it only moves the contract event the adapter already
 * sanitized. It does not touch PreToolUse decision semantics
 * (T005 owns `src/hooks/pre-tool-use.ts`).
 */

/** Error thrown when a boundary handler is given an invalid input. */
export class InvalidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "InvalidationError";
    this.code = code;
  }
}

import type { GuidancePulseStore } from "../store/index.js";
import { StoreError } from "../store/index.js";
import type { GuidancePulseEvent } from "../contracts/index.js";

/** Options for `handlePreCompact`. */
export interface HandlePreCompactOptions {
  /**
   * Strict mode (PROJECT_BOOK §5.4 / §6.5). When true and the
   * invalidation cannot be persisted, the compaction is blocked.
   * Default true: a hook that cannot prove the leases expired must
   * fail closed.
   */
  strictMode?: boolean;
}

/** Result of `handlePreCompact`. */
export interface PreCompactResult {
  /** True when the invalidation was persisted (event + leases). */
  persisted: boolean;
  /**
   * True when the compaction must NOT proceed: only set when
   * `persisted` is false AND strict mode is on.
   */
  blocked: boolean;
  /** Guidance ids whose FRESH lease expired in this scope. */
  invalidatedGuidanceIds: string[];
  /** Number of leases expired by this compaction. */
  expiredCount: number;
  /** Store error code when `persisted` is false; null otherwise. */
  errorCode: string | null;
}

/**
 * Persist a `PRE_COMPACT` event and expire every FRESH lease in its
 * scope, atomically (one store transaction). Returns the expired
 * guidance ids, or — on a persistence failure — a fail-closed
 * `blocked` verdict in strict mode.
 *
 * Throws `InvalidationError` (`INVALID_EVENT_TYPE`) when the event
 * is not a `PRE_COMPACT` event. Store failures are NOT thrown: they
 * are the case this handler exists to decide about, so they come
 * back in the result (`persisted: false`, `errorCode` set).
 */
export function handlePreCompact(
  store: GuidancePulseStore,
  event: GuidancePulseEvent,
  options: HandlePreCompactOptions = {},
): PreCompactResult {
  if (event.type !== "PRE_COMPACT") {
    throw new InvalidationError(
      "INVALID_EVENT_TYPE",
      "handlePreCompact requires a PRE_COMPACT event",
    );
  }
  const strictMode = options.strictMode ?? true;
  try {
    const beforeFresh = store
      .listLeasesForScope(event.sessionScopeId, event.agentScopeId)
      .filter((lease) => lease.state === "FRESH")
      .map((lease) => lease.guidanceId);
    store.recordEvent(event);
    // recordEvent committed; re-read to confirm the expiry landed.
    const after = store.listLeasesForScope(event.sessionScopeId, event.agentScopeId);
    const invalidated = after
      .filter(
        (lease) =>
          beforeFresh.includes(lease.guidanceId) &&
          lease.state === "EXPIRED" &&
          lease.reason === "CONTEXT_COMPACTION",
      )
      .map((lease) => lease.guidanceId);
    return {
      persisted: true,
      blocked: false,
      invalidatedGuidanceIds: invalidated,
      expiredCount: invalidated.length,
      errorCode: null,
    };
  } catch (error) {
    return {
      persisted: false,
      blocked: strictMode,
      invalidatedGuidanceIds: [],
      expiredCount: 0,
      errorCode: error instanceof StoreError ? error.code : "STORE_ERROR",
    };
  }
}

/**
 * Hook process exit code for a `PreCompactResult`: 2 blocks the
 * compaction (the `deny` convention shared with the T005 gate), 0
 * lets it proceed. Only a strict-mode persistence failure blocks.
 */
export function exitCodeForPreCompact(result: PreCompactResult): number {
  return result.blocked ? 2 : 0;
}
