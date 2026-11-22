/**
 * Public entry point for the privacy module (T003 + T007).
 * T004+ import from here; internals stay behind these re-exports.
 */
export {
  BANNED_FIELD_NAMES,
  SanitizeError,
  assertNoBannedKeys,
  computePathId,
  findBannedKeys,
  isAbsolutePath,
  isDriveRelativePath,
  isWindowsPath,
  normalizePathForId,
  redactForLog,
  resolveRelativeTargetPath,
  sanitizeHookInput,
  type SanitizedHookInput,
} from "./sanitize.js";
export {
  PATH_KEY_BYTES,
  PATH_KEY_FILENAME,
  PathKeyError,
  computePathIdForKey,
  deletePathKey,
  generatePathKey,
  loadOrCreatePathKey,
  loadPathKey,
  replacePathKeyFile,
  resolvePathKeyPath,
} from "./path-id.js";
export {
  RetentionError,
  assertNoCanariesInFile,
  countCanaryOccurrences,
  deleteAllData,
  deleteSessionData,
  exportEvents,
  exportEventsJson,
  scanFileForCanaries,
  secureDeleteFile,
  type Canary,
} from "./retention.js";
