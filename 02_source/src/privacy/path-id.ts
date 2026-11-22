/**
 * Path key management — P025 GuidancePulse, T007.
 *
 * A path identifier is `hmac:<sha256-hmac-hex>` over a normalised
 * path (T003 `computePathId`); the HMAC key is a local random secret
 * owned by THIS module. The key lives in exactly one file
 * (`path-key.bin`, PROJECT_BOOK §5.1 layout `.guidancepulse/
 * path-key.bin`, 32 raw bytes, mode 0600). No absolute path, Prompt,
 * or source code is ever stored — only HMACs computed with this key.
 *
 * Deleting the key file destroys the path mapping: without the key
 * the HMACs in the database cannot be reversed into paths (see
 * `deletePathKey` and the retention tests). The key is never logged
 * and never leaves this process except into its own file.
 *
 * Concurrency: two Hook subprocesses racing to create the key use an
 * exclusive create (`wx`); the loser re-reads the winner's file.
 * This module performs only local file I/O, no network.
 */

import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { computePathId } from "./sanitize.js";

/** Length of a path key in bytes (256-bit HMAC-SHA-256 key). */
export const PATH_KEY_BYTES = 32;

/** Default key file name inside the `.guidancepulse` directory. */
export const PATH_KEY_FILENAME = "path-key.bin";

/** Error thrown for key-file problems; carries only a code. */
export class PathKeyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "PathKeyError";
    this.code = code;
  }
}

/** Generate a fresh random path key (32 bytes). Never logged. */
export function generatePathKey(): Buffer {
  return randomBytes(PATH_KEY_BYTES);
}

/** Absolute path of the key file for a `.guidancepulse` directory. */
export function resolvePathKeyPath(dir: string, filename = PATH_KEY_FILENAME): string {
  return join(dir, filename);
}

/**
 * Read and validate a key file. Returns null when the file does not
 * exist. Throws PathKeyError INVALID_PATH_KEY when the file exists
 * but is not exactly 32 bytes (corrupt / foreign key file), and
 * PATH_KEY_UNREADABLE when it cannot be read. The key bytes are
 * never included in an error message.
 */
export function loadPathKey(dir: string, filename = PATH_KEY_FILENAME): Buffer | null {
  const path = resolvePathKeyPath(dir, filename);
  let raw: Buffer;
  try {
    raw = readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new PathKeyError("PATH_KEY_UNREADABLE", "path key file could not be read");
  }
  if (raw.length !== PATH_KEY_BYTES) {
    throw new PathKeyError(
      "INVALID_PATH_KEY",
      "path key file must contain exactly 32 bytes",
    );
  }
  return raw;
}

/**
 * Load the key, creating it (mode 0600, exclusive create) when
 * missing. Returns `{ key, created }`. Two processes racing the
 * create both end up with the same key: the loser re-reads the
 * winner's file instead of overwriting it.
 */
export function loadOrCreatePathKey(
  dir: string,
  filename = PATH_KEY_FILENAME,
): { key: Buffer; created: boolean } {
  mkdirSync(dir, { recursive: true });
  const existing = loadPathKey(dir, filename);
  if (existing !== null) return { key: existing, created: false };
  const path = resolvePathKeyPath(dir, filename);
  const key = generatePathKey();
  try {
    const fd = openSync(path, "wx", 0o600);
    try {
      writeFileSync(fd, key);
    } finally {
      closeSync(fd);
    }
    return { key, created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const winner = loadPathKey(dir, filename);
      if (winner !== null) return { key: winner, created: false };
    }
    throw new PathKeyError("PATH_KEY_UNWRITABLE", "path key file could not be created");
  }
}

/**
 * Opaque identifier for a path under an explicit key — thin wrapper
 * over T003 `computePathId` so callers do not need the sanitizer
 * import. Deterministic for (key, normalised path).
 */
export function computePathIdForKey(rawPath: unknown, key: Buffer): string {
  return computePathId(rawPath, key);
}

/**
 * Destroy the key file: overwrite its bytes with zeros, then unlink.
 * Returns true when a key file existed and was removed, false when
 * there was nothing to delete. After this, the HMAC path ids already
 * stored in the database cannot be mapped back to paths (the key is
 * the only pre-image); callers deleting the database too should use
 * `deleteAllData` in retention.ts.
 */
export function deletePathKey(dir: string, filename = PATH_KEY_FILENAME): boolean {
  const path = resolvePathKeyPath(dir, filename);
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
    throw new PathKeyError("PATH_KEY_UNDELETABLE", "path key file could not be deleted");
  }
}

/** Re-exported for callers that need an atomic key-file replace. */
export function replacePathKeyFile(dir: string, tmpPath: string, filename = PATH_KEY_FILENAME): void {
  renameSync(tmpPath, resolvePathKeyPath(dir, filename));
}
