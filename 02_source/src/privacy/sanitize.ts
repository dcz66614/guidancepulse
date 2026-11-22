/**
 * Privacy sanitizer — P025 GuidancePulse, T003.
 *
 * Two jobs, both allowlist-based (never denylist-based):
 *
 *   1. `sanitizeHookInput` — extract ONLY the fields the adapter needs
 *      from raw Hook JSON. Everything else (tool_response bodies,
 *      transcript_path, Prompt, content, environment variables, and any
 *      unknown field) is dropped in memory and can never reach an event.
 *   2. `computePathId` — turn a path into an opaque `hmac:<hex>`
 *      identifier (SHA-256 HMAC with the local path key). Raw paths —
 *      including absolute cwds — never appear in an event.
 *
 * `findBannedKeys` / `assertNoBannedKeys` let tests (and T007/T012)
 * prove that a persisted value contains no sensitive field name, and
 * `redactForLog` produces a log-safe deep copy of arbitrary values.
 *
 * This module performs no I/O and no network access. The path key is
 * injected by the caller (generated and owned by T007); this module
 * never reads it from disk.
 */

import { createHmac } from "node:crypto";
import { normalizeTargetPath } from "../config/index.js";

/**
 * Field names that must never appear in a persisted event, a report, or
 * a log line. Checked by `findBannedKeys` against keys (not values):
 * a canary planted under any of these names is caught even if the
 * value itself is innocuous.
 */
export const BANNED_FIELD_NAMES: readonly string[] = [
  "transcript_path",
  "transcript",
  "tool_response",
  "tool_input",
  "prompt",
  "user_prompt",
  "system_prompt",
  "content",
  "file_content",
  "file_contents",
  "file_path",
  "cwd",
  "old_cwd",
  "oldcwd",
  "new_cwd",
  "newcwd",
  "env",
  "environment",
  "api_key",
  "apikey",
  "token",
  "access_token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "session_key",
  "private_key",
  "model_response",
  "thinking",
  "hook_input",
];

const BANNED_SET: ReadonlySet<string> = new Set(
  BANNED_FIELD_NAMES.map((name) => name.toLowerCase()),
);

/** Error thrown when sanitization cannot produce a safe value. */
export class SanitizeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "SanitizeError";
    this.code = code;
  }
}

/**
 * True when `value` (after backslash→`/` conversion) is an absolute
 * path in any spelling Hook input can carry: POSIX (`/...`), Windows
 * drive-letter (`C:/...`, either slash, either drive-letter case),
 * or UNC (`//server/share/...`). A drive-relative spelling (`C:foo`,
 * no slash) is NOT absolute — it is treated as a relative path.
 */
export function isAbsolutePath(value: string): boolean {
  const forward = value.replace(/\\/g, "/");
  return forward.startsWith("/") || /^[A-Za-z]:\//.test(forward);
}

/**
 * Uppercase a leading Windows drive letter (`c:/...` -> `C:/...`);
 * no-op for every other spelling. Windows drive letters are
 * case-insensitive, so both spellings must normalise identically
 * (path ids, cwd comparison, cwd-prefix stripping).
 */
function canonicalizeDriveLetter(forward: string): string {
  return forward.replace(/^[a-z]:\//, (match) => match.toUpperCase());
}

/**
 * True when `value` (after backslash→`/` conversion) is a Windows
 * spelling: a drive-letter path (`C:/...`, `C:foo`, bare `C:` —
 * either slash, either drive-letter case) or a UNC path
 * (`//server/share/...`). POSIX paths — including a leading single
 * `/` — are never Windows. Used to decide where case folding
 * applies: NTFS is case-insensitive, POSIX filesystems are not.
 */
export function isWindowsPath(value: string): boolean {
  if (typeof value !== "string") return false;
  const forward = value.replace(/\\/g, "/");
  return /^[A-Za-z]:/.test(forward) || forward.startsWith("//");
}

/**
 * True when `value` is a drive-relative Windows spelling: a drive
 * letter and colon NOT followed by a slash (`C:foo`,
 * `C:src/session/token.ts`, bare `C:`). Windows resolves it against
 * the current directory of that drive, which the gate cannot know —
 * it must fail closed, never be treated as a project-relative path.
 */
export function isDriveRelativePath(value: string): boolean {
  if (typeof value !== "string") return false;
  const forward = value.replace(/\\/g, "/");
  return /^[A-Za-z]:($|[^/])/.test(forward);
}

/**
 * True when `value` is a drive-rooted Windows spelling: a leading
 * `/` or `\` with no drive letter and not UNC (`/x/...`,
 * `\x\...`). On Windows this is a path rooted at the current
 * drive's root — it is NOT a POSIX absolute path, even though it
 * looks like one. A POSIX cwd must never treat it as Windows
 * (see `resolveRelativeTargetPath`, FIX-R6 R6-P2-02).
 */
export function isDriveRootedPath(value: string): boolean {
  if (typeof value !== "string") return false;
  const forward = value.replace(/\\/g, "/");
  return forward.startsWith("/") && !forward.startsWith("//");
}

/** Leading Windows drive letter of `value` (`C:`), or null. */
function driveLetterOf(value: string): string | null {
  const forward = value.replace(/\\/g, "/");
  const match = /^[A-Za-z]:/.exec(forward);
  return match === null ? null : match[0].toUpperCase();
}

/**
 * Strip trailing spaces and periods from one Windows path segment
 * (FIX-R6, R6-P2-01). Win32 does not allow a file or directory name
 * to end with a space or a period: when a DOS path is converted to
 * an NT path, each component's trailing spaces and periods are
 * stripped, so `session.`, `session ` and `session` are the same
 * directory. Node's `path.win32.resolve` does NOT do this, so the
 * gate must model it itself. Only for Windows-origin paths: on
 * POSIX a trailing dot or space is a legal, significant part of a
 * name.
 */
function stripWindowsTrailingDotsAndSpaces(segment: string): string {
  return segment.replace(/[ .]+$/, "");
}

/**
 * Normalise a relative target under a Windows cwd (FIX-R6,
 * R6-P2-01): the same segment rules as `normalizeTargetPath`
 * (backslashes, duplicate separators, `.` collapse, `..` resolves
 * lexically, escaping `..` returns null), plus Win32
 * trailing-dot/space stripping per segment — with the same
 * guards as `normalizedSegments` (an exact `.` / `..` keeps its
 * meaning; a segment that strips to empty collapses like `.`).
 * Returns null for a non-string, empty, or whitespace-only value,
 * or when the path escapes the project root — the same contract
 * as `normalizeTargetPath`.
 */
function normalizeWindowsRelativeTarget(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw !== raw.trim()) return null;
  const forward = raw.replace(/\\/g, "/");
  if (forward.startsWith("/")) return null;
  const out: string[] = [];
  for (const rawSegment of forward.split("/")) {
    // Exact `.` / `..` keep their meaning (see
    // `normalizedSegments`: stripping `..` would erase it).
    const segment =
      rawSegment === "." || rawSegment === ".."
        ? rawSegment
        : stripWindowsTrailingDotsAndSpaces(rawSegment);
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

/**
 * Normalise a path to its segments: backslashes become `/`,
 * duplicate separators and `.` segments collapse, `..` segments
 * resolve lexically (a leading `..` that would escape the root is
 * kept, so two different spellings of the same location still
 * collide only when they are lexically identical after resolution).
 * A Windows drive prefix (`C:/...`) is a root like `/` so `..`
 * never pops it (`C:/../x` is `C:/x`, not `x`); a UNC root
 * (`//server/share/...`) collapses to a single leading `/`.
 * With `foldWindowsCase`, Windows spellings (drive-letter / UNC,
 * see `isWindowsPath`) are case-folded — drive letter kept
 * upper-case, every other segment lower-cased — so two spellings
 * of one NTFS path normalise identically; POSIX spellings are
 * never folded. Windows spellings additionally have each
 * segment's trailing spaces and periods stripped (FIX-R6,
 * R6-P2-01: Win32 strips them, so `session.` is `session`) —
 * except that an exact `.` or `..` segment keeps its meaning
 * (stripping must never erase `..` into nothing) and a segment
 * that strips to empty (all dots/spaces, e.g. `...`, `.. `)
 * collapses like `.`, which is the fail-closed reading: it can
 * only over-deny, never mis-allow.
 * Returns null for a non-string, empty, or whitespace-only value.
 */
function normalizedSegments(
  raw: string,
  foldWindowsCase: boolean,
): { segments: string[]; absolute: boolean } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const forward = canonicalizeDriveLetter(trimmed.replace(/\\/g, "/"));
  const absolute = forward.startsWith("/");
  const windows = isWindowsPath(forward);
  // A Windows drive prefix (`C:/...`) is a root like `/`: `..` never
  // pops it. `floor` is the number of leading segments that can
  // never be popped (1 for a drive prefix, 0 otherwise).
  const floor = /^[A-Z]:\//.test(forward) ? 1 : 0;
  const out: string[] = [];
  for (const rawSegment of forward.split("/")) {
    // Exact `.` / `..` segments keep their meaning: stripping
    // them would turn `..` into `` (both dots are "trailing"),
    // which would silently drop a parent step. Every other
    // segment has its trailing spaces and periods stripped.
    const segment =
      rawSegment === "." || rawSegment === ".."
        ? rawSegment
        : windows
          ? stripWindowsTrailingDotsAndSpaces(rawSegment)
          : rawSegment;
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length > floor && out[out.length - 1] !== "..") {
        out.pop();
      } else if (!absolute && floor === 0) {
        out.push("..");
      }
      continue;
    }
    out.push(segment);
  }
  if (foldWindowsCase && windows) {
    return {
      segments: out.map((segment) =>
        /^[A-Za-z]:/.test(segment)
          ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
          : segment.toLowerCase(),
      ),
      absolute,
    };
  }
  return { segments: out, absolute };
}

function segmentsToPath(normalised: { segments: string[]; absolute: boolean }): string | null {
  const joined = normalised.segments.join("/");
  if (joined.length === 0) return normalised.absolute ? "/" : null;
  return normalised.absolute ? `/${joined}` : joined;
}

/**
 * Normalise a path for HMAC identification: backslashes become `/`,
 * duplicate separators and `.` segments collapse, `..` segments resolve
 * lexically (a leading `..` that would escape the root is kept, so two
 * different spellings of the same location still collide only when
 * they are lexically identical after resolution). Unlike
 * `normalizeTargetPath` (config glob matching), absolute paths are
 * allowed here — a cwd IS absolute and must still get a stable id.
 * Windows spellings are canonicalised and case-folded (FIX-R5):
 * a leading drive letter is upper-cased and every other segment
 * lower-cased, so `C:\SYNTHETIC\Project\A.ts` and
 * `c:/synthetic/project/a.ts` share one id (NTFS is
 * case-insensitive); a drive prefix (`C:/...`) is a root like `/`
 * so `..` never pops it (`C:/../x` is `C:/x`, not `x`), and a UNC
 * root (`//server/share/...`) collapses to a single leading `/`
 * (`/server/share/...`) and folds case the same way. Each
 * Windows segment's trailing spaces and periods are also stripped
 * (FIX-R6: Win32 strips them, so `session.` shares the id of
 * `session`).
 * POSIX spellings are NOT folded: `/Tmp/X.ts` and `/tmp/x.ts` are
 * different files and keep different ids, as do two relative
 * spellings that differ only by case (`Src/Auth` vs `src/auth`).
 * Returns null for a non-string, empty, or whitespace-only value.
 */
export function normalizePathForId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalised = normalizedSegments(raw, true);
  if (normalised === null) return null;
  return segmentsToPath(normalised);
}

/**
 * Resolve an already-sanitised tool target to a project-relative
 * normalised path (FIX-R3: Windows absolute paths; FIX-R5: Windows
 * case variants + drive-relative fail-closed; FIX-R6: Windows
 * trailing-dot/space segments + drive-rooted spellings). Absolute targets
 * — POSIX (`/...`), Windows drive-letter (`C:/...`, either slash,
 * either drive-letter case), UNC (`//server/share/...`) — are
 * canonicalised with `normalizePathForId` and matched against the
 * likewise canonicalised cwd; a target equal to the cwd itself (the
 * project dir, not a file) is null. The prefix comparison is
 * case-insensitive for Windows spellings (both sides are folded by
 * `normalizePathForId`) and case-sensitive for POSIX spellings, and
 * it is segment-wise, so a cwd that is a string prefix of another
 * directory never matches. Targets outside the cwd return null —
 * no relative `applies_to` glob can match them. Relative targets
 * pass through `normalizeTargetPath` unchanged — except under a
 * Windows cwd, where each segment's trailing spaces and periods
 * are stripped first (FIX-R6, R6-P2-01: Win32 strips them, so a
 * relative `src\session.\token.ts` is `src/session/token.ts`).
 * A drive-rooted spelling (`/x/...` or `\x\...`, no drive letter)
 * under a Windows cwd is resolved against the cwd's drive first
 * (FIX-R6, R6-P2-02: Win32 reads it as rooted at the current
 * drive's root, so `/synthetic/...` under `C:\synthetic\project`
 * is `C:\synthetic\...`); under a POSIX cwd it stays a POSIX
 * absolute path. Returns null for a null target (callers that
 * must fail closed on a missing file_path throw themselves).
 * Throws SanitizeError `DRIVE_RELATIVE_PATH` for a drive-relative
 * spelling (`C:foo`, no slash): Windows resolves it against the
 * drive's current directory, which the gate cannot know, so it
 * must fail closed — callers turn the throw into DENY exactly
 * like a missing file_path, never into an ignored project-relative
 * path. Throws SanitizeError `DRIVE_ROOTED_PATH` for a
 * drive-rooted spelling under a UNC cwd, which has no drive
 * letter to resolve it against (same fail-closed rationale).
 */
export function resolveRelativeTargetPath(
  toolFilePath: string | null,
  cwd: string,
): string | null {
  if (toolFilePath === null) return null;
  if (isDriveRelativePath(toolFilePath)) {
    throw new SanitizeError(
      "DRIVE_RELATIVE_PATH",
      "drive-relative Windows path cannot be resolved against the project cwd",
    );
  }
  // FIX-R6 (R6-P2-02): a drive-rooted spelling under a Windows cwd
  // is rooted at the cwd drive's root. Resolve it against that
  // drive before the prefix comparison; a UNC cwd has no drive
  // letter, so the spelling cannot be located and fails closed.
  // A POSIX cwd never takes this branch: a leading `/` there is a
  // POSIX absolute path, resolved by the ordinary prefix comparison.
  let target = toolFilePath;
  if (isDriveRootedPath(target) && isWindowsPath(cwd)) {
    const drive = driveLetterOf(cwd);
    if (drive === null) {
      throw new SanitizeError(
        "DRIVE_ROOTED_PATH",
        "drive-rooted Windows path cannot be resolved against a UNC cwd (no drive letter)",
      );
    }
    target = `${drive}${target}`;
  }
  if (!isAbsolutePath(target)) {
    if (isWindowsPath(cwd)) return normalizeWindowsRelativeTarget(target);
    return normalizeTargetPath(target);
  }
  const fileFolded = normalizedSegments(target, true);
  const cwdFolded = normalizedSegments(cwd, true);
  if (fileFolded === null || cwdFolded === null) return null;
  if (fileFolded.absolute !== cwdFolded.absolute) return null;
  const fileSegments = fileFolded.segments;
  const cwdSegments = cwdFolded.segments;
  // The target must be strictly under the cwd (equal length means
  // the target IS the project dir, not a file).
  if (fileSegments.length <= cwdSegments.length) return null;
  for (let i = 0; i < cwdSegments.length; i += 1) {
    if (fileSegments[i] !== cwdSegments[i]) return null;
  }
  // Return the target's own spelling (case preserved): the folded
  // form is only for comparison. In particular a guidance source
  // such as `CLAUDE.md` still matches a Windows Read of
  // `C:\...\CLAUDE.md`, and the glob layer (not this function)
  // decides case-insensitivity for the relative path.
  const filePreserved = normalizedSegments(target, false);
  if (filePreserved === null) return null;
  const relative = filePreserved.segments.slice(cwdSegments.length).join("/");
  return relative.length === 0 ? null : relative;
}

/**
 * Opaque identifier for a path: `hmac:<sha256-hmac-hex>`.
 * Deterministic for (key, normalised path); different paths or keys
 * give different ids (up to HMAC collision resistance). The raw path
 * is unrecoverable from the id without the key.
 */
export function computePathId(
  rawPath: unknown,
  key: string | Uint8Array,
): string {
  const normalised = normalizePathForId(rawPath);
  if (normalised === null) {
    throw new SanitizeError("INVALID_PATH", "path must be a non-empty string");
  }
  if (
    (typeof key === "string" && key.length === 0) ||
    (key instanceof Uint8Array && key.length === 0)
  ) {
    throw new SanitizeError("EMPTY_PATH_KEY", "a non-empty path key is required");
  }
  const hex = createHmac("sha256", key).update(normalised, "utf8").digest("hex");
  return `hmac:${hex}`;
}

/**
 * The only Hook fields the adapter is allowed to see. Every field is
 * either a scope identifier, a timestamp-free routing value, a
 * normalised relative path, or a single success boolean. In particular:
 *   - `tool_response` is reduced to `toolSuccess: boolean | null`
 *     (null = no tool_response present); its body is dropped.
 *   - `transcript_path`, Prompt, `content`, environment variables and
 *     every unknown field are dropped, not copied.
 *   - `loadedPaths` keeps normalised RELATIVE paths only; absolute
 *     entries are dropped (a guidance source is a relative path).
 *   - `cwd` is kept here because the adapter needs it to resolve
 *     relative paths — it is in-memory only and must never be copied
 *     into an event (see `findBannedKeys`, which flags "cwd").
 *   - `oldCwd` / `newCwd` (CwdChanged only) are likewise in-memory
 *     only: the adapter HMACs them immediately into `oldPathId` /
 *     `newPathId` and never copies the raw values anywhere.
 */
export interface SanitizedHookInput {
  hookEventName: string;
  sessionId: string;
  cwd: string;
  oldCwd: string | null;
  newCwd: string | null;
  toolName: string | null;
  /**
   * Tool-input file path, or null when absent. Absolute paths are
   * kept absolute (POSIX `/...`, Windows drive-letter `C:/...` with
   * an upper-case drive, UNC `//server/...`); relative paths are
   * normalised. The adapter resolves absolute paths against cwd.
   */
  toolFilePath: string | null;
  /** Success flag from tool_response, or null when not determinable. */
  toolSuccess: boolean | null;
  /** PreCompact trigger ("manual"/"auto"/...), or null. */
  trigger: string | null;
  /** Reason string (SessionStart source / SessionEnd reason / InstructionsLoaded reason), or null. */
  reason: string | null;
  /** Agent id for SubagentStart, or null. */
  agentId: string | null;
  /** Agent type for SubagentStart, or null. */
  agentType: string | null;
  /** Normalised relative loaded paths (InstructionsLoaded), or null. */
  loadedPaths: string[] | null;
}

/**
 * Allowlist-extract a raw Hook JSON value. Throws SanitizeError on a
 * malformed envelope (not an object, missing/empty hook_event_name,
 * session_id, or cwd). Unknown event names are NOT rejected here —
 * the adapter decides whether to ignore them; the sanitizer's job is
 * only to make sure nothing sensitive survives, whatever the event.
 */
export function sanitizeHookInput(input: unknown): SanitizedHookInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SanitizeError("NOT_AN_OBJECT", "hook input must be a JSON object");
  }
  const record = input as Record<string, unknown>;

  const hookEventName = readNonEmptyString(record["hook_event_name"], "hook_event_name");
  if (hookEventName === null) {
    throw new SanitizeError("MISSING_EVENT_NAME", "hook_event_name is required");
  }
  const sessionId = readNonEmptyString(record["session_id"], "session_id");
  if (sessionId === null) {
    throw new SanitizeError("MISSING_SESSION_ID", "session_id is required");
  }
  const cwd = readNonEmptyString(record["cwd"], "cwd");
  if (cwd === null) {
    throw new SanitizeError("MISSING_CWD", "cwd is required");
  }

  const toolName = readNonEmptyString(record["tool_name"], "tool_name");
  const toolFilePath = readToolFilePath(record["tool_input"]);
  const toolSuccess = readToolSuccess(record["tool_response"]);
  const trigger = readNonEmptyString(record["trigger"], "trigger");
  const reason = readNonEmptyString(record["reason"], "reason");
  // SessionStart carries its startup source under `source`, not `reason`.
  const source = readNonEmptyString(record["source"], "source");
  const agentId = readNonEmptyString(record["agent_id"], "agent_id");
  const agentType = readNonEmptyString(record["agent_type"], "agent_type");
  const loadedPaths = readLoadedPaths(record["loaded_paths"]);
  const oldCwd = readNonEmptyString(record["old_cwd"], "old_cwd");
  const newCwd = readNonEmptyString(record["new_cwd"], "new_cwd");

  return {
    hookEventName,
    sessionId,
    cwd,
    oldCwd,
    newCwd,
    toolName,
    toolFilePath,
    toolSuccess,
    trigger,
    reason: reason ?? source,
    agentId,
    agentType,
    loadedPaths,
  };
}

function readNonEmptyString(value: unknown, _field: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : value;
}

/** Extract only `tool_input.file_path`, normalised relative; else null. */
function readToolFilePath(toolInput: unknown): string | null {
  if (typeof toolInput !== "object" || toolInput === null || Array.isArray(toolInput)) {
    return null;
  }
  const filePath = (toolInput as Record<string, unknown>)["file_path"];
  if (typeof filePath !== "string" || filePath.length === 0) return null;
  // Absolute paths are kept absolute here; the adapter resolves them
  // against cwd. Relative paths are normalised via the config helper.
  // Absolute means POSIX (`/...`), Windows drive-letter (`C:/...`,
  // either slash, either drive-letter case), or UNC (`//server/...`).
  // A drive-letter path is returned with an upper-case drive so the
  // adapter's cwd-prefix comparison is spelling-independent.
  // (FIX-R3: a drive-letter path used to fall through to
  // `normalizeTargetPath`, which kept it as the bogus "relative"
  // path `C:/...` that could never match a rule glob.)
  const forward = filePath.replace(/\\/g, "/");
  if (isAbsolutePath(forward)) return canonicalizeDriveLetter(forward);
  return normalizeTargetPath(filePath);
}

/**
 * Reduce tool_response to a single boolean. Accepted shapes (per the
 * official Hooks reference and the T001 probe payloads):
 *   - `{ success: true/false }` -> that boolean
 *   - `{ is_error: true/false }` -> `!is_error`
 *   - a bare boolean -> itself
 * Anything else (strings, numbers, objects without either flag) -> null
 * ("not determinable"), never the body.
 */
function readToolSuccess(toolResponse: unknown): boolean | null {
  if (typeof toolResponse === "boolean") return toolResponse;
  if (typeof toolResponse === "object" && toolResponse !== null && !Array.isArray(toolResponse)) {
    const record = toolResponse as Record<string, unknown>;
    if (typeof record["success"] === "boolean") return record["success"];
    if (typeof record["is_error"] === "boolean") return !record["is_error"];
  }
  return null;
}

/** Keep normalised relative loaded paths; drop absolute/empty entries. */
function readLoadedPaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const forward = entry.replace(/\\/g, "/");
    // Absolute entries are dropped in every spelling (POSIX `/...`,
    // Windows drive-letter `C:/...`, UNC `//server/...`): a guidance
    // source is a relative path. (FIX-R3: a drive-letter entry used
    // to slip through this check and survive as the bogus "relative"
    // path `C:/...`, which could never match a rule source.)
    if (isAbsolutePath(forward)) continue;
    const normalised = normalizeTargetPath(entry);
    if (normalised !== null) out.push(normalised);
  }
  return out;
}

/**
 * Recursively collect the banned field names present anywhere in a
 * value (object keys, case-insensitive). An empty result means the
 * value carries no sensitive field NAME. (Values are checked
 * separately by canary tests — a canary smuggled under an innocent
 * key name would not be caught by key scanning, which is why the
 * adapter only ever builds events from allowlisted fields.)
 */
export function findBannedKeys(value: unknown, seen = new Set<object>()): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (BANNED_SET.has(key.toLowerCase())) found.push(key);
      visit(child);
    }
  };
  visit(value);
  return [...new Set(found)];
}

/** Throw SanitizeError listing any banned field names in `value`. */
export function assertNoBannedKeys(value: unknown, what: string): void {
  const banned = findBannedKeys(value);
  if (banned.length > 0) {
    throw new SanitizeError(
      "BANNED_FIELD_PRESENT",
      `${what} contains banned field(s): ${banned.join(", ")}`,
    );
  }
}

/**
 * Deep-copy a value for logging with every banned field's value
 * replaced by "[REDACTED]" and every other value preserved. Cyclic
 * structures are replaced by "[CIRCULAR]". Use for any diagnostic
 * output that might otherwise echo raw Hook JSON.
 *
 * Known limit: only values under KNOWN banned keys are redacted. A
 * sensitive value under an unknown future field name survives
 * redaction — the privacy guarantee rests on the allowlist
 * `sanitizeHookInput`, and raw Hook JSON must never be logged even
 * through this helper unless its shape is known. Do not use this to
 * make arbitrary unknown input "safe"; use it only for diagnostics
 * of known Hook shapes.
 */
export function redactForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = BANNED_SET.has(key.toLowerCase())
      ? "[REDACTED]"
      : redactForLog(child, seen);
  }
  return out;
}
