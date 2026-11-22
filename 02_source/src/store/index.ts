/**
 * Public entry point for the store module (T007).
 * T005/T006/T008/T011 import from here; internals stay behind these
 * re-exports.
 */
export { StoreError, toStoreError, toStoreErrorCode } from "./errors.js";
export { EVENT_COLUMNS, LEASE_COLUMNS, SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";
export {
  GuidancePulseStore,
  type BatchedRecord,
  type DeleteSessionResult,
  type ListEventsFilter,
  type OpenStoreOptions,
} from "./store.js";
