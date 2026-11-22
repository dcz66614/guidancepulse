/**
 * Public entry point for the hooks module (T003).
 * T004–T006 import from here; internals stay behind these re-exports.
 */
export {
  AdapterError,
  BLOCKING_HOOK_EVENTS,
  KNOWN_HOOK_EVENTS,
  OBSERVATION_ONLY_HOOK_EVENTS,
  adaptHookEvent,
  type AdapterContext,
  type AdapterOutput,
} from "./adapter.js";
export {
  buildHookOutput,
  decisionToPermissionDecision,
  describeRuleCheck,
  hookExitCode,
  nonFreshChecks,
  summarizeNonFresh,
  type HookPermissionDecision,
  type PreToolUseHookOutput,
} from "./decision.js";
export {
  checkWrite,
  handlePreToolUse,
  recordSuccessfulWrite,
  type PreToolUseContext,
  type PreToolUseFailure,
  type PreToolUseResult,
} from "./pre-tool-use.js";
