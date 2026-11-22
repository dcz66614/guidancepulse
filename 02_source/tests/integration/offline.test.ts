/**
 * Offline regression — P025 GuidancePulse, T012 (spec v1.1.0, §7.5 / §9.7).
 *
 * Two independent proofs that GuidancePulse makes zero external
 * requests:
 *
 * 1. Static scan: the same network call-site patterns the S0 gate
 *    uses (`scripts/s0-gate.ts` gate 6) are run over every production
 *    TypeScript file under `src/` plus the shipped hook entry
 *    `scripts/hook-entry.ts`. Comment lines are skipped, exactly as
 *    in the S0 gate. Any `fetch(`, `node:http`, `WebSocket(`,
 *    `http.request`, URL literal in code, etc. fails the test.
 *    (The S0 gate harnesses themselves — `s0-gate.ts`, `perf-hook.ts`,
 *    `repeat-s0.ts` — are dev-only scripts, never shipped or invoked
 *    by a Hook, and are excluded: they contain these very patterns
 *    as data, so scanning them would self-flag. The shipped entry
 *    point, `hook-entry.ts`, IS scanned.)
 *
 * 2. Runtime: the Read → Write-allow half of the T012 chain is run
 *    with the hook subprocesses inside a fresh network namespace
 *    (`unshare -rn` — no interfaces at all, not even loopback). Any
 *    network attempt would fail with ENETUNREACH/ENETDOWN and change
 *    the outcome; the chain must still return the identical
 *    decisions and exit codes as with networking available. This is
 *    stronger than a proxy honeypot: there is literally no network
 *    for the process to use.
 *
 * All data is synthetic; no network, no real user config.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  T,
  readEvent,
  readLease,
  setupChainProject,
  teardownChainProject,
  runHook,
  writeEvent,
} from "./t012-helpers.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Same patterns as the S0 gate (scripts/s0-gate.ts NETWORK_PATTERNS). */
const NETWORK_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "axios", re: /\baxios\b/ },
  { name: "node:http import", re: /from\s+["']node:http["']/ },
  { name: "node:https import", re: /from\s+["']node:https["']/ },
  { name: "node:net import", re: /from\s+["']node:net["']/ },
  { name: "node:dgram import", re: /from\s+["']node:dgram["']/ },
  { name: "node:dns import", re: /from\s+["']node:dns["']/ },
  { name: "WebSocket(", re: /\bWebSocket\s*\(/ },
  { name: "http.request", re: /\bhttps?\.request\s*\(/ },
  { name: "http.get", re: /\bhttps?\.get\s*\(/ },
  { name: "net.connect", re: /\bnet\.connect\s*\(/ },
  { name: "XMLHttpRequest", re: /\bXMLHttpRequest\b/ },
  { name: "http url literal", re: /https?:\/\/[a-z0-9.-]+/i },
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("T012 offline: no external requests", () => {
  it("static scan: zero network call sites and zero URL literals in src/ + shipped hook entry", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "src")),
      join(ROOT, "scripts", "hook-entry.ts"),
    ];
    expect(files.length).toBeGreaterThan(0);
    const hits: { file: string; line: number; pattern: string; text: string }[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((text, idx) => {
        const trimmed = text.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) return; // doc comment, not code
        for (const { name, re } of NETWORK_PATTERNS) {
          if (!re.test(text)) continue;
          hits.push({
            file: file.slice(ROOT.length + 1),
            line: idx + 1,
            pattern: name,
            text: trimmed.slice(0, 160),
          });
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it("runtime: Read → FRESH → Write allow inside a network namespace with no interfaces", () => {
    const project = setupChainProject("offline");
    try {
      const runNetns = (
        launcherFile: string,
        event: Record<string, unknown>,
        now: string,
      ): { status: number | null; stdout: string; stderr: string; json: unknown } => {
        const run = spawnSync(
          "unshare",
          ["-rn", "node", join(project.hooksDir, launcherFile)],
          {
            input: JSON.stringify(event),
            encoding: "utf-8",
            timeout: 60000,
            env: {
              ...process.env,
              GP_PHASE: "implementation",
              GP_NOW: now,
            },
          },
        );
        let json: unknown = null;
        const trimmed = (run.stdout ?? "").trim();
        if (trimmed.length > 0) {
          try {
            json = JSON.parse(trimmed) as unknown;
          } catch {
            json = null;
          }
        }
        return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "", json };
      };

      // Sanity: the namespace really has no network. `node -e` asking
      // for a TCP connect must fail — if this passes, the sandbox is
      // not isolating and the proof below would be vacuous.
      const probe = spawnSync(
        "unshare",
        [
          "-rn",
          "node",
          "-e",
          "require('net').connect(80,'8.8.8.8').on('error',()=>process.exit(3)).on('connect',()=>process.exit(0))",
        ],
        { encoding: "utf-8", timeout: 30000 },
      );
      expect(probe.status).toBe(3);

      // Same chain steps as the full-chain test, minus PreCompact.
      const r1 = runNetns("instructions-loaded.js", readEvent(project), T.t1);
      expect(r1.status).toBe(0);
      expect(readLease(project)?.state).toBe("FRESH");

      const w1 = runNetns("pre-tool-use.js", writeEvent(project), T.t2);
      expect(w1.status).toBe(0);
      const out = w1.json as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(out.hookSpecificOutput?.permissionDecision).toBe("allow");

      // PreCompact under no-network must also persist the invalidation.
      const c1 = runNetns("pre-compact.js", {
        hook_event_name: "PreCompact",
        session_id: "synthetic-session-t012",
        cwd: project.dir,
      }, T.t3);
      expect(c1.status).toBe(0);
      expect(readLease(project)?.state).toBe("EXPIRED");
      expect(readLease(project)?.reason).toBe("CONTEXT_COMPACTION");
    } finally {
      teardownChainProject(project);
    }
  }, 180000);
});
