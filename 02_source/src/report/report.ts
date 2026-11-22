/**
 * Static HTML / JSON report — P025 GuidancePulse, T008.
 *
 * PROJECT_BOOK §8.2: "导出 JSON/静态 HTML；UI 只读本地脱敏数据。"
 * This module turns a `TimelineModel` (built from the T007 store's
 * allowlisted rows via `buildTimelineModel`) into:
 *
 *   - deterministic JSON (`buildReportJson`: 2-space, LF, sorted keys
 *     are unnecessary — the model is already built in deterministic
 *     order);
 *   - a standalone static HTML file (`renderTimelineHtml`) with inline
 *     CSS, no `<script>`, no CDN, no remote font, no external URL of
 *     any kind, so it can be opened from disk or served on 127.0.0.1.
 *
 * Privacy: every interpolated string is HTML-escaped. The model only
 * ever contains allowlisted values (guidance IDs, `hmac:…` short codes,
 * timestamps, states, reason codes, decisions), so there is no Prompt,
 * source code, or absolute path to leak — and the escaping below is
 * defence in depth for hostile guidance IDs.
 */

import {
  buildTimelineModel,
  LEASE_STATE_DISPLAY,
  WRITE_DECISION_DISPLAY,
  type TimelineModel,
} from "../ui/index.js";
import type { GuidancePulseEvent } from "../contracts/index.js";
import type { GuidanceLease } from "../core/index.js";

/** Build the report model from store rows (events + leases). */
export function buildReportModel(
  sessionScopeId: string,
  agentScopeId: string,
  events: readonly GuidancePulseEvent[],
  leases: readonly GuidanceLease[],
  currentPhaseId?: string | null,
): TimelineModel {
  return buildTimelineModel({
    sessionScopeId,
    agentScopeId,
    events,
    leases,
    currentPhaseId,
  });
}

/** Deterministic JSON export of a report model (2-space, LF). */
export function buildReportJson(model: TimelineModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}

/** Escape text for interpolation into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render the standalone static HTML report. Inline `<style>` only;
 * no `<script>`, no `http://` / `https://` / `//` references, no
 * remote fonts. All state is shown with text AND an icon (§8.2).
 */
export function renderTimelineHtml(model: TimelineModel): string {
  const esc = escapeHtml;
  const guidanceRows = model.guidances
    .map((guidance) => {
      const display = LEASE_STATE_DISPLAY[guidance.state];
      const remaining =
        guidance.remainingSuccessfulEdits === null
          ? "—"
          : `${guidance.remainingSuccessfulEdits}/${guidance.maxSuccessfulEdits ?? "—"}`;
      return `        <li>
          <span class="gp-guidance-id">${esc(guidance.guidanceId)}</span>
          <span class="gp-state" style="color: ${display.color}">${display.icon} ${display.label}</span>
          <span class="gp-remaining">Remaining edits: ${esc(remaining)}</span>
          ${
            guidance.reason !== null
              ? `<span class="gp-reason">Reason: ${esc(guidance.reason)}</span>`
              : ""
          }
        </li>`;
    })
    .join("\n");

  const entryRows = model.entries
    .map((entry) => {
      const decision =
        entry.decision === null
          ? ""
          : ` <span class="gp-decision" style="color: ${WRITE_DECISION_DISPLAY[entry.decision].color}">${WRITE_DECISION_DISPLAY[entry.decision].icon} ${WRITE_DECISION_DISPLAY[entry.decision].label}</span>`;
      const state =
        entry.state === null
          ? ""
          : ` <span class="gp-state" style="color: ${LEASE_STATE_DISPLAY[entry.state].color}">${LEASE_STATE_DISPLAY[entry.state].icon} ${LEASE_STATE_DISPLAY[entry.state].label}</span>`;
      const reason =
        entry.reason === null ? "" : ` <span class="gp-reason">Reason: ${esc(entry.reason)}</span>`;
      return `        <li>
          <span class="gp-time">${esc(entry.timestampUtc)}</span>
          <span class="gp-kind">${esc(entry.label)}</span>
          <span class="gp-detail">${esc(entry.detail)}</span>${decision}${state}${reason}
        </li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GuidancePulse — Local Timeline Report</title>
<style>
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2328; background: #ffffff; }
.gp-report { max-width: 1100px; margin: 0 auto; padding: 16px; }
.gp-session-bar { border: 1px solid #d0d7de; border-radius: 8px; background: #f6f8fa; padding: 12px 16px; margin-bottom: 16px; }
.gp-session-bar h1 { font-size: 20px; margin: 0 0 8px; }
.gp-session-bar dl { display: flex; flex-wrap: wrap; gap: 8px 32px; margin: 0; }
.gp-session-bar dl div { display: flex; gap: 8px; }
.gp-session-bar dt { font-weight: 600; }
.gp-session-bar dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.gp-zones { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
.gp-guidances, .gp-timeline { border: 1px solid #d0d7de; border-radius: 8px; padding: 12px; }
.gp-guidances h2, .gp-timeline h2 { font-size: 16px; margin: 0 0 12px; }
.gp-guidances ul, .gp-timeline ol { list-style: none; margin: 0; padding: 0; }
.gp-guidances li { margin-bottom: 8px; }
.gp-guidance-id { display: block; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.gp-state, .gp-remaining, .gp-reason { display: block; margin-top: 4px; font-size: 13px; }
.gp-timeline li { margin-bottom: 8px; border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 10px; }
.gp-time { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: #57606a; }
.gp-kind { display: inline-block; font-weight: 600; margin-top: 4px; }
.gp-detail { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.gp-decision, .gp-timeline .gp-state { display: inline-block; margin-top: 4px; margin-right: 12px; font-weight: 600; }
.gp-footer { margin-top: 16px; font-size: 13px; color: #57606a; }
</style>
</head>
<body>
<div class="gp-report">
  <header class="gp-session-bar">
    <h1>GuidancePulse — Local Timeline</h1>
    <dl>
      <div><dt>Session</dt><dd>${esc(model.sessionScopeId)}</dd></div>
      <div><dt>Agent</dt><dd>${esc(model.agentScopeId)}</dd></div>
      <div><dt>Phase</dt><dd>${esc(model.phaseId ?? "—")}</dd></div>
      <div><dt>Last compact</dt><dd>${esc(model.lastCompactUtc ?? "—")}</dd></div>
    </dl>
  </header>
  <div class="gp-zones">
    <aside class="gp-guidances" aria-label="Guidance leases">
      <h2>Guidance</h2>
      <ul>
${guidanceRows}
      </ul>
    </aside>
    <main class="gp-timeline" aria-label="Event timeline">
      <h2>Timeline</h2>
      <ol>
${entryRows}
      </ol>
    </main>
  </div>
  <footer class="gp-footer">Local data only — no network requests. No prompts, source code, or absolute paths are shown.</footer>
</div>
</body>
</html>
`;
}
