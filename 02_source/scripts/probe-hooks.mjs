// T001 probe: local Claude Code Hook PoC (synthetic data only).
// Purpose: validate that synthetic Hook JSON payloads shaped per the
// official Claude Code Hooks reference parse correctly, and demonstrate
// the PreToolUse decision output shape. This is NOT production code
// (production adapter is T003) and does NOT call any model API, does
// NOT contact Claude Code, and does NOT read any real user prompt,
// transcript, source file or credential. All inputs are synthetic.
//
// Usage:
//   node scripts/probe-hooks.mjs --synthetic   # run built-in synthetic events
//   echo '<hook json>' | node scripts/probe-hooks.mjs   # parse one stdin event
//
// Exit code: 0 = probe completed (all synthetic events parsed as
// expected). A synthetic DENY decision inside the probe does NOT make
// the probe fail; the would-be hook exit code is printed per event.

import { readFileSync } from "node:fs";

// Events the product needs, per PROJECT_BOOK.md §5.3 and the official
// Hooks reference (https://code.claude.com/docs/en/hooks, checked
// 2026-11-15). "canBlock" = the reference documents a decision that
// can stop the triggering action on this event.
const KNOWN_EVENTS = {
  PreToolUse: { canBlock: true, matcherOn: "tool name", note: "core write gate (Write|Edit)" },
  PostToolUse: { canBlock: false, matcherOn: "tool name", note: "success Read -> FRESH lease" },
  PreCompact: { canBlock: true, matcherOn: "compaction trigger", note: "core invalidation gate" },
  PostCompact: { canBlock: false, matcherOn: "compaction trigger", note: "non-blocking observation" },
  InstructionsLoaded: { canBlock: false, matcherOn: "load reason", note: "async observation only; CLAUDE.md / .claude/rules/*.md" },
  CwdChanged: { canBlock: false, matcherOn: "none", note: "async observation only" },
  SubagentStart: { canBlock: false, matcherOn: "agent type", note: "new agent scope, starts UNSEEN" },
  SessionStart: { canBlock: false, matcherOn: "startup source", note: "session scope init" },
  SessionEnd: { canBlock: false, matcherOn: "end reason", note: "session cleanup" },
};

// Synthetic payloads. Values are invented (session "synthetic-session-001",
// cwd "/tmp/synthetic-project") and contain no real user data.
function syntheticEvents() {
  const base = {
    session_id: "synthetic-session-001",
    transcript_path: "/tmp/synthetic-project/.synthetic-transcript.jsonl",
    cwd: "/tmp/synthetic-project",
  };
  return [
    { hook_event_name: "SessionStart", ...base, source: "startup" },
    {
      hook_event_name: "InstructionsLoaded",
      ...base,
      reason: "session_start",
      loaded_paths: ["CLAUDE.md", ".claude/rules/security.md"],
    },
    {
      hook_event_name: "PostToolUse",
      ...base,
      tool_name: "Read",
      tool_input: { file_path: "/tmp/synthetic-project/CLAUDE.md" },
      tool_response: { success: true },
    },
    {
      hook_event_name: "PreToolUse",
      ...base,
      tool_name: "Write",
      tool_input: { file_path: "/tmp/synthetic-project/src/auth/login.ts" },
      // Synthetic lease state for the PoC only: no FRESH lease exists.
      _synthetic_lease_state: "UNSEEN",
    },
    {
      hook_event_name: "PreToolUse",
      ...base,
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/synthetic-project/src/auth/login.ts" },
      _synthetic_lease_state: "FRESH",
    },
    { hook_event_name: "PreCompact", ...base, trigger: "manual", custom_instructions: "" },
    { hook_event_name: "PostCompact", ...base, trigger: "manual" },
    {
      hook_event_name: "CwdChanged",
      ...base,
      old_cwd: "/tmp/synthetic-project",
      new_cwd: "/tmp/synthetic-project/sub",
    },
    { hook_event_name: "SubagentStart", ...base, agent_type: "general-purpose", agent_id: "synthetic-agent-001" },
    { hook_event_name: "SessionEnd", ...base, reason: "other" },
  ];
}

// Validate one parsed Hook JSON object; returns { ok, errors[], normalized }.
function probeEvent(input) {
  const errors = [];
  const name = input?.hook_event_name;
  if (typeof name !== "string" || name.length === 0) errors.push("missing hook_event_name");
  const known = name ? KNOWN_EVENTS[name] : undefined;
  if (name && !known) errors.push(`unknown event name: ${name}`);
  if (typeof input?.session_id !== "string") errors.push("missing session_id");
  if (typeof input?.cwd !== "string") errors.push("missing cwd");

  let decision = null;
  if (name === "PreToolUse") {
    const tool = input.tool_name;
    if (tool !== "Write" && tool !== "Edit" && tool !== "Read" && tool !== "Bash") {
      errors.push(`unexpected tool_name for probe: ${tool}`);
    }
    if (tool === "Write" || tool === "Edit") {
      // PoC decision shape only. Real lease lookup is T004/T005.
      const lease = input._synthetic_lease_state ?? "UNSEEN";
      if (lease === "FRESH") {
        decision = { permissionDecision: "allow", wouldBeExitCode: 0, reason: "synthetic FRESH lease" };
      } else {
        decision = {
          permissionDecision: "deny",
          permissionDecisionReason: `synthetic lease state ${lease}: guidance not (re-)read in this scope`,
          wouldBeExitCode: 2,
          reason: "synthetic UNSEEN/EXPIRED lease",
        };
      }
    } else {
      decision = { permissionDecision: "allow", wouldBeExitCode: 0, reason: "tool not gated by GuidancePulse" };
    }
  }
  if (name === "PreCompact") {
    decision = { action: "invalidate leases in scope (synthetic)", wouldBeExitCode: 0 };
  }
  return {
    ok: errors.length === 0,
    errors,
    event: name ?? null,
    known: Boolean(known),
    canBlock: known?.canBlock ?? null,
    decision,
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const args = process.argv.slice(2);
if (args.includes("--synthetic")) {
  const started = Date.now();
  const results = [];
  for (const ev of syntheticEvents()) {
    const t0 = process.hrtime.bigint();
    const r = probeEvent(ev);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    results.push({ ...r, probeMs: Number(ms.toFixed(3)) });
    console.log(
      JSON.stringify({
        event: r.event,
        ok: r.ok,
        known: r.known,
        canBlock: r.canBlock,
        decision: r.decision,
        probeMs: Number(ms.toFixed(3)),
        errors: r.errors,
      }),
    );
  }
  const failed = results.filter((r) => !r.ok);
  const byEvent = {};
  for (const r of results) byEvent[r.event] = (byEvent[r.event] ?? 0) + 1;
  console.log(
    JSON.stringify({
      summary: {
        totalSyntheticEvents: results.length,
        distinctEvents: Object.keys(byEvent).length,
        failed: failed.length,
        eventsSeen: Object.keys(byEvent).sort(),
        totalProbeMs: Date.now() - started,
        note: "Synthetic-only probe. No Claude Code binary, model API, real prompt, transcript, source or credential was used. Real Claude Code hook behaviour is NOT verified on this VM because `claude` is not installed.",
      },
    }),
  );
  process.exit(failed.length === 0 ? 0 : 1);
} else {
  const raw = await readStdin();
  if (!raw.trim()) {
    console.error("probe-hooks.mjs: no JSON on stdin; use --synthetic for the built-in probe.");
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`probe-hooks.mjs: invalid JSON on stdin: ${e.message}`);
    process.exit(2);
  }
  const r = probeEvent(parsed);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
