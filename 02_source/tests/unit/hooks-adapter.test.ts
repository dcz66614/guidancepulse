/**
 * Hook adapter tests — P025 GuidancePulse, T003.
 *
 * Covers PROJECT_BOOK §5.3 (event table), §6.4 (write gate targets),
 * §6.5 (invalidation boundaries), §7.3 (event contract) and §7.4
 * (persistence allowlist). All inputs are synthetic; the canary
 * strings below are invented markers that must never appear in any
 * adapter output (they stand in for a real user Prompt / source
 * file content planted in tool_input, tool_response, transcript_path
 * and environment variables).
 */

import { describe, expect, it } from "vitest";
import { parseConfigYaml } from "../../src/config/index.js";
import { isGuidancePulseEvent, type GuidancePulseEvent } from "../../src/contracts/index.js";
import { AdapterError, adaptHookEvent, type AdapterContext } from "../../src/hooks/index.js";
import { findBannedKeys, SanitizeError, sanitizeHookInput } from "../../src/privacy/index.js";

const TEST_KEY = "synthetic-test-path-key-001";
const FIXED_NOW = "2026-11-15T13:30:00Z";
const CWD = "/tmp/synthetic-project";

const CONFIG_YAML = `version: 1
defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny
phases: [explore, implementation, review]
rules:
  - id: auth-change-safety
    source: [CLAUDE.md, .claude/rules/security.md]
    applies_to: [src/auth/**, src/session/**]
    phases: [implementation, review]
    mode: block
    max_successful_edits: 5
  - id: docs-consistency
    source: [AGENTS.md]
    applies_to: [docs/**]
  - id: auth-audit
    source: [CLAUDE.md]
    applies_to: [src/auth/**]
    mode: ask
`;

const CONFIG = parseConfigYaml(CONFIG_YAML);

function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { config: CONFIG, pathKey: TEST_KEY, now: FIXED_NOW, ...overrides };
}

function base(event: string): Record<string, unknown> {
  return { hook_event_name: event, session_id: "synthetic-session-001", cwd: CWD };
}

/** Every event must satisfy the §7.3 contract and carry no banned keys. */
function expectContractClean(output: unknown): void {
  const text = JSON.stringify(output);
  expect(findBannedKeys(output)).toEqual([]);
  expect(text).not.toContain("/tmp/synthetic-project");
  expect(text).not.toContain("CLAUDE.md");
  expect(text).not.toContain("src/auth");
}

describe("PreToolUse write gate", () => {
  it("Write to a protected path yields a write-check with matching rule ids", () => {
    const out = adaptHookEvent(
      {
        ...base("PreToolUse"),
        tool_name: "Write",
        tool_input: { file_path: `${CWD}/src/auth/login.ts` },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.toolName).toBe("Write");
    expect(out.request.sessionScopeId).toBe("synthetic-session-001");
    expect(out.request.agentScopeId).toBe("main");
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
    expect(out.request.pathId).toMatch(/^hmac:[0-9a-f]{64}$/);
    expect(out.request.timestampUtc).toBe(FIXED_NOW);
    expectContractClean(out);
  });

  it("Edit to a path matching one rule lists only that rule", () => {
    const out = adaptHookEvent(
      {
        ...base("PreToolUse"),
        tool_name: "Edit",
        tool_input: { file_path: `${CWD}/src/session/store.ts` },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.ruleIds).toEqual(["auth-change-safety"]);
  });

  it("relative tool paths resolve against cwd", () => {
    const out = adaptHookEvent(
      { ...base("PreToolUse"), tool_name: "Write", tool_input: { file_path: "src/auth/x.ts" } },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
  });

  it("Write to an unprotected path is ignored (allow without gate)", () => {
    const out = adaptHookEvent(
      { ...base("PreToolUse"), tool_name: "Write", tool_input: { file_path: `${CWD}/src/other/a.ts` } },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "no-matching-rule" });
  });

  it("Write outside the project cwd is ignored (no relative rule can match)", () => {
    const out = adaptHookEvent(
      { ...base("PreToolUse"), tool_name: "Write", tool_input: { file_path: "/etc/passwd" } },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "target-outside-project" });
  });

  it("non-gated tools (Read, Bash) are ignored", () => {
    for (const tool of ["Read", "Bash", "Glob", "Grep"]) {
      const out = adaptHookEvent(
        { ...base("PreToolUse"), tool_name: tool, tool_input: { file_path: `${CWD}/src/auth/a.ts` } },
        ctx(),
      );
      expect(out).toEqual({ kind: "ignored", reason: "tool-not-gated" });
    }
  });

  it("Write without file_path throws (fail closed, no decision on an unknown target)", () => {
    expect(() =>
      adaptHookEvent({ ...base("PreToolUse"), tool_name: "Write", tool_input: {} }, ctx()),
    ).toThrowError(AdapterError);
    expect(() =>
      adaptHookEvent({ ...base("PreToolUse"), tool_name: "Write", tool_input: {} }, ctx()),
    ).toThrowError(/MISSING_TOOL_FILE_PATH/);
  });

  it("PreToolUse without tool_name throws", () => {
    expect(() => adaptHookEvent({ ...base("PreToolUse"), tool_input: {} }, ctx())).toThrowError(
      /MISSING_TOOL_NAME/,
    );
  });

  it("same input twice with a fixed clock gives identical output (deterministic)", () => {
    const input = {
      ...base("PreToolUse"),
      tool_name: "Write",
      tool_input: { file_path: `${CWD}/src/auth/login.ts` },
    };
    expect(JSON.stringify(adaptHookEvent(input, ctx()))).toBe(
      JSON.stringify(adaptHookEvent(input, ctx())),
    );
  });
});

describe("PostToolUse successful Read", () => {
  it("successful Read of CLAUDE.md issues one READ_SUCCEEDED per matching rule", () => {
    const out = adaptHookEvent(
      {
        ...base("PostToolUse"),
        tool_name: "Read",
        tool_input: { file_path: `${CWD}/CLAUDE.md` },
        tool_response: { success: true },
      },
      ctx(),
    );
    expect(out.kind).toBe("events");
    if (out.kind !== "events") return;
    expect(out.events).toHaveLength(2);
    expect(out.events.map((e) => (e as { guidanceId: string }).guidanceId).sort()).toEqual([
      "auth-audit",
      "auth-change-safety",
    ]);
    for (const event of out.events) {
      expect(event.type).toBe("READ_SUCCEEDED");
      expect(isGuidancePulseEvent(event)).toBe(true);
      expect(event).toEqual({
        type: "READ_SUCCEEDED",
        sessionScopeId: "synthetic-session-001",
        agentScopeId: "main",
        guidanceId: (event as { guidanceId: string }).guidanceId,
        pathId: (out.events[0] as { pathId: string }).pathId,
        timestampUtc: FIXED_NOW,
      });
    }
    // Same guidance file -> same path id in both events.
    const ids = new Set(out.events.map((e) => (e as { pathId: string }).pathId));
    expect(ids.size).toBe(1);
    expectContractClean(out);
  });

  it("Read of a guidance file via a relative path also matches", () => {
    const out = adaptHookEvent(
      {
        ...base("PostToolUse"),
        tool_name: "Read",
        tool_input: { file_path: ".claude/rules/security.md" },
        tool_response: { success: true },
      },
      ctx(),
    );
    expect(out.kind).toBe("events");
    if (out.kind !== "events") return;
    expect(out.events).toHaveLength(1);
    expect((out.events[0] as { guidanceId: string }).guidanceId).toBe("auth-change-safety");
  });

  it("failed Read issues nothing (strict mode: no credential without confirmed success)", () => {
    const failed = [
      { success: false },
      { is_error: true },
      { error: "synthetic read error" },
      "synthetic raw string response",
    ];
    for (const tool_response of failed) {
      const out = adaptHookEvent(
        {
          ...base("PostToolUse"),
          tool_name: "Read",
          tool_input: { file_path: `${CWD}/CLAUDE.md` },
          tool_response,
        },
        ctx(),
      );
      expect(out).toEqual({ kind: "ignored", reason: "read-not-successful" });
    }
  });

  it("Read of a non-guidance file issues nothing", () => {
    const out = adaptHookEvent(
      {
        ...base("PostToolUse"),
        tool_name: "Read",
        tool_input: { file_path: `${CWD}/src/auth/login.ts` },
        tool_response: { success: true },
      },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "no-matching-guidance" });
  });

  it("PostToolUse for a non-Read tool is ignored", () => {
    const out = adaptHookEvent(
      {
        ...base("PostToolUse"),
        tool_name: "Bash",
        tool_input: { command: "synthetic" },
        tool_response: { success: true },
      },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "tool-not-guidance-read" });
  });
});

describe("Windows absolute paths (FIX-R3)", () => {
  const WIN_CWD = "C:\\t015-test";

  function winBase(event: string, cwd: string = WIN_CWD): Record<string, unknown> {
    return { hook_event_name: event, session_id: "synthetic-session-001", cwd };
  }

  it("Write with a Windows absolute path (backslashes) yields a write-check", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse"),
        tool_name: "Write",
        tool_input: { file_path: "C:\\t015-test\\src\\auth\\login.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
    expectContractClean(out);
  });

  it("Write with a Windows absolute path (forward slashes, lower-case drive) yields a write-check", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse", "c:/t015-test"),
        tool_name: "Write",
        tool_input: { file_path: "c:/t015-test/src/auth/login.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
  });

  it("Write with a UNC absolute path under a UNC cwd yields a write-check", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse", "\\\\server\\share\\project"),
        tool_name: "Write",
        tool_input: { file_path: "\\\\server\\share\\project\\src\\auth\\login.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
  });

  it("Edit with a Windows absolute path (backslashes) yields a write-check", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse"),
        tool_name: "Edit",
        tool_input: { file_path: "C:\\\\t015-test\\\\src\\\\session\\\\store.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.toolName).toBe("Edit");
    expect(out.request.ruleIds).toEqual(["auth-change-safety"]);
    expectContractClean(out);
  });

  it("Edit with a Windows absolute path (forward slashes, lower-case drive) yields a write-check", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse", "c:/t015-test"),
        tool_name: "Edit",
        tool_input: { file_path: "c:/t015-test/src/auth/login.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.toolName).toBe("Edit");
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
  });

  it("Windows absolute path outside the cwd is ignored", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse"),
        tool_name: "Write",
        tool_input: { file_path: "D:\\other\\src\\auth\\login.ts" },
      },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "target-outside-project" });
  });

  it("Windows absolute path naming the project dir itself is ignored", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse"),
        tool_name: "Write",
        tool_input: { file_path: "C:\\t015-test" },
      },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "target-outside-project" });
  });

  it("successful Read of a guidance file via a Windows absolute path issues READ_SUCCEEDED", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PostToolUse"),
        tool_name: "Read",
        tool_input: { file_path: "C:\\t015-test\\CLAUDE.md" },
        tool_response: { success: true },
      },
      ctx(),
    );
    expect(out.kind).toBe("events");
    if (out.kind !== "events") return;
    expect(out.events).toHaveLength(2);
    expect(out.events.map((e) => (e as { guidanceId: string }).guidanceId).sort()).toEqual([
      "auth-audit",
      "auth-change-safety",
    ]);
    for (const event of out.events) {
      expect(event.type).toBe("READ_SUCCEEDED");
      expect(isGuidancePulseEvent(event)).toBe(true);
    }
    expectContractClean(out);
  });

  it("InstructionsLoaded with a Windows absolute loaded path drops it (POSIX parity)", () => {
    // Open question, NOT fixed here: absolute loaded_paths are
    // dropped on every platform (see the POSIX test above), so an
    // InstructionsLoaded observation carrying only absolute paths
    // credentials nothing. Resolving them against cwd would change
    // POSIX behaviour too and needs its own decision; the T015
    // credential path is the confirmed PostToolUse Read above.
    const out = adaptHookEvent(
      {
        ...winBase("InstructionsLoaded"),
        reason: "session_start",
        loaded_paths: ["C:\\t015-test\\CLAUDE.md"],
      },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "no-loaded-paths" });
  });

  it("Write with a cwd-prefix case variant yields a write-check (FIX-R5, mechanism A)", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse"),
        tool_name: "Write",
        tool_input: { file_path: "C:\\T015-TEST\\src\\auth\\login.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
  });

  it("Write with a protected-segment case variant yields a write-check (FIX-R5, mechanism B)", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse"),
        tool_name: "Write",
        tool_input: { file_path: "C:\\t015-test\\SRC\\AUTH\\login.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
  });

  it("Write with a UNC case variant yields a write-check (FIX-R5)", () => {
    const out = adaptHookEvent(
      {
        ...winBase("PreToolUse", "\\\\SERVER\\Share\\Project"),
        tool_name: "Write",
        tool_input: { file_path: "\\\\server\\share\\project\\src\\auth\\login.ts" },
      },
      ctx(),
    );
    expect(out.kind).toBe("write-check");
    if (out.kind !== "write-check") return;
    expect(out.request.ruleIds).toEqual(["auth-change-safety", "auth-audit"]);
  });

  it("Write with a drive-relative path throws DRIVE_RELATIVE_PATH (FIX-R5, R5-P2-01)", () => {
    for (const target of ["C:src\\auth\\login.ts", "C:src/auth/login.ts"]) {
      expect(() =>
        adaptHookEvent(
          {
            ...winBase("PreToolUse"),
            tool_name: "Write",
            tool_input: { file_path: target },
          },
          ctx(),
        ),
      ).toThrowError(/DRIVE_RELATIVE_PATH/);
      expect(() =>
        adaptHookEvent(
          {
            ...winBase("PreToolUse"),
            tool_name: "Write",
            tool_input: { file_path: target },
          },
          ctx(),
        ),
      ).toThrowError(SanitizeError);
    }
  });
});

describe("invalidation and observation events", () => {
  it("PreCompact yields a PRE_COMPACT event", () => {
    const out = adaptHookEvent({ ...base("PreCompact"), trigger: "manual" }, ctx());
    expect(out).toEqual({
      kind: "events",
      events: [
        {
          type: "PRE_COMPACT",
          sessionScopeId: "synthetic-session-001",
          agentScopeId: "main",
          timestampUtc: FIXED_NOW,
        },
      ],
    });
    if (out.kind === "events") expectContractClean(out);
  });

  it("PostCompact is observation-only and yields no event", () => {
    expect(adaptHookEvent({ ...base("PostCompact"), trigger: "manual" }, ctx())).toEqual({
      kind: "ignored",
      reason: "post-compact-is-observation-only",
    });
  });

  it("CwdChanged yields a CWD_CHANGED event with HMAC ids only", () => {
    const out = adaptHookEvent(
      { ...base("CwdChanged"), old_cwd: `${CWD}`, new_cwd: `${CWD}/sub` },
      ctx(),
    );
    expect(out.kind).toBe("events");
    if (out.kind !== "events") return;
    const event = out.events[0] as Extract<GuidancePulseEvent, { type: "CWD_CHANGED" }>;
    expect(event.type).toBe("CWD_CHANGED");
    expect(event.oldPathId).toMatch(/^hmac:[0-9a-f]{64}$/);
    expect(event.newPathId).toMatch(/^hmac:[0-9a-f]{64}$/);
    expect(event.oldPathId).not.toBe(event.newPathId);
    expect(isGuidancePulseEvent(event)).toBe(true);
    expectContractClean(out);
    // Same transition under the same key is deterministic.
    const again = adaptHookEvent(
      { ...base("CwdChanged"), old_cwd: `${CWD}`, new_cwd: `${CWD}/sub` },
      ctx(),
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(out));
  });

  it("CwdChanged without old/new cwd is ignored, not invented", () => {
    expect(adaptHookEvent({ ...base("CwdChanged") }, ctx())).toEqual({
      kind: "ignored",
      reason: "cwd-change-without-old-or-new-cwd",
    });
  });

  it("SubagentStart yields SUBAGENT_STARTED with the new agent scope", () => {
    const out = adaptHookEvent(
      { ...base("SubagentStart"), agent_type: "general-purpose", agent_id: "synthetic-agent-001" },
      ctx(),
    );
    expect(out).toEqual({
      kind: "events",
      events: [
        {
          type: "SUBAGENT_STARTED",
          sessionScopeId: "synthetic-session-001",
          agentScopeId: "synthetic-agent-001",
          timestampUtc: FIXED_NOW,
        },
      ],
    });
  });

  it("SubagentStart without agent_id throws (a scope cannot be created without an id)", () => {
    expect(() =>
      adaptHookEvent({ ...base("SubagentStart"), agent_type: "general-purpose" }, ctx()),
    ).toThrowError(/MISSING_AGENT_ID/);
  });

  it("SessionStart / SessionEnd have no contract event and are ignored", () => {
    expect(adaptHookEvent({ ...base("SessionStart"), source: "startup" }, ctx())).toEqual({
      kind: "ignored",
      reason: "session-lifecycle-has-no-contract-event",
    });
    expect(adaptHookEvent({ ...base("SessionEnd"), reason: "other" }, ctx())).toEqual({
      kind: "ignored",
      reason: "session-lifecycle-has-no-contract-event",
    });
  });

  it("InstructionsLoaded yields one READ_SUCCEEDED per guidance id (deduped)", () => {
    const out = adaptHookEvent(
      {
        ...base("InstructionsLoaded"),
        reason: "session_start",
        loaded_paths: ["CLAUDE.md", ".claude/rules/security.md", "AGENTS.md"],
      },
      ctx(),
    );
    expect(out.kind).toBe("events");
    if (out.kind !== "events") return;
    expect(out.events.map((e) => (e as { guidanceId: string }).guidanceId).sort()).toEqual([
      "auth-audit",
      "auth-change-safety",
      "docs-consistency",
    ]);
    for (const event of out.events) expect(isGuidancePulseEvent(event)).toBe(true);
    expectContractClean(out);
  });

  it("InstructionsLoaded with no matching guidance is ignored", () => {
    const out = adaptHookEvent(
      { ...base("InstructionsLoaded"), reason: "session_start", loaded_paths: ["README.md"] },
      ctx(),
    );
    expect(out).toEqual({ kind: "ignored", reason: "no-matching-guidance" });
  });
});

describe("envelope validation and forward compatibility", () => {
  it("unknown event names are ignored and persist nothing", () => {
    const out = adaptHookEvent({ ...base("FutureEvent"), extra_field: "synthetic" }, ctx());
    expect(out.kind).toBe("ignored");
    if (out.kind === "ignored") expect(out.reason).toMatch(/^unknown-event:/);
  });

  it("malformed envelopes throw instead of silently producing an event", () => {
    const bad: unknown[] = [
      null,
      "synthetic-string",
      42,
      [],
      { session_id: "x", cwd: CWD },
      { hook_event_name: "PreToolUse", cwd: CWD },
      { hook_event_name: "PreToolUse", session_id: "x" },
      { hook_event_name: "", session_id: "x", cwd: CWD },
    ];
    for (const input of bad) {
      expect(() => adaptHookEvent(input, ctx())).toThrowError();
    }
  });

  it("an invalid injected timestamp throws", () => {
    expect(() =>
      adaptHookEvent({ ...base("PreCompact") }, ctx({ now: "not-a-timestamp" })),
    ).toThrowError(/INVALID_TIMESTAMP/);
  });

  it("event-name blocking table matches PROJECT_BOOK §5.3", async () => {
    const { BLOCKING_HOOK_EVENTS, OBSERVATION_ONLY_HOOK_EVENTS } = await import(
      "../../src/hooks/index.js"
    );
    expect([...BLOCKING_HOOK_EVENTS].sort()).toEqual(["PreCompact", "PreToolUse"]);
    expect(OBSERVATION_ONLY_HOOK_EVENTS).toContain("InstructionsLoaded");
    expect(OBSERVATION_ONLY_HOOK_EVENTS).toContain("CwdChanged");
    expect(BLOCKING_HOOK_EVENTS).not.toContain("InstructionsLoaded");
    expect(BLOCKING_HOOK_EVENTS).not.toContain("CwdChanged");
  });
});

describe("canary leak test (synthetic Prompt / source content)", () => {
  const CANARY_PROMPT = "CANARY-PROMPT-7f3a9d21-syn-001";
  const CANARY_SOURCE = "CANARY-SOURCE-9b4e77c2-syn-002";
  const CANARY_TOKEN = "CANARY-TOKEN-4d1a08f6-syn-003";

  const canaryInputs: Record<string, unknown>[] = [
    {
      ...base("PostToolUse"),
      tool_name: "Read",
      tool_input: { file_path: `${CWD}/CLAUDE.md`, content: CANARY_SOURCE },
      tool_response: { success: true, data: CANARY_SOURCE, prompt: CANARY_PROMPT },
      transcript_path: `/tmp/synthetic/${CANARY_PROMPT}.jsonl`,
      env: { SYNTHETIC_API_KEY: CANARY_TOKEN },
      prompt: CANARY_PROMPT,
      unknown_future_field: CANARY_PROMPT,
    },
    {
      ...base("PreToolUse"),
      tool_name: "Write",
      tool_input: { file_path: `${CWD}/src/auth/login.ts`, content: CANARY_SOURCE },
      transcript_path: `/tmp/synthetic/${CANARY_TOKEN}.jsonl`,
      prompt: CANARY_PROMPT,
    },
    {
      ...base("CwdChanged"),
      old_cwd: CWD,
      new_cwd: `${CWD}/sub`,
      transcript_path: `/tmp/synthetic/${CANARY_PROMPT}.jsonl`,
    },
    {
      ...base("PreCompact"),
      trigger: "manual",
      custom_instructions: CANARY_PROMPT,
    },
  ];

  it("no canary string appears in any adapter output", () => {
    for (const input of canaryInputs) {
      const out = adaptHookEvent(input, ctx());
      const text = JSON.stringify(out);
      expect(text).not.toContain(CANARY_PROMPT);
      expect(text).not.toContain(CANARY_SOURCE);
      expect(text).not.toContain(CANARY_TOKEN);
      expect(findBannedKeys(out)).toEqual([]);
    }
  });

  it("the sanitizer alone drops every canary field", () => {
    for (const input of canaryInputs) {
      const clean = sanitizeHookInput(input);
      const text = JSON.stringify(clean);
      expect(text).not.toContain(CANARY_PROMPT);
      expect(text).not.toContain(CANARY_SOURCE);
      expect(text).not.toContain(CANARY_TOKEN);
      expect(Object.keys(clean).sort()).toEqual(
        [
          "agentId",
          "agentType",
          "cwd",
          "hookEventName",
          "loadedPaths",
          "newCwd",
          "oldCwd",
          "reason",
          "sessionId",
          "toolFilePath",
          "toolName",
          "toolSuccess",
          "trigger",
        ].sort(),
      );
    }
  });

  it("a simulated persistence file holding the serialized events contains 0 canary hits", async () => {
    const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "guidancepulse-t003-"));
    try {
      const lines: string[] = [];
      for (const input of canaryInputs) {
        const out = adaptHookEvent(input, ctx());
        if (out.kind === "events") {
          for (const event of out.events) lines.push(JSON.stringify(event));
        } else if (out.kind === "write-check") {
          lines.push(JSON.stringify(out.request));
        }
      }
      const file = join(dir, "events.jsonl");
      await writeFile(file, `${lines.join("\n")}\n`, "utf8");
      const stored = await readFile(file, "utf8");
      for (const canary of [CANARY_PROMPT, CANARY_SOURCE, CANARY_TOKEN]) {
        expect(stored.split(canary).length - 1).toBe(0);
      }
      expect(lines.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
