/**
 * Synthetic demo data — P025 GuidancePulse, T008.
 *
 * Fixed, fully synthetic fixtures for the local dashboard demo: no real
 * Prompt, source code, absolute path, or user data anywhere. Path ids
 * are fixed `hmac:<hex>` values (the store never sees a real path here;
 * `scripts/demo-report.ts` re-derives the same sequence through the
 * real SQLite store + lease engine instead, so the report proves the
 * store → UI path).
 *
 * The sequence covers all six timeline kinds and all three lease states:
 *   - auth-change-safety: read in `implementation`, then EXPIRED by the
 *     explicit phase change to `review` (PHASE_MISMATCH);
 *   - release-checklist: read in `review`, EXPIRED by compaction, then
 *     re-read and FRESH again;
 *   - api-rate-limits: never read — UNSEEN, its write is DENY.
 */

import type { GuidancePulseEvent } from "../contracts/index.js";
import type { GuidanceLease } from "../core/index.js";
import { buildTimelineModel, type TimelineModel } from "./timeline.js";

export const DEMO_SESSION_SCOPE_ID = "demo-session-01";
export const DEMO_AGENT_SCOPE_ID = "main";
export const DEMO_SUBAGENT_SCOPE_ID = "subagent-01";

/** Fixed synthetic HMAC path ids (64 lowercase hex after `hmac:`). */
export const DEMO_PATH_IDS = {
  cwdImplementation: `hmac:${"8a12c9"}${"1".repeat(58)}`,
  cwdReview: `hmac:${"7b34e2"}${"2".repeat(58)}`,
  targetAuth: `hmac:${"c41f77"}${"3".repeat(58)}`,
  targetRelease: `hmac:${"d902ab"}${"4".repeat(58)}`,
  targetApi: `hmac:${"e51c08"}${"5".repeat(58)}`,
} as const;

export const DEMO_EVENTS: readonly GuidancePulseEvent[] = [
  {
    type: "READ_SUCCEEDED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "auth-change-safety",
    pathId: DEMO_PATH_IDS.targetAuth,
    timestampUtc: "2026-11-15T10:14:03Z",
  },
  {
    type: "WRITE_CHECKED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "auth-change-safety",
    pathId: DEMO_PATH_IDS.targetAuth,
    decision: "ALLOW",
    state: "FRESH",
    timestampUtc: "2026-11-15T10:15:20Z",
  },
  {
    type: "PHASE_CHANGED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    phaseId: "review",
    timestampUtc: "2026-11-15T10:20:02Z",
  },
  {
    type: "READ_SUCCEEDED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "release-checklist",
    pathId: DEMO_PATH_IDS.targetRelease,
    timestampUtc: "2026-11-15T10:21:37Z",
  },
  {
    type: "WRITE_CHECKED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "release-checklist",
    pathId: DEMO_PATH_IDS.targetRelease,
    decision: "ALLOW",
    state: "FRESH",
    timestampUtc: "2026-11-15T10:24:10Z",
  },
  {
    type: "PRE_COMPACT",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    timestampUtc: "2026-11-15T10:31:55Z",
  },
  {
    type: "WRITE_CHECKED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "release-checklist",
    pathId: DEMO_PATH_IDS.targetRelease,
    decision: "DENY",
    state: "EXPIRED",
    timestampUtc: "2026-11-15T10:33:02Z",
  },
  {
    type: "CWD_CHANGED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    oldPathId: DEMO_PATH_IDS.cwdImplementation,
    newPathId: DEMO_PATH_IDS.cwdReview,
    timestampUtc: "2026-11-15T10:40:18Z",
  },
  {
    type: "SUBAGENT_STARTED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_SUBAGENT_SCOPE_ID,
    timestampUtc: "2026-11-15T10:45:44Z",
  },
  {
    type: "WRITE_CHECKED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "api-rate-limits",
    pathId: DEMO_PATH_IDS.targetApi,
    decision: "DENY",
    state: "UNSEEN",
    timestampUtc: "2026-11-15T10:47:09Z",
  },
  {
    type: "READ_SUCCEEDED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "release-checklist",
    pathId: DEMO_PATH_IDS.targetRelease,
    timestampUtc: "2026-11-15T10:52:30Z",
  },
  {
    type: "WRITE_CHECKED",
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "release-checklist",
    pathId: DEMO_PATH_IDS.targetRelease,
    decision: "ALLOW",
    state: "FRESH",
    timestampUtc: "2026-11-15T10:53:15Z",
  },
];

/** Final lease rows matching the demo sequence above. */
export const DEMO_LEASES: readonly GuidanceLease[] = [
  {
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "auth-change-safety",
    state: "EXPIRED",
    phaseId: "implementation",
    cwdPathId: DEMO_PATH_IDS.cwdImplementation,
    remainingSuccessfulEdits: 4,
    maxSuccessfulEdits: 5,
    reason: "PHASE_MISMATCH",
    lastConfirmedReadUtc: "2026-11-15T10:14:03Z",
  },
  {
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    guidanceId: "release-checklist",
    state: "FRESH",
    phaseId: "review",
    cwdPathId: DEMO_PATH_IDS.cwdReview,
    remainingSuccessfulEdits: 4,
    maxSuccessfulEdits: 5,
    reason: null,
    lastConfirmedReadUtc: "2026-11-15T10:52:30Z",
  },
];

/**
 * The demo dashboard model. `api-rate-limits` has no lease row here —
 * exactly as in the real store, where absence means UNSEEN — and
 * `buildTimelineModel` derives its UNSEEN row from the WRITE_CHECKED
 * event, so the report path (real store rows) shows the identical row.
 */
export function buildDemoModel(): TimelineModel {
  return buildTimelineModel({
    sessionScopeId: DEMO_SESSION_SCOPE_ID,
    agentScopeId: DEMO_AGENT_SCOPE_ID,
    events: DEMO_EVENTS,
    leases: DEMO_LEASES,
    currentPhaseId: "review",
  });
}
