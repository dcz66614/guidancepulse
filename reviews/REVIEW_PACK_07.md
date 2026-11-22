# REVIEW_PACK_07 — 问题 F-04（P2）：汇总检出计数要求 matchesGolden AND basis

- **严重度：** P2（计数口径；本次运行无可观测差异）
- **状态：** OPEN
- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`

## 问题

逐 fixture 的 `errorDetected` 是规格忠实的（只由 detection_basis 决定），但汇总计数 `summary.errorDetected` 额外要求 `matchesGolden`，与 IMPLEMENTATION_PLAN §8.1“检测计数不能从 matchesGolden 推导”有出入：一次 parity 失败会被误报为检出失败，掩盖真正的失败原因。

## 证据

`02_source/scripts/s0-replay.ts` `summarizeReplay`：

```ts
// 逐 fixture：规格忠实
const errorDetected = fixture.group === "control" ? null : detectionBasis !== null;
// 汇总：多了一个 matchesGolden 条件
errorDetected: errors.filter((f) => f.matchesGolden && f.errorDetected === true).length,
```

同函数内 `controlClean` 汇总亦为 `matchesGolden && controlClean === true`（同样模式，但控制门的定义本身就是“无误报且与期望一致”，影响较小）。

本次运行无可观测差异：48/48 parity 全过，汇总 32/32 与 basis-only 计数相同。篡改测试（忽略 compact 边界 → 31/32）针对的是逐 fixture 的 basis 判定，不受此影响。

## 影响

仅报告归因：若将来某次运行出现 parity 失败但 basis 命中，gate 2 会报 <32/32，使排查者先怀疑检出逻辑而非 parity 差异。Gate 1（parity 48/48）本身仍会独立 FAIL，故总体 verdict 不会被误判为 PASS。

## 建议修复

把汇总 `errorDetected` 改为 basis-only 计数（`errors.filter((f) => f.errorDetected === true).length`），与 §8.1 字面一致；parity 失败继续由 gate 1 单独报告。改动后重跑 `npm run s0:gate` 确认七门仍 PASS（预期无变化，因本次 parity 全过）。
