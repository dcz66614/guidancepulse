/**
 * GuidancePulse timeline dashboard — P025 GuidancePulse, T008.
 *
 * React 19 component rendering the four zones of PROJECT_BOOK §8.1
 * from a `TimelineModel` (see ./timeline.ts). It is data-agnostic: the
 * local demo feeds it `buildDemoModel()` (see ./main.tsx) and the
 * static report renders the same model from real store rows.
 *
 * Interaction (§8.2): clicking a guidance ID filters the timeline;
 * clicking an invalidation event shows its reason code in the detail
 * panel. Every state is shown with text AND an icon, never colour
 * alone. Denied writes show only the guidance ID, the path short code,
 * and the re-read suggestion — never source code.
 *
 * No network: no CDN, no remote font, no fetch. All styling is the
 * local ./styles.css with a system font stack.
 */

import { useState } from "react";
import {
  filterEntriesByGuidance,
  LEASE_STATE_DISPLAY,
  WRITE_DECISION_DISPLAY,
  type TimelineEntry,
  type TimelineModel,
} from "./timeline.js";

export interface AppProps {
  model: TimelineModel;
}

export default function App({ model }: AppProps) {
  const [selectedGuidanceId, setSelectedGuidanceId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const visibleEntries = filterEntriesByGuidance(model.entries, selectedGuidanceId);
  const selectedEntry: TimelineEntry | undefined = model.entries.find(
    (entry) => entry.id === selectedEntryId,
  );

  return (
    <div className="gp-dashboard">
      <header className="gp-session-bar" data-testid="session-bar">
        <h1>GuidancePulse — Local Timeline</h1>
        <dl>
          <div>
            <dt>Session</dt>
            <dd data-testid="session-id">{model.sessionScopeId}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd data-testid="agent-id">{model.agentScopeId}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd data-testid="phase-id">{model.phaseId ?? "—"}</dd>
          </div>
          <div>
            <dt>Last compact</dt>
            <dd data-testid="last-compact">{model.lastCompactUtc ?? "—"}</dd>
          </div>
        </dl>
      </header>

      <div className="gp-zones">
        <aside className="gp-guidances" aria-label="Guidance leases">
          <h2>Guidance</h2>
          <button
            type="button"
            className={selectedGuidanceId === null ? "gp-filter active" : "gp-filter"}
            onClick={() => {
              setSelectedGuidanceId(null);
              setSelectedEntryId(null);
            }}
          >
            All events
          </button>
          <ul>
            {model.guidances.map((guidance) => {
              const display = LEASE_STATE_DISPLAY[guidance.state];
              return (
                <li key={guidance.guidanceId}>
                  <button
                    type="button"
                    data-testid={`guidance-${guidance.guidanceId}`}
                    className={
                      selectedGuidanceId === guidance.guidanceId
                        ? "gp-guidance active"
                        : "gp-guidance"
                    }
                    onClick={() => {
                      setSelectedGuidanceId(guidance.guidanceId);
                      setSelectedEntryId(null);
                    }}
                  >
                    <span className="gp-guidance-id">{guidance.guidanceId}</span>
                    <span className="gp-state" style={{ color: display.color }}>
                      {display.icon} {display.label}
                    </span>
                    <span className="gp-remaining">
                      Remaining edits:{" "}
                      {guidance.remainingSuccessfulEdits === null
                        ? "—"
                        : `${guidance.remainingSuccessfulEdits}/${guidance.maxSuccessfulEdits ?? "—"}`}
                    </span>
                    {guidance.reason !== null && (
                      <span className="gp-reason">Reason: {guidance.reason}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="gp-timeline" aria-label="Event timeline">
          <h2>
            Timeline
            {selectedGuidanceId !== null && (
              <span className="gp-filter-note"> — filtered to {selectedGuidanceId}</span>
            )}
          </h2>
          {visibleEntries.length === 0 ? (
            <p className="gp-empty">No events for this guidance yet.</p>
          ) : (
            <ol>
              {visibleEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-testid={`entry-${entry.id}`}
                    className={
                      selectedEntryId === entry.id ? "gp-entry active" : "gp-entry"
                    }
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <span className="gp-time">{entry.timestampUtc}</span>
                    <span className="gp-kind">{entry.label}</span>
                    <span className="gp-detail">{entry.detail}</span>
                    {entry.decision !== null && (
                      <span
                        className="gp-decision"
                        style={{ color: WRITE_DECISION_DISPLAY[entry.decision].color }}
                      >
                        {WRITE_DECISION_DISPLAY[entry.decision].icon}{" "}
                        {WRITE_DECISION_DISPLAY[entry.decision].label}
                      </span>
                    )}
                    {entry.state !== null && (
                      <span
                        className="gp-state"
                        style={{ color: LEASE_STATE_DISPLAY[entry.state].color }}
                      >
                        {LEASE_STATE_DISPLAY[entry.state].icon}{" "}
                        {LEASE_STATE_DISPLAY[entry.state].label}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </main>

        <aside className="gp-detail" aria-label="Event detail" data-testid="detail-panel">
          <h2>Detail</h2>
          {selectedEntry === undefined ? (
            <p>Select an event to see its details.</p>
          ) : (
            <dl>
              <div>
                <dt>Event type</dt>
                <dd data-testid="detail-kind">{selectedEntry.label}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd data-testid="detail-time">{selectedEntry.timestampUtc}</dd>
              </div>
              <div>
                <dt>Guidance ID</dt>
                <dd data-testid="detail-guidance">{selectedEntry.guidanceId ?? "—"}</dd>
              </div>
              <div>
                <dt>Path ID</dt>
                <dd data-testid="detail-path">{selectedEntry.pathIdShort ?? "—"}</dd>
              </div>
              {selectedEntry.state !== null && (
                <div>
                  <dt>Lease state</dt>
                  <dd data-testid="detail-state">
                    {LEASE_STATE_DISPLAY[selectedEntry.state].icon}{" "}
                    {LEASE_STATE_DISPLAY[selectedEntry.state].label}
                  </dd>
                </div>
              )}
              {selectedEntry.decision !== null && (
                <div>
                  <dt>Decision</dt>
                  <dd data-testid="detail-decision">
                    {WRITE_DECISION_DISPLAY[selectedEntry.decision].icon}{" "}
                    {WRITE_DECISION_DISPLAY[selectedEntry.decision].label}
                  </dd>
                </div>
              )}
              {selectedEntry.reason !== null && (
                <div>
                  <dt>Reason code</dt>
                  <dd data-testid="detail-reason">{selectedEntry.reason}</dd>
                </div>
              )}
              <div>
                <dt>Summary</dt>
                <dd data-testid="detail-summary">{selectedEntry.detail}</dd>
              </div>
            </dl>
          )}
        </aside>
      </div>

      <footer className="gp-footer">
        Local data only — no network requests. No prompts, source code, or
        absolute paths are shown.
      </footer>
    </div>
  );
}
