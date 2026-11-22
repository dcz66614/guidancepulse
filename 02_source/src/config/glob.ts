/**
 * Glob grammar for `applies_to` — P025 GuidancePulse, T002.
 *
 * Frozen semantics (PROJECT_BOOK §5.1 example uses `src/auth/**`;
 * the book does not spell out a glob grammar, so T002 freezes this one
 * and flags it for review):
 *
 *   - Patterns are relative POSIX paths; segments are split on `/`.
 *   - `**` as a whole segment matches zero or more path segments.
 *   - `*`  matches any sequence of characters except `/`, within one segment.
 *   - `?`  matches exactly one character except `/`, within one segment.
 *   - `[...]` is a character class within one segment; ranges (`a-z`)
 *     and negation with leading `!` or `^` are supported. A literal `]`
 *     may appear first inside the class. An unbalanced `[` is illegal.
 *   - A literal segment matches exactly.
 *   - Case: matching is case-sensitive by default — POSIX paths
 *     are case-sensitive, so `src/auth/**` does not match
 *     `src/AUTH/x.ts`. Callers pass `{ caseInsensitive: true }`
 *     for Windows-origin targets (a drive-letter or UNC cwd or
 *     target, see `isWindowsPath` in the privacy module), where
 *     the pattern and the target are both folded with
 *     `toLowerCase` before matching: NTFS is case-insensitive, so
 *     `src/session/**` must match `src/SESSION/token.ts` there.
 *     Character classes fold with the rest (`[A-Z]` matches `a`
 *     when folding is on). Never fold for a POSIX-origin target.
 *
 * Illegal (rejected by `validateGlob`, never silently repaired):
 *   - empty pattern; leading `/`; trailing `/`; empty segment (`a//b`);
 *   - a `..` segment or a backslash (Windows separators are not globs
 *     here; paths are normalised to `/` before matching, see
 *     `normalizeTargetPath`);
 *   - `**` embedded inside a segment (`src/**x`, `a**b`) or `***`;
 *   - unbalanced `[`, or a trailing `[` with no closing `]`;
 *   - leading/trailing whitespace (nothing is silently trimmed).
 *
 * Matching is segment-wise and recursive, so `**` can match zero
 * segments (`src/**` matches `src` itself) and `*` can never cross `/`.
 */

import { configError, type ConfigError } from "./errors.js";

/** Validate a glob pattern. Returns null when valid, else a reason. */
export function globErrorReason(pattern: unknown): string | null {
  if (typeof pattern !== "string") return "glob must be a string";
  if (pattern.length === 0) return "glob must not be empty";
  if (pattern !== pattern.trim()) {
    return "glob must not have leading or trailing whitespace";
  }
  if (pattern.startsWith("/")) return "glob must be relative (no leading '/')";
  if (pattern.endsWith("/")) return "glob must not end with '/'";
  if (pattern.includes("\\")) {
    return "glob must use '/' separators, not '\\'";
  }
  const segments = pattern.split("/");
  for (const segment of segments) {
    if (segment.length === 0) return "glob must not contain an empty segment";
    if (segment === "..") return "glob must not contain a '..' segment";
    if (segment === "**") continue;
    if (segment.includes("**")) {
      return "'**' must be a whole segment, not embedded in one";
    }
    const reason = validateSegmentGlob(segment);
    if (reason !== null) return reason;
  }
  return null;
}

function validateSegmentGlob(segment: string): string | null {
  let i = 0;
  while (i < segment.length) {
    const ch = segment[i] as string;
    if (ch === "[") {
      const close = scanCharClass(segment, i);
      if (close === -1) return "unbalanced '[' in glob segment";
      i = close + 1;
    } else {
      i += 1;
    }
  }
  return null;
}

/** Index of the closing `]` of the class starting at `open`, or -1. */
function scanCharClass(segment: string, open: number): number {
  let i = open + 1;
  // Optional negation.
  if (segment[i] === "!" || segment[i] === "^") i += 1;
  // A literal `]` may appear first.
  if (segment[i] === "]") i += 1;
  while (i < segment.length) {
    if (segment[i] === "]") return i;
    i += 1;
  }
  return -1;
}

/** Throw a ConfigError when `pattern` is not a valid glob. */
export function validateGlob(pattern: unknown, path: string): asserts pattern is string {
  const reason = globErrorReason(pattern);
  if (reason !== null) {
    throw configError("INVALID_GLOB", path, reason);
  }
}

/** True when `pattern` is a valid glob (no throw). */
export function isValidGlob(pattern: unknown): boolean {
  return globErrorReason(pattern) === null;
}

/**
 * Normalise a target path for matching: backslashes become `/`,
 * redundant `.` segments and duplicate separators collapse, a leading
 * `./` is dropped. The result is relative; an absolute or `..`-escaping
 * path returns null (callers must reject it, not match it).
 */
export function normalizeTargetPath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw !== raw.trim()) return null;
  const forward = raw.replace(/\\/g, "/");
  if (forward.startsWith("/")) return null;
  const out: string[] = [];
  for (const segment of forward.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  if (out.length === 0) return null;
  return out.join("/");
}

/** Match one path segment against one glob segment (`*`, `?`, `[...]`). */
function matchSegment(pattern: string, value: string): boolean {
  let p = 0;
  let v = 0;
  let starP = -1;
  let starV = 0;
  // Classic glob matcher with backtracking, extended with char classes.
  while (v < value.length) {
    if (p < pattern.length) {
      const pc = pattern[p] as string;
      if (pc === "*") {
        starP = p;
        starV = v;
        p += 1;
        continue;
      }
      if (pc === "?") {
        p += 1;
        v += 1;
        continue;
      }
      if (pc === "[") {
        const close = scanCharClass(pattern, p);
        if (close !== -1) {
          const matched = matchCharClass(pattern.slice(p + 1, close), value[v] as string);
          if (matched) {
            p = close + 1;
            v += 1;
            continue;
          }
        }
        // Unbalanced `[` or no match: fall through to star backtrack.
      } else if (pc === value[v]) {
        p += 1;
        v += 1;
        continue;
      }
    }
    if (starP !== -1) {
      p = starP + 1;
      starV += 1;
      v = starV;
      continue;
    }
    return false;
  }
  while (p < pattern.length && pattern[p] === "*") p += 1;
  return p === pattern.length;
}

function matchCharClass(body: string, ch: string): boolean {
  let negated = false;
  let i = 0;
  if (body[i] === "!" || body[i] === "^") {
    negated = true;
    i += 1;
  }
  let matched = false;
  // A leading `]` is a literal member.
  let first = true;
  while (i < body.length) {
    const c = body[i] as string;
    if (c === "]" && !first) break;
    first = false;
    if (i + 2 < body.length && body[i + 1] === "-" && body[i + 2] !== "]") {
      const lo = c;
      const hi = body[i + 2] as string;
      if (lo <= ch && ch <= hi) matched = true;
      i += 3;
    } else {
      if (c === ch) matched = true;
      i += 1;
    }
  }
  return negated ? !matched : matched;
}

function matchSegments(
  patternSegments: string[],
  valueSegments: string[],
): boolean {
  if (patternSegments.length === 0) return valueSegments.length === 0;
  const head = patternSegments[0] as string;
  if (head === "**") {
    // `**` matches zero or more segments.
    for (let skip = 0; skip <= valueSegments.length; skip += 1) {
      if (matchSegments(patternSegments.slice(1), valueSegments.slice(skip))) {
        return true;
      }
    }
    return false;
  }
  if (valueSegments.length === 0) return false;
  if (!matchSegment(head, valueSegments[0] as string)) return false;
  return matchSegments(patternSegments.slice(1), valueSegments.slice(1));
}

/** Options for `matchGlob`. */
export interface GlobMatchOptions {
  /**
   * Fold the pattern and the target with `toLowerCase` before
   * matching (Windows-origin targets: NTFS is case-insensitive).
   * Default false — POSIX matching stays case-sensitive.
   */
  caseInsensitive?: boolean;
}

/**
 * Match a normalised relative path against a glob pattern.
 * Throws ConfigError on an invalid pattern; callers should validate
 * config globs at load time so this is unreachable for loaded configs.
 * Returns false for an un-normalisable target path instead of matching.
 * Case-sensitive by default; pass `{ caseInsensitive: true }` for a
 * Windows-origin target (see the grammar note at the top of this file).
 */
export function matchGlob(
  pattern: string,
  targetPath: string,
  options: GlobMatchOptions = {},
): boolean {
  validateGlob(pattern, "applies_to");
  const normalised = normalizeTargetPath(targetPath);
  if (normalised === null) return false;
  const fold = options.caseInsensitive === true;
  const foldedPattern = fold ? pattern.toLowerCase() : pattern;
  const foldedTarget = fold ? normalised.toLowerCase() : normalised;
  return matchSegments(foldedPattern.split("/"), foldedTarget.split("/"));
}
