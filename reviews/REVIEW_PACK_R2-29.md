# REVIEW_PACK_R2-29 — S0 支撑证据门对 vitest worker 抖动过脆：390/390 通过仍判 FAIL（P2）

- **审查对象 commit：** `eaeca88`（FIX-T013 交接）
- **规格版本：** v1.1.0
- **严重度：** P2（门禁稳健性；七门硬门本身全部 PASS；不改变任何产品语义）
- **状态：** OPEN（本轮重审新发现；首次复跑命中）
- **来源：** T013 最终重审（R2）`npm run s0:gate` 复跑

## 1. 问题

`scripts/s0-gate.ts` 的支撑证据判定是纯退出码判定（约 372–374 行）：
`typecheck`、`test:golden`、`test:oracle`、`npm test` 四者退出码须全为 0
且 `fullCounts.failed === 0`，否则总 verdict 为 FAIL。审查员第一次
`s0:gate` 复跑（2026-11-15 16:44–16:46 GMT）中，七门硬门全部 PASS，
但 `npm test` 以 exit 1 结束——而其输出是 `Test Files 21 passed (21)`、
`Tests 390 passed (390)`、失败 0 个；唯一的“错误”是 1 个 vitest
unhandled error：

```text
Vitest caught 1 unhandled error during the test run.
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 ❯ Object.onTimeoutError node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:53:10
```

即 vitest worker 的 RPC 回调在负载下超时（本 VM 仅 1.5 共享核；该轮
`s0:gate` 内部在 typecheck/golden/oracle 之后又连续跑全量测试），
没有任何一条测试失败。审查员随即直接重跑 `npm test`：真实退出码 0，
390/390 通过。同一 commit、同一命令，一次 exit 1、一次 exit 0——
这是环境抖动，不是产品回归；但 S0 把它记为一次 FAIL verdict
（`S0_GATE.json`，generated 2026-11-15T16:46:23Z）。

## 2. 影响与边界

- 误判方向是 fail-closed（宁可错判 FAIL），对产品安全无害；但它让
  S0 verdict 本身带上随机性：T014 冻结要求“S0 Gate 与最终冻结版本
  对应”，一次抖动就得重跑整门（约 4–5 分钟）并解释。
- 审查员第二轮 `npm run s0:gate` 复跑（见主报告 §1）为 PASS，
  七门数值与本次一致；故本轮结论以第二轮为准，第一次 FAIL 记为抖动。

## 3. 处置建议

- 支撑证据改用“失败测试数”为主要判定（exit 非 0 但 failed==0 时记为
  抖动并自动重试一次，或至少在日志/S0_GATE.md 中区分“测试失败”与
  “运行器异常”）；或在 `vitest run` 侧加 `--pool=forks` 等降低 worker
  RPC 超时概率的配置（需先验证不改变测试语义）。
- 不阻断 T014：七门硬门已两次独立复现 PASS；抖动已定位到运行器层，
  与产品代码无关。
