/**
 * SQLite schema — P025 GuidancePulse, T007.
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §7.3 (internal event
 * contract) and §7.4 (persistable fields). The plan card cites
 * PROJECT_BOOK §7.4 for the data fields; in v1.1.0 §7.4 is the field
 * allowlist ("允许持久化字段"), so the citation is now correct — the
 * v1.0.0 mismatch (chapter 7 ended at §7.3, and §6.4 was the field
 * allowlist) no longer applies. This schema follows §7.3/§7.4
 * verbatim; no spec file was changed.
 *
 * Persisted columns are ONLY the §7.4 allowlist: event type,
 * guidance ID, HMAC path identifier(s), timestamp, session/agent
 * scope identifiers, lease state, phase ID, remaining edit count,
 * invalidation reason code. There is NO raw-JSON column, NO Prompt /
 * Transcript / source-code / absolute-path column — a canary planted
 * in Hook input has nowhere to land (verified by the real-file scan
 * in tests/unit/privacy.test.ts).
 *
 * Schema versioning: `PRAGMA user_version` holds SCHEMA_VERSION.
 * A database with a higher version is refused (STORE_UNSUPPORTED_SCHEMA)
 * rather than silently migrated.
 */

export const SCHEMA_VERSION = 1;

/** DDL for a fresh (or empty) database. Idempotent. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  session_scope_id TEXT NOT NULL,
  agent_scope_id TEXT NOT NULL,
  guidance_id TEXT,
  path_id TEXT,
  old_path_id TEXT,
  new_path_id TEXT,
  phase_id TEXT,
  decision TEXT,
  state TEXT,
  recorded_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session
  ON events (session_scope_id, recorded_at_utc);

CREATE TABLE IF NOT EXISTS leases (
  session_scope_id TEXT NOT NULL,
  agent_scope_id TEXT NOT NULL,
  guidance_id TEXT NOT NULL,
  state TEXT NOT NULL,
  phase_id TEXT,
  cwd_path_id TEXT,
  remaining_successful_edits INTEGER NOT NULL,
  max_successful_edits INTEGER NOT NULL,
  reason TEXT,
  last_confirmed_read_utc TEXT,
  updated_at_utc TEXT NOT NULL,
  PRIMARY KEY (session_scope_id, agent_scope_id, guidance_id)
);

CREATE INDEX IF NOT EXISTS idx_leases_scope
  ON leases (session_scope_id, agent_scope_id);
`;

/** Columns of the events table, in order — the allowlist, nothing else. */
export const EVENT_COLUMNS: readonly string[] = [
  "id",
  "type",
  "session_scope_id",
  "agent_scope_id",
  "guidance_id",
  "path_id",
  "old_path_id",
  "new_path_id",
  "phase_id",
  "decision",
  "state",
  "recorded_at_utc",
];

/** Columns of the leases table, in order — mirrors GuidanceLease. */
export const LEASE_COLUMNS: readonly string[] = [
  "session_scope_id",
  "agent_scope_id",
  "guidance_id",
  "state",
  "phase_id",
  "cwd_path_id",
  "remaining_successful_edits",
  "max_successful_edits",
  "reason",
  "last_confirmed_read_utc",
  "updated_at_utc",
];
