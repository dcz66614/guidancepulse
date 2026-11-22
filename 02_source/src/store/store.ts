/**
 * SQLite store — P025 GuidancePulse, T007.
 *
 * Single-file embedded SQLite (better-sqlite3, frozen stack) holding
 * ONLY the PROJECT_BOOK §7.4 allowlist. One `GuidancePulseStore`
 * instance is one connection; many Hook subprocesses each open their
 * own connection against the same file.
 *
 * Concurrency (PROJECT_BOOK §10 risk "SQLite 并发冲突", P1):
 *   - WAL journal mode (`PRAGMA journal_mode=WAL`): readers never
 *     block the writer, writers serialise through the WAL.
 *   - `PRAGMA busy_timeout=5000`: a contended writer waits up to 5s
 *     instead of failing immediately with SQLITE_BUSY.
 *   - Every mutation runs inside a `BEGIN IMMEDIATE` transaction
 *     (better-sqlite3 `.immediate`), so an event row and its lease
 *     transition commit or roll back together — a Hook subprocess
 *     can never persist an event without its lease effect, or vice
 *     versa. IMMEDIATE (not the default DEFERRED) matters: a
 *     deferred transaction that reads first and writes second fails
 *     at once with SQLITE_BUSY_SNAPSHOT when another process
 *     committed in between, and the busy handler is NOT invoked for
 *     snapshot errors. IMMEDIATE takes the write lock up front, so
 *     contended writers wait out `busy_timeout` instead.
 *   - `PRAGMA synchronous=NORMAL`: durable across process crashes
 *     (the realistic Hook failure mode); NOT guaranteed across an OS
 *     crash / power loss. That trade-off is recorded in HANDOFF_T007.md.
 *
 * Lease persistence mirrors the T004 in-memory machine exactly:
 * `recordEvent` loads the lease rows into a `LeaseStore`, applies
 * `applyGuidanceEvent`, and upserts the resulting leases in the same
 * transaction as the event row. `checkWriteAndPersist` does the same
 * with `checkWrite` (its `updatedStore` is what gets persisted), and
 * `recordWriteOutcomeAndPersist` with `recordWriteOutcome`. The
 * persisted lease columns are field-for-field the `GuidanceLease`
 * fields, so `canonicalLeaseSnapshot` over a reloaded store equals
 * the in-memory snapshot — T009 can compare them directly.
 *
 * Privacy: values are validated with `isGuidancePulseEvent` plus a
 * banned-key check before any write, and all SQL uses bound
 * parameters. Thrown errors are `StoreError`s carrying only a code
 * (see ./errors.ts). This module never logs, never reads the network,
 * and never touches wall-clock time except for the bookkeeping
 * `updated_at_utc` column (never part of a canonical snapshot or an
 * event; callers that have an event timestamp should pass it so the
 * column stays deterministic).
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  applyGuidanceEvent,
  checkWrite,
  getLease,
  leaseKey,
  listLeases,
  recordWriteOutcome,
  type ApplyEventOptions,
  type CheckWriteInput,
  type GuidanceLease,
  type LeaseStore,
  type WriteCheckResult,
} from "../core/index.js";
import {
  isGuidancePulseEvent,
  type GuidancePulseEvent,
  type LeaseState,
  type WriteDecision,
} from "../contracts/index.js";
import { assertNoBannedKeys, SanitizeError } from "../privacy/sanitize.js";
import { StoreError, toStoreError } from "./errors.js";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

/** Options for `GuidancePulseStore.open`. */
export interface OpenStoreOptions {
  /** Create the parent directory when missing (default true). */
  createDir?: boolean;
  /** Writer wait budget in ms (default 5000). */
  busyTimeoutMs?: number;
  /** Open read-only (default false). */
  readonly?: boolean;
}

/** Filter for `listEvents`. All fields optional. */
export interface ListEventsFilter {
  sessionScopeId?: string;
  agentScopeId?: string;
  type?: GuidancePulseEvent["type"];
  limit?: number;
}

/** One batched record: an event plus its lease-transition options. */
export interface BatchedRecord {
  event: GuidancePulseEvent;
  /** Required for READ_SUCCEEDED; ignored for other event types. */
  options?: ApplyEventOptions;
}

/** Result of `deleteSession`. */
export interface DeleteSessionResult {
  eventsDeleted: number;
  leasesDeleted: number;
}

type LeaseRow = {
  session_scope_id: string;
  agent_scope_id: string;
  guidance_id: string;
  state: string;
  phase_id: string | null;
  cwd_path_id: string | null;
  remaining_successful_edits: number;
  max_successful_edits: number;
  reason: string | null;
  last_confirmed_read_utc: string | null;
};

type EventRow = {
  id: number;
  type: string;
  session_scope_id: string;
  agent_scope_id: string;
  guidance_id: string | null;
  path_id: string | null;
  old_path_id: string | null;
  new_path_id: string | null;
  phase_id: string | null;
  decision: string | null;
  state: string | null;
  recorded_at_utc: string;
};

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

export class GuidancePulseStore {
  readonly dbPath: string;
  private db: Database.Database;
  private readonly isReadonly: boolean;
  private closed = false;

  private constructor(dbPath: string, db: Database.Database, readonly: boolean) {
    this.dbPath = dbPath;
    this.db = db;
    this.isReadonly = readonly;
  }

  /**
   * Open (or create) the store file. Creates the parent directory
   * unless `createDir: false`. Applies WAL + busy_timeout +
   * synchronous=NORMAL, creates the schema at version 1, and refuses
   * a database whose user_version is newer than SCHEMA_VERSION.
   */
  static open(dbPath: string, options: OpenStoreOptions = {}): GuidancePulseStore {
    const createDir = options.createDir ?? true;
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    try {
      if (dbPath !== ":memory:" && createDir) {
        const parent = dirname(dbPath);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      }
      const readonly = options.readonly ?? false;
      const db = new Database(dbPath, {
        readonly,
        timeout: busyTimeoutMs,
      });
      const store = new GuidancePulseStore(dbPath, db, readonly);
      store.initPragmas(busyTimeoutMs);
      store.initSchema();
      return store;
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw toStoreError(error, "open");
    }
  }

  private initPragmas(busyTimeoutMs: number): void {
    try {
      this.db.pragma(`busy_timeout = ${busyTimeoutMs}`);
      if (this.dbPath !== ":memory:") {
        const mode = this.db.pragma("journal_mode=WAL", { simple: true });
        if (typeof mode === "string" && mode.toLowerCase() !== "wal") {
          throw new StoreError("STORE_WAL_UNAVAILABLE", "WAL journal mode could not be enabled");
        }
      }
      this.db.pragma("synchronous = NORMAL");
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw toStoreError(error, "init pragmas");
    }
  }

  private initSchema(): void {
    try {
      const version = this.db.pragma("user_version", { simple: true }) as number;
      if (typeof version === "number" && version > SCHEMA_VERSION) {
        throw new StoreError(
          "STORE_UNSUPPORTED_SCHEMA",
          "database schema version is newer than this build supports",
        );
      }
      // A read-only connection cannot create the schema: it may only
      // verify that a schema already exists.
      if (this.isReadonly) {
        if (version === 0) {
          throw new StoreError(
            "STORE_NOT_INITIALIZED",
            "database has no schema and was opened read-only",
          );
        }
        return;
      }
      this.db.exec(SCHEMA_SQL);
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw toStoreError(error, "init schema");
    }
  }

  /** Current journal mode (e.g. "wal"); "memory" for :memory: databases. */
  journalMode(): string {
    this.assertOpen();
    try {
      const mode = this.db.pragma("journal_mode", { simple: true });
      return typeof mode === "string" ? mode : String(mode);
    } catch (error) {
      throw toStoreError(error, "read journal mode");
    }
  }

  /** Current schema version (`PRAGMA user_version`). */
  schemaVersion(): number {
    this.assertOpen();
    try {
      return this.db.pragma("user_version", { simple: true }) as number;
    } catch (error) {
      throw toStoreError(error, "read schema version");
    }
  }

  /** Number of persisted event rows. */
  countEvents(): number {
    this.assertOpen();
    try {
      const row = this.db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
      return row.n;
    } catch (error) {
      throw toStoreError(error, "count events");
    }
  }

  /** Number of persisted lease rows. */
  countLeases(): number {
    this.assertOpen();
    try {
      const row = this.db.prepare("SELECT COUNT(*) AS n FROM leases").get() as { n: number };
      return row.n;
    } catch (error) {
      throw toStoreError(error, "count leases");
    }
  }

  /**
   * Append one event row WITHOUT a lease transition. Use for events
   * the caller already applied (or for WRITE_CHECKED, which is an
   * output record, not a state-machine input). Prefer `recordEvent`
   * when the lease must move with the event.
   */
  appendEvent(event: GuidancePulseEvent): number {
    this.assertOpen();
    validateEventForStore(event);
    try {
      const run = this.db.transaction(() => this.insertEventRow(event)).immediate;
      return run();
    } catch (error) {
      throw toStoreError(error, "append event");
    }
  }

  /**
   * Atomically persist one event AND its lease transition: the event
   * row and the upserted leases commit or roll back together.
   * `options` is required for READ_SUCCEEDED (phase/cwd at issuance
   * and the rule's edit budget); ignored for other event types.
   * Returns the lease store after the transition.
   */
  recordEvent(event: GuidancePulseEvent, options?: ApplyEventOptions): LeaseStore {
    this.assertOpen();
    validateEventForStore(event);
    if (event.type === "READ_SUCCEEDED" && options === undefined) {
      throw new StoreError(
        "MISSING_READ_OPTIONS",
        "READ_SUCCEEDED requires phase, cwd and edit-budget options",
      );
    }
    try {
      const run = this.db.transaction(() => {
        const before = this.loadLeaseStore();
        const after = applyGuidanceEvent(
          before,
          event,
          options ?? { phaseId: null, cwdPathId: null, maxSuccessfulEdits: 0 },
        );
        this.insertEventRow(event);
        this.persistLeases(after, event.timestampUtc);
        return after;
      }).immediate;
      return run();
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw toStoreError(error, "record event");
    }
  }

  /**
   * Atomically persist a batch of events and their lease transitions.
   * Every record is validated BEFORE the transaction opens, and the
   * whole batch commits or rolls back together — one bad record
   * persists nothing. Returns the lease store after the batch.
   */
  recordEvents(records: readonly BatchedRecord[]): LeaseStore {
    this.assertOpen();
    for (const record of records) {
      validateEventForStore(record.event);
      if (record.event.type === "READ_SUCCEEDED" && record.options === undefined) {
        throw new StoreError(
          "MISSING_READ_OPTIONS",
          "READ_SUCCEEDED requires phase, cwd and edit-budget options",
        );
      }
    }
    try {
      const run = this.db.transaction(() => {
        let store = this.loadLeaseStore();
        let lastTimestamp = "";
        for (const record of records) {
          store = applyGuidanceEvent(
            store,
            record.event,
            record.options ?? { phaseId: null, cwdPathId: null, maxSuccessfulEdits: 0 },
          );
          this.insertEventRow(record.event);
          lastTimestamp = record.event.timestampUtc;
        }
        this.persistLeases(store, lastTimestamp);
        return store;
      }).immediate;
      return run();
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw toStoreError(error, "record events");
    }
  }

  /**
   * Run the T004 §6.4 write check against the persisted leases and
   * persist its `updatedStore` (lazy expiries included) in the same
   * transaction as the read. `timestampUtc` stamps `updated_at_utc`
   * for changed leases; defaults to the current wall-clock time and
   * is bookkeeping only (never in a canonical snapshot or event).
   */
  checkWriteAndPersist(
    input: CheckWriteInput,
    timestampUtc?: string,
  ): WriteCheckResult {
    this.assertOpen();
    try {
      const run = this.db.transaction(() => {
        const before = this.loadLeaseStore();
        const result = checkWrite(before, input);
        if (result.updatedStore !== before) {
          this.persistLeases(result.updatedStore, timestampUtc ?? new Date().toISOString());
        }
        return result;
      }).immediate;
      return run();
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw toStoreError(error, "check write");
    }
  }

  /**
   * Persist a write outcome (§6.3: successful writes spend budget).
   * Returns the lease afterwards, or undefined when there is no
   * FRESH lease to spend from. `timestampUtc` stamps `updated_at_utc`;
   * defaults to wall-clock time (bookkeeping only).
   */
  recordWriteOutcomeAndPersist(
    sessionScopeId: string,
    agentScopeId: string,
    guidanceId: string,
    outcome: "success" | "failure",
    timestampUtc?: string,
  ): GuidanceLease | undefined {
    this.assertOpen();
    try {
      const run = this.db.transaction(() => {
        const before = this.loadLeaseStore();
        const after = recordWriteOutcome(before, sessionScopeId, agentScopeId, guidanceId, outcome);
        if (after !== before) {
          this.persistLeases(after, timestampUtc ?? new Date().toISOString());
        }
        return getLease(after, sessionScopeId, agentScopeId, guidanceId);
      }).immediate;
      return run();
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw toStoreError(error, "record write outcome");
    }
  }

  /** Load one lease by identity; undefined means UNSEEN (absent). */
  getLease(
    sessionScopeId: string,
    agentScopeId: string,
    guidanceId: string,
  ): GuidanceLease | undefined {
    this.assertOpen();
    try {
      return getLease(this.loadLeaseStore(), sessionScopeId, agentScopeId, guidanceId);
    } catch (error) {
      throw toStoreError(error, "read lease");
    }
  }

  /** All leases in a scope, sorted by guidance id (deterministic). */
  listLeasesForScope(sessionScopeId: string, agentScopeId: string): GuidanceLease[] {
    this.assertOpen();
    try {
      const store = this.loadLeaseStore();
      const out: GuidanceLease[] = [];
      for (const lease of store.values()) {
        if (lease.sessionScopeId === sessionScopeId && lease.agentScopeId === agentScopeId) {
          out.push(lease);
        }
      }
      out.sort((a, b) => (a.guidanceId < b.guidanceId ? -1 : a.guidanceId > b.guidanceId ? 1 : 0));
      return out;
    } catch (error) {
      throw toStoreError(error, "list leases");
    }
  }

  /** All leases, sorted by (session, agent, guidance). */
  listAllLeases(): GuidanceLease[] {
    this.assertOpen();
    try {
      return listLeases(this.loadLeaseStore());
    } catch (error) {
      throw toStoreError(error, "list leases");
    }
  }

  /** Persisted events, oldest first, optionally filtered / limited. */
  listEvents(filter: ListEventsFilter = {}): GuidancePulseEvent[] {
    this.assertOpen();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filter.sessionScopeId !== undefined) {
        conditions.push("session_scope_id = ?");
        params.push(filter.sessionScopeId);
      }
      if (filter.agentScopeId !== undefined) {
        conditions.push("agent_scope_id = ?");
        params.push(filter.agentScopeId);
      }
      if (filter.type !== undefined) {
        conditions.push("type = ?");
        params.push(filter.type);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filter.limit !== undefined ? "LIMIT ?" : "";
      if (filter.limit !== undefined) params.push(filter.limit);
      const rows = this.db
        .prepare(
          `SELECT id, type, session_scope_id, agent_scope_id, guidance_id, path_id,
                  old_path_id, new_path_id, phase_id, decision, state, recorded_at_utc
             FROM events ${where} ORDER BY id ASC ${limit}`,
        )
        .all(...params) as EventRow[];
      return rows.map((row) => eventRowToEvent(row));
    } catch (error) {
      throw toStoreError(error, "list events");
    }
  }

  /**
   * Delete every event and lease row for one session (privacy delete).
   * The caller must VACUUM afterwards (see `vacuum()` / retention)
   * so the bytes actually leave the file; DELETE alone only frees
   * pages. Returns the deleted row counts.
   */
  deleteSession(sessionScopeId: string): DeleteSessionResult {
    this.assertOpen();
    try {
      const run = this.db.transaction(() => {
        const events = this.db
          .prepare("DELETE FROM events WHERE session_scope_id = ?")
          .run(sessionScopeId);
        const leases = this.db
          .prepare("DELETE FROM leases WHERE session_scope_id = ?")
          .run(sessionScopeId);
        return { eventsDeleted: events.changes, leasesDeleted: leases.changes };
      }).immediate;
      return run();
    } catch (error) {
      throw toStoreError(error, "delete session");
    }
  }

  /** Rebuild the database file, physically removing deleted content. */
  vacuum(): void {
    this.assertOpen();
    try {
      this.db.exec("VACUUM");
    } catch (error) {
      throw toStoreError(error, "vacuum");
    }
  }

  /** Checkpoint the WAL and truncate it (so a file scan sees all bytes). */
  checkpoint(): void {
    this.assertOpen();
    try {
      this.db.pragma("wal_checkpoint(TRUNCATE)");
    } catch (error) {
      throw toStoreError(error, "checkpoint");
    }
  }

  /** True while the connection is open. */
  isOpen(): boolean {
    return !this.closed;
  }

  /** Close the connection. Idempotent. Checkpoints the WAL first. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // Best effort: a checkpoint failure must not mask close().
    }
    this.db.close();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new StoreError("STORE_CLOSED", "store is closed");
    }
  }

  /** Read every lease row into the T004 immutable `LeaseStore`. */
  private loadLeaseStore(): LeaseStore {
    const rows = this.db
      .prepare(
        `SELECT session_scope_id, agent_scope_id, guidance_id, state, phase_id,
                cwd_path_id, remaining_successful_edits, max_successful_edits,
                reason, last_confirmed_read_utc
           FROM leases`,
      )
      .all() as LeaseRow[];
    const map = new Map<string, GuidanceLease>();
    for (const row of rows) {
      const lease: GuidanceLease = {
        sessionScopeId: row.session_scope_id,
        agentScopeId: row.agent_scope_id,
        guidanceId: row.guidance_id,
        state: row.state as GuidanceLease["state"],
        phaseId: row.phase_id,
        cwdPathId: row.cwd_path_id,
        remainingSuccessfulEdits: row.remaining_successful_edits,
        maxSuccessfulEdits: row.max_successful_edits,
        reason: row.reason as GuidanceLease["reason"],
        lastConfirmedReadUtc: row.last_confirmed_read_utc,
      };
      map.set(leaseKey(lease.sessionScopeId, lease.agentScopeId, lease.guidanceId), lease);
    }
    return map;
  }

  /** Upsert every lease in the store (leases are only ever upserted or deleted). */
  private persistLeases(store: LeaseStore, updatedAtUtc: string): void {
    const upsert = this.db.prepare(
      `INSERT INTO leases
         (session_scope_id, agent_scope_id, guidance_id, state, phase_id,
          cwd_path_id, remaining_successful_edits, max_successful_edits,
          reason, last_confirmed_read_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_scope_id, agent_scope_id, guidance_id)
       DO UPDATE SET state = excluded.state,
                     phase_id = excluded.phase_id,
                     cwd_path_id = excluded.cwd_path_id,
                     remaining_successful_edits = excluded.remaining_successful_edits,
                     max_successful_edits = excluded.max_successful_edits,
                     reason = excluded.reason,
                     last_confirmed_read_utc = excluded.last_confirmed_read_utc,
                     updated_at_utc = excluded.updated_at_utc`,
    );
    for (const lease of store.values()) {
      upsert.run(
        lease.sessionScopeId,
        lease.agentScopeId,
        lease.guidanceId,
        lease.state,
        lease.phaseId,
        lease.cwdPathId,
        lease.remainingSuccessfulEdits,
        lease.maxSuccessfulEdits,
        lease.reason,
        lease.lastConfirmedReadUtc,
        updatedAtUtc,
      );
    }
  }

  /** Insert one event row; returns the row id. */
  private insertEventRow(event: GuidancePulseEvent): number {
    const columns = eventToRow(event);
    const info = this.db
      .prepare(
        `INSERT INTO events
           (type, session_scope_id, agent_scope_id, guidance_id, path_id,
            old_path_id, new_path_id, phase_id, decision, state, recorded_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        columns.type,
        columns.sessionScopeId,
        columns.agentScopeId,
        columns.guidanceId,
        columns.pathId,
        columns.oldPathId,
        columns.newPathId,
        columns.phaseId,
        columns.decision,
        columns.state,
        columns.recordedAtUtc,
      );
    return Number(info.lastInsertRowid);
  }
}

/**
 * Reject anything that is not exactly one §7.3 contract event, and
 * anything carrying a banned field name. Throws StoreError with a
 * code only — the rejected value is never echoed.
 */
function validateEventForStore(event: unknown): asserts event is GuidancePulseEvent {
  if (!isGuidancePulseEvent(event)) {
    throw new StoreError("INVALID_EVENT", "event failed contract validation");
  }
  try {
    assertNoBannedKeys(event, "event");
  } catch (error) {
    if (error instanceof SanitizeError) {
      throw new StoreError("BANNED_FIELD_PRESENT", "event contains a banned field");
    }
    throw error;
  }
}

type EventColumns = {
  type: string;
  sessionScopeId: string;
  agentScopeId: string;
  guidanceId: string | null;
  pathId: string | null;
  oldPathId: string | null;
  newPathId: string | null;
  phaseId: string | null;
  decision: string | null;
  state: string | null;
  recordedAtUtc: string;
};

/** Map a contract event onto its allowlisted row columns. */
function eventToRow(event: GuidancePulseEvent): EventColumns {
  const base = {
    sessionScopeId: event.sessionScopeId,
    agentScopeId: event.agentScopeId,
    guidanceId: null as string | null,
    pathId: null as string | null,
    oldPathId: null as string | null,
    newPathId: null as string | null,
    phaseId: null as string | null,
    decision: null as string | null,
    state: null as string | null,
    recordedAtUtc: event.timestampUtc,
  };
  switch (event.type) {
    case "READ_SUCCEEDED":
      return { ...base, type: event.type, guidanceId: event.guidanceId, pathId: event.pathId };
    case "PRE_COMPACT":
      return { ...base, type: event.type };
    case "CWD_CHANGED":
      return { ...base, type: event.type, oldPathId: event.oldPathId, newPathId: event.newPathId };
    case "SUBAGENT_STARTED":
      return { ...base, type: event.type };
    case "PHASE_CHANGED":
      return { ...base, type: event.type, phaseId: event.phaseId };
    case "WRITE_CHECKED":
      return {
        ...base,
        type: event.type,
        guidanceId: event.guidanceId,
        pathId: event.pathId,
        decision: event.decision,
        state: event.state,
      };
  }
}

/** Rebuild a contract event from a row (inverse of eventToRow). */
function eventRowToEvent(row: EventRow): GuidancePulseEvent {
  switch (row.type) {
    case "READ_SUCCEEDED":
      return {
        type: "READ_SUCCEEDED",
        sessionScopeId: row.session_scope_id,
        agentScopeId: row.agent_scope_id,
        guidanceId: row.guidance_id as string,
        pathId: row.path_id as string,
        timestampUtc: row.recorded_at_utc,
      };
    case "PRE_COMPACT":
      return {
        type: "PRE_COMPACT",
        sessionScopeId: row.session_scope_id,
        agentScopeId: row.agent_scope_id,
        timestampUtc: row.recorded_at_utc,
      };
    case "CWD_CHANGED":
      return {
        type: "CWD_CHANGED",
        sessionScopeId: row.session_scope_id,
        agentScopeId: row.agent_scope_id,
        oldPathId: row.old_path_id as string,
        newPathId: row.new_path_id as string,
        timestampUtc: row.recorded_at_utc,
      };
    case "SUBAGENT_STARTED":
      return {
        type: "SUBAGENT_STARTED",
        sessionScopeId: row.session_scope_id,
        agentScopeId: row.agent_scope_id,
        timestampUtc: row.recorded_at_utc,
      };
    case "PHASE_CHANGED":
      return {
        type: "PHASE_CHANGED",
        sessionScopeId: row.session_scope_id,
        agentScopeId: row.agent_scope_id,
        phaseId: row.phase_id as string,
        timestampUtc: row.recorded_at_utc,
      };
    case "WRITE_CHECKED":
      return {
        type: "WRITE_CHECKED",
        sessionScopeId: row.session_scope_id,
        agentScopeId: row.agent_scope_id,
        guidanceId: row.guidance_id as string,
        pathId: row.path_id as string,
        decision: row.decision as WriteDecision,
        state: row.state as LeaseState,
        timestampUtc: row.recorded_at_utc,
      };
    default:
      throw new StoreError("STORE_CORRUPT", "stored event has an unknown type");
  }
}
