/**
 * InstructionsLoaded observation — P025 GuidancePulse, T006.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §6.5 ("InstructionsLoaded：
 * 只作官方支持范围内的加载观察，不具备阻断能力") and §5.3
 * (InstructionsLoaded covers CLAUDE.md / .claude/rules/*.md loads),
 * plus IMPLEMENTATION_PLAN.md §6 T006 ("InstructionsLoaded 不承担
 * 阻断").
 *
 * Semantics: this event is ASYNC OBSERVATION ONLY. The T003 adapter
 * already turns a load into one `READ_SUCCEEDED` event per matched
 * guidance id (deduped); this handler only persists those events
 * through the store, which (re-)issues a FRESH lease for each
 * guidance. Persisting a confirmed load is the credential effect —
 * it is NOT a gate: nothing this handler returns can block, delay,
 * or deny anything, and a persistence failure here must never be
 * treated as a block either (it is reported, and the lease simply
 * stays UNSEEN/EXPIRED until a later confirmed read).
 *
 * Hard rule, enforced by the return type: there is no `blocked`
 * field that can ever be true. `INSTRUCTIONS_LOADED_CAN_BLOCK` is
 * false as a named constant so callers and tests can assert the
 * invariant instead of inferring it from an absent field.
 *
 * The handler records the batch atomically
 * (`store.recordEvents`): either every loaded guidance is
 * credentialed or none is — a half-credentialed load would be
 * worse than none, because a later write check could not tell
 * which guidance the load actually confirmed.
 */

import type { GuidancePulseStore } from "../store/index.js";
import { StoreError } from "../store/index.js";
import type { ApplyEventOptions } from "../core/index.js";
import type { GuidancePulseEvent } from "../contracts/index.js";
import { InvalidationError } from "./pre-compact.js";

/** InstructionsLoaded can never block. Named so tests can assert it. */
export const INSTRUCTIONS_LOADED_CAN_BLOCK = false as const;

/** One loaded guidance plus the issuance context its lease needs. */
export interface LoadedGuidanceRecord {
  event: GuidancePulseEvent;
  /** Phase/cwd at load time and the rule's edit budget (T004). */
  options: ApplyEventOptions;
}

/** Result of `handleInstructionsLoaded`. */
export interface InstructionsLoadedResult {
  /** True when the batch was persisted (events + leases). */
  persisted: boolean;
  /** Always false: this event can never block. */
  blocking: false;
  /** Guidance ids credentialed (FRESH) by this load. */
  credentialedGuidanceIds: string[];
  /** Store error code when `persisted` is false; null otherwise. */
  errorCode: string | null;
}

/**
 * Persist a batch of adapted `READ_SUCCEEDED` events from one
 * InstructionsLoaded observation. Every event must be
 * `READ_SUCCEEDED` (anything else is an
 * `InvalidationError`/`INVALID_EVENT_TYPE` — the adapter, not this
 * handler, decides what a load means). Store failures are reported
 * in the result, never thrown, and never block: `blocking` is
 * always false.
 */
export function handleInstructionsLoaded(
  store: GuidancePulseStore,
  records: readonly LoadedGuidanceRecord[],
): InstructionsLoadedResult {
  const credentialedGuidanceIds = [...new Set(records.map((record) => {
    if (record.event.type !== "READ_SUCCEEDED") {
      throw new InvalidationError(
        "INVALID_EVENT_TYPE",
        "handleInstructionsLoaded requires READ_SUCCEEDED events only",
      );
    }
    return record.event.guidanceId;
  }))];
  try {
    store.recordEvents(records);
  } catch (error) {
    return {
      persisted: false,
      blocking: false,
      credentialedGuidanceIds: [],
      errorCode: error instanceof StoreError ? error.code : "STORE_ERROR",
    };
  }
  return {
    persisted: true,
    blocking: false,
    credentialedGuidanceIds,
    errorCode: null,
  };
}
