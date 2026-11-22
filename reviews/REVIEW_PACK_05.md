# REVIEW_PACK_05 — 问题 F-02（P2）：Oracle 三处边缘语义取自生产源码，独立性有保留

- **严重度：** P2（方法学保留；无 S0 影响）
- **状态：** OPEN
- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`

## 问题

Oracle 自述其三处边缘语义不是从规格独立推导，而是以生产源码为语义参考。这三处是规格未明确写死的“冻结选择”，Oracle 与生产在此处共享同一假设，削弱了“独立实现”对这些边缘的交叉验证能力。

## 证据

`02_source/tests/oracle/reference_oracle.py` 头注释（INDEPENDENCE 一节）：

> "It was written from the spec (§5.1–§5.5) and the fixture format, reading the production sources only as a semantic reference for frozen edge choices that the spec leaves open (fail-closed on unknown cwd/phase, budget-0 leases, lazy expiry)."

三处共享假设：

1. 未知 cwd/phase 时 fail-closed（失效而非放行）；
2. `max_successful_edits=0` 的租约签发即 `EXPIRED / EDIT_BUDGET_EXHAUSTED`；
3. 写前检查的懒失效（lazy expiry）语义。

生产侧对应实现：`src/core/lease-machine.ts`（`checkWrite` 的 null cwd/phase 分支、预算 0 分支）与文件头“Fail-closed choices (frozen here, flagged for review)”注释——生产作者同样标注这些是规格未定、此处冻结的选择。

## 影响

无 S0 影响：48/48 parity、32/32 检出、Oracle `--self-test` 均通过；Golden 为手工期望且经独立复核 PASS（commit `95bf699`），三处边缘在 Golden 的期望值中已有手工判定（例如预算 0 fixture 的期望为 EXPIRED），提供了第三方的交叉锚点。风险在于：若三处假设本身与产品意图不符，Oracle 与生产会以同样错误的方式一致通过，parity 无法发现。

## 建议修复

在 T013 最终审查前，把三处共享假设显式写入 T009 证据（或规格附录）作为“冻结决策”，说明其来源与产品意图，并由独立复核者确认每处假设与 Golden 手工期望一致；或在规格 v1.1.x 中把三处语义写死，使 Oracle 可完全从规格推导。
