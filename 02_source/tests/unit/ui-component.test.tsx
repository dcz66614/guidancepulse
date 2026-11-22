// @vitest-environment jsdom
/**
 * React dashboard component tests — P025 GuidancePulse, T008.
 *
 * Renders the real `App` in jsdom and exercises the §8.2 interactions:
 * click a guidance ID to filter the timeline, click an event to open
 * its detail (including the invalidation reason code). Synthetic demo
 * data only.
 */

import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Vitest runs without globals here, so RTL's automatic cleanup does
// not register; clean up explicitly between tests.
afterEach(() => cleanup());
import App from "../../src/ui/App.js";
import { buildDemoModel } from "../../src/ui/demo-data.js";

describe("App dashboard", () => {
  it("shows the session bar, guidance states, and all timeline entries", () => {
    render(<App model={buildDemoModel()} />);
    expect(screen.getByTestId("session-id")).toHaveTextContent("demo-session-01");
    expect(screen.getByTestId("agent-id")).toHaveTextContent("main");
    expect(screen.getByTestId("phase-id")).toHaveTextContent("review");
    expect(screen.getByTestId("last-compact")).toHaveTextContent("2026-11-15T10:31:55Z");

    const release = screen.getByTestId("guidance-release-checklist");
    expect(release).toHaveTextContent("release-checklist");
    expect(release).toHaveTextContent("● FRESH");
    expect(release).toHaveTextContent("Remaining edits: 4/5");
    expect(screen.getByTestId("guidance-auth-change-safety")).toHaveTextContent("▲ EXPIRED");
    expect(screen.getByTestId("guidance-auth-change-safety")).toHaveTextContent(
      "Reason: PHASE_MISMATCH",
    );
    expect(screen.getByTestId("guidance-api-rate-limits")).toHaveTextContent("○ UNSEEN");
    expect(screen.getByTestId("guidance-api-rate-limits")).toHaveTextContent("Remaining edits: —");

    // 12 demo events, one button each.
    expect(screen.getAllByText("Write decision")).toHaveLength(5);
    expect(screen.getByText("Compact")).toBeTruthy();
    expect(screen.getByText("Subagent")).toBeTruthy();
  });

  it("filters the timeline when a guidance id is clicked", () => {
    render(<App model={buildDemoModel()} />);
    fireEvent.click(screen.getByTestId("guidance-release-checklist"));
    expect(screen.getByText(/filtered to release-checklist/)).toBeTruthy();
    expect(screen.getAllByText("Write decision")).toHaveLength(3);
    expect(screen.queryByText("Subagent")).toBeNull();
    fireEvent.click(screen.getByText("All events"));
    expect(screen.getAllByText("Write decision")).toHaveLength(5);
  });

  it("shows the reason code when an invalidation event is clicked", () => {
    render(<App model={buildDemoModel()} />);
    expect(screen.getByTestId("detail-panel")).toHaveTextContent(
      "Select an event to see its details.",
    );
    fireEvent.click(screen.getByTestId("entry-e6"));
    expect(screen.getByTestId("detail-kind")).toHaveTextContent("Compact");
    expect(screen.getByTestId("detail-time")).toHaveTextContent("2026-11-15T10:31:55Z");
    expect(screen.getByTestId("detail-reason")).toHaveTextContent("CONTEXT_COMPACTION");
    fireEvent.click(screen.getByTestId("entry-e7"));
    expect(screen.getByTestId("detail-decision")).toHaveTextContent("✕ DENY");
    expect(screen.getByTestId("detail-state")).toHaveTextContent("▲ EXPIRED");
    expect(screen.getByTestId("detail-summary")).toHaveTextContent("Re-read the guidance");
  });
});
