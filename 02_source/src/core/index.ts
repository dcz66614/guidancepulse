/**
 * Public entry point for the core module (T004).
 * T005–T007 import from here; internals stay behind these re-exports.
 */
export {
  LeaseError,
  applyGuidanceEvent,
  canonicalLeaseSnapshot,
  checkWrite,
  createEmptyLeaseStore,
  getLease,
  leaseKey,
  leasesForScope,
  listLeases,
  recordWriteOutcome,
  type ApplyEventOptions,
  type CheckWriteInput,
  type GuidanceLease,
  type LeaseStore,
  type RuleCheckResult,
  type WriteCheckResult,
} from "./lease-machine.js";
export {
  isRuleActiveInPhase,
  matchRuleIds,
  matchRules,
  matchRulesAnyPhase,
  ruleMatchesTarget,
} from "./match-rules.js";
