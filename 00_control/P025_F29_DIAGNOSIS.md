# P025 FIX-R4 — F-29 diagnostic report (diagnosis ONLY, nothing modified)

- Date: 2026-11-17 ~01:41–01:47 GMT
- Worker: P025 FIX-R4 F-29 diagnostic worker
- Scope: `~/workspace/p025-guidancepulse/02_source`, vitest 3.2.4, Node v24.22.1, 4 vCPU VM
- Verdict: **root cause found, high confidence**. No code, test, config, or `scripts/s0-gate.ts` was modified. All bisect runs used CLI path filters only. `git status` is unchanged from the start of this task (only the pre-existing S0-artifact modifications).

## 1. Symptom (confirmed)

`npm test` exits 1 with **423 passed / 0 failed (22 files)** and N unhandled errors, all identical:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 ❯ Object.onTimeoutError node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:53:10
```

The S0 gate (`scripts/s0-gate.ts` lines 411–412) requires `fullTest.exit_code === 0 AND failed === 0`, so this deterministically blocks the re-freeze. It is **not** a test failure — zero tests fail in any run.

## 2. Root-cause hypothesis

**A Vitest worker→main RPC (`onTaskUpdate`) with a hardcoded 60-second timeout fires because a fork worker running a file of synchronous `spawnSync` tests does not service its event loop / IPC for the whole file duration, and the file's wall duration exceeds 60 s under parallel load.**

Mechanism, verified in the installed `node_modules`:

- Timeout value: **60,000 ms**, hardcoded birpc `DEFAULT_TIMEOUT` (`node_modules/vitest/dist/chunks/index.B521nVV-.js:3`, `timeout = DEFAULT_TIMEOUT`). There is **no public Vitest option to raise it**; `testTimeout` is unrelated (the slow tests set their own per-test timeout to 180,000 ms — 3× the RPC timeout — which is why they pass while the RPC times out).
- `onTimeoutError` (`node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:48-53`) throws `[vitest-worker]: Timeout calling "onTaskUpdate"`; birpc catches it and **rejects the RPC promise** (`index.B521nVV-.js:57-68`). The rejection surfaces at file end via `finishSendTasksUpdate` → `Promise.all(pendingTasksUpdates)` (`node_modules/@vitest/runner/dist/chunk-hooks.js`) as one unhandled error per timed-out RPC. `cli-api.BkDphVBG.js:9884` then sets `process.exitCode = 1` whenever unhandled errors exist (unless `dangerouslyIgnoreUnhandledErrors`).
- The runner sends `onTaskUpdate` **fire-and-forget, throttled to 100 ms** (`sendTasksUpdate`, `chunk-hooks.js:1458-1480`); the promises are only awaited at file end. The slow files' tests are synchronous `spawnSync` chains (real `node` subprocesses per CLI/hook call: `tests/integration/t012-helpers.ts:121`, `tests/e2e/cli-chain.test.ts:40`, `tests/integration/fix-t013.test.ts:113`, `tests/unit/installer.test.ts:340`). The runner's inter-test path is pure `async`/`await` microtasks plus synchronous test bodies, so Node's microtask queue starves the timers/poll phases for the whole file: the response to the file's **first** update RPC (sent at file start) cannot be processed until the file ends. If file wall duration > 60 s, that RPC's timer fires first → exactly **one** unhandled error per over-60 s file. Later RPCs sent during the file are answered promptly once the loop ticks, so the count is exactly 1 per slow file, never more.
- This is a known Vitest failure family (upstream reports: worker→main birpc calls have a fixed timeout and a starved/blocked worker misses it; fix direction is "fix the starvation or split the work, don't raise the timeout").

## 3. Evidence — bisect (7 runs, perfect correlation)

**In every run, error count == number of test files whose wall duration exceeded 60 s.** No run contradicts this.

| Run (GMT) | Exit | Errors | Files > 60 s (wall) | Notes |
|---|---|---|---|---|
| Full suite, `/tmp/p025-test-direct.log` 00:20 | 1 | 3 | cli-chain 66.0 s, installer 66.3 s, fix-t013 88.8 s (next: full-chain 53.5 s) | 423/423 pass |
| S0 attempt 3, `/tmp/p025-s0-attempt3.log` 01:28 | 1 | (exit 1, 423/0) | per-file durations not logged | S0 FAIL on tests |
| `tests/e2e` alone 01:35 | 0 | 0 | none (max cli-chain 31.1 s) | 2/2 pass |
| `tests/integration` alone 01:36 | 1 | 1 | fix-t013 71.4 s (next: full-chain 56.4 s) | 17/17 pass |
| `tests/unit` alone 01:38 | 0 | 0 | none (max installer 48.5 s) | 404/404 pass |
| `full-chain.test.ts` alone 01:39 | 0 | 0 | 23.8 s | 3/3 pass |
| `fix-t013.test.ts` alone 01:39 | 0 | 0 | 24.0 s | 9/9 pass |
| Full suite **minus full-chain** 01:40 | 1 | 1 | fix-t013 62.5 s (cli-chain 47.8 s, installer 48.9 s — both under) | 420/420 pass |

Load dependence (same file, same code — durations are load, not code):

| File | Alone | Subset run | Full run |
|---|---|---|---|
| fix-t013 | 24.0 s | 62.5–71.4 s | 88.8 s |
| cli-chain | 31.1 s | 47.8 s | 66.0 s |
| installer | 48.5 s | 48.9 s | 66.3 s |
| full-chain | 23.8 s | 53.5–56.4 s | 53.5 s |

Load averages during the runs hit 5–9 on the 4-vCPU VM (this cell is CPU-capped at 1.5 shared CPUs); each slow test spawns many real `node` processes (vite-node launcher, real `tsc` compiles), so files stretch 2–3.7× under parallel load. The 60 s threshold sits between the observed 56.4 s (no error) and 62.5 s (error).

## 4. What it is NOT

- **Not the new FIX-R4 test / not full-chain.** full-chain alone: 23.8 s, 0 errors. Full suite minus full-chain still fails (1 error). Exonerated.
- **Not one long blocking operation.** Max single test in the erroring multi-test files is 22.7 s (fix-t013) / 27.4 s (installer) — well under 60 s. Only cli-chain has a single 66 s test, and it alone cannot explain the other two files. The trigger is **cumulative file duration**, not a single test.
- **Not main-process starvation.** Fast files' updates are all answered promptly under the same load (hundreds of tests, 0 errors from them); errors track slow files exactly, never the fast ones.
- **Not fixable by re-running.** Reproduces in 3/3 recent full/near-full runs; it is load-dependent, so an occasional quiet run may pass by luck — that is not a fix.
- **Not a code regression since R2.** `git diff f4d2b2e HEAD -- tests/` changes only 4 files (full-chain +1 real test; hooks-adapter, pre-tool-use, privacy-sanitizer — all fast unit tests; +27 tests, 396→423). cli-chain, installer, fix-t013, fix-t014-f27, offline, concurrency, privacy-scan are **byte-identical since the frozen R2 commit**. The variable is wall-clock duration under load. (Caveat: R2 evidence records only counts, not per-file durations, so "at R2 the three slow files each ran < 60 s" is inference, not direct evidence — but it is the only explanation consistent with unchanged slow files plus the measured load dependence.)

## 5. Proposed fixes (NOT applied — parent/coordinator decision required)

1. **Reduce parallel contention so every file stays < 60 s (recommended, lowest risk).** Set `poolOptions.forks.maxWorkers` (e.g. 2) or `fileParallelism: false` in `vitest.config.ts`. Solo durations are 24–49 s, well under the threshold. Cost: longer total wall time (full run ~140 s → roughly 250–350 s serial; S0 gate slower). Risk: low — no test or gate semantics change. Must verify after the change that all files stay < 60 s.
   - Variant of the same idea: split the three slow files (cli-chain, installer, fix-t013) into smaller files each < 60 s. More invasive (test edits) but also robust if the machine gets slower.
2. **Make the slow tests yield the worker loop.** Convert `spawnSync` → async `spawn` with `await` in the slow helpers (`t012-helpers.ts`, fix-t013 helpers, installer helpers). This lets IPC/timers be serviced between subprocess calls — treats the cause (loop starvation), not the symptom (load). Risk: medium — touches helpers used by many tests; timing semantics change slightly; full re-verification needed.
3. **Upgrade Vitest** and check whether a newer 3.x/4.x raises the RPC timeout or makes `onTaskUpdate` non-timing-out. Unverified — needs an upstream changelog check; a harness version bump has re-freeze implications.
4. **⚠️ FLAGGED — gate-weakening, needs an explicit parent decision, do NOT apply silently.** `dangerouslyIgnoreUnhandledErrors: true` (Vitest config/CLI) would make `npm test` exit 0 despite the errors — but it hides **all** unhandled errors, not just this one, so a genuine test bug that throws unhandled would also be masked. Likewise, relaxing `scripts/s0-gate.ts` lines 411–412 (dropping the `exit_code === 0` requirement, or trusting "423 passed / 0 failed" while ignoring the exit code) would unblock the re-freeze but weaken the gate; S0 would then certify a run with known unhandled errors. Recommend against unless Sam/parent explicitly accepts it with a recorded caveat.
5. **Not recommended as a fix:** running the suite on a quieter/faster machine, or hoping for a quiet run. It passes by luck and will cross the threshold again under load.

## 6. Caveats / open items

- R2 per-file durations were never recorded (see §4 caveat).
- The microtask-starvation detail (worker loop never servicing IPC mid-file) is inferred from Node semantics plus the black-box correlation; direct proof would need worker instrumentation (not done — diagnosis only, no code changes).
- No fresh full-suite run was repeated after the bisect; the full-minus-full-chain run serves as the confirmation run (task allowed at most 1 full confirmation run; two prior full runs already establish the baseline).
- Config/CLI flags other than path filters were **not** tested (per task scope); fix options in §5 are proposals, not verified remedies.

## 7. Logs

- `/tmp/p025-test-direct.log` (full run, 00:20, 3 errors), `/tmp/p025-s0-attempt3.log` (S0 attempt 3, 01:28, exit 1)
- Bisect logs: `/tmp/p025-diag-e2e.log`, `/tmp/p025-diag-integration.log`, `/tmp/p025-diag-unit.log`, `/tmp/p025-diag-fullchain.log`, `/tmp/p025-diag-fixt013.log`, `/tmp/p025-diag-fullminusfullchain.log`
- Frozen R2 evidence: `02_source/release/s0-evidence/S0_GATE.json` (PASS, 396/396, exit 0, commit f4d2b2e)
