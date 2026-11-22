/**
 * `guidancepulse uninstall` — P025 GuidancePulse, T011 (spec v1.1.0).
 *
 * Source of truth: IMPLEMENTATION_PLAN.md v1.1.0 §7.2 (`uninstall
 * --project .` — 只移除自身 Hook) and the T011 card ("卸载只移除自
 * 有条目；不覆盖用户原有 Hook").
 *
 * Safety contract (mirrors install.ts):
 *
 *   1. 只移除自有条目 — only entries matching
 *      `isGuidancePulseHookEntry` (a `node` command whose first arg
 *      is `${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/*.js`) are
 *      removed. Every other key, matcher group and hook entry is
 *      copied through untouched.
 *   2. 备份 — the pre-uninstall settings are backed up to the same
 *      backup file install uses, but only when no backup exists
 *      yet, so uninstall never overwrites install's pre-install
 *      original.
 *   3. 失败回退 — any failure after the backup restores the
 *      exact settings bytes this run read at its start (FIX-T013
 *      F-19: never the earliest backup file) and appends to the
 *      failure log (`.guidancepulse/install-failure.log`).
 *   4. 空文件清理 — when install created the settings file (no
 *      backup exists, i.e. there was no pre-install file) and
 *      removal leaves an empty `{}` object, the file is deleted
 *      instead of leaving an empty husk behind.
 *   5. Uninstall does NOT delete `.guidancepulse/` state (config,
 *      SQLite, path key, hook launchers): the user's lease history
 *      stays auditable, and a later re-install reuses it. Removing
 *      local state is a separate, explicit decision, not part of
 *      uninstall. It DOES remove `.guidancepulse/hooks/.build/`
 *      (FIX-T013 F-17) — the compiled hook entry and its vendored
 *      runtime dependencies are install's own generated content;
 *      the launchers stay and fail closed (HOOK_ENTRY_MISSING)
 *      if invoked after uninstall, and a re-install rebuilds
 *      and re-vendors them. The `.build/` removal runs on EVERY
 *      uninstall path (FIX-T014 F-27): also when the settings
 *      file is missing and when no own Hook is registered, so a
 *      manually edited settings file can never strand the ~19 MB
 *      compiled entry behind a "nothing removed" report.
 *
 * This module never reads Prompt, Transcript, source code, or any
 * network.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import {
  appendFailureLog,
  BACKUP_REL_PATH,
  InstallError,
  removeOwnHooks,
  SETTINGS_REL_PATH,
} from "./install.js";

/** Result of `uninstallProject`. */
export interface UninstallResult {
  projectDir: string;
  settingsPath: string;
  /** True when the settings file existed before uninstall. */
  settingsExisted: boolean;
  /** Path of the backup file, when one was (or had already been) written. */
  backupPath: string | null;
  /** True when a fresh backup was written by this run. */
  backupWritten: boolean;
  /** True when at least one own entry was removed. */
  changed: boolean;
  removed: number;
  /** True when the settings file was deleted (it was created by install and left empty). */
  settingsDeleted: boolean;
  /**
   * True when `.guidancepulse/hooks/.build/` (compiled hook entry +
   * vendored runtime dependencies, FIX-T013 F-17) was removed by
   * this run. False when there was nothing to remove, or when the
   * removal was attempted after a successful settings update but
   * failed (best-effort: a stale compiled entry fails closed and
   * is rebuilt by the next install). FIX-T014 (F-27): the removal
   * is attempted on every return path, including the settings-
   * missing and no-own-hooks early returns, so this is true
   * whenever a stale `.build/` existed and was removed, even when
   * no settings entry changed.
   */
  hookBuildRemoved: boolean;
}

/**
 * Remove GuidancePulse's own Hook entries from a project's
 * `.claude/settings.local.json`. See the module header for the
 * safety contract. Throws `InstallError` on failure after
 * restoring the pre-uninstall settings.
 */
export function uninstallProject(projectDirArg: string): UninstallResult {
  const projectDir = resolve(projectDirArg);
  const settingsPath = join(projectDir, SETTINGS_REL_PATH);
  const backupPath = join(projectDir, BACKUP_REL_PATH);
  const settingsExisted = existsSync(settingsPath);
  const backupExisted = existsSync(backupPath);
  // Exact settings bytes this run read at its start (FIX-T013
  // F-19): the failure rollback restores THESE bytes, never the
  // earliest backup file. Null until the read succeeds.
  let settingsRaw: Buffer | null = null;
  // Remove `.guidancepulse/hooks/.build/` (compiled entry + vendored
  // runtime dependencies, FIX-T013 F-17) after a successful settings
  // update — and on the early-return paths too (FIX-T014 F-27: a
  // manually edited settings file must not strand the compiled
  // entry). Best-effort: it runs after the settings write, so a
  // removal failure must not roll the settings back; the leftover
  // entry fails closed and the next install rebuilds it.
  const removeHookBuild = (): boolean => {
    const buildDir = join(projectDir, ".guidancepulse", "hooks", ".build");
    if (!existsSync(buildDir)) return false;
    try {
      rmSync(buildDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  };
  try {
    if (!settingsExisted) {
      // FIX-T014 (F-27): no settings file, but install's own
      // generated `.build/` may still be on disk (the user deleted
      // the settings file by hand). Remove it and report honestly.
      const buildRemoved = removeHookBuild();
      return {
        projectDir,
        settingsPath,
        settingsExisted: false,
        backupPath: backupExisted ? backupPath : null,
        backupWritten: false,
        changed: false,
        removed: 0,
        settingsDeleted: false,
        hookBuildRemoved: buildRemoved,
      };
    }
    let settings: Record<string, unknown>;
    try {
      const raw = readFileSync(settingsPath);
      settingsRaw = raw;
      const parsed: unknown = JSON.parse(raw.toString("utf-8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new InstallError("INVALID_SETTINGS", "settings file is not a JSON object");
      }
      settings = parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof InstallError) throw err;
      throw new InstallError("INVALID_SETTINGS", "settings file is not valid JSON");
    }
    // Backup BEFORE any write; keep the earliest backup (see install.ts).
    let backupWritten = false;
    if (!backupExisted) {
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(settingsPath, backupPath);
      backupWritten = true;
    }
    const pruned = removeOwnHooks(settings.hooks);
    if (!pruned.changed) {
      // FIX-T014 (F-27): no own Hook registered, but install's own
      // generated `.build/` may still be on disk (the user removed
      // the Hook entries by hand). Remove it and report honestly.
      const buildRemoved = removeHookBuild();
      return {
        projectDir,
        settingsPath,
        settingsExisted: true,
        backupPath,
        backupWritten,
        changed: false,
        removed: 0,
        settingsDeleted: false,
        hookBuildRemoved: buildRemoved,
      };
    }
    const nextSettings = { ...settings, hooks: pruned.hooks };
    // Install created the file and removal leaves `{}`: delete it.
    if (Object.keys(nextSettings).length === 1 && Object.keys(pruned.hooks).length === 0 && !backupExisted) {
      rmSync(settingsPath, { force: true });
      return {
        projectDir,
        settingsPath,
        settingsExisted: true,
        backupPath,
        backupWritten,
        changed: true,
        removed: pruned.removed,
        settingsDeleted: true,
        hookBuildRemoved: removeHookBuild(),
      };
    }
    const tmpPath = join(
      dirname(settingsPath),
      `.settings.local.json.guidancepulse-tmp-${process.pid}-${randomBytes(4).toString("hex")}`,
    );
    writeFileSync(tmpPath, JSON.stringify(nextSettings, null, 2) + "\n", "utf-8");
    renameSync(tmpPath, settingsPath);
    return {
      projectDir,
      settingsPath,
      settingsExisted: true,
      backupPath,
      backupWritten,
      changed: true,
      removed: pruned.removed,
      settingsDeleted: false,
      hookBuildRemoved: removeHookBuild(),
    };
  } catch (err) {
    const error = err instanceof InstallError ? err : new InstallError("UNINSTALL_FAILED", String(err));
    // Failure rollback (FIX-T013 F-19): restore the exact bytes
    // this run read at its start, never the earliest backup file.
    // When this run never managed to read the file, leave it alone.
    try {
      if (settingsExisted && settingsRaw !== null) {
        writeFileSync(settingsPath, settingsRaw);
      }
    } catch {
      // Restore itself failed: the failure log below still records it.
    }
    appendFailureLog(projectDir, "uninstall", error);
    throw error;
  }
}
