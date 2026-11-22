/**
 * PreToolUse write-gate tests — P025 GuidancePulse, T005.
 *
 * Covers: decision.ts pure mapping (warn/ask/block/allow, exit codes,
 * no-gate and fail-closed outputs) and the handlePreToolUse gate
 * end-to-end against the T007 :memory: store — adapter gating (T003),
 * live-phase rule refinement (T004 matchRules), lease check with lazy
 * expiry persistence (T004 checkWrite + T007 checkWriteAndPersist),
 * WRITE_CHECKED audit events (T007 recordEvent), and fail-closed
 * behaviour on malformed input / store failure. All data is synthetic;
 * timestamps are fixed so output is deterministic.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfigYaml } from "../../src/config/index.js";
import { adaptHookEvent } from "../../src/hooks/adapter.js";
import {
  buildHookOutput,
  decisionToPermissionDecision,
  hookExitCode,
} from "../../src/hooks/decision.js";
import {
  handlePreToolUse,
  recordSuccessfulWrite,
  type PreToolUseContext,
} from "../../src/hooks/pre-tool-use.js";
import { handleInstructionsLoaded } from "../../src/hooks/instructions-loaded.js";
import { matchRules } from "../../src/core/index.js";
import { computePathId } from "../../src/privacy/sanitize.js";
import { GuidancePulseStore } from "../../src/store/index.js";

const SESSION = "synthetic-session-001";
const AGENT = "main";
const CWD = "/synthetic/project";
const OTHER_CWD = "/synthetic/other";
const PATH_KEY = "synthetic-test-path-key-001";
const TS = "2026-11-15T10:14:03Z";
const TS2 = "2026-11-15T10:15:00Z";

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
  - id: auth-audit
    source: [CLAUDE.md]
    applies_to: [src/auth/**]
    phases: [implementation, review]
    mode: warn
    max_successful_edits: 5
  - id: api-review
    source: [CLAUDE.md]
    applies_to: [src/api/**]
    phases: [implementation]
    mode: ask
    max_successful_edits: 5
  - id: docs-consistency
    source: [AGENTS.md]
    applies_to: [docs/**]
`;

const CONFIG = parseConfigYaml(CONFIG_YAML);

function preToolUseInput(
  toolName: string,
  filePath: string | null,
  cwd: string = CWD,
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    hook_event_name: "PreToolUse",
    session_id: SESSION,
    cwd,
    tool_name: toolName,
  };
  if (filePath !== null) {
    input["tool_input"] = { file_path: filePath };
  }
  return input;
}

let dir: string;
let store: GuidancePulseStore;

function ctx(livePhaseId: string | null = "implementation"): PreToolUseContext {
  return { config: CONFIG, store, pathKey: PATH_KEY, livePhaseId, now: TS };
}

/** Seed a FRESH lease for a guidance id, issued in `phaseId` under `cwd`. */
function seedFreshLease(
  guidanceId: string,
  phaseId: string = "implementation",
  cwd: string = CWD,
): void {
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
      phaseId,
      cwdPathId: computePathId(cwd, PATH_KEY),
      maxSuccessfulEdits: 5,
    },
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gp-t005-"));
  store = GuidancePulseStore.open(join(dir, "state.sqlite"));
});

afterEach(() => {
  if (store.isOpen()) store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("decision.ts pure mapping", () => {
  it("ALLOW maps to allow, exit 0", () => {
    expect(decisionToPermissionDecision("ALLOW")).toBe("allow");
    expect(hookExitCode("ALLOW")).toBe(0);
    const out = buildHookOutput("ALLOW", [
      { guidanceId: "auth-change-safety", mode: "block", state: "FRESH", expiredReason: null },
    ]);
    expect(out.hookSpecificOutput?.permissionDecision).toBe("allow");
    expect(out.hookSpecificOutput?.permissionDecisionReason).toContain("FRESH");
  });

  it("WARN maps to allow with additionalContext, exit 0", () => {
    expect(decisionToPermissionDecision("WARN")).toBe("allow");
    expect(hookExitCode("WARN")).toBe(0);
    const out = buildHookOutput("WARN", [
      { guidanceId: "docs-consistency", mode: "warn", state: "UNSEEN", expiredReason: null },
    ]);
    expect(out.hookSpecificOutput?.permissionDecision).toBe("allow");
    expect(out.additionalContext).toContain("docs-consistency");
    expect(out.additionalContext).toContain("UNSEEN");
    expect(out.additionalContext).toContain("Re-read");
  });

  it("ASK maps to ask, exit 0", () => {
    expect(decisionToPermissionDecision("ASK")).toBe("ask");
    expect(hookExitCode("ASK")).toBe(0);
    const out = buildHookOutput("ASK", [
      { guidanceId: "api-review", mode: "ask", state: "EXPIRED", expiredReason: "CONTEXT_COMPACTION" },
    ]);
    expect(out.hookSpecificOutput?.permissionDecision).toBe("ask");
    expect(out.hookSpecificOutput?.permissionDecisionReason).toContain("api-review");
  });

  it("DENY maps to deny, exit 2", () => {
    expect(decisionToPermissionDecision("DENY")).toBe("deny");
    expect(hookExitCode("DENY")).toBe(2);
    const out = buildHookOutput("DENY", [
      { guidanceId: "auth-change-safety", mode: "block", state: "UNSEEN", expiredReason: null },
    ]);
    expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput?.permissionDecisionReason).toContain("Re-read");
  });

  it("no-gate output is an empty object (no opinion)", () => {
    expect(buildHookOutput("ALLOW", [], { noGate: true })).toEqual({});
  });

  it("fail-closed output is a deny naming only the error code", () => {
    const out = buildHookOutput("DENY", [], { failureCode: "STORE_CLOSED" });
    expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput?.permissionDecisionReason).toContain("STORE_CLOSED");
    expect(JSON.stringify(out)).not.toContain("/synthetic");
  });
});

describe("handlePreToolUse: no-gate cases", () => {
  it("Bash is not gated (PROJECT_BOOK §6.5): allow, no opinion, no events", () => {
    const result = handlePreToolUse(preToolUseInput("Bash", null), ctx());
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
    expect(result.exitCode).toBe(0);
    expect(result.perRule).toEqual([]);
    expect(result.eventsRecorded).toBe(0);
    expect(store.countEvents()).toBe(0);
    expect(result.leaseSnapshot).toBe("[]");
  });

  it("Write to an unmatched path is not gated", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/unrelated/notes.ts"),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
    expect(store.countEvents()).toBe(0);
  });

  it("Write to an absolute path outside the project is not gated", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "/etc/passwd"),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
  });

  it("a rule inactive in the live phase does not gate the write", () => {
    // auth-change-safety is active only in implementation/review.
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx("explore"),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
  });
});

describe("handlePreToolUse: gated decisions", () => {
  it("UNSEEN lease under a block rule is DENY, exit 2, with a WRITE_CHECKED audit event", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "auth-change-safety",
    );
    expect(result.perRule).toHaveLength(1);
    expect(result.perRule[0]).toEqual({
      guidanceId: "auth-change-safety",
      mode: "block",
      state: "UNSEEN",
      expiredReason: null,
    });
    expect(result.eventsRecorded).toBe(1);
    const events = store.listEvents({ type: "WRITE_CHECKED" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "WRITE_CHECKED",
      guidanceId: "auth-change-safety",
      decision: "DENY",
      state: "UNSEEN",
    });
    // No lease row is created for an UNSEEN check.
    expect(store.countLeases()).toBe(0);
  });

  it("Edit (not only Write) is gated the same way", () => {
    const result = handlePreToolUse(
      preToolUseInput("Edit", "src/session/token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
  });

  it("FRESH lease passes: ALLOW, exit 0, WRITE_CHECKED state FRESH", () => {
    seedFreshLease("auth-change-safety");
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.exitCode).toBe(0);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("allow");
    expect(result.perRule[0]?.state).toBe("FRESH");
    expect(result.eventsRecorded).toBe(1);
    const events = store.listEvents({ type: "WRITE_CHECKED" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ decision: "ALLOW", state: "FRESH" });
  });

  it("absolute target under the cwd is relativised and checked", () => {
    seedFreshLease("auth-change-safety");
    const result = handlePreToolUse(
      preToolUseInput("Write", "/synthetic/project/src/session/token.ts"),
      ctx(),
    );
    expect(result.gated).toBe(true);
    expect(result.decision).toBe("ALLOW");
  });

  it("EXPIRED lease (after PreCompact) cannot pass a block rule", () => {
    seedFreshLease("auth-change-safety");
    store.recordEvent({
      type: "PRE_COMPACT",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      timestampUtc: TS2,
    });
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.perRule[0]?.state).toBe("EXPIRED");
    expect(result.exitCode).toBe(2);
  });

  it("UNSEEN lease under a warn rule is WARN: allow + additionalContext, exit 0", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "docs/guide.md"),
      ctx(),
    );
    expect(result.decision).toBe("WARN");
    expect(result.exitCode).toBe(0);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("allow");
    expect(result.hookOutput.additionalContext).toContain("docs-consistency");
    expect(result.perRule[0]).toEqual({
      guidanceId: "docs-consistency",
      mode: "warn",
      state: "UNSEEN",
      expiredReason: null,
    });
    const events = store.listEvents({ type: "WRITE_CHECKED" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ decision: "WARN", state: "UNSEEN" });
  });

  it("UNSEEN lease under an ask rule is ASK: permissionDecision ask, exit 0", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/api/handler.ts"),
      ctx(),
    );
    expect(result.decision).toBe("ASK");
    expect(result.exitCode).toBe(0);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("ask");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "api-review",
    );
  });

  it("aggregation is block > ask > warn: block + warn on one target is DENY", () => {
    // src/auth/** matches block (auth-change-safety) and warn (auth-audit).
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/auth/login.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
    expect(result.perRule).toHaveLength(2);
    expect(result.perRule.map((r) => r.guidanceId)).toEqual([
      "auth-change-safety",
      "auth-audit",
    ]);
    expect(result.eventsRecorded).toBe(2);
  });

  it("ask beats warn when the block rule is FRESH but the ask rule is UNSEEN", () => {
    seedFreshLease("auth-change-safety");
    // src/auth/login.ts matches auth-change-safety (FRESH, block) and
    // auth-audit (UNSEEN, warn) -> WARN, not ALLOW.
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/auth/login.ts"),
      ctx(),
    );
    expect(result.decision).toBe("WARN");
    expect(result.exitCode).toBe(0);
    expect(result.hookOutput.additionalContext).toContain("auth-audit");
  });
});

describe("Windows absolute paths (FIX-R3)", () => {
  const WIN_CWD = "C:\\synthetic\\project";

  it("Windows absolute Write with an UNSEEN lease is DENY, exit 2", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "auth-change-safety",
    );
    expect(result.perRule).toHaveLength(1);
    expect(result.perRule[0]).toEqual({
      guidanceId: "auth-change-safety",
      mode: "block",
      state: "UNSEEN",
      expiredReason: null,
    });
    expect(result.eventsRecorded).toBe(1);
    const events = store.listEvents({ type: "WRITE_CHECKED" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "WRITE_CHECKED",
      guidanceId: "auth-change-safety",
      decision: "DENY",
      state: "UNSEEN",
    });
  });

  it("Windows absolute Write on a FRESH lease issued under a Windows cwd is ALLOW", () => {
    seedFreshLease("auth-change-safety", "implementation", WIN_CWD);
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.exitCode).toBe(0);
    expect(result.perRule[0]?.state).toBe("FRESH");
    expect(result.eventsRecorded).toBe(1);
  });

  it("Windows absolute Edit with an UNSEEN lease is DENY, exit 2", () => {
    const result = handlePreToolUse(
      preToolUseInput("Edit", "C:\\\\synthetic\\\\project\\\\src\\\\session\\\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "auth-change-safety",
    );
    expect(result.perRule).toHaveLength(1);
    expect(result.perRule[0]).toEqual({
      guidanceId: "auth-change-safety",
      mode: "block",
      state: "UNSEEN",
      expiredReason: null,
    });
    expect(result.eventsRecorded).toBe(1);
    const events = store.listEvents({ type: "WRITE_CHECKED" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "WRITE_CHECKED",
      guidanceId: "auth-change-safety",
      decision: "DENY",
      state: "UNSEEN",
    });
  });

  it("Windows absolute Edit on a FRESH lease issued under a Windows cwd is ALLOW", () => {
    seedFreshLease("auth-change-safety", "implementation", WIN_CWD);
    const result = handlePreToolUse(
      preToolUseInput("Edit", "C:\\\\synthetic\\\\project\\\\src\\\\session\\\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.exitCode).toBe(0);
    expect(result.perRule[0]?.state).toBe("FRESH");
    expect(result.eventsRecorded).toBe(1);
  });

  it("Windows absolute Write outside the cwd is not gated", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "D:\\other\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
  });

  it("Windows absolute Read issues FRESH, then a Windows absolute Write is ALLOW", () => {
    const adapted = adaptHookEvent(
      {
        hook_event_name: "PostToolUse",
        session_id: SESSION,
        cwd: WIN_CWD,
        tool_name: "Read",
        tool_input: { file_path: "C:\\synthetic\\project\\CLAUDE.md" },
        tool_response: { success: true },
      },
      { config: CONFIG, pathKey: PATH_KEY, now: TS },
    );
    expect(adapted.kind).toBe("events");
    if (adapted.kind !== "events") return;
    expect(adapted.events.map((e) => (e as { guidanceId: string }).guidanceId).sort()).toEqual([
      "api-review",
      "auth-audit",
      "auth-change-safety",
    ]);
    // Persist exactly as scripts/hook-entry.ts does for READ_SUCCEEDED.
    for (const event of adapted.events) {
      if (event.type !== "READ_SUCCEEDED") continue;
      const rule = CONFIG.rules.find((r) => r.id === event.guidanceId);
      const persisted = handleInstructionsLoaded(store, [
        {
          event,
          options: {
            phaseId: "implementation",
            cwdPathId: computePathId(WIN_CWD, PATH_KEY),
            maxSuccessfulEdits: rule?.max_successful_edits ?? CONFIG.defaults.max_successful_edits,
          },
        },
      ]);
      expect(persisted.persisted).toBe(true);
    }
    const leases = store.listLeasesForScope(SESSION, AGENT);
    expect(leases.map((l) => [l.guidanceId, l.state]).sort()).toEqual([
      ["api-review", "FRESH"],
      ["auth-audit", "FRESH"],
      ["auth-change-safety", "FRESH"],
    ]);
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\src\\auth\\login.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.exitCode).toBe(0);
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("allow");
  });
});

describe("Windows case variants (FIX-R5: P1-R5-01 + R5-P2-01)", () => {
  const WIN_CWD = "C:\\synthetic\\project";

  it("R5 probe #3: cwd-prefix case variant (Write) is DENY, exit 2", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\SYNTHETIC\\PROJECT\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.perRule[0]).toEqual({
      guidanceId: "auth-change-safety",
      mode: "block",
      state: "UNSEEN",
      expiredReason: null,
    });
    expect(result.eventsRecorded).toBe(1);
  });

  it("R5 probe #4: mixed-case cwd prefix (Edit) is DENY, exit 2", () => {
    const result = handlePreToolUse(
      preToolUseInput("Edit", "c:\\Synthetic\\Project\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("R5 probe #5: protected-segment case variant (Write) is DENY, exit 2", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\src\\SESSION\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("R5 probe #6: SRC case variant (Write) is DENY, exit 2", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\SRC\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("fully mixed-case spelling (Write) is DENY, exit 2", () => {
    const result = handlePreToolUse(
      preToolUseInput(
        "Write",
        "C:\\SyNtHeTiC\\PrOjEcT\\SrC\\SeSsIoN\\ToKeN.tS",
        WIN_CWD,
      ),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("control: canonical spelling is still DENY under UNSEEN", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
  });

  it("FRESH lease passes a case-variant Write (no mis-deny from the folded lease id)", () => {
    seedFreshLease("auth-change-safety", "implementation", WIN_CWD);
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\SYNTHETIC\\PROJECT\\src\\SESSION\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.exitCode).toBe(0);
    expect(result.perRule[0]?.state).toBe("FRESH");
  });

  it("lease issued under a case-variant cwd passes a canonical Write (cwd id is folded)", () => {
    seedFreshLease("auth-change-safety", "implementation", "C:\\SYNTHETIC\\PROJECT");
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\synthetic\\project\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.exitCode).toBe(0);
    expect(result.perRule[0]?.state).toBe("FRESH");
  });

  it("control: POSIX cwd case variants still mismatch (no folding on POSIX)", () => {
    seedFreshLease("auth-change-safety", "implementation", "/SYNTHETIC/project");
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts", "/synthetic/project"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.perRule[0]?.state).toBe("EXPIRED");
    expect(result.perRule[0]?.expiredReason).toBe("CWD_MISMATCH");
  });

  it("control: a case-variant path outside the cwd is still not gated", () => {
    const result = handlePreToolUse(
      preToolUseInput("Write", "C:\\SYNTHETIC\\OTHER\\src\\session\\token.ts", WIN_CWD),
      ctx(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.gated).toBe(false);
    expect(result.hookOutput).toEqual({});
  });

  it.each([
    ["Write", "C:src\\session\\token.ts"],
    ["Write", "C:src/session/token.ts"],
    ["Edit", "C:src\\session\\token.ts"],
    ["Edit", "C:src/session/token.ts"],
  ])("drive-relative %s %s fails closed (DENY, exit 2, DRIVE_RELATIVE_PATH)", (tool, target) => {
    const result = handlePreToolUse(preToolUseInput(tool, target, WIN_CWD), ctx());
    expect(result.decision).toBe("DENY");
    expect(result.gated).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.error?.code).toBe("DRIVE_RELATIVE_PATH");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "DRIVE_RELATIVE_PATH",
    );
  });
});

describe("handlePreToolUse: live cwd / phase fail-closed", () => {
  it("cwd mismatch lazily expires the lease (CWD_MISMATCH) and denies", () => {
    seedFreshLease("auth-change-safety");
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts", OTHER_CWD),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.perRule[0]?.state).toBe("EXPIRED");
    expect(result.perRule[0]?.expiredReason).toBe("CWD_MISMATCH");
    // Lazy expiry is persisted, with the reason in the snapshot.
    const lease = store.getLease(SESSION, AGENT, "auth-change-safety");
    expect(lease?.state).toBe("EXPIRED");
    expect(lease?.reason).toBe("CWD_MISMATCH");
    expect(result.leaseSnapshot).toContain("CWD_MISMATCH");
  });

  it("phase mismatch lazily expires the lease (PHASE_MISMATCH) and denies", () => {
    seedFreshLease("auth-change-safety", "implementation");
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx("review"),
    );
    expect(result.decision).toBe("DENY");
    expect(result.perRule[0]?.expiredReason).toBe("PHASE_MISMATCH");
    const lease = store.getLease(SESSION, AGENT, "auth-change-safety");
    expect(lease?.state).toBe("EXPIRED");
    expect(lease?.reason).toBe("PHASE_MISMATCH");
  });

  it("unknown live phase (null) fails closed: a FRESH lease does not pass", () => {
    seedFreshLease("auth-change-safety", "implementation");
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx(null),
    );
    expect(result.decision).toBe("DENY");
    expect(result.perRule[0]?.state).toBe("EXPIRED");
    expect(result.perRule[0]?.expiredReason).toBe("PHASE_MISMATCH");
  });
});

describe("handlePreToolUse: fail-closed errors", () => {
  it("Write without file_path fails closed (DENY, exit 2, error code)", () => {
    const result = handlePreToolUse(preToolUseInput("Write", null), ctx());
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
    expect(result.error?.code).toBe("MISSING_TOOL_FILE_PATH");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(result.hookOutput.hookSpecificOutput?.permissionDecisionReason).toContain(
      "MISSING_TOOL_FILE_PATH",
    );
  });

  it("non-object input fails closed, never throws", () => {
    const result = handlePreToolUse("not-json", ctx());
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
    expect(result.error?.code).toBe("NOT_AN_OBJECT");
  });

  it("store failure fails closed (DENY, exit 2, STORE_CLOSED)", () => {
    store.close();
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.exitCode).toBe(2);
    expect(result.error?.code).toBe("STORE_CLOSED");
  });
});

describe("adapter / matchRules agreement", () => {
  it("adapter rule ids equal matchRules with a null (any) phase", () => {
    const adapted = adaptHookEvent(
      preToolUseInput("Write", "src/auth/login.ts"),
      { config: CONFIG, pathKey: PATH_KEY, now: TS },
    );
    expect(adapted.kind).toBe("write-check");
    if (adapted.kind !== "write-check") throw new Error("unreachable");
    const phaseAgnostic = matchRules(CONFIG, "src/auth/login.ts", null).map(
      (rule) => rule.id,
    );
    expect(adapted.request.ruleIds).toEqual(phaseAgnostic);
    expect(phaseAgnostic).toEqual(["auth-change-safety", "auth-audit"]);
  });
});

describe("recordSuccessfulWrite (PostToolUse companion)", () => {
  it("a successful write spends one edit; a failed write spends none", () => {
    seedFreshLease("auth-change-safety");
    const afterSuccess = recordSuccessfulWrite(
      store,
      SESSION,
      AGENT,
      "auth-change-safety",
      "success",
      TS2,
    );
    expect(afterSuccess?.remainingSuccessfulEdits).toBe(4);
    expect(afterSuccess?.state).toBe("FRESH");
    const afterFailure = recordSuccessfulWrite(
      store,
      SESSION,
      AGENT,
      "auth-change-safety",
      "failure",
      TS2,
    );
    expect(afterFailure?.remainingSuccessfulEdits).toBe(4);
  });

  it("spending the last edit expires the lease (EDIT_BUDGET_EXHAUSTED)", () => {
    seedFreshLease("auth-change-safety");
    let lease;
    for (let i = 0; i < 5; i++) {
      lease = recordSuccessfulWrite(store, SESSION, AGENT, "auth-change-safety", "success", TS2);
    }
    expect(lease?.remainingSuccessfulEdits).toBe(0);
    expect(lease?.state).toBe("EXPIRED");
    expect(lease?.reason).toBe("EDIT_BUDGET_EXHAUSTED");
    // The next write is now denied.
    const result = handlePreToolUse(
      preToolUseInput("Write", "src/session/token.ts"),
      ctx(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.perRule[0]?.state).toBe("EXPIRED");
  });

  it("returns undefined when there is no FRESH lease to spend from", () => {
    expect(
      recordSuccessfulWrite(store, SESSION, AGENT, "auth-change-safety", "success", TS2),
    ).toBeUndefined();
  });
});
