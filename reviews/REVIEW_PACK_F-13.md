# REVIEW_PACK_F-13 — F-03 仍成立：冷启动样本为 PostToolUse Read 而非 PreToolUse Write（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（测量口径严谨性；门本身仍 PASS）
- **状态：** OPEN（自 T013 S0 审查起未变）
- **来源：** T013 S0 审查 F-03 的复核

## 证据

`02_source/scripts/perf-hook.ts`：

- 第 2 步（seed）：以 PostToolUse Read 子进程调用播种 FRESH 租约，
  “the first-ever spawn = the cold start”，其耗时记为 `durations[0]`，
  同时报告为 `cold_start_ms`，`cold_start_sample_index: 0`。
- 随后 5 次预热（不计入）+ 99 次计时 PreToolUse Write，全新 Node 子进程。

审查员本次复跑 `npm run s0:gate` 的 `perf-hook.json`：

```text
n=100, p50=177.50ms, p95=422.92ms, p99=621.61ms, min=147.09ms, max=780.23ms
cold_start_ms=780.23ms, cold_start_sample_index=0, durations[0]==cold_start_ms, run_failures=0
```

符合 PROJECT_BOOK §9.6 / IMPLEMENTATION_PLAN §8.3 的字面口径：
5 次预热排除、100 次计时含冷启动、每次全新 Node 子进程、阈值严格 p95 <500ms。
但 100 个样本并不同构：样本 #1 是 Read 路径（播种），样本 #2–#100 是
Write 路径（被门控的写前检查）。Read 与 Write 在 hook-entry 内的处理
路径不同（Read 走 InstructionsLoaded 批处理写租约；Write 走 PreToolUse
门 + WRITE_CHECKED 审计写），冷启动值不能直接读作“一次 Write 的冷启动”。

## 处置建议

- 接受为已知口径保留（P2）：门只看 p95，本次 p95=422.92ms <500ms，
  结论不受影响；但发布材料不得把 `cold_start_ms` 表述为 Write 冷启动。
- 若后续收紧口径，应改为“先播种（不计入），再 100 次计时 Write”
  并另行报告种子耗时——但这会改变已冻结的测量口径，需规格修订，
  不在本轮处理。
