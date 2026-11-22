/**
 * Public entry point for the UI module (T008).
 * The report module (src/report) imports the model builders from here.
 */
export { default as App } from "./App.js";
export { buildDemoModel, DEMO_EVENTS, DEMO_LEASES } from "./demo-data.js";
export {
  buildTimelineModel,
  filterEntriesByGuidance,
  LEASE_STATE_DISPLAY,
  shortPathId,
  WRITE_DECISION_DISPLAY,
  type GuidanceRow,
  type TimelineEntry,
  type TimelineModel,
} from "./timeline.js";
