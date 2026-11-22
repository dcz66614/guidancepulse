/**
 * Path rule matcher — P025 GuidancePulse, T004.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §5.1 (rule shape:
 * `applies_to` globs, `phases`), §6.4 (write-check algorithm:
 * `rules = match_rules(target, current_phase)`), and §6.2 condition 3
 * (FRESH requires the current phase to be in the rule's allowed
 * range). Glob semantics and path normalisation are T002's frozen
 * `matchGlob` / `normalizeTargetPath` (reused, not re-implemented).
 *
 * This module is pure: no I/O, no network, no clock, no randomness.
 * It answers one question — which rules protect a write target in the
 * current phase — so T005 can feed exactly those rules to the lease
 * machine's `checkWrite`. It does not decide ALLOW/DENY itself and
 * never touches lease state.
 *
 * Fail-closed choices (frozen here, flagged for review):
 *   - An un-normalisable target (absolute path, `..` escaping the
 *     project, empty) matches NO rule — it cannot be a relative
 *     `applies_to` target. Callers (T005 adapter path) treat an
 *     absolute target outside the project cwd as un-gated; a target
 *     that normalises to a relative path is matched normally.
 *   - A `null` phase means "phase unknown": rules are matched
 *     regardless of phase, so a rule that might apply is checked
 *     rather than silently skipped. The lease machine still expires
 *     a FRESH lease on a null-phase write check (§6.2 condition 3
 *     cannot be verified), so unknown phase never passes a gate.
 *   - An invalid glob in a caller-built config throws ConfigError
 *     (via T002 `matchGlob`); configs loaded through `parseConfig`
 *     have valid globs by construction.
 */

import {
  matchGlob,
  normalizeTargetPath,
  type GlobMatchOptions,
  type GuidanceConfig,
  type GuidanceRule,
} from "../config/index.js";

/** A rule protects the target in the given phase. */
export function isRuleActiveInPhase(rule: GuidanceRule, phaseId: string | null): boolean {
  if (phaseId === null) return true;
  return rule.phases.includes(phaseId);
}

/**
 * A rule's `applies_to` globs match the (already normalised) target.
 * Case-sensitive by default (POSIX); pass
 * `{ caseInsensitive: true }` for a Windows-origin target (NTFS is
 * case-insensitive) — the option is forwarded to `matchGlob`.
 */
export function ruleMatchesTarget(
  rule: GuidanceRule,
  normalisedTarget: string,
  options: GlobMatchOptions = {},
): boolean {
  return rule.applies_to.some((pattern) => matchGlob(pattern, normalisedTarget, options));
}

/**
 * Rules protecting `targetPath` in `phaseId`, in config order.
 * `targetPath` is normalised first (backslashes, `./`, duplicate
 * separators, `.` segments collapse; see T002
 * `normalizeTargetPath`). Returns [] when the target cannot be
 * normalised to a relative path, when no rule's globs match, or when
 * no matching rule is active in the phase. The `options` (notably
 * `caseInsensitive` for Windows-origin targets) are forwarded to
 * `matchGlob` via `ruleMatchesTarget`.
 */
export function matchRules(
  config: GuidanceConfig,
  targetPath: string,
  phaseId: string | null,
  options: GlobMatchOptions = {},
): GuidanceRule[] {
  const normalised = normalizeTargetPath(targetPath);
  if (normalised === null) return [];
  return config.rules.filter(
    (rule) => isRuleActiveInPhase(rule, phaseId) && ruleMatchesTarget(rule, normalised, options),
  );
}

/** Rule ids protecting `targetPath` in `phaseId`, in config order. */
export function matchRuleIds(
  config: GuidanceConfig,
  targetPath: string,
  phaseId: string | null,
  options: GlobMatchOptions = {},
): string[] {
  return matchRules(config, targetPath, phaseId, options).map((rule) => rule.id);
}

/**
 * Rules protecting `targetPath` in ANY phase (phase-agnostic view).
 * This is the T003 adapter's view: `adaptHookEvent` lists matching
 * rule ids without phase filtering because the live phase is not part
 * of the Hook input. T005 refines with `matchRules` + the live phase.
 */
export function matchRulesAnyPhase(
  config: GuidanceConfig,
  targetPath: string,
  options: GlobMatchOptions = {},
): GuidanceRule[] {
  return matchRules(config, targetPath, null, options);
}
