/**
 * Guidance config parsing and validation — P025 GuidancePulse, T002.
 *
 * Input is YAML text (or an already-parsed unknown value). Output is a
 * fully resolved GuidanceConfig: every default is applied, an omitted
 * rule `phases` resolves to all declared phases, and every field is
 * validated. Anything invalid throws ConfigError with a stable code and
 * a dotted path; nothing is silently trimmed, dropped, coerced, or
 * deduplicated.
 *
 * Rejection summary (all covered by tests/unit/config.test.ts):
 *   - not an object / bad YAML / wrong or missing `version`
 *   - unknown keys at any level
 *   - empty / duplicate / malformed `phases`; rule phases outside the
 *     declared set; empty `rules`
 *   - missing / duplicate / malformed rule `id`
 *   - missing / empty / absolute / `..` / glob-containing `source`
 *   - missing / empty / illegal `applies_to` glob
 *   - unknown `mode` / `unobservable_read`; non-integer or out-of-range
 *     `max_successful_edits`
 *   - duplicate entries inside any array; whitespace-padded strings
 */

import { parse as parseYaml } from "yaml";
import { configError, type ConfigError } from "./errors.js";
import { validateGlob } from "./glob.js";
import {
  DEFAULT_MAX_SUCCESSFUL_EDITS,
  DEFAULT_MODE,
  DEFAULT_UNOBSERVABLE_READ,
  GUIDANCE_MODES,
  MAX_SUCCESSFUL_EDITS_LIMIT,
  UNOBSERVABLE_READS,
  type GuidanceConfig,
  type GuidanceDefaults,
  type GuidanceMode,
  type GuidanceRule,
  type UnobservableRead,
} from "./types.js";

export { ConfigError } from "./errors.js";

/** Slug for phase ids and rule ids: ^[a-z0-9][a-z0-9_-]*$ (max 64/128). */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_PHASE_LENGTH = 64;
const MAX_RULE_ID_LENGTH = 128;

/** Parse YAML text into a validated, fully resolved config. */
export function parseConfigYaml(text: string): GuidanceConfig {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw configError("EMPTY_CONFIG", "$", "configuration text must not be empty");
  }
  let value: unknown;
  try {
    value = parseYaml(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw configError("YAML_SYNTAX", "$", `invalid YAML: ${detail ?? ""}`);
  }
  return parseConfig(value);
}

/** Validate an already-parsed value into a fully resolved config. */
export function parseConfig(value: unknown): GuidanceConfig {
  if (!isRecord(value)) {
    throw configError("NOT_AN_OBJECT", "$", "configuration must be a YAML mapping");
  }
  rejectUnknownKeys(value, ["version", "defaults", "phases", "rules"], "$");

  const version = value["version"];
  if (version !== 1) {
    throw configError(
      "INVALID_VERSION",
      "version",
      "version is required and must be exactly 1",
    );
  }

  const phases = parsePhases(value["phases"]);
  const defaults = parseDefaults(value["defaults"]);
  const rules = parseRules(value["rules"], phases, defaults);

  return { version: 1, defaults, phases, rules };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw configError(
        "UNKNOWN_KEY",
        path === "$" ? key : `${path}.${key}`,
        `unknown field "${key}" (unknown fields are rejected, not ignored)`,
      );
    }
  }
}

function parsePhases(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw configError("INVALID_PHASES", "phases", "phases is required and must be an array");
  }
  if (value.length === 0) {
    throw configError("INVALID_PHASES", "phases", "phases must not be empty");
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const path = `phases[${index}]`;
    const phase = parseSlug(entry, path, "phase", MAX_PHASE_LENGTH);
    if (seen.has(phase)) {
      throw configError("DUPLICATE_PHASE", path, `duplicate phase "${phase}"`);
    }
    seen.add(phase);
  });
  return value as string[];
}

function parseSlug(
  value: unknown,
  path: string,
  what: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw configError("INVALID_SLUG", path, `${what} must be a string`);
  }
  if (value.length === 0) {
    throw configError("INVALID_SLUG", path, `${what} must not be empty`);
  }
  if (value !== value.trim()) {
    throw configError(
      "INVALID_SLUG",
      path,
      `${what} must not have leading or trailing whitespace (values are never silently trimmed)`,
    );
  }
  if (value.length > maxLength) {
    throw configError(
      "INVALID_SLUG",
      path,
      `${what} must be at most ${maxLength} characters`,
    );
  }
  if (!SLUG_PATTERN.test(value)) {
    throw configError(
      "INVALID_SLUG",
      path,
      `${what} "${value}" must match ^[a-z0-9][a-z0-9_-]*$`,
    );
  }
  return value;
}

function parseDefaults(value: unknown): GuidanceDefaults {
  if (value === undefined) {
    return {
      mode: DEFAULT_MODE,
      max_successful_edits: DEFAULT_MAX_SUCCESSFUL_EDITS,
      unobservable_read: DEFAULT_UNOBSERVABLE_READ,
    };
  }
  if (!isRecord(value)) {
    throw configError("INVALID_DEFAULTS", "defaults", "defaults must be a mapping");
  }
  rejectUnknownKeys(value, ["mode", "max_successful_edits", "unobservable_read"], "defaults");
  return {
    mode: parseMode(value["mode"], "defaults.mode", DEFAULT_MODE),
    max_successful_edits: parseMaxEdits(
      value["max_successful_edits"],
      "defaults.max_successful_edits",
      DEFAULT_MAX_SUCCESSFUL_EDITS,
    ),
    unobservable_read: parseUnobservableRead(
      value["unobservable_read"],
      "defaults.unobservable_read",
      DEFAULT_UNOBSERVABLE_READ,
    ),
  };
}

function parseMode(value: unknown, path: string, fallback: GuidanceMode): GuidanceMode {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !(GUIDANCE_MODES as readonly string[]).includes(value)) {
    throw configError(
      "INVALID_MODE",
      path,
      `mode must be one of ${GUIDANCE_MODES.join(", ")}`,
    );
  }
  return value as GuidanceMode;
}

function parseUnobservableRead(
  value: unknown,
  path: string,
  fallback: UnobservableRead,
): UnobservableRead {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    !(UNOBSERVABLE_READS as readonly string[]).includes(value)
  ) {
    throw configError(
      "INVALID_UNOBSERVABLE_READ",
      path,
      `unobservable_read must be one of ${UNOBSERVABLE_READS.join(", ")}`,
    );
  }
  return value as UnobservableRead;
}

function parseMaxEdits(value: unknown, path: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw configError("INVALID_MAX_EDITS", path, "max_successful_edits must be an integer");
  }
  if (value < 0 || value > MAX_SUCCESSFUL_EDITS_LIMIT) {
    throw configError(
      "INVALID_MAX_EDITS",
      path,
      `max_successful_edits must be between 0 and ${MAX_SUCCESSFUL_EDITS_LIMIT}`,
    );
  }
  return value;
}

function parseRules(
  value: unknown,
  phases: string[],
  defaults: GuidanceDefaults,
): GuidanceRule[] {
  if (!Array.isArray(value)) {
    throw configError("INVALID_RULES", "rules", "rules is required and must be an array");
  }
  if (value.length === 0) {
    throw configError("INVALID_RULES", "rules", "rules must not be empty");
  }
  const seenIds = new Set<string>();
  return value.map((entry, index) => {
    const path = `rules[${index}]`;
    if (!isRecord(entry)) {
      throw configError("INVALID_RULE", path, "each rule must be a mapping");
    }
    rejectUnknownKeys(
      entry,
      ["id", "source", "applies_to", "phases", "mode", "max_successful_edits", "unobservable_read"],
      path,
    );
    const id = parseSlug(entry["id"], `${path}.id`, "rule id", MAX_RULE_ID_LENGTH);
    if (seenIds.has(id)) {
      throw configError("DUPLICATE_RULE_ID", `${path}.id`, `duplicate rule id "${id}"`);
    }
    seenIds.add(id);
    return {
      id,
      source: parseSource(entry["source"], `${path}.source`),
      applies_to: parseAppliesTo(entry["applies_to"], `${path}.applies_to`),
      phases: parseRulePhases(entry["phases"], `${path}.phases`, phases),
      mode: parseMode(entry["mode"], `${path}.mode`, defaults.mode),
      max_successful_edits: parseMaxEdits(
        entry["max_successful_edits"],
        `${path}.max_successful_edits`,
        defaults.max_successful_edits,
      ),
      unobservable_read: parseUnobservableRead(
        entry["unobservable_read"],
        `${path}.unobservable_read`,
        defaults.unobservable_read,
      ),
    };
  });
}

/**
 * A guidance source is a literal relative file path (PROJECT_BOOK §5.1:
 * `CLAUDE.md`, `.claude/rules/security.md`). Glob characters are rejected
 * here — a source names a file, it does not pattern-match.
 */
function parseSource(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw configError("INVALID_SOURCE", path, "source is required and must be an array");
  }
  if (value.length === 0) {
    throw configError("INVALID_SOURCE", path, "source must not be empty");
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (typeof entry !== "string" || entry.length === 0) {
      throw configError("INVALID_SOURCE", entryPath, "source entries must be non-empty strings");
    }
    if (entry !== entry.trim()) {
      throw configError(
        "INVALID_SOURCE",
        entryPath,
        "source entries must not have leading or trailing whitespace",
      );
    }
    if (entry.startsWith("/") || entry.includes("\\")) {
      throw configError(
        "INVALID_SOURCE",
        entryPath,
        `source "${entry}" must be a relative path using '/' separators`,
      );
    }
    if (entry.endsWith("/")) {
      throw configError("INVALID_SOURCE", entryPath, `source "${entry}" must name a file`);
    }
    if (entry.split("/").includes("..")) {
      throw configError(
        "INVALID_SOURCE",
        entryPath,
        `source "${entry}" must not contain a '..' segment`,
      );
    }
    if (entry.split("/").some((segment) => segment.length === 0)) {
      throw configError(
        "INVALID_SOURCE",
        entryPath,
        `source "${entry}" must not contain an empty segment`,
      );
    }
    if (/[*?[\]]/.test(entry)) {
      throw configError(
        "INVALID_SOURCE",
        entryPath,
        `source "${entry}" must be a literal path, not a glob`,
      );
    }
    if (seen.has(entry)) {
      throw configError("DUPLICATE_SOURCE", entryPath, `duplicate source "${entry}"`);
    }
    seen.add(entry);
  });
  return value as string[];
}

function parseAppliesTo(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw configError("INVALID_APPLIES_TO", path, "applies_to is required and must be an array");
  }
  if (value.length === 0) {
    throw configError("INVALID_APPLIES_TO", path, "applies_to must not be empty");
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    validateGlob(entry, entryPath);
    if (seen.has(entry as string)) {
      throw configError(
        "DUPLICATE_GLOB",
        entryPath,
        `duplicate applies_to pattern "${String(entry)}"`,
      );
    }
    seen.add(entry as string);
  });
  return value as string[];
}

function parseRulePhases(
  value: unknown,
  path: string,
  declared: string[],
): string[] {
  // Omitted -> every declared phase (frozen T002 decision).
  if (value === undefined) return [...declared];
  if (!Array.isArray(value)) {
    throw configError("INVALID_RULE_PHASES", path, "phases must be an array");
  }
  if (value.length === 0) {
    throw configError("INVALID_RULE_PHASES", path, "phases must not be empty");
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const phase = parseSlug(entry, entryPath, "phase", MAX_PHASE_LENGTH);
    if (!declared.includes(phase)) {
      throw configError(
        "UNKNOWN_PHASE",
        entryPath,
        `phase "${phase}" is not declared in top-level phases`,
      );
    }
    if (seen.has(phase)) {
      throw configError("DUPLICATE_PHASE", entryPath, `duplicate phase "${phase}"`);
    }
    seen.add(phase);
  });
  return value as string[];
}

/**
 * Conflict decision (PROJECT_BOOK §6.4): when several rules match one
 * write target, the strictest mode wins — block > ask > warn.
 * Exported here so T005 reuses the frozen T002 decision.
 */
export function aggregateModes(modes: readonly GuidanceMode[]): GuidanceMode {
  if (modes.includes("block")) return "block";
  if (modes.includes("ask")) return "ask";
  if (modes.includes("warn")) return "warn";
  throw configError("INVALID_MODE", "modes", "at least one mode is required to aggregate");
}
