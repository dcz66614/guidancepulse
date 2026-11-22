/**
 * Guidance rule configuration model — P025 GuidancePulse, T002.
 *
 * Frozen from PROJECT_BOOK.md v1.1.0 §5.1 (example config), §6.3 (edit
 * budget) and §6.4 (decision aggregation). The task card cites §7.2 as the
 * interface contract, but §7.2 in v1.1.0 is the module table and the UI
 * colour/wording section is §8.2, which contains no schema fields; the
 * schema-relevant sections are
 * §5.1, §6.3 and §6.4. That mismatch is recorded in HANDOFF_T002.md as a
 * spec note — the schema below follows §5.1/§6.3/§6.4, not §7.2.
 *
 * Defaults (PROJECT_BOOK §5.1):
 *   mode = "warn", max_successful_edits = 5, unobservable_read = "deny".
 *
 * T002 decisions (not in the spec, frozen here and flagged for review):
 *   - `version` must be exactly 1.
 *   - `phases` and rule `id` are slugs: ^[a-z0-9][a-z0-9_-]*$.
 *   - A rule with no `phases` applies to ALL declared phases.
 *   - `max_successful_edits` is an integer in 0..10000 (0 = never FRESH
 *     for writes; the spec only fixes the default of 5).
 *   - `rules` must be a non-empty array: a config that gates nothing is
 *     rejected rather than silently accepted.
 *   - Unknown keys are rejected everywhere; nothing is silently trimmed,
 *     dropped, or deduplicated — leading/trailing whitespace in an
 *     identifier, path, or glob is an error, and duplicate entries inside
 *     an array are an error.
 */

/** Enforcement mode for a rule when its lease is not FRESH. */
export type GuidanceMode = "warn" | "ask" | "block";

export const GUIDANCE_MODES: readonly GuidanceMode[] = [
  "warn",
  "ask",
  "block",
];

/**
 * How to treat a guidance file that cannot be observably confirmed as
 * read (PROJECT_BOOK §5.4: AGENTS.md / Skill / @path reads may be
 * unobservable). "deny" keeps the lease UNSEEN; "allow" is an explicit
 * opt-in to trust the unobservable load.
 */
export type UnobservableRead = "deny" | "allow";

export const UNOBSERVABLE_READS: readonly UnobservableRead[] = [
  "deny",
  "allow",
];

/** Project-book defaults (PROJECT_BOOK §5.1). */
export const DEFAULT_MODE: GuidanceMode = "warn";
export const DEFAULT_MAX_SUCCESSFUL_EDITS = 5;
export const DEFAULT_UNOBSERVABLE_READ: UnobservableRead = "deny";
/** T002 sanity bound; the spec fixes only the default (5). */
export const MAX_SUCCESSFUL_EDITS_LIMIT = 10000;

export interface GuidanceDefaults {
  mode: GuidanceMode;
  max_successful_edits: number;
  unobservable_read: UnobservableRead;
}

export interface GuidanceRule {
  /** Unique slug, e.g. "auth-change-safety". */
  id: string;
  /** Guidance source files, relative literal paths, e.g. ["CLAUDE.md"]. */
  source: string[];
  /** Relative path globs the rule protects, e.g. ["src/auth/**"]. */
  applies_to: string[];
  /**
   * Phases this rule is active in. Always fully resolved on parse: an
   * omitted `phases` field resolves to every declared phase.
   */
  phases: string[];
  mode: GuidanceMode;
  max_successful_edits: number;
  unobservable_read: UnobservableRead;
}

export interface GuidanceConfig {
  version: 1;
  defaults: GuidanceDefaults;
  /** Declared phases, in order, e.g. ["explore","implementation","review","release"]. */
  phases: string[];
  rules: GuidanceRule[];
}
