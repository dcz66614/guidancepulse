/**
 * `guidancepulse init` and `guidancepulse status` — P025 GuidancePulse,
 * T011 (spec v1.1.0).
 *
 * Source of truth: PROJECT_BOOK.md v1.1.0 §5.1 (init generates
 * `.guidancepulse/config.yaml`, `state.sqlite`, `path-key.bin`,
 * `reports/`) and IMPLEMENTATION_PLAN.md v1.1.0 §7.2 (`init` —
 * 初始化本地配置与 SQLite; `status` — 查看会话与租约状态).
 *
 * `init` is idempotent: an existing `config.yaml` or `path-key.bin`
 * is never overwritten (the path key is the HMAC secret for all
 * stored path ids — regenerating it would orphan every existing
 * lease), and opening an existing SQLite file keeps its data.
 * `status` opens the store read-only and never writes.
 *
 * This module never reads Prompt, Transcript, source code, or any
 * network. The only persisted values are the default config, the
 * SQLite state, and the random path key.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { GuidancePulseStore } from "../store/index.js";
import { getCurrentPhase } from "./phase.js";
import { countOwnHooks, GUIDANCEPULSE_HOOKS, SETTINGS_REL_PATH } from "./install.js";

/** Default config written by `init` (PROJECT_BOOK §5.1 example). */
export const DEFAULT_CONFIG_YAML = `version: 1

defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny

phases: [explore, implementation, review, release]

rules:
  - id: auth-change-safety
    source: [CLAUDE.md, .claude/rules/security.md]
    applies_to: [src/auth/**, src/session/**]
    phases: [implementation, review]
    mode: block
    max_successful_edits: 5
`;

/** Relative paths inside `.guidancepulse/` (PROJECT_BOOK §5.1). */
export const CONFIG_REL_PATH = ".guidancepulse/config.yaml";
export const DB_REL_PATH = ".guidancepulse/state.sqlite";
export const PATH_KEY_REL_PATH = ".guidancepulse/path-key.bin";
export const REPORTS_REL_PATH = ".guidancepulse/reports";

/** Result of `initProject`. */
export interface InitResult {
  projectDir: string;
  /** True when any file was created by this run. */
  created: boolean;
  configCreated: boolean;
  dbCreated: boolean;
  pathKeyCreated: boolean;
  reportsCreated: boolean;
}

/**
 * Initialise `.guidancepulse/` in a project directory. Creates
 * `config.yaml` (default config), `state.sqlite` (schema v1),
 * `path-key.bin` (32 random bytes), and `reports/` — each only
 * when missing. Returns which files were created.
 */
export function initProject(projectDirArg: string): InitResult {
  const projectDir = resolve(projectDirArg);
  const gpDir = join(projectDir, ".guidancepulse");
  const configPath = join(projectDir, CONFIG_REL_PATH);
  const dbPath = join(projectDir, DB_REL_PATH);
  const pathKeyPath = join(projectDir, PATH_KEY_REL_PATH);
  const reportsPath = join(projectDir, REPORTS_REL_PATH);
  // FIX-T013 F-21: every `*Created` flag is computed BEFORE the
  // corresponding creation — `reportsCreated` used to be checked
  // after `mkdirSync(reports)`, so it was always false.
  const configCreated = !existsSync(configPath);
  const dbCreated = !existsSync(dbPath);
  const pathKeyCreated = !existsSync(pathKeyPath);
  const reportsCreated = !existsSync(reportsPath);
  mkdirSync(join(gpDir, "reports"), { recursive: true });
  if (configCreated) writeFileSync(configPath, DEFAULT_CONFIG_YAML, "utf-8");
  if (pathKeyCreated) writeFileSync(pathKeyPath, randomBytes(32));
  // Opening the store creates the file and applies the schema;
  // opening an existing file keeps its data (idempotent).
  const store = GuidancePulseStore.open(dbPath);
  try {
    // No-op read to prove the schema is usable.
    store.listEvents({ limit: 1 });
  } finally {
    store.close();
  }
  return {
    projectDir,
    created: configCreated || dbCreated || pathKeyCreated || reportsCreated,
    configCreated,
    dbCreated,
    pathKeyCreated,
    reportsCreated,
  };
}

/** One scope's lease summary in `status` output. */
export interface StatusScope {
  sessionScopeId: string;
  agentScopeId: string;
  currentPhase: string | null;
  fresh: number;
  expired: number;
  total: number;
}

/** Result of `statusProject`. */
export interface StatusResult {
  projectDir: string;
  initialised: boolean;
  configExists: boolean;
  dbExists: boolean;
  pathKeyExists: boolean;
  installed: boolean;
  /** Own Hook entries present in settings (0–6). */
  ownHooksPresent: number;
  ownHooksExpected: number;
  settingsExists: boolean;
  events: number;
  scopes: StatusScope[];
}

/**
 * Report installation and lease state for a project. Read-only:
 * the store is opened with `readonly: true` and nothing is
 * created. Scopes are derived from the persisted events, so a
 * project with no events reports zero scopes.
 */
export function statusProject(projectDirArg: string): StatusResult {
  const projectDir = resolve(projectDirArg);
  const configExists = existsSync(join(projectDir, CONFIG_REL_PATH));
  const dbExists = existsSync(join(projectDir, DB_REL_PATH));
  const pathKeyExists = existsSync(join(projectDir, PATH_KEY_REL_PATH));
  const settingsPath = join(projectDir, SETTINGS_REL_PATH);
  const settingsExists = existsSync(settingsPath);
  let ownHooksPresent = 0;
  if (settingsExists) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf-8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        ownHooksPresent = countOwnHooks((parsed as Record<string, unknown>).hooks);
      }
    } catch {
      // Unparseable settings: status reports 0 own hooks rather
      // than failing — repair is install's job, not status's.
      ownHooksPresent = 0;
    }
  }
  let events = 0;
  const scopes: StatusScope[] = [];
  if (dbExists) {
    const store = GuidancePulseStore.open(join(projectDir, DB_REL_PATH), { readonly: true });
    try {
      const allEvents = store.listEvents({});
      events = allEvents.length;
      const scopeKeys = new Map<string, { sessionScopeId: string; agentScopeId: string }>();
      for (const e of allEvents) {
        const key = `${e.sessionScopeId}\n${e.agentScopeId}`;
        if (!scopeKeys.has(key)) {
          scopeKeys.set(key, { sessionScopeId: e.sessionScopeId, agentScopeId: e.agentScopeId });
        }
      }
      for (const { sessionScopeId, agentScopeId } of scopeKeys.values()) {
        const leases = store.listLeasesForScope(sessionScopeId, agentScopeId);
        scopes.push({
          sessionScopeId,
          agentScopeId,
          currentPhase: getCurrentPhase(store, sessionScopeId, agentScopeId),
          fresh: leases.filter((l) => l.state === "FRESH").length,
          expired: leases.filter((l) => l.state === "EXPIRED").length,
          total: leases.length,
        });
      }
    } finally {
      store.close();
    }
  }
  return {
    projectDir,
    initialised: configExists && dbExists && pathKeyExists,
    configExists,
    dbExists,
    pathKeyExists,
    installed: ownHooksPresent === GUIDANCEPULSE_HOOKS.length,
    ownHooksPresent,
    ownHooksExpected: GUIDANCEPULSE_HOOKS.length,
    settingsExists,
    events,
    scopes,
  };
}
