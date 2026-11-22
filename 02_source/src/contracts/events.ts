/**
 * Internal event contract — P025 GuidancePulse, T003.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §7.3 ("内部事件契约") and
 * §7.4 ("允许持久化字段").
 *
 * Spec-reference note (same class of mismatch T002 already recorded for
 * §8.2): the T003 task card cites PROJECT_BOOK §7.1 as the contract,
 * but §7.1 in v1.1.0 is the process architecture and the UI four-zone
 * layout is §8.1 ("主界面四区"), which contains no event fields. The
 * event contract lives in §7.3; this file follows §7.3 verbatim, plus
 * §7.4 for what may be persisted. No spec file was
 * changed; the discrepancy is recorded in HANDOFF_T003.md.
 *
 * Persistence allowlist (§7.4): event type, guidance ID, HMAC path
 * identifier, timestamp, session/agent scope identifiers, lease state,
 * phase ID, remaining edit count, invalidation reason code.
 *
 * Persistence denylist (§7.4): Prompt, Transcript, model replies,
 * source code, Read/Write bodies, absolute paths, user names, host
 * names, API keys, cookies, access tokens. The raw Hook JSON is parsed
 * in memory only and is never a persisted value (see
 * src/privacy/sanitize.ts and src/hooks/adapter.ts).
 *
 * Field conventions:
 *   - `pathId` is always `hmac:<hex>` (SHA-256 HMAC over a normalised
 *     path, see src/privacy/sanitize.ts). A raw path never appears in
 *     an event.
 *   - `timestampUtc` is an ISO 8601 UTC string (e.g. 2026-11-15T10:14:03Z).
 *   - `sessionScopeId` is the Hook `session_id`; `agentScopeId` is the
 *     Hook `agent_id` when present, otherwise the frozen default "main"
 *     (the main agent has no agent_id in Hook input). Both are scope
 *     identifiers, explicitly allowed by §7.4.
 *   - `WRITE_CHECKED` is emitted by the T005 write gate AFTER lease
 *     lookup, not by the T003 adapter: the adapter cannot know lease
 *     state. The adapter instead yields a `WriteCheckRequest` (same
 *     scope/path shape, no decision/state) for T005 to resolve. The
 *     `WRITE_CHECKED` shape below is frozen here so T005 and the T007
 *     store share one definition.
 */

export type LeaseState = "UNSEEN" | "FRESH" | "EXPIRED";

export type WriteDecision = "ALLOW" | "WARN" | "ASK" | "DENY";

/** Invalidation reason codes (§7.4 allows persisting a reason code). */
export type InvalidationReason =
  | "CONTEXT_COMPACTION"
  | "CWD_MISMATCH"
  | "PHASE_MISMATCH"
  | "EDIT_BUDGET_EXHAUSTED"
  | "SUBAGENT_SCOPE"
  | "SESSION_END";

/**
 * The six persisted internal events (PROJECT_BOOK §7.3, verbatim
 * field-for-field; field order normalised alphabetically in code only).
 */
export type GuidancePulseEvent =
  | {
      type: "READ_SUCCEEDED";
      sessionScopeId: string;
      agentScopeId: string;
      guidanceId: string;
      pathId: string;
      timestampUtc: string;
    }
  | {
      type: "PRE_COMPACT";
      sessionScopeId: string;
      agentScopeId: string;
      timestampUtc: string;
    }
  | {
      type: "CWD_CHANGED";
      sessionScopeId: string;
      agentScopeId: string;
      oldPathId: string;
      newPathId: string;
      timestampUtc: string;
    }
  | {
      type: "SUBAGENT_STARTED";
      sessionScopeId: string;
      agentScopeId: string;
      timestampUtc: string;
    }
  | {
      type: "PHASE_CHANGED";
      sessionScopeId: string;
      agentScopeId: string;
      phaseId: string;
      timestampUtc: string;
    }
  | {
      type: "WRITE_CHECKED";
      sessionScopeId: string;
      agentScopeId: string;
      guidanceId: string;
      pathId: string;
      decision: WriteDecision;
      state: LeaseState;
      timestampUtc: string;
    };

/** Discriminant values of GuidancePulseEvent. */
export const GUIDANCE_PULSE_EVENT_TYPES: readonly GuidancePulseEvent["type"][] = [
  "READ_SUCCEEDED",
  "PRE_COMPACT",
  "CWD_CHANGED",
  "SUBAGENT_STARTED",
  "PHASE_CHANGED",
  "WRITE_CHECKED",
];

/**
 * What the T003 adapter yields for a PreToolUse Write/Edit: the write
 * target and the rules it matches, before any lease lookup. NOT a
 * persisted event — T005 turns one request per matching rule into a
 * `WRITE_CHECKED` event once it knows the lease state and decision.
 * `ruleIds` is empty when no rule protects the target; T005 then allows
 * the write without a guidance gate (PROJECT_BOOK §6.4).
 */
export interface WriteCheckRequest {
  toolName: "Write" | "Edit";
  sessionScopeId: string;
  agentScopeId: string;
  /** HMAC of the normalised target path, relative to the project cwd. */
  pathId: string;
  /** IDs of the rules whose `applies_to` matches the target (any phase). */
  ruleIds: string[];
  timestampUtc: string;
}

/** The agent-scope id used when Hook input carries no `agent_id`. */
export const MAIN_AGENT_SCOPE_ID = "main";

/**
 * Structural check that a value is one of the six contract events and
 * carries only contract fields (no raw Hook fields may leak through).
 * This is a shape guard, not a substitute for the sanitizer: the
 * adapter must never construct an event from unsanitized input.
 */
export function isGuidancePulseEvent(value: unknown): value is GuidancePulseEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const type = record["type"];
  if (typeof type !== "string") return false;
  const stringFields = ["sessionScopeId", "agentScopeId", "timestampUtc"];
  for (const field of stringFields) {
    if (typeof record[field] !== "string" || (record[field] as string).length === 0) {
      return false;
    }
  }
  if (typeof record["timestampUtc"] === "string" && Number.isNaN(Date.parse(record["timestampUtc"] as string))) {
    return false;
  }
  switch (type) {
    case "READ_SUCCEEDED":
      return (
        hasExactKeys(record, ["type", "sessionScopeId", "agentScopeId", "guidanceId", "pathId", "timestampUtc"]) &&
        isNonEmptyString(record["guidanceId"]) &&
        isPathId(record["pathId"])
      );
    case "PRE_COMPACT":
      return hasExactKeys(record, ["type", "sessionScopeId", "agentScopeId", "timestampUtc"]);
    case "CWD_CHANGED":
      return (
        hasExactKeys(record, ["type", "sessionScopeId", "agentScopeId", "oldPathId", "newPathId", "timestampUtc"]) &&
        isPathId(record["oldPathId"]) &&
        isPathId(record["newPathId"])
      );
    case "SUBAGENT_STARTED":
      return hasExactKeys(record, ["type", "sessionScopeId", "agentScopeId", "timestampUtc"]);
    case "PHASE_CHANGED":
      return (
        hasExactKeys(record, ["type", "sessionScopeId", "agentScopeId", "phaseId", "timestampUtc"]) &&
        isNonEmptyString(record["phaseId"])
      );
    case "WRITE_CHECKED":
      return (
        hasExactKeys(record, [
          "type",
          "sessionScopeId",
          "agentScopeId",
          "guidanceId",
          "pathId",
          "decision",
          "state",
          "timestampUtc",
        ]) &&
        isNonEmptyString(record["guidanceId"]) &&
        isPathId(record["pathId"]) &&
        (["ALLOW", "WARN", "ASK", "DENY"] as readonly string[]).includes(record["decision"] as string) &&
        (["UNSEEN", "FRESH", "EXPIRED"] as readonly string[]).includes(record["state"] as string)
      );
    default:
      return false;
  }
}

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(record);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A path identifier must be the `hmac:<64 lowercase hex>` form. */
export function isPathId(value: unknown): value is string {
  return typeof value === "string" && /^hmac:[0-9a-f]{64}$/.test(value);
}
