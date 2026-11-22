/**
 * SubagentStart scope creation — P025 GuidancePulse, T006.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §6.2 ("新 Session 或新
 * Subagent 从 UNSEEN 开始；租约不跨 Agent 作用域继承") and §6.5
 * ("SubagentStart：建立独立子 Agent 作用域，初始 UNSEEN"), plus
 * IMPLEMENTATION_PLAN.md §6 T006 ("SubagentStart 建立新的 UNSEEN
 * 作用域").
 *
 * Semantics: a subagent is a NEW agent scope
 * (sessionScopeId, agentScopeId). Leases are keyed by
 * (session, agent, guidance) (T004), and absence from the store
 * MEANS UNSEEN — so creating the scope needs no lease row at all.
 * This handler persists the `SUBAGENT_STARTED` event (the audit
 * record that the scope was created) and verifies, by re-reading
 * both scopes, that the parent scope's leases are untouched and
 * the new scope holds no leases (no inheritance in either
 * direction: the subagent does not inherit the parent's FRESH
 * leases, and the parent's leases are not expired by the spawn).
 *
 * A SubagentStart never blocks and never gates a write; it is an
 * observation that establishes scope identity. The new scope stays
 * UNSEEN until its own confirmed Read / load issues a lease under
 * its own agent id.
 */

import type { GuidancePulseStore } from "../store/index.js";
import { StoreError } from "../store/index.js";
import type { GuidancePulseEvent } from "../contracts/index.js";
import { InvalidationError } from "./pre-compact.js";

/** Result of `handleSubagentStart`. */
export interface SubagentStartResult {
  /** True when the SUBAGENT_STARTED event was persisted. */
  persisted: boolean;
  /** The new scope's identity. */
  scope: { sessionScopeId: string; agentScopeId: string };
  /** Always "UNSEEN": the new scope starts with no leases. */
  initialState: "UNSEEN";
  /** Guidance ids the new scope inherited from the parent (always []). */
  inheritedGuidanceIds: string[];
  /** True when no parent lease changed state or reason. */
  parentLeasesUntouched: boolean;
  /** Store error code when `persisted` is false; null otherwise. */
  errorCode: string | null;
}

/**
 * Persist a `SUBAGENT_STARTED` event and establish the new scope
 * as UNSEEN. Store failures are reported in the result, never
 * thrown.
 *
 * Throws `InvalidationError` (`INVALID_EVENT_TYPE`) when the event
 * is not a `SUBAGENT_STARTED` event.
 */
export function handleSubagentStart(
  store: GuidancePulseStore,
  event: GuidancePulseEvent,
): SubagentStartResult {
  if (event.type !== "SUBAGENT_STARTED") {
    throw new InvalidationError(
      "INVALID_EVENT_TYPE",
      "handleSubagentStart requires a SUBAGENT_STARTED event",
    );
  }
  const scope = { sessionScopeId: event.sessionScopeId, agentScopeId: event.agentScopeId };
  // Other scopes in the same session are the "parents" here: a
  // subagent may itself spawn a subagent, so the parent is any
  // other agent scope in this session, not just the main agent.
  const snapshotScope = (leases: { sessionScopeId: string; agentScopeId: string; guidanceId: string; state: string; reason: string | null }[]) =>
    leases
      .filter((l) => l.sessionScopeId === event.sessionScopeId && l.agentScopeId !== event.agentScopeId)
      .map((l) => `${l.agentScopeId}:${l.guidanceId}:${l.state}:${l.reason ?? ""}`)
      .sort();
  try {
    const otherBefore = snapshotScope(store.listAllLeases());
    store.recordEvent(event);
    const newScopeLeases = store.listLeasesForScope(event.sessionScopeId, event.agentScopeId);
    const otherAfter = snapshotScope(store.listAllLeases());
    return {
      persisted: true,
      scope,
      initialState: "UNSEEN",
      inheritedGuidanceIds: newScopeLeases.map((lease) => lease.guidanceId),
      parentLeasesUntouched:
        otherBefore.length === otherAfter.length &&
        otherBefore.every((entry, i) => entry === otherAfter[i]),
      errorCode: null,
    };
  } catch (error) {
    return {
      persisted: false,
      scope,
      initialState: "UNSEEN",
      inheritedGuidanceIds: [],
      parentLeasesUntouched: false,
      errorCode: error instanceof StoreError ? error.code : "STORE_ERROR",
    };
  }
}
