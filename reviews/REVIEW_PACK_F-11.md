# REVIEW_PACK_F-11 — F-01 残留：计划书任务卡 7 处旧章节引用 + Fixture/Golden/Oracle 的 v1.0.0 §5 标注（P2）

- **审查对象 commit：** `143f4e5`
- **规格版本：** v1.1.0
- **严重度：** P2（文档/追溯性，不改变任何 S0 数值）
- **状态：** OPEN（F-01 部分闭环：源码/脚本/单元测试注释已闭环；以下两处残留）
- **来源：** T013 S0 审查 F-01 的复核

## 1. 已闭环的部分（已验证）

FIX-T013-PRE（commit `26dc1de`）把 `02_source/src/`、`scripts/`、`tests/unit/` 中的
`v1.0.0 §` 引用清零。审查员复核：

```bash
grep -rn "v1\.0\.0 §" 02_source/src 02_source/scripts 02_source/tests/unit
# 无输出
```

`src/core/lease-machine.ts`（含 2 个既存 NUL 字节，`git diff --text` 可审）
与 `src/hooks/pre-tool-use.ts` 的章节号已按 v1.1.0 逐条核对改写
（§6/§6.2/§6.3/§6.4/§6.5/§7.3/§7.4），与 PROJECT_BOOK v1.1.0 实际编号一致。

## 2. 残留 A：IMPLEMENTATION_PLAN v1.1.0 §6 任务卡的 7 处引用仍为旧编号

`00_control/v1.1.0/IMPLEMENTATION_PLAN.md`（规格文件，审查员与 FIX 任务均不得改）：

| 行 | 原文 | 问题 |
|---|---|---|
| 323 | T002 输入：项目书 §5/§8 | §5 是用户流程、§8 是 UI；规则 Schema 应为 §5.1/§5.2 一带 |
| 336 | Schema 与项目书 §5.2 一致 | v1.1.0 §5.2 是“典型旅程”，无 Schema 内容 |
| 366 | 内部事件契约与项目书 §8.1 一致 | v1.1.0 §8.1 是 UI 四区；事件契约在 §7.3 |
| 500 | T008 输入：项目书 §9 | v1.1.0 §9 是 S0 门禁；UI 规格在 §8 |
| 526 | T009 输入：项目书 §10 | v1.1.0 §10 是风险分级；Fixture 分组在 §9.2 |
| 555 | 按项目书 §10 实现唯一 S0 判定口径 | S0 判定在 §9（§9.3/§9.5） |
| 567 | 判定条件与项目书 §10.3 完全一致 | §10 无 §10.3；四依据在 §9.3 |

FIX-T013-PRE 交接 §5 已承认这 7 处“留待最终审查记录，不得改规格”。
这些引用是施工任务卡的导航错误，不影响已交付代码（代码按正确章节实现）。

## 3. 残留 B：Fixture/Golden/Oracle 仍标注 `PROJECT_BOOK.md v1.0.0 §5`

```bash
grep -rn "v1\.0\.0 §" 02_source/tests/fixtures/s0/ 02_source/tests/golden/ 02_source/tests/oracle/
# 52 处，49 个文件：48 个 fixture JSON + author-fixtures.py（3 处）+ expected-v1.json（1 处）+ reference_oracle.py 头注释
```

例：`tests/fixtures/s0/control/C01.json:5: "spec": "PROJECT_BOOK.md v1.0.0 §5"`。
FIX-T013-PRE 交接 §2 称其为“冻结 S0 证据的来源标注”，语义与 v1.1.0 §6
一致（PROJECT_BOOK §0.1：三态语义不变、48 条 Fixture 不删减），故未改。
审查员确认该说法属实：§5（v1.0.0）与 §6（v1.1.0）状态机语义相同，
标注作为“按 v1.0.0 §5 编写”的来源说明不算错，但与现行规格版本号不一致，
阅读者需自行换算。

## 4. 处置建议

- 计划书 7 处：由规格方在下一次规格修订时勘误（不是代码任务，不得在
  T014 冻结前私自改规格文件）。
- Fixture/Golden/Oracle 标注：接受“冻结证据来源标注”的口径并记录在案，
  或在下一次证据重建时统一改为 v1.1.0 §6；本次不改动冻结证据。
- 不阻断 T014 之外的任何事项；但 T014 冻结报告应注明这两处残留已记录。
