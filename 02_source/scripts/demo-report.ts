/**
 * Demo report generator — P025 GuidancePulse, T008.
 *
 * Run: `npm run demo:report` (vite-node).
 *
 * Replays the fixed synthetic demo sequence through the REAL stack —
 * T007 SQLite store, T004 lease machine, T005 write gate,
 * T006 phase command — and writes the report artifacts:
 *
 *   artifacts/demo/state.sqlite   (real store; regenerated each run)
 *   artifacts/demo/timeline.json  (exportEventsJson + leases, via the
 *                                  T007 privacy export path)
 *   artifacts/demo/timeline.html  (static offline report)
 *
 * All paths, guidance IDs, and timestamps are synthetic and fixed.
 * No Prompt, source code, absolute path, or user data is used.
 * The generated timeline.json / timeline.html must match the React
 * demo model story (same events, same final lease states); the UI
 * test `tests/unit/ui.test.ts` asserts the store-derived model equals
 * the demo model on events and lease states.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GuidancePulseStore } from "../src/store/index.js";
import {
  computePathIdForKey,
  exportEventsJson,
  loadOrCreatePathKey,
} from "../src/privacy/index.js";
import { setPhase } from "../src/cli/phase.js";
import {
  buildReportJson,
  buildReportModel,
  renderTimelineHtml,
} from "../src/report/index.js";
import type { GuidancePulseEvent } from "../src/contracts/index.js";

const SESSION = "demo-session-01";
const AGENT = "main";
const SUBAGENT = "subagent-01";

const T = {
  readAuth: "2026-11-15T10:14:03Z",
  writeAuth: "2026-11-15T10:15:20Z",
  phaseReview: "2026-11-15T10:20:02Z",
  readRelease: "2026-11-15T10:21:37Z",
  writeRelease: "2026-11-15T10:24:10Z",
  compact: "2026-11-15T10:31:55Z",
  writeReleaseDenied: "2026-11-15T10:33:02Z",
  cwdChange: "2026-11-15T10:40:18Z",
  subagent: "2026-11-15T10:45:44Z",
  writeApiDenied: "2026-11-15T10:47:09Z",
  readReleaseAgain: "2026-11-15T10:52:30Z",
  writeReleaseAgain: "2026-11-15T10:53:15Z",
} as const;

/** Replay one write check exactly the way T005 does, then audit it. */
function writeCheck(
  store: GuidancePulseStore,
  guidanceId: string,
  pathId: string,
  cwdPathId: string,
  phaseId: string,
  timestampUtc: string,
): void {
  const check = store.checkWriteAndPersist(
    {
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      cwdPathId,
      phaseId,
      rules: [{ id: guidanceId, mode: "block" }],
    },
    timestampUtc,
  );
  for (const ruleResult of check.perRule) {
    const event: GuidancePulseEvent = {
      type: "WRITE_CHECKED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      guidanceId: ruleResult.guidanceId,
      pathId,
      decision: check.decision,
      state: ruleResult.state,
      timestampUtc,
    };
    store.recordEvent(event);
  }
  // A successful write spends one edit of the budget (§6.3).
  if (check.decision === "ALLOW") {
    store.recordWriteOutcomeAndPersist(SESSION, AGENT, guidanceId, "success", timestampUtc);
  }
}

function main(): void {
  const outDir = join(process.cwd(), "artifacts", "demo");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const keyDir = join(outDir, ".guidancepulse");
  const { key } = loadOrCreatePathKey(keyDir);
  // Synthetic relative paths only — never an absolute path.
  const cwdA = computePathIdForKey("demo-project", key);
  const cwdB = computePathIdForKey("demo-project/subdir", key);
  const targetAuth = computePathIdForKey("src/auth/login.ts", key);
  const targetRelease = computePathIdForKey("src/release/checklist.md", key);
  const targetApi = computePathIdForKey("src/api/client.ts", key);

  const store = GuidancePulseStore.open(join(outDir, "state.sqlite"));

  // 1. Read auth guidance in `implementation` -> FRESH (5 edits).
  store.recordEvent(
    {
      type: "READ_SUCCEEDED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      guidanceId: "auth-change-safety",
      pathId: targetAuth,
      timestampUtc: T.readAuth,
    },
    { phaseId: "implementation", cwdPathId: cwdA, maxSuccessfulEdits: 5 },
  );
  // 2. Write check -> ALLOW, spends one edit (4 left).
  writeCheck(store, "auth-change-safety", targetAuth, cwdA, "implementation", T.writeAuth);
  // 3. Explicit phase change -> auth lease EXPIRED (PHASE_MISMATCH).
  setPhase(store, {
    sessionScopeId: SESSION,
    agentScopeId: AGENT,
    phaseId: "review",
    timestampUtc: T.phaseReview,
    allowedPhases: ["explore", "implementation", "review", "release"],
  });
  // 4. Read release guidance in `review` -> FRESH (5 edits).
  store.recordEvent(
    {
      type: "READ_SUCCEEDED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      guidanceId: "release-checklist",
      pathId: targetRelease,
      timestampUtc: T.readRelease,
    },
    { phaseId: "review", cwdPathId: cwdA, maxSuccessfulEdits: 5 },
  );
  // 5. Write check -> ALLOW, spends one edit (4 left).
  writeCheck(store, "release-checklist", targetRelease, cwdA, "review", T.writeRelease);
  // 6. Compaction -> release lease EXPIRED (CONTEXT_COMPACTION).
  store.recordEvent({
    type: "PRE_COMPACT",
    sessionScopeId: SESSION,
    agentScopeId: AGENT,
    timestampUtc: T.compact,
  });
  // 7. Write check without re-read -> DENY (block mode).
  writeCheck(store, "release-checklist", targetRelease, cwdA, "review", T.writeReleaseDenied);
  // 8. Working directory changes.
  store.recordEvent({
    type: "CWD_CHANGED",
    sessionScopeId: SESSION,
    agentScopeId: AGENT,
    oldPathId: cwdA,
    newPathId: cwdB,
    timestampUtc: T.cwdChange,
  });
  // 9. A subagent starts in its own scope (parent leases not inherited).
  store.recordEvent({
    type: "SUBAGENT_STARTED",
    sessionScopeId: SESSION,
    agentScopeId: SUBAGENT,
    timestampUtc: T.subagent,
  });
  // 10. Write to never-read guidance -> DENY (UNSEEN).
  writeCheck(store, "api-rate-limits", targetApi, cwdB, "review", T.writeApiDenied);
  // 11. Re-read release guidance in the new cwd -> FRESH again.
  store.recordEvent(
    {
      type: "READ_SUCCEEDED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      guidanceId: "release-checklist",
      pathId: targetRelease,
      timestampUtc: T.readReleaseAgain,
    },
    { phaseId: "review", cwdPathId: cwdB, maxSuccessfulEdits: 5 },
  );
  // 12. Write check -> ALLOW, spends one edit (4 left).
  writeCheck(store, "release-checklist", targetRelease, cwdB, "review", T.writeReleaseAgain);

  const events = store.listEvents({ sessionScopeId: SESSION });
  const leases = store.listLeasesForScope(SESSION, AGENT);
  const model = buildReportModel(SESSION, AGENT, events, leases, "review");
  const json = buildReportJson(model);
  const html = renderTimelineHtml(model);
  writeFileSync(join(outDir, "timeline.json"), json);
  writeFileSync(join(outDir, "timeline.html"), html);
  // Keep the raw privacy export next to the model for cross-checking.
  writeFileSync(join(outDir, "events.json"), exportEventsJson(store, SESSION));
  store.close();

  const summary = [
    `events: ${events.length}`,
    `leases: ${leases.length}`,
    ...leases.map(
      (lease) =>
        `${lease.guidanceId}: ${lease.state} ${lease.remainingSuccessfulEdits}/${lease.maxSuccessfulEdits}` +
        (lease.reason === null ? "" : ` (${lease.reason})`),
    ),
  ].join("\n  ");
  console.log(`demo report written to ${outDir}\n  ${summary}`);
}

main();
