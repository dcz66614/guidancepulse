# REVIEW_PACK_F-23 — v1.1.0 规格目录未入库；工作树不干净（P2，T014 前置）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（可追溯性/冻结前提；不影响代码与 S0）
- **状态：** OPEN（须在 T014 冻结前处理）
- **来源：** 审查员核查发布就绪状态

## 证据

审查时 `git status --short`（HEAD `143f4e5`）：

```text
 M 02_source/artifacts/s0/S0_GATE.json
 M 02_source/artifacts/s0/S0_GATE.md
 M 02_source/artifacts/s0/logs/s0-gate.log
 M 02_source/artifacts/s0/perf-hook.json
 M 02_source/artifacts/s0/privacy-scan.json
?? 00_control/P025_SPEC_REVISION_v1.1.0_CONVERSATION.pdf
?? 00_control/P025_SPEC_V110_VERIFICATION.md
?? 00_control/v1.1.0/
```

1. **v1.1.0 规格基线不在 git 里**：`00_control/v1.1.0/`（含
   `PROJECT_BOOK.md` 与 `IMPLEMENTATION_PLAN.md`，即本轮全部验收的
   依据）处于 untracked 状态；`git ls-files 00_control/` 只有 v1.0.0
   的 `PROJECT_BOOK.md` / `IMPLEMENTATION_PLAN.md` 与各交接文件。
   T014 验收要求“冻结 commit 与 manifest 一致”——冻结 commit 若不含
   规格基线本身，冻结的溯源链是断的。
2. **工作树不干净**：5 个 S0 产物文件被复跑改动而未提交。其中一部分是
   审查员本次复跑所致（`S0_GATE.json` 现为审查员复跑值，
   sha256 `3356442e…`，p95 422.92ms；HEAD 提交值为 `7bd58eb6…`，
   p95 199.79ms）。T014 要求 `git status --short` 干净后才冻结。
3. 另有 2 个 untracked 控制文件（规格修订对话 PDF 与 v1.1.0 核验报告），
   是否入库由协调员决定，但须明确记录。

## 处置建议

- T014 前：决定 S0 产物是提交本次复跑值还是丢弃；把
  `00_control/v1.1.0/`（及两个控制文件，按决定）纳入一次 commit；
  冻结时 `git status --short` 为空。
- 本次审查提交仅含 `reviews/`，不碰上述文件（审查员禁止修改
  00_control/，S0 产物归属由协调员决定）。
