/**
 * Full-chain integration test — P025 GuidancePulse, T012 (spec v1.1.0).
 *
 * Acceptance chain, driven end to end through the REAL installed
 * artifacts (real `installProject` + real `tsc` hook build + generated
 * `.guidancepulse/hooks/*.js` launchers, each spawned as a plain `node`
 * subprocess exactly as Claude Code invokes them):
 *
 *   install → Read → FRESH → Write allow → PreCompact → EXPIRED
 *   → Write deny → Read → FRESH → Write allow
 *
 * A step 0 is included before the first Read: a Write with no lease
 * (UNSEEN) under block mode must DENY (exit 2). The second Read uses
 * the PostToolUse Read-success path, so both guidance-read routes
 * (InstructionsLoaded and confirmed PostToolUse Read) are exercised
 * in the chain.
 *
 * Lease states are asserted against the real SQLite store via a
 * read-only open after each step — not against hook stdout alone.
 * Privacy is asserted on the same run: every Hook input carries
 * synthetic canaries (Prompt, source body, API key, transcript path,
 * canary cwd); none may appear in any persisted file, in hook stdout,
 * or in hook stderr, and the absolute project path must not be
 * persisted either (§7.4).
 *
 * What this does NOT prove (blocked_external, see HANDOFF_T012.md):
 * a live Claude Code session triggering these Hooks, or `onFailure:
 * "block"` failing closed inside Claude Code itself. Claude Code is
 * not installed on this machine (`claude --version` exits 127) and
 * its login needs Sam's account, so that half of E2E cannot run here.
 * What runs here is the complete Hook-entry chain Claude Code would
 * drive, with identical inputs, subprocess shape, and exit codes.
 *
 * All data is synthetic; no network, no real user config.
 */

import { describe, expect, it } from "vitest";
import {
  GUIDANCE,
  PHASE,
  T,
  assertNoCanariesPersisted,
  assertOutputHasNoCanaries,
  baseEvent,
  canaryValue,
  eventTypes,
  postReadEvent,
  preCompactEvent,
  readEvent,
  readLease,
  setupChainProject,
  teardownChainProject,
  runHook,
  writeDecisions,
  writeEvent,
} from "./t012-helpers.js";

describe("T012 full chain: install → Read → FRESH → Write allow → PreCompact → EXPIRED → Write deny → Read → FRESH", () => {
  it("runs the whole chain through the installed hook launchers", () => {
    const project = setupChainProject("chain");
    try {
      // -- install already asserted by setup (6 hooks, built entry). --
      expect(readLease(project)).toBeUndefined();

      // -- step 0: Write before any Read → UNSEEN → DENY, exit 2. --
      const w0 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t0);
      assertOutputHasNoCanaries(w0, "step0-write-unseen");
      expect(w0.status).toBe(2);
      const w0out = w0.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w0out.hookSpecificOutput?.permissionDecision).toBe("deny");

      // -- step 1: Read (InstructionsLoaded loads CLAUDE.md) → FRESH. --
      const r1 = runHook(project, "instructions-loaded.js", readEvent(project), T.t1);
      assertOutputHasNoCanaries(r1, "step1-read");
      expect(r1.status).toBe(0);
      const lease1 = readLease(project);
      expect(lease1?.state).toBe("FRESH");
      expect(lease1?.reason).toBeNull();
      expect(lease1?.phaseId).toBe(PHASE);
      expect(lease1?.remainingSuccessfulEdits).toBe(5);
      expect(lease1?.lastConfirmedReadUtc).toBe(T.t1);

      // -- step 2: Write on a FRESH lease → ALLOW, exit 0. --
      const w1 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t2);
      assertOutputHasNoCanaries(w1, "step2-write-allow");
      expect(w1.status).toBe(0);
      const w1out = w1.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w1out.hookSpecificOutput?.permissionDecision).toBe("allow");

      // -- step 3: PreCompact → lease EXPIRED / CONTEXT_COMPACTION. --
      const c1 = runHook(project, "pre-compact.js", preCompactEvent(project), T.t3);
      assertOutputHasNoCanaries(c1, "step3-precompact");
      expect(c1.status).toBe(0);
      const c1out = c1.json as {
        persisted?: boolean;
        blocked?: boolean;
        invalidatedGuidanceIds?: string[];
      };
      expect(c1out.persisted).toBe(true);
      expect(c1out.blocked).toBe(false);
      expect(c1out.invalidatedGuidanceIds).toContain(GUIDANCE);
      const lease3 = readLease(project);
      expect(lease3?.state).toBe("EXPIRED");
      expect(lease3?.reason).toBe("CONTEXT_COMPACTION");
      expect(lease3?.lastConfirmedReadUtc).toBe(T.t1);

      // -- step 4: Write on an EXPIRED lease → DENY, exit 2. --
      const w2 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t4);
      assertOutputHasNoCanaries(w2, "step4-write-deny");
      expect(w2.status).toBe(2);
      const w2out = w2.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w2out.hookSpecificOutput?.permissionDecision).toBe("deny");

      // -- step 5: Re-read (PostToolUse Read success) → FRESH again. --
      const r2 = runHook(project, "post-tool-use.js", postReadEvent(project), T.t5);
      assertOutputHasNoCanaries(r2, "step5-reread");
      expect(r2.status).toBe(0);
      const lease5 = readLease(project);
      expect(lease5?.state).toBe("FRESH");
      expect(lease5?.reason).toBeNull();
      expect(lease5?.remainingSuccessfulEdits).toBe(5);
      expect(lease5?.lastConfirmedReadUtc).toBe(T.t5);

      // -- step 6: Write on the refreshed lease → ALLOW, exit 0. --
      const w3 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t6);
      assertOutputHasNoCanaries(w3, "step6-write-allow");
      expect(w3.status).toBe(0);
      const w3out = w3.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w3out.hookSpecificOutput?.permissionDecision).toBe("allow");

      // -- audit trail: decisions and event types in the real store. --
      expect(writeDecisions(project)).toEqual(["DENY", "ALLOW", "DENY", "ALLOW"]);
      const types = eventTypes(project);
      expect(types.filter((t) => t === "READ_SUCCEEDED")).toHaveLength(2);
      expect(types.filter((t) => t === "PRE_COMPACT")).toHaveLength(1);
      expect(types.filter((t) => t === "WRITE_CHECKED")).toHaveLength(4);

      // -- privacy: no canary, no absolute project path, in any persisted file. --
      assertNoCanariesPersisted(project);
    } finally {
      teardownChainProject(project);
    }
  }, 180000);

  it("rejects a Write to a path outside the project without a gate (ignored, exit 0)", () => {
    const project = setupChainProject("outside");
    try {
      const outside = runHook(
        project,
        "pre-tool-use.js",
        baseEvent(project, {
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: { file_path: "/etc/passwd", content: "x" },
        }),
        T.t0,
      );
      expect(outside.status).toBe(0);
      const out = outside.json as { ignored?: boolean; reason?: string };
      expect(out.ignored).toBe(true);
      expect(out.reason).toBe("target-outside-project");
      expect(readLease(project)).toBeUndefined();
    } finally {
      teardownChainProject(project);
    }
  }, 180000);
});

describe("FIX-R4: Windows drive-letter paths through the installed hook launchers", () => {
  it("gates Windows absolute Write/Edit through the real hook entry (outside ignored, UNSEEN deny, Read FRESH, allow)", () => {
    const project = setupChainProject("winpath");
    const WIN_CWD = "C:\\synthetic\\project";
    const WIN_TARGET = "C:\\synthetic\\project\\src\\auth\\login.ts";
    const WIN_OUTSIDE = "D:\\other\\src\\auth\\login.ts";
    const WIN_GUIDANCE = "C:\\synthetic\\project\\CLAUDE.md";
    const winWrite = (filePath: string) =>
      baseEvent(project, {
        cwd: WIN_CWD,
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: filePath, content: canaryValue("source") },
      });
    const winEdit = (filePath: string) =>
      baseEvent(project, {
        cwd: WIN_CWD,
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {
          file_path: filePath,
          old_string: canaryValue("source"),
          new_string: "synthetic replacement",
        },
      });
    try {
      // -- step -1: Write outside the Windows cwd is ignored, exit 0. --
      const outside = runHook(project, "pre-tool-use.js", winWrite(WIN_OUTSIDE), T.t0);
      assertOutputHasNoCanaries(outside, "win-outside-write");
      expect(outside.status).toBe(0);
      const outsideOut = outside.json as { ignored?: boolean; reason?: string };
      expect(outsideOut.ignored).toBe(true);
      expect(outsideOut.reason).toBe("target-outside-project");
      expect(readLease(project)).toBeUndefined();

      // -- step 0: Windows Write before any Read → UNSEEN → DENY, exit 2. --
      const w0 = runHook(project, "pre-tool-use.js", winWrite(WIN_TARGET), T.t1);
      assertOutputHasNoCanaries(w0, "win-write-unseen");
      expect(w0.status).toBe(2);
      const w0out = w0.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w0out.hookSpecificOutput?.permissionDecision).toBe("deny");

      // -- step 0b: Windows Edit before any Read → UNSEEN → DENY, exit 2. --
      const e0 = runHook(project, "pre-tool-use.js", winEdit(WIN_TARGET), T.t2);
      assertOutputHasNoCanaries(e0, "win-edit-unseen");
      expect(e0.status).toBe(2);
      const e0out = e0.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(e0out.hookSpecificOutput?.permissionDecision).toBe("deny");

      // -- step 1: PostToolUse Read of CLAUDE.md via a Windows path → FRESH. --
      const r1 = runHook(
        project,
        "post-tool-use.js",
        baseEvent(project, {
          cwd: WIN_CWD,
          hook_event_name: "PostToolUse",
          tool_name: "Read",
          tool_input: { file_path: WIN_GUIDANCE },
          tool_response: {
            success: true,
            stdout: canaryValue("source"),
            content: canaryValue("api-key"),
          },
        }),
        T.t3,
      );
      assertOutputHasNoCanaries(r1, "win-read");
      expect(r1.status).toBe(0);
      const lease1 = readLease(project);
      expect(lease1?.state).toBe("FRESH");
      expect(lease1?.reason).toBeNull();
      expect(lease1?.phaseId).toBe(PHASE);
      expect(lease1?.remainingSuccessfulEdits).toBe(5);
      expect(lease1?.lastConfirmedReadUtc).toBe(T.t3);

      // -- step 2: Windows Write on a FRESH lease → ALLOW, exit 0. --
      const w1 = runHook(project, "pre-tool-use.js", winWrite(WIN_TARGET), T.t4);
      assertOutputHasNoCanaries(w1, "win-write-allow");
      expect(w1.status).toBe(0);
      const w1out = w1.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(w1out.hookSpecificOutput?.permissionDecision).toBe("allow");

      // -- step 3: Windows Edit on a FRESH lease → ALLOW, exit 0. --
      const e1 = runHook(project, "pre-tool-use.js", winEdit(WIN_TARGET), T.t5);
      assertOutputHasNoCanaries(e1, "win-edit-allow");
      expect(e1.status).toBe(0);
      const e1out = e1.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(e1out.hookSpecificOutput?.permissionDecision).toBe("allow");

      // -- audit trail: decisions and event types in the real store. --
      expect(writeDecisions(project)).toEqual(["DENY", "DENY", "ALLOW", "ALLOW"]);
      const types = eventTypes(project);
      expect(types.filter((t) => t === "READ_SUCCEEDED")).toHaveLength(1);
      expect(types.filter((t) => t === "WRITE_CHECKED")).toHaveLength(4);

      // -- privacy: no canary, no absolute project path, in any persisted file. --
      assertNoCanariesPersisted(project);
    } finally {
      teardownChainProject(project);
    }
  }, 180000);
});
