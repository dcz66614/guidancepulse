# GuidancePulse

> ## ⚠️ Status — read first
>
> Real Claude Code end-to-end verification (**T015**, P1-R1-03) has **NOT** been executed. GPT final review R5 is **HELD** pending that evidence. This repository is a **work-in-progress upload, not a passed final review**.
>
> What has passed: independent re-reviews T013 R6 and R7 on frozen commit `4216d962328a15a432de534947d6a56483dccd7d` (full suite 489/489, S0 gate PASS) — see `reviews/T013_FINAL_REVIEW_R7.md`. The T015 live tests still need to run inside real Claude Code sessions on a Windows PC; the S1 failure log (E01) was never archived, and the S1 cause is unknown. See `STATUS.md` for the full status.

Local Claude Code Hooks adapter that turns guidance reads into scoped, expirable leases checked before supported writes. P025, spec v1.1.0, MIT.

- **Product:** `02_source/` — the hook, CLI, UI and tests. Start at `02_source/README.md`.
- **Specs, handoffs, T015 test pack:** `00_control/` (specs v1.1.0 under `00_control/v1.1.0/`).
- **Independent re-reviews:** `reviews/` (R7: FINAL_VERDICT: PASS, P0=0, P1=0, P2=7).
- **Freeze record:** `02_source/release/T014_FREEZE_REPORT_R5.md` (freeze `4216d96`; `source.zip` / `dist.zip` are release artifacts, not the source of truth — the tree is).

Honest boundary: the hook proves a guidance file was re-READ, not that it was understood or followed (spec §6). It does not prove content safety, and it cannot prove real agent binaries follow the documented hook behaviour — that is exactly what T015 still has to test.
