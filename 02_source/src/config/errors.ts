/**
 * Structured configuration error. `path` is a dotted/YAML-style location
 * (e.g. "rules[1].applies_to[0]") so a rejected config can be fixed
 * without guessing which field failed. `code` is stable for tests.
 */
export class ConfigError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${path}: ${message} [${code}]`);
    this.name = "ConfigError";
    this.code = code;
    this.path = path;
  }
}

export function configError(
  code: string,
  path: string,
  message: string,
): ConfigError {
  return new ConfigError(code, path, message);
}
