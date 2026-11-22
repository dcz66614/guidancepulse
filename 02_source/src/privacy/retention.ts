/**
 * Privacy retention — P025 GuidancePulse, T007.
 *
 * Implements PROJECT_BOOK §7.5 (`privacy export`, `privacy delete
 * --session <id>`, `privacy delete --all`):
 *
 *   - `exportEvents` / `exportEventsJson` return ONLY the §7.4
 *     allowlisted event fields already in the store. There is no
 *     raw-payload export path: the store never held the raw fields,
 *     so an export cannot leak them.
 *   - `deleteSessionData` deletes one session's rows and VACUUMs, so
 *     the bytes physically leave the file — a plain DELETE only frees
 *     SQLite pages, and a forensic scan could still find the data.
 *   - `deleteAllData` removes the database file (+ WAL/SHM sidecars)
 *     and the path key (zero-overwritten first). With the key gone,
 *     any surviving copy of the database still cannot be mapped back
 *     to paths.
 *   - `scanFileForCanaries` / `assertNoCanariesInFile` scan a real
 *     file's bytes for synthetic canary strings. T007's acceptance
 *     proof is a scan of the REAL SQLite file (T003 only scanned a
 *     simulated persistence); canaries are reported by label, never
 *     by value, so a failure line cannot itself leak a secret.
 *
 * All functions are local-only: file I/O and SQLite, no network.
 * The store must be CLOSED before `deleteAllData` unlinks its files.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { GuidancePulseEvent } from "../contracts/index.js";
import type { GuidancePulseStore } from "../store/store.js";
import { deletePathKey, resolvePathKeyPath } from "./path-id.js";

/** Error thrown for retention failures; carries only a code. */
export class RetentionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "RetentionError";
    this.code = code;
  }
}

/** One canary: a label (reported on failure) and the secret value. */
export interface Canary {
  label: string;
  value: string;
}

/** Export one session's (or all) events — allowlisted fields only. */
export function exportEvents(
  store: GuidancePulseStore,
  sessionScopeId?: string,
): GuidancePulseEvent[] {
  return store.listEvents(
    sessionScopeId === undefined ? {} : { sessionScopeId },
  );
}

/** Deterministic JSON export of `exportEvents` (2-space, LF). */
export function exportEventsJson(
  store: GuidancePulseStore,
  sessionScopeId?: string,
): string {
  return `${JSON.stringify(exportEvents(store, sessionScopeId), null, 2)}\n`;
}

/**
 * Delete one session's events and leases, then VACUUM so the bytes
 * leave the file. Returns the deleted row counts. The store stays
 * open and usable afterwards.
 */
export function deleteSessionData(
  store: GuidancePulseStore,
  sessionScopeId: string,
): { eventsDeleted: number; leasesDeleted: number } {
  const result = store.deleteSession(sessionScopeId);
  store.vacuum();
  return result;
}

/**
 * Delete everything: the database file, its -wal / -shm sidecars,
 * and the path key (zero-overwritten before unlink). The store MUST
 * be closed first — unlinking an open database is platform-dependent.
 * Returns the paths actually removed. Throws RetentionError
 * STORE_STILL_OPEN is impossible to detect reliably, so the
 * closed-first rule is a documented caller contract, not a check.
 */
export function deleteAllData(
  dbPath: string,
  keyDir: string,
  keyFilename?: string,
): { deletedFiles: string[] } {
  const deletedFiles: string[] = [];
  const keyPath = resolvePathKeyPath(keyDir, keyFilename);
  if (deletePathKey(keyDir, keyFilename)) deletedFiles.push(keyPath);
  for (const sidecar of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (secureDeleteFile(sidecar)) deletedFiles.push(sidecar);
  }
  return { deletedFiles };
}

/**
 * Overwrite a file with zeros, then unlink it. Returns true when a
 * file existed and was removed. Best effort on the overwrite: a
 * failure there still attempts the unlink. Used for the path key and
 * database files on full delete.
 */
export function secureDeleteFile(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const size = readFileSync(path).length;
    if (size > 0) writeFileSync(path, Buffer.alloc(size));
  } catch {
    // Best effort: zeroing must not block the unlink below.
  }
  try {
    unlinkSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new RetentionError("DELETE_FAILED", "file could not be deleted");
  }
}

/** Count occurrences of one canary's bytes in a file (overlapping allowed). */
export function countCanaryOccurrences(filePath: string, canary: string): number {
  const haystack = readFileSync(filePath);
  const needle = Buffer.from(canary, "utf8");
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + 1;
  }
}

/**
 * Scan a real file's bytes for every canary. Returns `{ label: count }`.
 * Throws RetentionError CANARY_FILE_MISSING when the file does not
 * exist. Counts are raw byte occurrences — 0 means the canary never
 * reached the file, even in a free page, a WAL frame, or an index.
 */
export function scanFileForCanaries(
  filePath: string,
  canaries: readonly Canary[],
): Record<string, number> {
  if (!existsSync(filePath)) {
    throw new RetentionError("CANARY_FILE_MISSING", "scan target file does not exist");
  }
  const out: Record<string, number> = {};
  for (const canary of canaries) {
    out[canary.label] = countCanaryOccurrences(filePath, canary.value);
  }
  return out;
}

/**
 * Assert a file contains none of the canaries. Throws RetentionError
 * CANARY_FOUND naming the offending LABELS (never the values) and
 * their counts, so the failure line cannot itself leak a secret.
 */
export function assertNoCanariesInFile(
  filePath: string,
  canaries: readonly Canary[],
): void {
  const counts = scanFileForCanaries(filePath, canaries);
  const found = Object.entries(counts).filter(([, count]) => count > 0);
  if (found.length > 0) {
    throw new RetentionError(
      "CANARY_FOUND",
      `canary leak in file: ${found.map(([label, count]) => `${label} x${count}`).join(", ")}`,
    );
  }
}
