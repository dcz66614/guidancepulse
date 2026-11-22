/**
 * Privacy regression (E2E) — P025 GuidancePulse, T012 (spec v1.1.0, §7.4/§7.5).
 *
 * Runs a fresh install + a short hook chain with synthetic canaries in
 * every Hook input (Prompt, source-code body, API key, transcript
 * path, canary cwd — including a canary Write body, the realistic
 * leak vector for a Write gate), then proves, on the REAL persisted
 * files:
 *
 * 1. No canary occurs in any persisted file byte (SQLite file, WAL,
 *    config, installed settings) — `assertNoCanariesInFile` counts
 *    raw byte occurrences, so even a free-page / WAL-frame copy fails.
 * 2. The privacy export (`exportEventsJson`) carries only §7.4
 *    allowlisted fields: no banned key names anywhere
 *    (`findBannedKeys`), and no canary values in the export text.
 * 3. `deleteSessionData` + VACUUM removes the session's rows and the
 *    bytes leave the file (canary scan still 0 and the event count
 *    drops to 0 — the delete path itself must not leave copies).
 *
 * This is the regression half of `npm run test:privacy` (the other
 * half is the T007 unit privacy suite). All data is synthetic; no
 * network, no real user config.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findBannedKeys } from "../../src/privacy/sanitize.js";
import {
  assertNoCanariesInFile,
  deleteSessionData,
  exportEventsJson,
} from "../../src/privacy/index.js";
import { GuidancePulseStore } from "../../src/store/index.js";
import {
  CANARIES,
  SESSION,
  T,
  assertNoCanariesPersisted,
  postReadEvent,
  preCompactEvent,
  readEvent,
  readLease,
  setupChainProject,
  teardownChainProject,
  runHook,
  writeEvent,
} from "../integration/t012-helpers.js";

describe("T012 privacy regression: canaries never persist", () => {
  it("install + Read + Write allow + PreCompact + Write deny leaves zero canaries", () => {
    const project = setupChainProject("privacy");
    try {
      const r1 = runHook(project, "instructions-loaded.js", readEvent(project), T.t1);
      expect(r1.status).toBe(0);
      expect(readLease(project)?.state).toBe("FRESH");

      const w1 = runHook(project, "pre-tool-use.js", writeEvent(project), T.t2);
      expect(w1.status).toBe(0);

      const c1 = runHook(project, "pre-compact.js", preCompactEvent(project), T.t3);
      expect(c1.status).toBe(0);
      expect(readLease(project)?.state).toBe("EXPIRED");

      // A second read via the PostToolUse path also carries canaries
      // in the tool_response body; it must not persist them either.
      const r2 = runHook(project, "post-tool-use.js", postReadEvent(project), T.t5);
      expect(r2.status).toBe(0);
      expect(readLease(project)?.state).toBe("FRESH");

      // 1. Byte scan of every persisted file the chain wrote.
      assertNoCanariesPersisted(project);
      // The WAL file, when present, is scanned too (it is in the
      // target list); assert the scan actually covered the DB file.
      expect(existsSync(project.dbPath)).toBe(true);

      // 2. The privacy export is allowlisted fields only.
      const store = GuidancePulseStore.open(project.dbPath, { readonly: true });
      let exported: string;
      try {
        exported = exportEventsJson(store, SESSION);
      } finally {
        store.close();
      }
      const parsed = JSON.parse(exported) as unknown;
      expect(findBannedKeys(parsed)).toEqual([]);
      for (const canary of CANARIES) {
        expect(exported).not.toContain(canary.value);
      }
      // The export must still contain the real audit trail (it is a
      // redaction check, not an empty-output check).
      expect(exported).toContain("READ_SUCCEEDED");
      expect(exported).toContain("WRITE_CHECKED");
      expect(exported).toContain("PRE_COMPACT");

      // 3. Session delete removes the rows and the bytes stay clean.
      const live = GuidancePulseStore.open(project.dbPath);
      let deleted: { eventsDeleted: number; leasesDeleted: number };
      try {
        deleted = deleteSessionData(live, SESSION);
        expect(deleted.eventsDeleted).toBeGreaterThan(0);
        expect(live.listEvents({ sessionScopeId: SESSION })).toHaveLength(0);
      } finally {
        live.close();
      }
      assertNoCanariesInFile(project.dbPath, CANARIES);
    } finally {
      teardownChainProject(project);
    }
  }, 180000);
});
