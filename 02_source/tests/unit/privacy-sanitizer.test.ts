/**
 * Privacy sanitizer tests — P025 GuidancePulse, T003.
 *
 * Covers PROJECT_BOOK §7.4 (allowed / forbidden persisted fields) and
 * the T003 acceptance rule: synthetic canary Prompt / source strings
 * must occur 0 times in anything that could be persisted, logged, or
 * reported. All data is synthetic; no real user Prompt, source file,
 * or credential is used anywhere in this file.
 */

import { describe, expect, it } from "vitest";
import {
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
} from "../../src/privacy/index.js";

const KEY_A = "synthetic-test-path-key-001";
const KEY_B = "synthetic-test-path-key-002";

describe("computePathId (HMAC path identifiers)", () => {
  it("produces hmac:<64 lowercase hex>", () => {
    expect(computePathId("src/auth/login.ts", KEY_A)).toMatch(/^hmac:[0-9a-f]{64}$/);
    expect(computePathId("/tmp/synthetic-project", KEY_A)).toMatch(/^hmac:[0-9a-f]{64}$/);
  });

  it("is deterministic for the same key and path", () => {
    expect(computePathId("CLAUDE.md", KEY_A)).toBe(computePathId("CLAUDE.md", KEY_A));
  });

  it("different paths give different ids", () => {
    expect(computePathId("src/auth/a.ts", KEY_A)).not.toBe(computePathId("src/auth/b.ts", KEY_A));
    expect(computePathId("src/auth", KEY_A)).not.toBe(computePathId("src/auth/a.ts", KEY_A));
  });

  it("different keys give different ids (key rotation breaks old mappings)", () => {
    expect(computePathId("CLAUDE.md", KEY_A)).not.toBe(computePathId("CLAUDE.md", KEY_B));
  });

  it("the raw path is not recoverable from the id", () => {
    const id = computePathId("src/auth/very-distinctive-name.ts", KEY_A);
    expect(id).not.toContain("very-distinctive-name");
    expect(id).not.toContain("src/auth");
  });

  it("equivalent spellings of one path give one id", () => {
    const plain = computePathId("src/auth/login.ts", KEY_A);
    expect(computePathId("./src/auth/login.ts", KEY_A)).toBe(plain);
    expect(computePathId("src//auth/./login.ts", KEY_A)).toBe(plain);
    expect(computePathId("src\\auth\\login.ts", KEY_A)).toBe(plain);
    expect(computePathId("src/session/../auth/login.ts", KEY_A)).toBe(plain);
  });

  it("accepts a Uint8Array key and matches the equivalent string key", () => {
    expect(computePathId("CLAUDE.md", new TextEncoder().encode(KEY_A))).toBe(
      computePathId("CLAUDE.md", KEY_A),
    );
  });

  it("rejects empty paths and empty keys", () => {
    for (const bad of ["", "   ", null, undefined, 42, {}]) {
      expect(() => computePathId(bad, KEY_A)).toThrowError(SanitizeError);
    }
    expect(() => computePathId("CLAUDE.md", "")).toThrowError(/EMPTY_PATH_KEY/);
    expect(() => computePathId("CLAUDE.md", new Uint8Array(0))).toThrowError(/EMPTY_PATH_KEY/);
  });
});

describe("normalizePathForId", () => {
  it("normalises separators and dot segments, keeps absolutes absolute", () => {
    expect(normalizePathForId("a//b/./c")).toBe("a/b/c");
    expect(normalizePathForId("a\\b\\c")).toBe("a/b/c");
    expect(normalizePathForId("/tmp/synthetic-project")).toBe("/tmp/synthetic-project");
    expect(normalizePathForId("/a/b/../c")).toBe("/a/c");
    expect(normalizePathForId("./CLAUDE.md")).toBe("CLAUDE.md");
  });

  it("returns null for empty / non-string input", () => {
    expect(normalizePathForId("")).toBeNull();
    expect(normalizePathForId("   ")).toBeNull();
    expect(normalizePathForId(null)).toBeNull();
    expect(normalizePathForId(42)).toBeNull();
  });

  it("canonicalises Windows drive letters (FIX-R3)", () => {
    expect(normalizePathForId("c:\\t015-test\\protected\\notes.txt")).toBe(
      "C:/t015-test/protected/notes.txt",
    );
    expect(normalizePathForId("C:/t015-test/protected/notes.txt")).toBe(
      "C:/t015-test/protected/notes.txt",
    );
    // Same path id for either drive-letter case (ids must not split by spelling).
    expect(computePathId("c:\\t015-test\\a.ts", KEY_A)).toBe(
      computePathId("C:/t015-test/a.ts", KEY_A),
    );
  });

  it("collapses a UNC root to a single leading slash (FIX-R3)", () => {
    expect(normalizePathForId("\\\\server\\share\\project\\a.ts")).toBe(
      "/server/share/project/a.ts",
    );
    expect(normalizePathForId("//server/share/project/a.ts")).toBe("/server/share/project/a.ts");
  });

  it("never pops a drive prefix on '..' (FIX-R3)", () => {
    expect(normalizePathForId("C:/a/../b")).toBe("C:/b");
    expect(normalizePathForId("C:/../x")).toBe("C:/x");
    expect(normalizePathForId("C:/")).toBe("C:");
  });

  it("folds case for Windows spellings, keeps POSIX case (FIX-R5)", () => {
    // Drive-letter: drive stays upper-case, every other segment folds.
    expect(normalizePathForId("C:\\SYNTHETIC\\Project\\Src\\Session\\Token.ts")).toBe(
      "C:/synthetic/project/src/session/token.ts",
    );
    expect(normalizePathForId("c:/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS")).toBe(
      "C:/synthetic/project/src/session/token.ts",
    );
    // UNC folds the same way (server/share segments included).
    expect(normalizePathForId("\\\\SERVER\\Share\\PROJECT\\A.ts")).toBe(
      "/server/share/project/a.ts",
    );
    expect(normalizePathForId("//Server/Share/Project/A.ts")).toBe("/server/share/project/a.ts");
    // POSIX absolute paths are NOT folded: different case, different file.
    expect(normalizePathForId("/Tmp/Synthetic-Project/A.ts")).toBe("/Tmp/Synthetic-Project/A.ts");
    expect(normalizePathForId("/tmp/synthetic-project/a.ts")).toBe("/tmp/synthetic-project/a.ts");
    // Relative paths carry no Windows marker and are NOT folded.
    expect(normalizePathForId("Src/Auth/Login.ts")).toBe("Src/Auth/Login.ts");
    expect(normalizePathForId("./CLAUDE.md")).toBe("CLAUDE.md");
  });

  it("one Windows file in any case spelling gets one id; POSIX case variants get different ids (FIX-R5)", () => {
    const winId = computePathId("C:\\synthetic\\project\\src\\session\\token.ts", KEY_A);
    expect(computePathId("C:/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS", KEY_A)).toBe(winId);
    expect(computePathId("c:\\Synthetic\\Project\\Src\\Session\\Token.ts", KEY_A)).toBe(winId);
    expect(computePathId("\\\\SERVER\\share\\project\\a.ts", KEY_A)).toBe(
      computePathId("//server/SHARE/PROJECT/A.ts", KEY_A),
    );
    // POSIX: case is significant, so the ids must split.
    expect(computePathId("/tmp/synthetic-project/a.ts", KEY_A)).not.toBe(
      computePathId("/tmp/SYNTHETIC-PROJECT/A.ts", KEY_A),
    );
    expect(computePathId("src/auth/login.ts", KEY_A)).not.toBe(
      computePathId("src/AUTH/Login.ts", KEY_A),
    );
  });
});

describe("isAbsolutePath (FIX-R3: Windows absolute paths)", () => {
  it("accepts POSIX, drive-letter (either slash, either case), and UNC absolute paths", () => {
    for (const p of [
      "/tmp/synthetic-project/a.ts",
      "/a.ts",
      "C:/t015-test/protected/notes.txt",
      "C:\\t015-test\\protected\\notes.txt",
      "c:/t015-test/protected/notes.txt",
      "c:\\t015-test\\protected\\notes.txt",
      "//server/share/project/a.ts",
      "\\\\server\\share\\project\\a.ts",
    ]) {
      expect(isAbsolutePath(p)).toBe(true);
    }
  });

  it("rejects relative paths and drive-relative spellings", () => {
    for (const p of [
      "src/auth/a.ts",
      "./src/auth/a.ts",
      "a.ts",
      "C:foo",
      "C:protected/notes.txt",
      "../x.ts",
    ]) {
      expect(isAbsolutePath(p)).toBe(false);
    }
  });
});

describe("resolveRelativeTargetPath (FIX-R3)", () => {
  const posixCwd = "/tmp/synthetic-project";
  const winCwd = "C:\\t015-test";
  const uncCwd = "\\\\server\\share\\project";

  it("resolves POSIX absolute paths under cwd (unchanged behaviour)", () => {
    expect(resolveRelativeTargetPath("/tmp/synthetic-project/src/auth/a.ts", posixCwd)).toBe(
      "src/auth/a.ts",
    );
    expect(resolveRelativeTargetPath("/etc/passwd", posixCwd)).toBeNull();
    // The project dir itself is not a file.
    expect(resolveRelativeTargetPath("/tmp/synthetic-project", posixCwd)).toBeNull();
  });

  it("resolves Windows drive-letter absolute paths under cwd", () => {
    expect(resolveRelativeTargetPath("C:/t015-test/protected/notes.txt", winCwd)).toBe(
      "protected/notes.txt",
    );
    expect(resolveRelativeTargetPath("C:\\t015-test\\protected\\notes.txt", winCwd)).toBe(
      "protected/notes.txt",
    );
    // Lower-case drive on either side still matches.
    expect(resolveRelativeTargetPath("c:/t015-test/protected/notes.txt", winCwd)).toBe(
      "protected/notes.txt",
    );
    expect(resolveRelativeTargetPath("C:/t015-test/protected/notes.txt", "c:\\t015-test")).toBe(
      "protected/notes.txt",
    );
    // Different drive, or outside the cwd: ignored.
    expect(resolveRelativeTargetPath("D:/t015-test/protected/notes.txt", winCwd)).toBeNull();
    expect(resolveRelativeTargetPath("C:/other/protected/notes.txt", winCwd)).toBeNull();
    // The project dir itself is not a file.
    expect(resolveRelativeTargetPath("C:\\t015-test", winCwd)).toBeNull();
    expect(resolveRelativeTargetPath("C:/t015-test", winCwd)).toBeNull();
  });

  it("resolves UNC absolute paths under a UNC cwd", () => {
    expect(
      resolveRelativeTargetPath("\\\\server\\share\\project\\src\\auth\\a.ts", uncCwd),
    ).toBe("src/auth/a.ts");
    expect(resolveRelativeTargetPath("//server/share/other/a.ts", uncCwd)).toBeNull();
  });

  it("leaves relative paths unchanged", () => {
    expect(resolveRelativeTargetPath("src/auth/a.ts", posixCwd)).toBe("src/auth/a.ts");
    expect(resolveRelativeTargetPath("protected\\notes.txt", winCwd)).toBe("protected/notes.txt");
    expect(resolveRelativeTargetPath(null, posixCwd)).toBeNull();
  });

  it("detects Windows vs drive-relative spellings (FIX-R5)", () => {
    for (const p of ["C:/x/a.ts", "C:\\x\\a.ts", "c:/x/a.ts", "C:foo", "C:", "//server/share/x"]) {
      expect(isWindowsPath(p)).toBe(true);
    }
    for (const p of ["/tmp/x/a.ts", "src/auth/a.ts", "./a.ts", "a/b/c.ts"]) {
      expect(isWindowsPath(p)).toBe(false);
    }
    for (const p of ["C:foo", "C:src/session/token.ts", "C:src\\session\\token.ts", "C:"]) {
      expect(isDriveRelativePath(p)).toBe(true);
    }
    for (const p of ["C:/x/a.ts", "C:\\x\\a.ts", "//server/share/x", "/tmp/x", "src/a.ts"]) {
      expect(isDriveRelativePath(p)).toBe(false);
    }
  });
});

describe("resolveRelativeTargetPath (FIX-R5: Windows case variants)", () => {
  const winCwd = "C:\\synthetic\\project";

  it("cwd-prefix case variants still resolve (mechanism A)", () => {
    expect(
      resolveRelativeTargetPath("C:\\SYNTHETIC\\PROJECT\\src\\session\\token.ts", winCwd),
    ).toBe("src/session/token.ts");
    expect(
      resolveRelativeTargetPath("c:\\Synthetic\\Project\\src\\session\\token.ts", winCwd),
    ).toBe("src/session/token.ts");
    // Mixed-case cwd on either side.
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session\\token.ts", "C:\\SYNTHETIC\\PROJECT"),
    ).toBe("src/session/token.ts");
  });

  it("protected-segment case variants resolve with the target's own spelling preserved (mechanism B)", () => {
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\SESSION\\token.ts", winCwd),
    ).toBe("src/SESSION/token.ts");
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\SRC\\session\\token.ts", winCwd),
    ).toBe("SRC/session/token.ts");
    expect(
      resolveRelativeTargetPath("C:\\SyNtHeTiC\\PrOjEcT\\SrC\\SeSsIoN\\ToKeN.tS", winCwd),
    ).toBe("SrC/SeSsIoN/ToKeN.tS");
  });

  it("UNC case variants resolve", () => {
    expect(
      resolveRelativeTargetPath(
        "\\\\SERVER\\Share\\PROJECT\\src\\auth\\a.ts",
        "\\\\server\\share\\project",
      ),
    ).toBe("src/auth/a.ts");
  });

  it("POSIX cwd-prefix case variants still do NOT resolve (POSIX stays case-sensitive)", () => {
    expect(
      resolveRelativeTargetPath("/SYNTHETIC/project/src/auth/a.ts", "/synthetic/project"),
    ).toBeNull();
    expect(
      resolveRelativeTargetPath("/synthetic/project/src/AUTH/a.ts", "/synthetic/project"),
    ).toBe("src/AUTH/a.ts");
    expect(
      resolveRelativeTargetPath("/synthetic/project/src/auth/a.ts", "/SYNTHETIC/project"),
    ).toBeNull();
  });

  it("a cwd that is only a string prefix of another directory still does not match", () => {
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project-x\\src\\a.ts", winCwd),
    ).toBeNull();
    expect(resolveRelativeTargetPath("/tmp/proj-x/a.ts", "/tmp/proj")).toBeNull();
  });

  it("drive-relative spellings throw DRIVE_RELATIVE_PATH (FIX-R5, R5-P2-01)", () => {
    for (const p of ["C:src\\session\\token.ts", "C:src/session/token.ts", "C:foo", "C:"]) {
      expect(() => resolveRelativeTargetPath(p, winCwd)).toThrowError(/DRIVE_RELATIVE_PATH/);
      expect(() => resolveRelativeTargetPath(p, winCwd)).toThrowError(SanitizeError);
    }
  });
});

describe("sanitizeHookInput (allowlist extraction)", () => {
  const base = {
    hook_event_name: "PostToolUse",
    session_id: "synthetic-session-001",
    cwd: "/tmp/synthetic-project",
  };

  it("keeps only the allowlisted fields", () => {
    const clean = sanitizeHookInput({
      ...base,
      tool_name: "Read",
      tool_input: { file_path: "/tmp/synthetic-project/CLAUDE.md", content: "synthetic" },
      tool_response: { success: true, data: "synthetic body" },
      transcript_path: "/tmp/synthetic/transcript.jsonl",
      prompt: "synthetic prompt",
      env: { SYNTHETIC_KEY: "synthetic-value" },
      unknown_future_field: { nested: "synthetic" },
    });
    expect(clean).toEqual({
      hookEventName: "PostToolUse",
      sessionId: "synthetic-session-001",
      cwd: "/tmp/synthetic-project",
      oldCwd: null,
      newCwd: null,
      toolName: "Read",
      toolFilePath: "/tmp/synthetic-project/CLAUDE.md",
      toolSuccess: true,
      trigger: null,
      reason: null,
      agentId: null,
      agentType: null,
      loadedPaths: null,
    });
    expect(JSON.stringify(clean)).not.toContain("synthetic body");
    expect(JSON.stringify(clean)).not.toContain("transcript");
  });

  it("reduces tool_response to a single success boolean", () => {
    const cases: [unknown, boolean | null][] = [
      [{ success: true }, true],
      [{ success: false }, false],
      [{ is_error: false }, true],
      [{ is_error: true }, false],
      [true, true],
      [false, false],
      ["synthetic raw string", null],
      [{ data: "synthetic body" }, null],
      [undefined, null],
      [null, null],
    ];
    for (const [response, expected] of cases) {
      const clean = sanitizeHookInput({ ...base, tool_response: response });
      expect(clean.toolSuccess).toBe(expected);
    }
    // When both flags are present, `success` wins (checked first).
    expect(
      sanitizeHookInput({ ...base, tool_response: { success: true, is_error: true } }).toolSuccess,
    ).toBe(true);
  });

  it("normalises relative tool paths, keeps absolute paths for cwd resolution", () => {
    expect(
      sanitizeHookInput({ ...base, tool_input: { file_path: "./src/auth/./a.ts" } }).toolFilePath,
    ).toBe("src/auth/a.ts");
    expect(
      sanitizeHookInput({ ...base, tool_input: { file_path: "/tmp/synthetic-project/a.ts" } })
        .toolFilePath,
    ).toBe("/tmp/synthetic-project/a.ts");
    expect(sanitizeHookInput({ ...base, tool_input: {} }).toolFilePath).toBeNull();
    expect(sanitizeHookInput({ ...base }).toolFilePath).toBeNull();
  });

  it("keeps Windows drive-letter absolute paths absolute, upper-case drive (FIX-R3)", () => {
    expect(
      sanitizeHookInput({ ...base, tool_input: { file_path: "C:\\tmp\\synthetic-project\\a.ts" } })
        .toolFilePath,
    ).toBe("C:/tmp/synthetic-project/a.ts");
    expect(
      sanitizeHookInput({ ...base, tool_input: { file_path: "c:/tmp/synthetic-project/a.ts" } })
        .toolFilePath,
    ).toBe("C:/tmp/synthetic-project/a.ts");
    expect(
      sanitizeHookInput({
        ...base,
        tool_input: { file_path: "\\\\server\\share\\synthetic-project\\a.ts" },
      }).toolFilePath,
    ).toBe("//server/share/synthetic-project/a.ts");
  });

  it("keeps only normalised relative loaded_paths, drops absolute entries", () => {
    const clean = sanitizeHookInput({
      ...base,
      hook_event_name: "InstructionsLoaded",
      loaded_paths: ["CLAUDE.md", "./.claude/rules/security.md", "/tmp/synthetic-project/ABS.md", "", 42],
    });
    expect(clean.loadedPaths).toEqual(["CLAUDE.md", ".claude/rules/security.md"]);
  });

  it("drops Windows drive-letter and UNC absolute loaded_paths (FIX-R3)", () => {
    const clean = sanitizeHookInput({
      ...base,
      hook_event_name: "InstructionsLoaded",
      loaded_paths: [
        "CLAUDE.md",
        "C:\\tmp\\synthetic-project\\ABS.md",
        "c:/tmp/synthetic-project/ABS2.md",
        "\\\\server\\share\\synthetic-project\\ABS3.md",
        "/tmp/synthetic-project/ABS.md",
      ],
    });
    expect(clean.loadedPaths).toEqual(["CLAUDE.md"]);
  });

  it("reads SessionStart source as the reason", () => {
    const clean = sanitizeHookInput({ ...base, hook_event_name: "SessionStart", source: "startup" });
    expect(clean.reason).toBe("startup");
  });

  it("keeps old/new cwd in memory only (CwdChanged)", () => {
    const clean = sanitizeHookInput({
      ...base,
      hook_event_name: "CwdChanged",
      old_cwd: "/tmp/synthetic-project",
      new_cwd: "/tmp/synthetic-project/sub",
    });
    expect(clean.oldCwd).toBe("/tmp/synthetic-project");
    expect(clean.newCwd).toBe("/tmp/synthetic-project/sub");
  });

  it("throws on a malformed envelope", () => {
    const bad: unknown[] = [
      null,
      "x",
      42,
      [],
      { session_id: "x", cwd: "/tmp/synthetic-project" },
      { hook_event_name: "PreToolUse", cwd: "/tmp/synthetic-project" },
      { hook_event_name: "PreToolUse", session_id: "x" },
      { hook_event_name: "   ", session_id: "x", cwd: "/tmp/synthetic-project" },
    ];
    for (const input of bad) {
      expect(() => sanitizeHookInput(input)).toThrowError(SanitizeError);
    }
  });
});

describe("findBannedKeys / assertNoBannedKeys", () => {
  it("finds banned keys nested anywhere, case-insensitively, deduplicated", () => {
    expect(
      findBannedKeys({
        type: "READ_SUCCEEDED",
        nested: { transcript_path: "/tmp/x", deep: [{ prompt: "y" }] },
        TOOL_RESPONSE: {},
        ok: 1,
      }).sort(),
    ).toEqual(["TOOL_RESPONSE", "prompt", "transcript_path"]);
  });

  it("returns [] for a clean contract-shaped event", () => {
    expect(
      findBannedKeys({
        type: "READ_SUCCEEDED",
        sessionScopeId: "synthetic-session-001",
        agentScopeId: "main",
        guidanceId: "auth-change-safety",
        pathId: computePathId("CLAUDE.md", KEY_A),
        timestampUtc: "2026-11-15T13:30:00Z",
      }),
    ).toEqual([]);
  });

  it("flags raw cwd / file_path / content keys as banned", () => {
    expect(findBannedKeys({ cwd: "/tmp/x" })).toEqual(["cwd"]);
    expect(findBannedKeys({ file_path: "x" })).toEqual(["file_path"]);
    expect(findBannedKeys({ content: "x" })).toEqual(["content"]);
    expect(findBannedKeys({ env: {} })).toEqual(["env"]);
  });

  it("assertNoBannedKeys throws listing the offending keys", () => {
    expect(() => assertNoBannedKeys({ prompt: "x", ok: 1 }, "synthetic event")).toThrowError(
      /BANNED_FIELD_PRESENT.*prompt/,
    );
    expect(() => assertNoBannedKeys({ type: "PRE_COMPACT" }, "synthetic event")).not.toThrow();
  });
});

describe("redactForLog", () => {
  it("replaces banned values, preserves everything else", () => {
    const out = redactForLog({
      hook_event_name: "PreToolUse",
      transcript_path: "/tmp/synthetic/secret.jsonl",
      tool_input: { file_path: "x", content: "synthetic source" },
      nested: { prompt: "synthetic prompt", keep: "yes" },
      list: [{ env: { A: "1" } }, "plain"],
    });
    expect(out).toEqual({
      hook_event_name: "PreToolUse",
      transcript_path: "[REDACTED]",
      // `tool_input` is itself a banned key, so the whole subtree is
      // replaced rather than recursed into (the entire tool input may
      // carry file content).
      tool_input: "[REDACTED]",
      nested: { prompt: "[REDACTED]", keep: "yes" },
      list: [{ env: "[REDACTED]" }, "plain"],
    });
  });

  it("handles circular structures without throwing", () => {
    const cyclic: Record<string, unknown> = { keep: "yes" };
    cyclic["self"] = cyclic;
    expect(() => redactForLog(cyclic)).not.toThrow();
    expect((redactForLog(cyclic) as Record<string, unknown>)["self"]).toBe("[CIRCULAR]");
  });

  it("passes scalars through unchanged", () => {
    expect(redactForLog("synthetic")).toBe("synthetic");
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog(null)).toBeNull();
  });
});

describe("canary leak test (synthetic Prompt / source / token)", () => {
  const CANARY_PROMPT = "CANARY-PROMPT-7f3a9d21-syn-001";
  const CANARY_SOURCE = "CANARY-SOURCE-9b4e77c2-syn-002";
  const CANARY_TOKEN = "CANARY-TOKEN-4d1a08f6-syn-003";

  it("sanitized output and redacted logs contain 0 canary occurrences", () => {
    const raw = {
      hook_event_name: "PostToolUse",
      session_id: "synthetic-session-001",
      cwd: "/tmp/synthetic-project",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/synthetic-project/CLAUDE.md", content: CANARY_SOURCE },
      tool_response: { success: true, data: CANARY_SOURCE },
      transcript_path: `/tmp/synthetic/${CANARY_PROMPT}.jsonl`,
      prompt: CANARY_PROMPT,
      env: { SYNTHETIC_API_KEY: CANARY_TOKEN },
      // A canary under an UNKNOWN field name: the allowlist sanitizer
      // must still drop it (unknown fields are never copied).
      unknown_field: CANARY_TOKEN,
    };
    const sanitizedText = JSON.stringify(sanitizeHookInput(raw));
    for (const canary of [CANARY_PROMPT, CANARY_SOURCE, CANARY_TOKEN]) {
      expect(sanitizedText.split(canary).length - 1).toBe(0);
    }
    // redactForLog only redacts values under KNOWN banned keys; a
    // canary under an unknown field name survives redaction (documented
    // limit — the privacy guarantee rests on the allowlist sanitizer,
    // and raw Hook JSON must never be logged unredacted). So the
    // redaction view is fed canaries under banned keys only.
    const rawKnownKeys = {
      hook_event_name: "PostToolUse",
      tool_response: { success: true, data: CANARY_SOURCE },
      transcript_path: `/tmp/synthetic/${CANARY_PROMPT}.jsonl`,
      prompt: CANARY_PROMPT,
      env: { SYNTHETIC_API_KEY: CANARY_TOKEN },
    };
    const redactedText = JSON.stringify(redactForLog(rawKnownKeys));
    for (const canary of [CANARY_PROMPT, CANARY_SOURCE, CANARY_TOKEN]) {
      expect(redactedText.split(canary).length - 1).toBe(0);
    }
    // The raw input DOES contain the canaries (proving the test is live);
    // only the sanitized/redacted views must be clean.
    expect(JSON.stringify(raw)).toContain(CANARY_PROMPT);
    expect(JSON.stringify(raw)).toContain(CANARY_SOURCE);
    expect(JSON.stringify(raw)).toContain(CANARY_TOKEN);
  });
});
