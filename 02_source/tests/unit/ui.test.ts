/**
 * UI tests — P025 GuidancePulse, T008.
 *
 * Covers, without a browser:
 *   - the pure timeline model (§8.1 four zones, §8.2 colours/text+icon);
 *   - the static HTML/JSON report (offline, escaped, no script);
 *   - the real store → UI path: the fixed demo sequence replayed
 *     through the T007 store + T004 machine + T005 gate + T006 phase
 *     command must produce a model deep-equal to the React demo model.
 *
 * All data is synthetic. No Prompt, source code, or path ever appears:
 * path ids are fixed `hmac:<hex>` values.
 */

import { describe, expect, it } from "vitest";
import { buildDemoModel, DEMO_EVENTS, DEMO_LEASES, DEMO_PATH_IDS } from "../../src/ui/demo-data.js";
import {
  buildTimelineModel,
  filterEntriesByGuidance,
  LEASE_STATE_DISPLAY,
  shortPathId,
  WRITE_DECISION_DISPLAY,
  type TimelineModel,
} from "../../src/ui/timeline.js";
import {
  buildReportJson,
  buildReportModel,
  escapeHtml,
  renderTimelineHtml,
} from "../../src/report/report.js";
import { GuidancePulseStore } from "../../src/store/index.js";
import { setPhase } from "../../src/cli/phase.js";

const SESSION = "demo-session-01";
const AGENT = "main";

describe("shortPathId", () => {
  it("shortens a well-formed hmac path id to its first 6 hex chars", () => {
    expect(shortPathId(DEMO_PATH_IDS.cwdImplementation)).toBe("hmac:8a12c9…");
    expect(shortPathId(DEMO_PATH_IDS.targetRelease)).toBe("hmac:d902ab…");
  });

  it("never echoes a malformed path id", () => {
    expect(shortPathId("not-a-path-id")).toBe("hmac:—");
    expect(shortPathId("/home/someone/secret/project/src/auth/login.ts")).toBe("hmac:—");
    expect(shortPathId(null)).toBe("hmac:—");
    expect(shortPathId(undefined)).toBe("hmac:—");
  });
});

describe("buildTimelineModel (demo data)", () => {
  const model = buildDemoModel();

  it("shows session / agent / phase / last compact in the session bar", () => {
    expect(model.sessionScopeId).toBe(SESSION);
    expect(model.agentScopeId).toBe(AGENT);
    expect(model.phaseId).toBe("review");
    expect(model.lastCompactUtc).toBe("2026-11-15T10:31:55Z");
  });

  it("shows every guidance with state and remaining edits", () => {
    expect(model.guidances.map((g) => g.guidanceId)).toEqual([
      "api-rate-limits",
      "auth-change-safety",
      "release-checklist",
    ]);
    const byId = new Map(model.guidances.map((g) => [g.guidanceId, g]));
    expect(byId.get("api-rate-limits")).toMatchObject({
      state: "UNSEEN",
      remainingSuccessfulEdits: null,
      maxSuccessfulEdits: null,
      reason: null,
    });
    expect(byId.get("auth-change-safety")).toMatchObject({
      state: "EXPIRED",
      remainingSuccessfulEdits: 4,
      maxSuccessfulEdits: 5,
      reason: "PHASE_MISMATCH",
      lastConfirmedReadUtc: "2026-11-15T10:14:03Z",
    });
    expect(byId.get("release-checklist")).toMatchObject({
      state: "FRESH",
      remainingSuccessfulEdits: 4,
      maxSuccessfulEdits: 5,
      reason: null,
      lastConfirmedReadUtc: "2026-11-15T10:52:30Z",
    });
  });

  it("shows all six timeline kinds", () => {
    const kinds = model.entries.map((e) => e.kind);
    expect(kinds).toEqual([
      "read",
      "write",
      "phase",
      "read",
      "write",
      "compact",
      "write",
      "cwd",
      "subagent",
      "write",
      "read",
      "write",
    ]);
    expect(new Set(kinds).size).toBe(6);
  });

  it("labels write decisions with decision and lease state", () => {
    const writes = model.entries.filter((e) => e.kind === "write");
    expect(writes.map((e) => [e.decision, e.state])).toEqual([
      ["ALLOW", "FRESH"],
      ["ALLOW", "FRESH"],
      ["DENY", "EXPIRED"],
      ["DENY", "UNSEEN"],
      ["ALLOW", "FRESH"],
    ]);
  });

  it("carries the invalidation reason on boundary events", () => {
    const compact = model.entries.find((e) => e.kind === "compact");
    expect(compact?.reason).toBe("CONTEXT_COMPACTION");
    expect(compact?.detail).toContain("CONTEXT_COMPACTION");
    expect(model.entries.find((e) => e.kind === "cwd")?.reason).toBe("CWD_MISMATCH");
    expect(model.entries.find((e) => e.kind === "subagent")?.reason).toBe("SUBAGENT_SCOPE");
    expect(model.entries.find((e) => e.kind === "phase")?.reason).toBe("PHASE_MISMATCH");
  });

  it("tells a denied write to re-read, without any source code", () => {
    const denied = model.entries.filter((e) => e.decision === "DENY");
    expect(denied).toHaveLength(2);
    for (const entry of denied) {
      expect(entry.detail).toContain("Re-read the guidance, then retry the write.");
      expect(entry.detail).not.toMatch(/src\/|login\.ts|function|const /);
    }
  });

  it("shows every state with text and an icon, never colour alone", () => {
    for (const display of Object.values(LEASE_STATE_DISPLAY)) {
      expect(display.label).toBeTruthy();
      expect(display.icon).toBeTruthy();
      expect(display.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const display of Object.values(WRITE_DECISION_DISPLAY)) {
      expect(display.label).toBeTruthy();
      expect(display.icon).toBeTruthy();
      expect(display.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    // §8.2 colours.
    expect(LEASE_STATE_DISPLAY.FRESH.color).toBe("#1a7f37");
    expect(LEASE_STATE_DISPLAY.UNSEEN.color).toBe("#57606a");
    expect(LEASE_STATE_DISPLAY.EXPIRED.color).toBe("#bc4c00");
    expect(WRITE_DECISION_DISPLAY.DENY.color).toBe("#cf222e");
    expect(WRITE_DECISION_DISPLAY.ASK.color).toBe("#9a6700");
    expect(WRITE_DECISION_DISPLAY.WARN.color).toBe("#0969da");
  });

  it("filters the timeline by guidance id", () => {
    const filtered = filterEntriesByGuidance(model.entries, "release-checklist");
    expect(filtered.map((e) => e.id)).toEqual(["e4", "e5", "e7", "e11", "e12"]);
    expect(filterEntriesByGuidance(model.entries, null)).toHaveLength(model.entries.length);
    expect(filterEntriesByGuidance(model.entries, "no-such-guidance")).toHaveLength(0);
  });

  it("rejects a non-contract event instead of rendering it", () => {
    const bad = {
      type: "READ_SUCCEEDED",
      sessionScopeId: SESSION,
      agentScopeId: AGENT,
      guidanceId: "x",
      pathId: "/absolute/path/leak.ts",
      timestampUtc: "2026-11-15T10:00:00Z",
    } as never;
    expect(() =>
      buildTimelineModel({
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        events: [bad],
        leases: [],
      }),
    ).toThrow("UI_INVALID_EVENT");
  });
});

describe("static report", () => {
  const model = buildDemoModel();

  it("exports deterministic JSON that round-trips", () => {
    const json = buildReportJson(model);
    expect(json.endsWith("\n")).toBe(true);
    expect(JSON.parse(json)).toEqual(JSON.parse(buildReportJson(model)));
    expect(buildReportJson(model)).toBe(json);
  });

  it("renders standalone HTML with no script and no external URL", () => {
    const html = renderTimelineHtml(model);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i);
    expect(html).toContain("demo-session-01");
    expect(html).toContain("release-checklist");
    expect(html).toContain("CONTEXT_COMPACTION");
    expect(html).toContain("PHASE_MISMATCH");
  });

  it("escapes hostile guidance ids instead of injecting markup", () => {
    const hostile = '<img src=x onerror=alert(1)>';
    expect(escapeHtml(hostile)).toBe("&lt;img src=x onerror=alert(1)&gt;");
    const modelWithHostile: TimelineModel = {
      ...model,
      guidances: [
        {
          guidanceId: hostile,
          state: "UNSEEN",
          remainingSuccessfulEdits: null,
          maxSuccessfulEdits: null,
          reason: null,
          lastConfirmedReadUtc: null,
          cwdPathIdShort: null,
        },
      ],
      entries: [],
    };
    const html = renderTimelineHtml(modelWithHostile);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("never contains a real path, prompt, or source fragment", () => {
    const text = buildReportJson(model) + renderTimelineHtml(model);
    expect(text).not.toMatch(/\/home\/|\/Users\/|C:\\|login\.ts|checklist\.md|client\.ts/);
    expect(text).not.toContain("demo-project");
  });
});

describe("store → UI path (real store replay)", () => {
  it("replaying the demo sequence through the store yields the demo model", () => {
    const store = GuidancePulseStore.open(":memory:");
    try {
      const cwdA = DEMO_PATH_IDS.cwdImplementation;
      const cwdB = DEMO_PATH_IDS.cwdReview;
      const check = (
        guidanceId: string,
        pathId: string,
        cwdPathId: string,
        phaseId: string,
        timestampUtc: string,
      ) => {
        const result = store.checkWriteAndPersist(
          {
            sessionScopeId: SESSION,
            agentScopeId: AGENT,
            cwdPathId,
            phaseId,
            rules: [{ id: guidanceId, mode: "block" }],
          },
          timestampUtc,
        );
        for (const rule of result.perRule) {
          store.recordEvent({
            type: "WRITE_CHECKED",
            sessionScopeId: SESSION,
            agentScopeId: AGENT,
            guidanceId: rule.guidanceId,
            pathId,
            decision: result.decision,
            state: rule.state,
            timestampUtc,
          });
        }
        if (result.decision === "ALLOW") {
          store.recordWriteOutcomeAndPersist(SESSION, AGENT, guidanceId, "success", timestampUtc);
        }
      };

      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          guidanceId: "auth-change-safety",
          pathId: DEMO_PATH_IDS.targetAuth,
          timestampUtc: "2026-11-15T10:14:03Z",
        },
        { phaseId: "implementation", cwdPathId: cwdA, maxSuccessfulEdits: 5 },
      );
      check("auth-change-safety", DEMO_PATH_IDS.targetAuth, cwdA, "implementation", "2026-11-15T10:15:20Z");
      setPhase(store, {
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        phaseId: "review",
        timestampUtc: "2026-11-15T10:20:02Z",
        allowedPhases: ["explore", "implementation", "review", "release"],
      });
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          guidanceId: "release-checklist",
          pathId: DEMO_PATH_IDS.targetRelease,
          timestampUtc: "2026-11-15T10:21:37Z",
        },
        { phaseId: "review", cwdPathId: cwdA, maxSuccessfulEdits: 5 },
      );
      check("release-checklist", DEMO_PATH_IDS.targetRelease, cwdA, "review", "2026-11-15T10:24:10Z");
      store.recordEvent({
        type: "PRE_COMPACT",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        timestampUtc: "2026-11-15T10:31:55Z",
      });
      check("release-checklist", DEMO_PATH_IDS.targetRelease, cwdA, "review", "2026-11-15T10:33:02Z");
      store.recordEvent({
        type: "CWD_CHANGED",
        sessionScopeId: SESSION,
        agentScopeId: AGENT,
        oldPathId: cwdA,
        newPathId: cwdB,
        timestampUtc: "2026-11-15T10:40:18Z",
      });
      store.recordEvent({
        type: "SUBAGENT_STARTED",
        sessionScopeId: SESSION,
        agentScopeId: "subagent-01",
        timestampUtc: "2026-11-15T10:45:44Z",
      });
      check("api-rate-limits", DEMO_PATH_IDS.targetApi, cwdB, "review", "2026-11-15T10:47:09Z");
      store.recordEvent(
        {
          type: "READ_SUCCEEDED",
          sessionScopeId: SESSION,
          agentScopeId: AGENT,
          guidanceId: "release-checklist",
          pathId: DEMO_PATH_IDS.targetRelease,
          timestampUtc: "2026-11-15T10:52:30Z",
        },
        { phaseId: "review", cwdPathId: cwdB, maxSuccessfulEdits: 5 },
      );
      check("release-checklist", DEMO_PATH_IDS.targetRelease, cwdB, "review", "2026-11-15T10:53:15Z");

      const events = store.listEvents({ sessionScopeId: SESSION });
      const leases = store.listLeasesForScope(SESSION, AGENT);
      expect(events).toHaveLength(12);
      const fromStore = buildReportModel(SESSION, AGENT, events, leases, "review");
      const demo = buildDemoModel();
      expect(fromStore).toEqual(demo);
      // The demo fixtures themselves are the contract for this test.
      expect(DEMO_EVENTS).toHaveLength(12);
      expect(DEMO_LEASES).toHaveLength(2);
    } finally {
      store.close();
    }
  });
});
