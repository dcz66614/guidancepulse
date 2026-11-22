/**
 * PreToolUse decision output — P025 GuidancePulse, T005.
 *
 * Pure mapping from the T004 `WriteDecision` (PROJECT_BOOK §6.4:
 * `aggregate(block > ask > warn)`) to the Claude Code `PreToolUse`
 * hook JSON output (official Hooks reference, as verified by T001
 * against https://code.claude.com/docs/en/hooks, 2026-11-15):
 *
 *   - warn  -> `permissionDecision: "allow"` + `additionalContext`
 *              (a reminder appended to the agent's context; the
 *              normal permission flow is NOT changed);
 *   - ask   -> `permissionDecision: "ask"` (Claude Code asks the user
 *              to confirm before running the tool);
 *   - block -> `permissionDecision: "deny"` (the tool is not run) AND
 *              the hook process must exit with code 2;
 *   - allow -> `permissionDecision: "allow"`.
 *
 * Exit codes (same reference): exit 0 lets the tool run (allow /
 * warn / ask are all decided by Claude Code from the JSON);
 * exit 2 blocks the tool. `hookExitCode` is the single place that
 * maps a decision to an exit code, so a DENY can never accidentally
 * exit 0.
 *
 * No-gate case: when no rule protects the write target
 * (PROJECT_BOOK §6.4: "no matched rules -> ALLOW (no guidance
 * gate)"), the hook expresses NO opinion — the output is `{}` and
 * the exit code is 0. An empty object is the honest signal: the
 * write was not checked against any guidance, not that a lease
 * was verified.
 *
 * Fail-closed case: when the gate itself errors (malformed Hook
 * input, store failure — see pre-tool-use.ts), the output is a
 * DENY with the error code in the reason, exit code 2. The reason
 * carries only an error code and guidance ids / states — never a
 * raw path, Prompt, or source content (§7.4).
 *
 * This module is pure: no I/O, no network, no clock.
 */

import type { RuleCheckResult } from "../core/index.js";
import type { WriteDecision } from "../contracts/index.js";

/** Claude Code `permissionDecision` values for PreToolUse. */
export type HookPermissionDecision = "allow" | "deny" | "ask";

/**
 * The JSON object a PreToolUse hook prints to stdout. Only the
 * fields Claude Code reads for this event: `hookSpecificOutput`
 * (the decision) and `additionalContext` (extra context for the
 * agent, used by `warn`). An empty object means "no opinion".
 */
export interface PreToolUseHookOutput {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision: HookPermissionDecision;
    permissionDecisionReason?: string;
  };
  additionalContext?: string;
}

/** Map a lease-machine decision to a Claude Code permission decision. */
export function decisionToPermissionDecision(
  decision: WriteDecision,
): HookPermissionDecision {
  switch (decision) {
    case "ALLOW":
    case "WARN":
      return "allow";
    case "ASK":
      return "ask";
    case "DENY":
      return "deny";
  }
}

/**
 * The hook process exit code for a decision. Only DENY blocks via
 * exit code 2; every other decision exits 0 and lets Claude Code
 * apply the JSON decision (ask prompts the user, warn/allow proceed).
 */
export function hookExitCode(decision: WriteDecision): 0 | 2 {
  return decision === "DENY" ? 2 : 0;
}

/** One-line, path-free summary of a per-rule check outcome. */
export function describeRuleCheck(result: RuleCheckResult): string {
  const expired =
    result.expiredReason !== null ? `, expired: ${result.expiredReason}` : "";
  return `${result.guidanceId} (${result.state}, ${result.mode}${expired})`;
}

/** The non-FRESH per-rule outcomes, in check order. */
export function nonFreshChecks(perRule: readonly RuleCheckResult[]): RuleCheckResult[] {
  return perRule.filter((result) => result.state !== "FRESH");
}

/** Human-readable, path-free list of the non-FRESH rules. */
export function summarizeNonFresh(perRule: readonly RuleCheckResult[]): string {
  return nonFreshChecks(perRule).map(describeRuleCheck).join("; ");
}

/**
 * Build the hook JSON output for a decision.
 *
 *   - `noGate: true` -> `{}` (no rule protected the target; the hook
 *     expresses no opinion).
 *   - `failureCode` set -> fail-closed DENY: the gate itself errored,
 *     so the write is blocked until the check can run. The code (not
 *     the underlying error text, which may contain paths) is the only
 *     diagnostic in the reason.
 *   - ALLOW -> explicit allow naming the FRESH leases.
 *   - WARN  -> allow + `additionalContext` reminding the agent to
 *     (re-)read the guidance; the permission flow is unchanged.
 *   - ASK   -> ask + a reason naming the stale rules.
 *   - DENY  -> deny + a reason naming the stale rules and the remedy
 *     (re-read the guidance, then retry the write).
 */
export function buildHookOutput(
  decision: WriteDecision,
  perRule: readonly RuleCheckResult[],
  options: { noGate?: boolean; failureCode?: string } = {},
): PreToolUseHookOutput {
  if (options.noGate === true) {
    return {};
  }
  if (options.failureCode !== undefined) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `GuidancePulse check failed (${options.failureCode}); ` +
          `write blocked until the guidance check succeeds (fail closed).`,
      },
    };
  }
  const permissionDecision = decisionToPermissionDecision(decision);
  switch (decision) {
    case "ALLOW":
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision,
          permissionDecisionReason:
            perRule.length === 0
              ? "GuidancePulse: no guidance rule applies to this write."
              : `GuidancePulse: all matched guidance leases are FRESH: ${perRule.map(describeRuleCheck).join("; ")}.`,
        },
      };
    case "WARN": {
      const stale = summarizeNonFresh(perRule);
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision,
          permissionDecisionReason:
            `GuidancePulse: write allowed under warn mode, but guidance is stale: ${stale}.`,
        },
        additionalContext:
          `GuidancePulse reminder: the guidance for this write has not been (re-)read ` +
          `in the current scope: ${stale}. Re-read the guidance file(s) before relying ` +
          `on them for this change; this write itself was allowed (warn mode).`,
      };
    }
    case "ASK":
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision,
          permissionDecisionReason:
            `GuidancePulse: guidance is stale (${summarizeNonFresh(perRule)}); ` +
            `confirm the guidance was (re-)read before writing.`,
        },
      };
    case "DENY":
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision,
          permissionDecisionReason:
            `GuidancePulse: write blocked — guidance is stale: ${summarizeNonFresh(perRule)}. ` +
            `Re-read the guidance file(s), then retry the write.`,
        },
      };
  }
}
