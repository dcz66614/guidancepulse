/**
 * FIX-R6 regression tests — P025 GuidancePulse, T013 R6.
 *
 * R6 found two new fail-open Windows path spellings (both probed
 * UNSEEN, cwd `C:\synthetic\project`, Write and Edit, ALLOW
 * gated:false exit 0 before the fix):
 *
 *   - R6-P2-01: trailing dot / space directory segments
 *     (`src\session.\token.ts`, `src\session \token.ts`). Win32
 *     strips each component's trailing spaces and periods, so
 *     `session.` IS `session` — the gate must model that.
 *   - R6-P2-02: drive-rooted / POSIX-absolute spellings under a
 *     Windows cwd (`/synthetic/...`, `\synthetic\...`). On
 *     Windows these are paths rooted at the cwd drive's root
 *     (`C:\synthetic\...`), not POSIX absolute paths.
 *
 * Harness mirrors the R6 reviewer's probe: rule
 * `auth-change-safety` (`src/auth/**`, `src/session/**`, mode
 * block), a fresh `:memory:` store (UNSEEN — no lease seeded),
 * cwd `C:\synthetic\project`, through the real `handlePreToolUse`
 * entry point. Unit-level tests pin the resolver behaviour that
 * the gate relies on (`resolveRelativeTargetPath`,
 * `normalizePathForId`, `isDriveRootedPath`).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfigYaml } from "../../src/config/index.js";
import {
  handlePreToolUse,
  type PreToolUseContext,
} from "../../src/hooks/pre-tool-use.js";
import {
  computePathId,
  isDriveRootedPath,
  resolveRelativeTargetPath,
  SanitizeError,
} from "../../src/privacy/sanitize.js";
import { GuidancePulseStore } from "../../src/store/index.js";

const SESSION = "synthetic-session-001";
const AGENT = "main";
const WIN_CWD = "C:\\synthetic\\project";
const POSIX_CWD = "/synthetic/project";
const PATH_KEY = "synthetic-test-path-key-001";
const TS = "2026-11-15T10:14:03Z";

const CONFIG_YAML = `
version: 1
defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny
phases: [explore, implementation, review, release]
rules:
  - id: auth-change-safety
    source: [CLAUDE.md]
    applies_to: [src/auth/**, src/session/**]
    phases: [implementation, review]
    mode: block
    max_successful_edits: 5
`;

const CONFIG = parseConfigYaml(CONFIG_YAML);

function preToolUseInput(
  toolName: string,
  filePath: string,
  cwd: string = WIN_CWD,
): Record<string, unknown> {
  return {
    hook_event_name: "PreToolUse",
    session_id: SESSION,
    cwd,
    tool_name: toolName,
    tool_input: { file_path: filePath },
  };
}

let store: GuidancePulseStore;

function ctx(): PreToolUseContext {
  return { config: CONFIG, store, pathKey: PATH_KEY, livePhaseId: "implementation", now: TS };
}

/** Seed a FRESH lease for a guidance id, issued under `cwd`. */
function seedFreshLease(guidanceId: string, cwd: string = WIN_CWD): void {
  store.recordEvent(
    {
      type: "READ_SUCCEEDED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      guidanceId,
      pathId: computePathId("CLAUDE.md", PATH_KEY),
      timestampUtc: TS,
    },
    {
      phaseId: "implementation",
      cwdPathId: computePathId(cwd, PATH_KEY),
      maxSuccessfulEdits: 5,
    },
  );
}

beforeEach(() => {
  store = GuidancePulseStore.open(":memory:");
});

afterEach(() => {
  if (store.isOpen()) store.close();
});

describe("FIX-R6 R6-P2-01: trailing dot/space segments (resolver)", () => {
  it("a trailing-dot directory segment resolves to the plain directory", () => {
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session.\\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session.\\auth.\\x.ts", WIN_CWD),
    ).toBe("src/session/auth/x.ts");
  });

  it("a trailing-space directory segment resolves to the plain directory", () => {
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session \\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
  });

  it("mixed trailing dots and spaces on one segment are all stripped", () => {
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session. . \\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session...\\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
  });

  it("a trailing dot/space on the FILENAME also resolves (still gated)", () => {
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session\\token.ts.", WIN_CWD),
    ).toBe("src/session/token.ts");
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session\\token.ts ", WIN_CWD),
    ).toBe("src/session/token.ts");
  });

  it("relative targets under a Windows cwd strip the same way", () => {
    expect(resolveRelativeTargetPath("src\\session.\\token.ts", WIN_CWD)).toBe(
      "src/session/token.ts",
    );
    expect(resolveRelativeTargetPath("src\\session \\token.ts", WIN_CWD)).toBe(
      "src/session/token.ts",
    );
  });

  it("`.` / `..` segment semantics do not move", () => {
    // `.` segments still collapse; `..` still resolves lexically.
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\.\\src\\.\\session\\.\\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session\\..\\session\\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
    // `..` escaping the project still escapes (null = outside project).
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\..\\..\\other\\x.ts", WIN_CWD),
    ).toBeNull();
    // `..` that only leaves the protected glob is still outside the glob.
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session\\..\\..\\session\\token.ts", WIN_CWD),
    ).toBe("session/token.ts");
    // `..` still pops even though stripping runs first (stripping
    // must never erase an exact `..` segment into nothing).
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session\\..\\token.ts", WIN_CWD),
    ).toBe("src/token.ts");
    // A segment that strips to empty (all dots/spaces: `.. `,
    // `...`) collapses like `.` — the fail-closed reading. Win32's
    // exact treatment of such a component is ambiguous, but
    // collapsing it can only over-deny (the path still lands
    // inside the protected glob), never mis-allow.
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\session\\.. \\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
    expect(
      resolveRelativeTargetPath("C:\\synthetic\\project\\src\\...\\session\\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
  });

  it("POSIX paths are NOT stripped (a trailing dot/space is significant there)", () => {
    expect(
      resolveRelativeTargetPath("/synthetic/project/src/session./token.ts", POSIX_CWD),
    ).toBe("src/session./token.ts");
    expect(resolveRelativeTargetPath("src/session./token.ts", POSIX_CWD)).toBe(
      "src/session./token.ts",
    );
    expect(resolveRelativeTargetPath("src/session /token.ts", POSIX_CWD)).toBe(
      "src/session /token.ts",
    );
  });

  it("trailing-dot spellings share one path id with the canonical spelling (Windows only)", () => {
    const canonical = computePathId("C:\\synthetic\\project\\src\\session\\token.ts", PATH_KEY);
    expect(computePathId("C:\\synthetic\\project\\src\\session.\\token.ts", PATH_KEY)).toBe(
      canonical,
    );
    expect(computePathId("C:\\synthetic\\project\\src\\session \\token.ts", PATH_KEY)).toBe(
      canonical,
    );
    // POSIX: the same spellings are different files, different ids.
    expect(computePathId("/synthetic/project/src/session./token.ts", PATH_KEY)).not.toBe(
      computePathId("/synthetic/project/src/session/token.ts", PATH_KEY),
    );
  });
});

describe("FIX-R6 R6-P2-02: drive-rooted spellings (resolver)", () => {
  it("a leading `/` under a Windows cwd resolves against the cwd drive", () => {
    expect(
      resolveRelativeTargetPath("/synthetic/project/src/session/token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
  });

  it("a leading `\\` under a Windows cwd resolves against the cwd drive", () => {
    expect(
      resolveRelativeTargetPath("\\synthetic\\project\\src\\session\\token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
  });

  it("an all-caps drive-rooted spelling resolves with its own spelling preserved", () => {
    expect(
      resolveRelativeTargetPath("/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS", WIN_CWD),
    ).toBe("SRC/SESSION/TOKEN.TS");
  });

  it("a drive-rooted spelling outside the cwd still does not resolve", () => {
    expect(resolveRelativeTargetPath("/synthetic/other/src/session/token.ts", WIN_CWD)).toBeNull();
    expect(resolveRelativeTargetPath("/etc/passwd", WIN_CWD)).toBeNull();
  });

  it("a drive-rooted spelling combined with a trailing-dot segment resolves", () => {
    expect(
      resolveRelativeTargetPath("/synthetic/project/src/session./token.ts", WIN_CWD),
    ).toBe("src/session/token.ts");
  });

  it("POSIX cwd: a leading `/` stays a POSIX absolute path (no drive resolution)", () => {
    expect(
      resolveRelativeTargetPath("/SYNTHETIC/project/src/session/token.ts", POSIX_CWD),
    ).toBeNull();
    expect(
      resolveRelativeTargetPath("/synthetic/project/src/session/token.ts", POSIX_CWD),
    ).toBe("src/session/token.ts");
  });

  it("UNC cwd: a drive-rooted spelling has no drive to resolve against, so it fails closed", () => {
    expect(() =>
      resolveRelativeTargetPath("\\synthetic\\project\\src\\session\\token.ts", "\\\\server\\share\\project"),
    ).toThrowError(/DRIVE_ROOTED_PATH/);
    expect(() =>
      resolveRelativeTargetPath("\\synthetic\\project\\src\\session\\token.ts", "\\\\server\\share\\project"),
    ).toThrowError(SanitizeError);
  });

  it("isDriveRootedPath: leading `/` or `\\` without a drive letter, never UNC or drive-letter", () => {
    for (const p of ["/synthetic/project/x.ts", "\\synthetic\\project\\x.ts", "/x.ts"]) {
      expect(isDriveRootedPath(p)).toBe(true);
    }
    for (const p of [
      "C:/synthetic/project/x.ts",
      "C:\\synthetic\\project\\x.ts",
      "//server/share/x.ts",
      "\\\\server\\share\\x.ts",
      "src/session/token.ts",
      "C:foo",
    ]) {
      expect(isDriveRootedPath(p)).toBe(false);
    }
  });
});

describe("FIX-R6 gate: R6-P2-01 trailing dot/space segments are DENY, exit 2", () => {
  it.each([
    ["Write", "C:\\synthetic\\project\\src\\session.\\token.ts"],
    ["Edit", "C:\\synthetic\\project\\src\\session.\\token.ts"],
    ["Write", "C:\\synthetic\\project\\src\\session \\token.ts"],
    ["Edit", "C:\\synthetic\\project\\src\\session \\token.ts"],
  ])("R6 probe T1/T2 (%s %s) is DENY, exit 2, gated", (tool, target) => {
    const result = handlePreToolUse(preToolUseInput(tool, target), ctx());
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "auth-change-safety",
    );
    expect(result.perRule[0]).toEqual({
      guidanceId: "auth-change-safety",
      mode: "block",
      state: "UNSEEN",
      expiredReason: null,
    });
    expect(result.eventsRecorded).toBe(1);
  });

  it.each([
    ["Write", "C:\\synthetic\\project\\src\\session\\token.ts."],
    ["Write", "C:\\synthetic\\project\\src\\session\\token.ts "],
  ])("filename trailing dot/space (%s) is still DENY, exit 2", (tool, target) => {
    const result = handlePreToolUse(preToolUseInput(tool, target), ctx());
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("`.` segments still DENY (no regression from the strip)", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\.\\src\\.\\session\\.\\token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
  });
});

describe("FIX-R6 gate: R6-P2-02 drive-rooted spellings are DENY, exit 2", () => {
  it.each([
    ["Write", "/synthetic/project/src/session/token.ts"],
    ["Edit", "/synthetic/project/src/session/token.ts"],
    ["Write", "\\synthetic\\project\\src\\session\\token.ts"],
    ["Edit", "\\synthetic\\project\\src\\session\\token.ts"],
    ["Write", "/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS"],
    ["Edit", "/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS"],
  ])("R6 probe R1/R2/R3 (%s %s) is DENY, exit 2, gated", (tool, target) => {
    const result = handlePreToolUse(preToolUseInput(tool, target), ctx());
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "auth-change-safety",
    );
    expect(result.perRule[0]).toEqual({
      guidanceId: "auth-change-safety",
      mode: "block",
      state: "UNSEEN",
      expiredReason: null,
    });
    expect(result.eventsRecorded).toBe(1);
  });
});

describe("FIX-R6 gate: control group (no mis-deny, no POSIX over-folding)", () => {
  it("control: canonical spelling is still DENY under UNSEEN", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\src\\session\\token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
  });

  it("FRESH lease passes a case-variant Write (no mis-deny from folding)", () => {
    seedFreshLease("auth-change-safety");
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\SYNTHETIC\\PROJECT\\src\\SESSION\\token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.exitCode).toBe(0);
    expect(result.perRule[0]?.state).toBe("FRESH");
  });

  it("a path outside the project is still not gated", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\other\\src\\session\\token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
  });

  it("POSIX cwd: an all-caps absolute path is still ALLOW (no folding on POSIX)", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "/SYNTHETIC/project/src/session/token.ts", POSIX_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
  });

  it("POSIX cwd: a trailing-dot segment is still ALLOW (POSIX names keep the dot)", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "/synthetic/project/src/session./token.ts", POSIX_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
  });
});
