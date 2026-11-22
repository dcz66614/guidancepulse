/**
 * Store errors — P025 GuidancePulse, T007.
 *
 * Privacy discipline (PROJECT_BOOK §7.4/§7.5, IMPLEMENTATION_PLAN §6
 * T007): any store failure is reported ONLY by an error code. The
 * `StoreError` message is `"<CODE>: <generic text>"` and never
 * contains raw Hook JSON, a Prompt, source code, an absolute path, or
 * a SQLite error string (bound-parameter SQL aside, SQLite messages
 * can echo file paths). Callers log `error.code` only. The underlying
 * SQLite error code (e.g. SQLITE_BUSY) is preserved in the mapped
 * `StoreError.code` so failures stay diagnosable without leaking
 * payloads.
 */

export class StoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "StoreError";
    this.code = code;
  }
}

/**
 * Map any thrown value to a store error code. A `StoreError` keeps its
 * own code; a better-sqlite3 error keeps its SQLite code family
 * (SQLITE_BUSY, SQLITE_CORRUPT, ...); anything else becomes
 * STORE_ERROR. Never returns a message containing payload data.
 */
export function toStoreErrorCode(error: unknown): string {
  if (error instanceof StoreError) return error.code;
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      switch (code) {
        case "SQLITE_BUSY":
        case "SQLITE_LOCKED":
          return "STORE_BUSY";
        case "SQLITE_CORRUPT":
        case "SQLITE_NOTADB":
          return "STORE_CORRUPT";
        case "SQLITE_READONLY":
          return "STORE_READONLY";
        case "SQLITE_FULL":
          return "STORE_FULL";
        case "SQLITE_IOERR":
          return "STORE_IO_ERROR";
        case "SQLITE_CANTOPEN":
          return "STORE_CANT_OPEN";
        default:
          if (code.startsWith("SQLITE_")) return "STORE_ERROR";
          return "STORE_ERROR";
      }
    }
  }
  return "STORE_ERROR";
}

/** Wrap a thrown value as a StoreError with a generic message. */
export function toStoreError(error: unknown, operation: string): StoreError {
  const code = toStoreErrorCode(error);
  return new StoreError(code, `store ${operation} failed`);
}
