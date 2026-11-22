/**
 * Public entry point for the contracts module (T003).
 * The internal event contract (PROJECT_BOOK §7.3) lives here.
 */
export {
  GUIDANCE_PULSE_EVENT_TYPES,
  MAIN_AGENT_SCOPE_ID,
  isGuidancePulseEvent,
  isPathId,
  type GuidancePulseEvent,
  type InvalidationReason,
  type LeaseState,
  type WriteCheckRequest,
  type WriteDecision,
} from "./events.js";
