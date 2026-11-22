/**
 * Privacy tests — P025 GuidancePulse, T007 (`npm run test:privacy`).
 *
 * Covers: path-key generation / load-or-create / corruption /
 * deletion, HMAC determinism and key-dependence, privacy export
 * (allowlisted fields only), session delete + VACUUM (bytes leave
 * the file), delete-all (database + key), and — the T007 acceptance
 * proof — a REAL SQLite file canary scan: synthetic Prompt / source
 * code / absolute path / fake API key fed through the T003 sanitizer
 * into the real store must occur 0 times in the real `.sqlite` file
 * bytes. (T003 only scanned a simulated persistence.)
 *
 * Every canary is synthetic and labelled; failure lines report the
 * label, never the value.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GuidancePulseEvent } from "../../src/contracts/index.js";
import { sanitizeHookInput } from "../../src/privacy/sanitize.js";
import {
  PATH_KEY_BYTES,
  PathKeyError,
  RetentionError,
  assertNoCanariesInFile,
  computePathIdForKey,
  deleteAllData,
  deletePathKey,
  deleteSessionData,
  exportEventsJson,
  generatePathKey,
  loadOrCreatePathKey,
  loadPathKey,
  resolvePathKeyPath,
  scanFileForCanaries,
} from "../../src/privacy/index.js";
import { GuidancePulseStore } from "../../src/store/index.js";

// --- Synthetic canaries. Never real user data. -------------------------
const CANARY_PROMPT = "CANARY-PROMPT-9F27X-SYNTHETIC-DO-NOT-USE";
const CANARY_SOURCE = "CANARY-SOURCE-9F27X function syntheticSecret() { return 42; }";
const CANARY_CWD = "/synthetic-canary-home/secret-project";
const CANARY_API_KEY = "sk-synthetic-canary-9F27X-abcdef";
const CANARY_TRANSCRIPT = "/synthetic-canary-home/transcript-9F27X.jsonl";

const SESSION = "synthetic-session-privacy-001";
const AGENT = "main";
const GUIDANCE = "synthetic-guidance-privacy";
const TS = "2026-11-15T10:14:03Z";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gp-t007-privacy-"));
  dbPath = join(dir, "state.sqlite");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("path key", () => {
  it("generates 32 random bytes, unique every time", () => {
    const a = generatePathKey();
    const b = generatePathKey();
    expect(a.length).toBe(PATH_KEY_BYTES);
    expect(b.length).toBe(PATH_KEY_BYTES);
    expect(a.equals(b)).toBe(false);
  });

  it("loadOrCreate creates a 0600 key file, then reloads the same key", () => {
    const first = loadOrCreatePathKey(dir);
    expect(first.created).toBe(true);
    expect(first.key.length).toBe(PATH_KEY_BYTES);
    const keyPath = resolvePathKeyPath(dir);
    expect(existsSync(keyPath)).toBe(true);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    const second = loadOrCreatePathKey(dir);
    expect(second.created).toBe(false);
    expect(second.key.equals(first.key)).toBe(true);
    expect(loadPathKey(dir)?.equals(first.key)).toBe(true);
  });

  it("rejects a corrupt key file (wrong length) with a code only", () => {
    writeFileSync(resolvePathKeyPath(dir), Buffer.from("too-short"));
    let caught: unknown;
    try {
      loadPathKey(dir);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PathKeyError);
    expect((caught as PathKeyError).code).toBe("INVALID_PATH_KEY");
    expect((caught as Error).message).not.toContain("too-short");
  });

  it("returns null when no key file exists", () => {
    expect(loadPathKey(dir)).toBeNull();
  });

  it("deleting the key removes the file; a new key maps paths differently", () => {
    const { key: oldKey } = loadOrCreatePathKey(dir);
    const oldId = computePathIdForKey("src/auth/login.ts", oldKey);
    expect(deletePathKey(dir)).toBe(true);
    expect(existsSync(resolvePathKeyPath(dir))).toBe(false);
    expect(deletePathKey(dir)).toBe(false);
    const { key: newKey } = loadOrCreatePathKey(dir);
    expect(newKey.equals(oldKey)).toBe(false);
    // The old mapping is unrecoverable: the new key yields another id,
    // and the old key bytes no longer exist anywhere on disk.
    expect(computePathIdForKey("src/auth/login.ts", newKey)).not.toBe(oldId);
  });
});

describe("path HMAC", () => {
  it("is deterministic for (key, path) and matches T003 computePathId", async () => {
    const { computePathId } = await import("../../src/privacy/sanitize.js");
    const key = generatePathKey();
    const a = computePathIdForKey("src/auth/login.ts", key);
    const b = computePathIdForKey("src/auth/login.ts", key);
    expect(a).toBe(b);
    expect(a).toBe(computePathId("src/auth/login.ts", key));
    expect(a).toMatch(/^hmac:[0-9a-f]{64}$/);
    expect(a).not.toContain("src/auth/login.ts");
  });

  it("different keys and different paths give different ids", () => {
    const keyA = generatePathKey();
    const keyB = generatePathKey();
    const idA = computePathIdForKey("src/auth/login.ts", keyA);
    expect(computePathIdForKey("src/auth/login.ts", keyB)).not.toBe(idA);
    expect(computePathIdForKey("src/auth/other.ts", keyA)).not.toBe(idA);
  });

  it("normalises spellings of the same path to the same id", () => {
    const key = generatePathKey();
    expect(computePathIdForKey("src//auth/./login.ts", key)).toBe(
      computePathIdForKey("src/auth/login.ts", key),
    );
  });
});

describe("privacy export", () => {
  it("exports only allowlisted event fields, never raw paths or content", () => {
    const { key } = loadOrCreatePathKey(dir);
    const store = GuidancePulseStore.open(dbPath);
    try {
      const cwdId = computePathIdForKey(CANARY_CWD, key);
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          guidanceId: GUIDANCE,
          pathId: computePathIdForKey("CLAUDE.md", key),
          timestampUtc: TS,
        },
        { phaseId: "implementation", cwdPathId: cwdId, maxSuccessfulEdits: 5 },
      );
      const parsed = JSON.parse(exportEventsJson(store)) as Record<string, unknown>[];
      expect(parsed).toHaveLength(1);
      expect(Object.keys(parsed[0]).sort()).toEqual([
        "agentScopeId",
        "guidanceId",
        "pathId",
        "sessionScopeId",
        "timestampUtc",
        "type",
      ]);
      const text = JSON.stringify(parsed);
      expect(text).not.toContain(CANARY_CWD);
      expect(text).not.toContain("CLAUDE.md");
      expect(text).not.toContain(CANARY_PROMPT);
    } finally {
      store.close();
    }
  });
});

describe("session delete", () => {
  it("deleteSessionData + VACUUM removes the session id bytes from the file", () => {
    const { key } = loadOrCreatePathKey(dir);
    const store = GuidancePulseStore.open(dbPath);
    try {
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          guidanceId: GUIDANCE,
          pathId: computePathIdForKey("CLAUDE.md", key),
          timestampUtc: TS,
        },
        {
          phaseId: "implementation",
          cwdPathId: computePathIdForKey(CANARY_CWD, key),
          maxSuccessfulEdits: 5,
        },
      );
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: "synthetic-session-privacy-002",
          agentScopeId: AGENT,
          guidanceId: GUIDANCE,
          pathId: computePathIdForKey("CLAUDE.md", key),
          timestampUtc: TS,
        },
        {
          phaseId: "implementation",
          cwdPathId: computePathIdForKey(CANARY_CWD, key),
          maxSuccessfulEdits: 5,
        },
      );
      const result = deleteSessionData(store, SESSION);
      expect(result).toEqual({ eventsDeleted: 1, leasesDeleted: 1 });
      expect(store.getLease(SESSION, AGENT, GUIDANCE)).toBeUndefined();
      expect(store.getLease("synthetic-session-privacy-002", AGENT, GUIDANCE)?.state).toBe("FRESH");
      store.checkpoint();
    } finally {
      store.close();
    }
    // After VACUUM the deleted session id occurs 0 times in the file.
    const counts = scanFileForCanaries(dbPath, [
      { label: "deleted-session-id", value: SESSION },
      { label: "kept-session-id", value: "synthetic-session-privacy-002" },
    ]);
    expect(counts["deleted-session-id"]).toBe(0);
    expect(counts["kept-session-id"]).toBeGreaterThan(0);
  });
});

describe("delete-all", () => {
  it("removes the database, sidecars and key; a fresh open is empty", () => {
    const { key } = loadOrCreatePathKey(dir);
    const store = GuidancePulseStore.open(dbPath);
    const oldId = computePathIdForKey("src/auth/login.ts", key);
    store.recordEvent(
      {
        type: "READ_SUCCEEDED",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        guidanceId: GUIDANCE,
        pathId: computePathIdForKey("CLAUDE.md", key),
        timestampUtc: TS,
      },
      {
        phaseId: "implementation",
        cwdPathId: computePathIdForKey(CANARY_CWD, key),
        maxSuccessfulEdits: 5,
      },
    );
    store.close();
    expect(existsSync(dbPath)).toBe(true);
    const { deletedFiles } = deleteAllData(dbPath, dir);
    expect(deletedFiles).toContain(dbPath);
    expect(deletedFiles).toContain(resolvePathKeyPath(dir));
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    expect(existsSync(resolvePathKeyPath(dir))).toBe(false);
    // Fresh key + fresh database: empty, and the old path id is gone.
    const { key: newKey } = loadOrCreatePathKey(dir);
    const fresh = GuidancePulseStore.open(dbPath);
    try {
      expect(fresh.countEvents()).toBe(0);
      expect(fresh.countLeases()).toBe(0);
      expect(computePathIdForKey("src/auth/login.ts", newKey)).not.toBe(oldId);
    } finally {
      fresh.close();
    }
  });

  it("deleteAllData on missing files is a no-op, not an error", () => {
    expect(deleteAllData(dbPath, dir)).toEqual({ deletedFiles: [] });
  });
});

describe("real SQLite file canary scan", () => {
  const canaries = [
    { label: "prompt", value: CANARY_PROMPT },
    { label: "source", value: CANARY_SOURCE },
    { label: "absolute-cwd", value: CANARY_CWD },
    { label: "api-key", value: CANARY_API_KEY },
    { label: "transcript-path", value: CANARY_TRANSCRIPT },
  ];

  it("synthetic Prompt/source/absolute-path/key occur 0 times in the real .sqlite file", () => {
    // Raw Hook JSON carrying every canary, exactly as a hostile input
    // would: prompt text, source content, absolute cwd, transcript
    // path, and a fake API key in the environment.
    const rawHook = {
      hook_event_name: "PostToolUse",
      session_id: SESSION,
      cwd: CANARY_CWD,
      tool_name: "Read",
      tool_input: { file_path: "CLAUDE.md" },
      tool_response: { success: true },
      transcript_path: CANARY_TRANSCRIPT,
      prompt: CANARY_PROMPT,
      content: CANARY_SOURCE,
      env: { ANTHROPIC_API_KEY: CANARY_API_KEY },
    };
    const rawText = JSON.stringify(rawHook);
    // Sanity: the test is not vacuous — the canaries ARE in the input.
    for (const canary of canaries) {
      expect(rawText).toContain(canary.value);
    }

    const { key } = loadOrCreatePathKey(dir);
    const store = GuidancePulseStore.open(dbPath);
    try {
      // The T003 sanitizer is the only thing that ever sees raw input.
      const clean = sanitizeHookInput(rawHook);
      const cwdId = computePathIdForKey(clean.cwd, key);
      const readEvent: GuidancePulseEvent = {
        type: "READ_SUCCEEDED",
        sessionScopeId: clean.sessionId,
        agentScopeId: AGENT,
        guidanceId: GUIDANCE,
        pathId: computePathIdForKey(clean.toolFilePath ?? "CLAUDE.md", key),
        timestampUtc: TS,
      };
      store.recordEvent(readEvent, {
        phaseId: "implementation",
        cwdPathId: cwdId,
        maxSuccessfulEdits: 5,
      });
      // A write check whose target path is also derived from raw input.
      const checked: GuidancePulseEvent = {
        type: "WRITE_CHECKED",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        guidanceId: GUIDANCE,
        pathId: computePathIdForKey("src/auth/login.ts", key),
        decision: "ALLOW",
        state: "FRESH",
        timestampUtc: "2026-11-15T10:15:00Z",
      };
      store.recordEvent(checked);
      store.recordEvent({
        type: "PRE_COMPACT",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        timestampUtc: "2026-11-15T10:16:00Z",
      });
      expect(store.countEvents()).toBe(3);
      store.checkpoint();
    } finally {
      store.close();
    }

    // Scan the REAL database file bytes (and the WAL, if one remains).
    const counts = scanFileForCanaries(dbPath, canaries);
    for (const canary of canaries) {
      expect(counts[canary.label]).toBe(0);
    }
    expect(() => assertNoCanariesInFile(dbPath, canaries)).not.toThrow();
    if (existsSync(`${dbPath}-wal`)) {
      const walCounts = scanFileForCanaries(`${dbPath}-wal`, canaries);
      for (const canary of canaries) {
        expect(walCounts[canary.label]).toBe(0);
      }
    }
    // The HMAC ids stored instead are opaque: the raw cwd is not
    // recoverable from the file without the key.
    const dbBytes = readFileSync(dbPath).toString("latin1");
    expect(dbBytes).not.toContain(CANARY_CWD);
  });

  it("assertNoCanariesInFile reports labels, never canary values", () => {
    const planted = join(dir, "planted.txt");
    writeFileSync(planted, `harmless prefix ${CANARY_PROMPT} suffix`);
    let caught: unknown;
    try {
      assertNoCanariesInFile(planted, canaries);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RetentionError);
    expect((caught as RetentionError).code).toBe("CANARY_FOUND");
    expect((caught as Error).message).toContain("prompt");
    expect((caught as Error).message).not.toContain(CANARY_PROMPT);
  });

  it("scanFileForCanaries throws a code when the file is missing", () => {
    expect(() => scanFileForCanaries(join(dir, "no-such.sqlite"), canaries)).toThrowError(
      RetentionError,
    );
    try {
      scanFileForCanaries(join(dir, "no-such.sqlite"), canaries);
    } catch (error) {
      expect((error as RetentionError).code).toBe("CANARY_FILE_MISSING");
    }
  });
});
