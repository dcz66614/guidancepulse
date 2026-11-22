# REVIEW_PACK_06 — 问题 F-03（P2）：冷启动样本为 PostToolUse Read 而非 PreToolUse Write

- **严重度：** P2（测量口径严谨性；无 verdict 影响）
- **状态：** OPEN
- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`

## 问题

100 个计时样本并不同构：样本 #1（冷启动）是一次 PostToolUse Read（签发租约，SQLite 写），其余 99 个是 PreToolUse Write（写前检查，SQLite 读 + 决策）。规格 §9.6 要求每个样本包括“spawn、Node 启动、better-sqlite3 加载、JSON 解析、字段净化、SQLite 读取、路径匹配、决策、输出和退出”——冷启动样本走的是另一条代码路径（无写前决策），严格说不满足“每个样本”的同构描述。

## 证据

`02_source/scripts/perf-hook.ts` `measureHookPerf`：

- 种子步骤（注释）：“Seed one FRESH lease (first-ever spawn = cold start)… the seed duration is timed sample #1 (`cold_start_sample_index` 0)”；种子输入为 `seedInput()`——`hook_event_name: "PostToolUse"`、`tool_name: "Read"`；
- 其后 5 次预热与 99 次计时均为 `timedInput()`——`hook_event_name: "PreToolUse"`、`tool_name: "Write"`。

`02_source/artifacts/s0/perf-hook.json`（审查员复跑）：`cold_start_ms=259.97`，`cold_start_sample_index=0`，`durations[0]==cold_start_ms` 为真；其余 99 个样本均为 Write。

设计理由已在代码中注明且成立：没有租约存在时任何 Write 都无法返回 ALLOW，因此种子必须先行；且种子是测量内首次 spawn（在 5 次预热之前），确为真实冷启动（审查员核实顺序：种子 → 5 预热 → 99 计时）。

## 影响

无 verdict 影响：两类调用的共有主导成本是 Node 进程启动（~150ms）；三轮 p95（214.19 / 205.09 / 182.37ms）距 500ms 阈值余量均 >57%；冷启动样本 259.97–382.18ms 同样远低于阈值。即使把冷启动样本替换为同类 Write，p95 不可能越过阈值（p95 取第 95 百分位，单样本不决定 p95）。

## 建议修复

在 perf 证据中明确注明样本 #1 的事件类型与另 99 个不同及理由（已在代码注释中，宜同步进 `S0_GATE.md`/性能报告正文）；或在最终审查时评估：改用“直接写库种子租约 + 100 次全 Write 计时（含首次 spawn 冷启动）”是否更干净——若改，须重新跑 S0 并确认 p95 仍 PASS。
