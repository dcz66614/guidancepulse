# GuidancePulse

Local Claude Code Hooks adapter that turns guidance reads into scoped,
expirable leases checked before supported writes. P025, spec v1.1.0.

> **Status:** S0 gate PASS (v1.1.0, p95 < 500 ms). T011 CLI
> install/uninstall complete. Live Claude Code triggering is **not**
> verified on this VM — Claude Code is not installed here (T001);
> `onFailure: "block"` requires Claude Code ≥ v2.1.295.

## What it does

1. You read guidance (`CLAUDE.md`, rule files). A `PostToolUse`
   hook records a successful read and issues a **FRESH** lease for
   that guidance, scoped to the session, agent, cwd and phase.
2. Before a `Write`/`Edit`, a `PreToolUse` hook checks the lease:
   FRESH → allow; UNSEEN/EXPIRED → warn / ask / block per rule.
3. `PreCompact`, a cwd change, a subagent start or an explicit
   `phase set` expires the lease, so stale guidance cannot silently
   authorise the next write.

Nothing leaves the machine: no network, no Prompt/Transcript/source
persistence — only guidance ids, HMAC path ids, timestamps and lease
state in a local SQLite file (PROJECT_BOOK §7.4 allowlist).

## Prerequisites

- Node.js ≥ 24.
- **Windows: no C++ toolchain needed.** `better-sqlite3@13.2.0`
  ships N-API prebuilt binaries (including `win32-x64.node`) and
  has no install script, so `npm ci` does not run `node-gyp` and
  does not need MSVC / Visual Studio Build Tools. (Correction:
  earlier versions of this README wrongly said the toolchain was
  required and that no Node 24 prebuild existed.)
- **Windows install prerequisite under investigation.** The real
  cause of the `npm ci` failure seen in T015 S1 is still unknown —
  the E01 log was never archived (it only exists on Sam's PC at
  `C:\t015-evidence\`). If `npm ci` fails, keep the full log and
  hand it to Muse for re-diagnosis instead of installing a
  toolchain.

## Quick start

```bash
# Inside the project you want to protect:
guidancepulse init                    # create .guidancepulse/ (config, state, path key)
guidancepulse install --project .     # back up + merge Hooks into .claude/settings.local.json
guidancepulse status                  # installation + lease state (read-only)
```

`guidancepulse` is available as `npm run guidancepulse -- <args>` in
this tree, or via `bin/guidancepulse` (add `02_source/bin` to `PATH`).

## Commands

| Command | Behaviour |
|---|---|
| `guidancepulse init [--project <dir>]` | Create `.guidancepulse/config.yaml`, `state.sqlite`, `path-key.bin`, `reports/` (idempotent; never overwrites the path key). |
| `guidancepulse install --project <dir>` | Back up `.claude/settings.local.json`, merge only GuidancePulse's own Hook entries, build the hook entry scripts. Idempotent. |
| `guidancepulse uninstall --project <dir>` | Remove only GuidancePulse's own Hook entries; user Hooks untouched. |
| `guidancepulse status [--project <dir>]` | Installation + lease state. Read-only. |
| `guidancepulse phase set <id>` | Mark a phase; expires the current scope's old leases. |

Full user guide: [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md).

## Install safety (T011)

- **Backup first.** Before any write, the current
  `.claude/settings.local.json` is copied to
  `.claude/settings.local.json.guidancepulse-backup.json`. The backup
  is written only once — a re-install never overwrites the true
  pre-install original.
- **Merge only.** Install adds exactly the six Hook entries from
  IMPLEMENTATION_PLAN §7.1 and touches nothing else in your settings.
  Uninstall removes exactly those six entries.
- **Idempotent.** Running `install` twice changes nothing the second
  time; running `uninstall` twice removes nothing the second time.
- **Failure rollback.** If install/uninstall fails after the backup,
  the pre-existing settings are restored from the backup (or the
  file is deleted when install created it) and the failure is logged
  to `.guidancepulse/install-failure.log`. A failed install never
  leaves a half-merged configuration.
- **Formatting.** Install/uninstall rewrite the settings file as
  canonical 2-space JSON (a JSON round-trip): user content is
  preserved semantically, only whitespace is normalised. The backup
  file keeps the original bytes exactly.

## Hook configuration (§7.1)

Install merges these entries (verbatim from the spec):

- `PreToolUse`, matcher `Write|Edit` → `node
  ${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-tool-use.js`,
  `onFailure: "block"`, `timeout: 10`
- `PostToolUse`, matcher `Read` → `post-tool-use.js`, `timeout: 10`
- `PreCompact` → `pre-compact.js`, `onFailure: "block"`, `timeout: 10`
- `InstructionsLoaded` → `instructions-loaded.js`, `async: true`
- `CwdChanged` → `cwd-changed.js`, `async: true`
- `SubagentStart` → `subagent-start.js`

Each `.js` file is a thin launcher that defaults `GP_CONFIG` /
`GP_DB` / `GP_PATH_KEY` to the project's `.guidancepulse/` files and
imports the compiled hook entry
(`.guidancepulse/hooks/.build/scripts/hook-entry.js`, compiled from
`scripts/hook-entry.ts` with `tsc` at install time). A launcher whose
compiled entry is missing fails closed (stderr JSON + exit 2) —
a PreToolUse hook that cannot run blocks the write instead of
silently allowing it.

**Installed hooks are self-contained (FIX-T013, F-17):** `install`
compiles the hook entry into `.guidancepulse/hooks/.build/` and
vendors its runtime dependencies (`yaml`, `better-sqlite3` including
the native `.node` prebuilds) into `.build/node_modules/`, by local
offline copy from the guidancepulse source tree — no `npm install`
at install time. The installed hooks therefore run in any project,
whether or not the source tree's `node_modules` is resolvable above
it. `uninstall` removes `.build/` (compiled entry + vendored
dependencies); a re-install rebuilds and re-vendors them.

## Development

```bash
npm run typecheck        # tsc --noEmit
npm test                 # full unit suite (vitest)
npm run test:installer   # T011 installer suite (16 tests)
npm run s0:gate          # S0 gate (7 gates; do not lower thresholds)
```

Specs: `00_control/v1.1.0/PROJECT_BOOK.md`,
`00_control/v1.1.0/IMPLEMENTATION_PLAN.md`. Handoff for this task:
`00_control/HANDOFF_T011.md`.

## License

MIT — see `LICENSE`.
