/**
 * Timeline view model — P025 GuidancePulse, T008.
 *
 * Pure, DOM-free mapping from the T007 store's allowlisted data
 * (PROJECT_BOOK §7.4: event type, guidance ID, HMAC path id, timestamp,
 * scope ids, lease state, phase id, remaining edits, reason code) to
 * the four-zone dashboard of PROJECT_BOOK §8.1:
 *
 *   1. session bar — session / agent / phase / last compact time;
 *   2. guidance list — guidance ID, UNSEEN/FRESH/EXPIRED, remaining edits;
 *   3. timeline — Read, Compact, Cwd, Phase, Subagent, Write decision;
 *   4. detail — event type, time, guidance ID, path-id short code,
 *      state change, reason code, decision.
 *
 * Colours and wording follow PROJECT_BOOK §8.2 (the section the plan's
 * task cards mis-cite as the state-machine/event contract; §8.2 is in
 * fact the UI colour/wording section — same class of mismatch T002–T007
 * already recorded, spec unchanged): FRESH green, UNSEEN grey, EXPIRED
 * orange, DENY red, ASK yellow, WARN blue. Every state is shown with
 * text AND an icon, never colour alone.
 *
 * Privacy: this module only accepts contract events
 * (`isGuidancePulseEvent`) and leases. It never receives Prompt,
 * source code, absolute paths, or raw Hook JSON, and it never emits
 * them: path ids are shortened to `hmac:<first 6 hex>…` before display.
 * A denied write shows only the guidance ID, the path short code, and
 * the re-read suggestion — never source code (§8.2).
 */

import {
  isGuidancePulseEvent,
  type GuidancePulseEvent,
  type InvalidationReason,
  type LeaseState,
  type WriteDecision,
} from "../contracts/index.js";
import type { GuidanceLease } from "../core/index.js";

/** Timeline entry kinds (§8.1 zone 3). */
export type TimelineEntryKind =
  | "read"
  | "compact"
  | "cwd"
  | "phase"
  | "subagent"
  | "write";

/** Display metadata for a lease state (§8.2: text + icon, not colour alone). */
export interface StateDisplay {
  state: LeaseState;
  label: string;
  icon: string;
  color: string;
}

export const LEASE_STATE_DISPLAY: Record<LeaseState, StateDisplay> = {
  FRESH: { state: "FRESH", label: "FRESH", icon: "●", color: "#1a7f37" },
  UNSEEN: { state: "UNSEEN", label: "UNSEEN", icon: "○", color: "#57606a" },
  EXPIRED: { state: "EXPIRED", label: "EXPIRED", icon: "▲", color: "#bc4c00" },
};

/** Display metadata for a write decision (§8.2 colours). */
export interface DecisionDisplay {
  decision: WriteDecision;
  label: string;
  icon: string;
  color: string;
}

export const WRITE_DECISION_DISPLAY: Record<WriteDecision, DecisionDisplay> = {
  ALLOW: { decision: "ALLOW", label: "ALLOW", icon: "✓", color: "#1a7f37" },
  WARN: { decision: "WARN", label: "WARN", icon: "⚠", color: "#0969da" },
  ASK: { decision: "ASK", label: "ASK", icon: "?", color: "#9a6700" },
  DENY: { decision: "DENY", label: "DENY", icon: "✕", color: "#cf222e" },
};

/** One guidance row for the left-hand list (§8.1 zone 2). */
export interface GuidanceRow {
  guidanceId: string;
  state: LeaseState;
  /** Null when there is no lease (UNSEEN): no budget exists yet. */
  remainingSuccessfulEdits: number | null;
  maxSuccessfulEdits: number | null;
  reason: InvalidationReason | null;
  lastConfirmedReadUtc: string | null;
  cwdPathIdShort: string | null;
}

/** One timeline entry (§8.1 zone 3). */
export interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  label: string;
  timestampUtc: string;
  guidanceId: string | null;
  pathIdShort: string | null;
  decision: WriteDecision | null;
  state: LeaseState | null;
  reason: InvalidationReason | null;
  /** Human-readable detail; contains only allowlisted values. */
  detail: string;
}

/** The whole dashboard model (§8.1 zones 1–4). */
export interface TimelineModel {
  sessionScopeId: string;
  agentScopeId: string;
  /** Current phase (latest PHASE_CHANGED, else the caller's phase). */
  phaseId: string | null;
  /** Timestamp of the most recent PRE_COMPACT, if any. */
  lastCompactUtc: string | null;
  guidances: GuidanceRow[];
  entries: TimelineEntry[];
}

/** Input for `buildTimelineModel` — store-shaped, allowlisted only. */
export interface BuildTimelineModelInput {
  sessionScopeId: string;
  agentScopeId: string;
  events: readonly GuidancePulseEvent[];
  leases: readonly GuidanceLease[];
  /** Phase when no PHASE_CHANGED event exists; null when unknown. */
  currentPhaseId?: string | null;
}

/**
 * Shorten an `hmac:<64 hex>` path id to `hmac:<first 6 hex>…`
 * (PROJECT_BOOK §8.3 example shape). Anything that is not a well-formed
 * path id is never echoed: it renders as `hmac:—`.
 */
export function shortPathId(pathId: string | null | undefined): string {
  if (typeof pathId !== "string") return "hmac:—";
  const match = /^hmac:([0-9a-f]{6})[0-9a-f]{58}$/.exec(pathId);
  return match === null ? "hmac:—" : `hmac:${match[1]}…`;
}

/**
 * Build the dashboard model. Throws `Error("UI_INVALID_EVENT: …")`
 * (code only, the offending value is never echoed) when an event fails
 * the §7.3 contract, so a malformed row can never reach the UI.
 */
export function buildTimelineModel(input: BuildTimelineModelInput): TimelineModel {
  for (const event of input.events) {
    if (!isGuidancePulseEvent(event)) {
      throw new Error("UI_INVALID_EVENT: event failed contract validation");
    }
  }

  let phaseId: string | null = input.currentPhaseId ?? null;
  let lastCompactUtc: string | null = null;
  for (const event of input.events) {
    if (event.type === "PHASE_CHANGED") phaseId = event.phaseId;
    if (event.type === "PRE_COMPACT") lastCompactUtc = event.timestampUtc;
  }

  const rows = new Map<string, GuidanceRow>();
  for (const lease of input.leases) {
    rows.set(lease.guidanceId, {
      guidanceId: lease.guidanceId,
      state: lease.state,
      remainingSuccessfulEdits: lease.remainingSuccessfulEdits,
      maxSuccessfulEdits: lease.maxSuccessfulEdits,
      reason: lease.reason,
      lastConfirmedReadUtc: lease.lastConfirmedReadUtc,
      cwdPathIdShort: shortPathId(lease.cwdPathId),
    });
  }
  // A guidance seen in events but without a lease row is UNSEEN (§6.1:
  // absence from the store means UNSEEN; there is no stored UNSEEN row).
  for (const event of input.events) {
    const guidanceId =
      event.type === "READ_SUCCEEDED" || event.type === "WRITE_CHECKED"
        ? event.guidanceId
        : null;
    if (guidanceId !== null && !rows.has(guidanceId)) {
      rows.set(guidanceId, {
        guidanceId,
        state: "UNSEEN",
        remainingSuccessfulEdits: null,
        maxSuccessfulEdits: null,
        reason: null,
        lastConfirmedReadUtc: null,
        cwdPathIdShort: null,
      });
    }
  }
  const guidances = [...rows.values()].sort((a, b) =>
    a.guidanceId < b.guidanceId ? -1 : a.guidanceId > b.guidanceId ? 1 : 0,
  );

  const entries: TimelineEntry[] = input.events.map((event, index) => {
    const id = `e${index + 1}`;
    switch (event.type) {
      case "READ_SUCCEEDED":
        return {
          id,
          kind: "read" as const,
          label: "Read",
          timestampUtc: event.timestampUtc,
          guidanceId: event.guidanceId,
          pathIdShort: shortPathId(event.pathId),
          decision: null,
          state: null,
          reason: null,
          detail: `Guidance ${event.guidanceId} read confirmed · path ${shortPathId(event.pathId)}`,
        };
      case "PRE_COMPACT":
        return {
          id,
          kind: "compact" as const,
          label: "Compact",
          timestampUtc: event.timestampUtc,
          guidanceId: null,
          pathIdShort: null,
          decision: null,
          state: null,
          reason: "CONTEXT_COMPACTION",
          detail:
            "Context compaction — leases in this scope expired (CONTEXT_COMPACTION)",
        };
      case "CWD_CHANGED":
        return {
          id,
          kind: "cwd" as const,
          label: "Cwd",
          timestampUtc: event.timestampUtc,
          guidanceId: null,
          pathIdShort: shortPathId(event.newPathId),
          decision: null,
          state: null,
          reason: "CWD_MISMATCH",
          detail: `Working directory changed · ${shortPathId(event.oldPathId)} → ${shortPathId(event.newPathId)}`,
        };
      case "SUBAGENT_STARTED":
        return {
          id,
          kind: "subagent" as const,
          label: "Subagent",
          timestampUtc: event.timestampUtc,
          guidanceId: null,
          pathIdShort: null,
          decision: null,
          state: null,
          reason: "SUBAGENT_SCOPE",
          detail: `Subagent scope ${event.agentScopeId} started — parent leases are not inherited (SUBAGENT_SCOPE)`,
        };
      case "PHASE_CHANGED":
        return {
          id,
          kind: "phase" as const,
          label: "Phase",
          timestampUtc: event.timestampUtc,
          guidanceId: null,
          pathIdShort: null,
          decision: null,
          state: null,
          reason: "PHASE_MISMATCH",
          detail: `Phase changed to ${event.phaseId} — leases issued under an earlier phase expired (PHASE_MISMATCH)`,
        };
      case "WRITE_CHECKED": {
        const base =
          `Write decision ${event.decision} · lease ${event.state} · ` +
          `guidance ${event.guidanceId} · path ${shortPathId(event.pathId)}`;
        return {
          id,
          kind: "write" as const,
          label: "Write decision",
          timestampUtc: event.timestampUtc,
          guidanceId: event.guidanceId,
          pathIdShort: shortPathId(event.pathId),
          decision: event.decision,
          state: event.state,
          reason: null,
          detail:
            event.decision === "DENY"
              ? `${base} · Re-read the guidance, then retry the write.`
              : base,
        };
      }
    }
  });

  return {
    sessionScopeId: input.sessionScopeId,
    agentScopeId: input.agentScopeId,
    phaseId,
    lastCompactUtc,
    guidances,
    entries,
  };
}

/** Filter timeline entries to one guidance, or all when `null`. */
export function filterEntriesByGuidance(
  entries: readonly TimelineEntry[],
  guidanceId: string | null,
): TimelineEntry[] {
  if (guidanceId === null) return [...entries];
  return entries.filter((entry) => entry.guidanceId === guidanceId);
}
