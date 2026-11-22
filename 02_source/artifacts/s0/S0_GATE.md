# S0 Gate — P025 GuidancePulse

**Verdict: PASS**

Generated: 2026-11-17T03:23:20.814Z | Git commit: 8077c3c4e68facc30f69a3474855c1d64ecc316d | Node: v24.22.1 | Platform: linux-x64

## Hard gates (all must pass)

| Gate | Measured | Threshold | Verdict |
|---|---|---|---|
| production/oracle parity | production==golden 48/48, oracle==production 48/48, oracle==golden 48/48 | 48/48 on all three comparisons | **PASS** |
| planted-error detection | 32/32 | 32/32 | **PASS** |
| control no false alarms | 16/16 | 16/16 | **PASS** |
| hook end-to-end p95 | p95=228.95ms (n=100, p50=167.14ms, p99=345.64ms, min=148.35ms, max=590.26ms, cold_start=590.26ms, cold_start_sample_index=0, run_failures=0) | p95 < 500ms (fresh node subprocess per run, incl. startup + SQLite read) | **PASS** |
| 100-run determinism (one canonical SHA-256) | 1 unique hash(es) over 100 runs; sha256=ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50 | exactly 1 unique hash | **PASS** |
| network requests 0 | 0 network call-sites in src/ + scripts/hook-entry.ts (40 files); 0 URL literal(s) in code (informational, not requests) | 0 network call-sites | **PASS** |
| prompt/source persistence leaks 0 | 0 canary hit(s) across 11 persisted file(s) | 0 canary hits | **PASS** |

## Supporting evidence

- typecheck: exit 0 (PASS)
- test:golden: exit 0, 53 passed / 0 failed
- test:oracle: exit 0
- npm test (full): exit 0, 489 passed / 0 failed, 23 files

Canonical replay SHA-256 (100 runs): `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`

## Privacy second + final passes (S0_GATE.json/.md bytes)

Second pass (draft report bytes): 0 canary hit(s) across 2 file(s) — **PASS**.
Final byte scan (exact bytes written to disk): 0 canary hit(s) across 2 file(s) — **PASS**.

## Artifacts (sha256)

- `fixture-results.json`: `79daa09bbf4a624e5921f66e367fc0c73fe1384344e7beff01648d0561a25f74`
- `oracle-results.json`: `712e024d5bf681d91522239a449c5678272e3a52e78965a9265500605957df5f`
- `perf-hook.json`: `3a75713a5c0dd87685a94239c65178823098156d13c56129b87ac49ffb568dd2`
- `repeat-hashes.json`: `1fe3e5429e6ab72141bd2e4b150aecf791508d03d5b55447ef02cba5bba0ecc7`
- `privacy-scan.json`: `7e3af783ba670dcfb1fdde29fa7fdc75877fc17902ea6f112616226d7bc65cb3`
- `network-scan.json`: `d93b0840e7783fef0634717c9e868f0a2496fd852df112c1fa821d26a0937e06`
