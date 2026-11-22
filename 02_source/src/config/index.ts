/**
 * Public entry point for the config module (T002).
 * T003+ import from here; internals stay behind these re-exports.
 */
export {
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
export { ConfigError, configError } from "./errors.js";
export {
  globErrorReason,
  isValidGlob,
  matchGlob,
  normalizeTargetPath,
  validateGlob,
  type GlobMatchOptions,
} from "./glob.js";
export { aggregateModes, parseConfig, parseConfigYaml } from "./parse.js";
