# HANDOFF — FIX-T013-PRE：闭环 T013 S0 审查两项 P2（F-04、F-01）

- **任务：** FIX-T013-PRE，规格 v1.1.0，最终审查前闭环。
- **基线 commit：** `23f10b3add120fee018bd2aa7d9a1935dee6d28a`（T012 handoff）
- **工作 commit：** `26dc1de39e7c58d40342691015d7e68e0ac6d24c`（41 个文件，+297/−289）
- **日期：** 2026-11-15（UTC）
- **结论：F-04、F-01 均已关闭；S0 仍为 PASS（七门全过）；数值无变化。**

---

## 1. F-04 — 汇总检出计数口径（REVIEW_PACK_07，P2）

### 改了什么

文件：`02_source/scripts/s0-replay.ts`，`summarizeReplay` 返回值（原 492/494 行，现 492–500 行）。

改前：

```ts
controlClean: control.filter((f) => f.matchesGolden && f.controlClean === true).length,
errorTotal: errors.length,
errorDetected: errors.filter((f) => f.matchesGolden && f.errorDetected === true).length,
```

改后：

```ts
// Summary counts are basis-only per IMPLEMENTATION_PLAN §8.1:
// detection counts must NOT be derived from matchesGolden (a parity
// failure must be reported by gate 1 alone, not misreported as a
// detection failure). Per-fixture errorDetected / controlClean above
// are unchanged and already basis-only.
controlClean: control.filter((f) => f.controlClean === true).length,
errorTotal: errors.length,
errorDetected: errors.filter((f) => f.errorDetected === true).length,
```

### 为什么

与 `IMPLEMENTATION_PLAN.md` v1.1.0 §8.1 字面一致：“检测计数不能从
`matchesGolden` 推导。Fixture 只有在四种依据之一命中时才能标记
`errorDetected=true`。”原汇总多了一个 `matchesGolden` 条件：一次 parity
失败会被误报为检出失败，掩盖真正失败原因；parity 失败应由 gate 1
（48/48 三向一致）单独报告。

### 未改动

- 逐 fixture 的 `errorDetected` / `controlClean` / `detection_basis`
  判定逻辑与优先级（§9.3 四依据：`non_allow_decision` →
  `expired_final_lease` → `expired_intermediate_lease` →
  `same_cwd_no_expiry`）**一行未动**。
- 未改 Golden、未改四依据定义、未改 p95 阈值（500）、未改测量口径、
  未删 Fixture、未回写 Golden。

### 改前改后数值对照（`npm run s0:gate` 实测）

| 计数 | 改前（基线，16:03 运行） | 改后（16:11 运行） |
|---|---:|---:|
| parity | 48/48 | 48/48 |
| errorDetected（汇总） | 32/32 | 32/32 |
| controlClean（汇总） | 16/16 | 16/16 |
| detection_basis 分布 | non_allow 28、expired_final 1、expired_intermediate 2、same_cwd 1、control null 16 | **完全相同** |
| canonical replay hash | `ef06d30f45d2…` | `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（**未变**） |

数值不变符合预期（当前 parity 48/48 全过）；如数值变了应停下汇报——
实际未变，故继续。

---

## 2. F-01 — 源码注释章节引用滞后（REVIEW_PACK_04，P2）

### 范围

- 只改 `02_source/` 下源码与测试的**注释**（含 JSDoc 单行注释、
  `//` 注释，以及 `describe`/`it` 标题字符串——仅为可读性文字，
  无逻辑）。
- 共 **34 个文件**（`src/` 24 个、`scripts/` 2 个、`tests/unit/` 8 个）。
- 逐条按 `00_control/v1.1.0/PROJECT_BOOK.md` 实际章节标题与
  `00_control/v1.1.0/IMPLEMENTATION_PLAN.md` 实际章节标题核对，
  非机械 +1。核对依据见下表。

### 章节号映射表（v1.0.0 → v1.1.0，PROJECT_BOOK）

| v1.0.0 旧编号 | 旧内容 | v1.1.0 新编号 | v1.1.0 实际内容 |
|---|---|---|---|
| §4.1 | 示例配置 | §5.1 | 初始化和配置（含示例配置） |
| §4.3 | 官方事件表 | §5.3 | 官方事件表 |
| §4.4 | 不可观测读取 | §5.4 | 不可观测读取的保守处理 |
| §5 / §5.1–§5.5 | 状态机 / 状态定义 / 租约身份 / 编辑预算 / 写前算法 / 失效边界 | §6 / §6.1–§6.5 | Guidance Lease 状态机（同名小节） |
| §6.3 | 内部事件契约 | §7.3 | 内部事件契约 |
| §6.4 | 允许持久化字段 | §7.4 | 允许持久化字段 |
| §6.5 | 隐私操作 | §7.5 | 隐私操作 |
| §7.1 | 主界面四区 | §8.1 | 主界面四区 |
| §7.2 | 视觉与交互（颜色/文案） | §8.2 | 视觉与交互 |
| §7.3 | UI 示例 | §8.3 | 示例 |
| §10 | 风险分级 | §10 | 风险分级（**未变**，保留） |

### 计划书引用映射（IMPLEMENTATION_PLAN v1.1.0）

| 旧引用 | 修正 | 依据 |
|---|---|---|
| §5 T005 / T006 / T007（任务卡） | §6 T005 / T006 / T007 | v1.1.0 计划书 §6 才是“T001–T014 原子任务卡”；§5 是工作区布局 |
| §4.1（`src/core` 纯度） | §5.1（目录规则） | v1.1.0 §5.1 明确“`src/core` 只包含纯确定性算法”；PROJECT_BOOK §4.1 现为 P023，无关 |
| §7.3（100 次单哈希） | §8.4 | v1.1.0 §8.4“100 次确定性重放”；§7 无 §7.3（§7 只有 §7.1/§7.2） |
| §10（风险，如 PreCompact 失效未持久化、PreToolUse 误放行） | PROJECT_BOOK §10 | v1.1.0 计划书 §10 是模型工种分配；风险表在 PROJECT_BOOK §10 |
| §6.2（`guidancepulse phase set`） | §7.2（CLI 命令契约） | v1.1.0 §7.2 表格原文即“`guidancepulse phase set <id>`｜标记阶段并使旧租约失效” |

### 需要说明的特殊改动（非机械替换）

1. **`src/store/schema.ts`**：原注释称“计划书引 §7.4，但 v1.0.0 第 7 章止于
   §7.3，§7.4 不存在”。v1.1.0 中 §7.4 **存在**且正是字段 allowlist，
   故该条计划书引用现已正确；注释改写为说明旧错引已失效、现引用正确，
   schema 仍按 §7.3/§7.4 执行。
2. **`src/contracts/events.ts` §0.3**：PROJECT_BOOK 无 §0.3（§0 只有
   §0.1）；denylist 在 §7.4，改为“Persistence denylist (§7.4)”。
3. **`src/hooks/instructions-loaded.ts` §1.2**：§1.2（产品定义）未写
   InstructionsLoaded 覆盖范围；覆盖范围在 §5.3 官方事件表，改为 §5.3。
4. **`src/hooks/pre-tool-use.ts` §2.2**：§2.2（典型场景）未写 Bash/外部进程
   不覆盖；该边界只在 §6.5，改为仅引 §6.5（删 §2.2）。
5. **各文件头的“任务卡错引 §7.2/§7.1”说明**：原文称“§7.2 是 UI
   颜色/文案节、§7.1 是 UI 四区”。v1.1.0 中 §7.2 是模块表、§7.1 是进程
   架构，UI 颜色/文案是 §8.2、四区是 §8.1；说明文字已按 v1.1.0 重写，
   保留“任务卡曾错引、实现按正确章节执行、规格未改”的原意。
6. **`src/core/lease-machine.ts`**：文件含 2 个既存 NUL 字节（改前即有，
   git 视其为 binary）；本次编辑以 UTF-8 读写，NUL 原样保留，
   `git diff --text` 可正常审阅全部改动。

### 改了哪些文件（F-01，34 个）

- `src/config/`：`types.ts`、`glob.ts`、`parse.ts`
- `src/contracts/`：`events.ts`、`index.ts`
- `src/core/`：`lease-machine.ts`、`match-rules.ts`
- `src/hooks/`：`adapter.ts`、`decision.ts`、`pre-compact.ts`、
  `cwd-changed.ts`、`subagent-start.ts`、`instructions-loaded.ts`、
  `pre-tool-use.ts`
- `src/store/`：`schema.ts`、`store.ts`、`errors.ts`
- `src/privacy/`：`path-id.ts`、`retention.ts`
- `src/cli/`：`phase.ts`
- `src/ui/`：`timeline.ts`、`App.tsx`、`styles.css`
- `src/report/`：`report.ts`
- `scripts/`：`demo-report.ts`、`probe-hooks.mjs`
- `tests/unit/`：`config.test.ts`、`hooks-adapter.test.ts`、
  `lease-machine.test.ts`、`path-matcher.test.ts`、
  `pre-tool-use.test.ts`、`privacy-sanitizer.test.ts`、
  `ui-component.test.tsx`、`ui.test.ts`

复核方法：改后全树 grep——`02_source/src|scripts|tests/unit` 中
`v1.0.0 §` 引用清零（仅 `schema.ts` 一处历史叙述保留“v1.0.0”
字样，指 v1.0.0 版书本身，属实）；`§5.5`、`§4.1/§4.3/§4.4`、
`§0.3`、`IMPLEMENTATION_PLAN §5 T`、`IMPLEMENTATION_PLAN §10`、
`§1.2`、`§2.2` 等滞后引用清零；其余 `§6.3/§6.4` 出现处已逐条确认
指 v1.1.0 的编辑预算/写前算法（新含义），`§7.1/§7.2` 出现处仅剩
计划书 §7.1/§7.2 的正确引用（`install.ts`、`main.ts`）。

### 刻意未改的（及原因）

- **`00_control/` 全部未动**，包括计划书 §6 任务卡的 7 处滞后引用
  （REVIEW_PACK_04 表格：T002 §5/§8、T002 §5.2、T003 §8.1、T008 §9、
  T009 §10、T010 §10、T010 §10.3）。按任务指令，这是规格勘误，
  留待最终审查记录，不得改规格。
- **`tests/fixtures/s0/*.json`（48 个）、`tests/golden/expected-v1.json`、
  `tests/fixtures/s0/author-fixtures.py`、`tests/oracle/reference_oracle.py`
  未动**：其 `"spec": "PROJECT_BOOK.md v1.0.0 §5"` 是冻结 S0 证据的
  来源标注（fixtures 按 v1.0.0 §5 编写）；PROJECT_BOOK §0.1 确认
  v1.1.0“Guidance Lease 三态语义不变、48 条 Golden Fixtures 不删减”，
  故该标注仍属实；改动会触碰冻结证据与 Golden，超出本次任务范围。
- **`02_source/.guidancepulse/hooks/.build/` 未动**：编译产物（gitignored），
  下次安装/构建时自动重新生成。

### 逻辑未变证明

`git diff` 中除 F-04 两行代码外，其余全部为注释行（`*`/`//`/`/** */`）
与测试标题字符串；无任何生产逻辑、测试逻辑改动。`npm test` 381/381
通过亦佐证。

---

## 3. 验收（全部真实运行，退出码与关键数字）

| 命令 | 退出码 | 结果 |
|---|---|---:|
| `npm run typecheck` | 0 | `tsc --noEmit` 通过 |
| `npm test` | 0 | 20 文件 / **381/381 通过** |
| `npm run test:installer` | 0 | 1 文件 / **16/16 通过**（含 FIX-T011 回归） |
| `npm run s0:gate` | 0 | **S0 = PASS，七门全过** |

S0 七门（本次运行，`artifacts/s0/S0_GATE.json` sha256
`7bd58eb612731a74fac20a23bb21f430142a8644e17108fd6836711b35bceebb`）：

| 门 | 实测 | 阈值 | 结论 |
|---|---|---|---|
| 生产 / Golden / Oracle 三向一致 | 48/48、48/48、48/48 | 三向均 48/48 | PASS |
| 植入错误检出 | 32/32 | 32/32 | PASS |
| 控制无误报 | 16/16 | 16/16 | PASS |
| Hook 端到端 p95 | **p95=199.79ms**（n=100，p50=160.40ms，p99=271.49ms，min=143.72ms，max=278.06ms，cold_start=271.49ms，run_failures=0） | p95 < 500ms | PASS |
| 100 次确定性重放 | 1 个哈希，`ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50` | 恰好 1 个 | PASS |
| 运行时网络请求 | 0（38 文件，0 URL 字面量） | 0 | PASS |
| Prompt/源码持久化泄露 | 0 canary 命中（11 文件） | 0 | PASS |

注：p95 本次 199.79ms，基线运行 215.38ms——均为同阈值下的正常
波动（阈值 500ms，余量充足）；canonical hash 与基线完全一致。

### 防作弊复核（改前改后 `fixture-results.json` 逐条对照）

- 改前基线：运行前将 `02_source/artifacts/s0/fixture-results.json`
  复制至 `/tmp/p025-fix-baseline/fixture-results.BEFORE.json`
  （当时工作区源码与 HEAD 一致，仅 artifacts 为 T012 复核运行产物）。
- 改后文件与基线 **字节完全相同**：sha256 均为
  `79daa09bbf4a624e5921f66e367fc0c73fe1384344e7beff01648d0561a25f74`。
- `summary.perFixture` 48 条逐条相同（`matchesGolden` 全 true；
  `errorDetected`/`controlClean`/`detection_basis`/`mismatchDetail`
  无一差异）；顶层 `per_fixture`（decisions / leases / snapshots /
  golden 全量）逐条相同；依据分布改前改后同为 28/1/2/1。
- 结论：本次改动未改变任何逐 fixture 判定；汇总计数变化为零是
  真实结果（parity 全过时 basis-only 与 matchesGolden-gated 计数
  本就相等），非“修到通过”。

---

## 4. 提交

- **工作 commit：** `26dc1de39e7c58d40342691015d7e68e0ac6d24c`
  `FIX-T013-PRE: F-04 basis-only summary counts; F-01 v1.1.0 section refs in source comments (S0 recheck PASS)`
  ——41 个文件：35 个源码/脚本/测试 + 6 个 S0 产物
  （`S0_GATE.json`、`S0_GATE.md`、`logs/s0-gate.log`、
  `network-scan.json`、`perf-hook.json`、`privacy-scan.json`；
  `fixture-results.json`、`oracle-results.json`、`repeat-hashes.json`
  内容未变，不在提交内）。
- **交接 commit：** 本文件（`00_control/HANDOFF_FIX_T013_PRE.md`）单独提交。

## 5. 待最终审查记录（不属于本次修复）

- 计划书 `00_control/v1.1.0/IMPLEMENTATION_PLAN.md` §6 任务卡 7 处
  引用滞后（REVIEW_PACK_04 表格）——规格勘误，需最终审查记录，
  本次未碰规格文件。
- Fixture/Golden/Oracle 的 `v1.0.0 §5` 来源标注——冻结证据来源，
  语义与 v1.1.0 §6 一致（§0.1 不变项），建议最终审查确认保留口径。
- `lease-machine.ts` 含 2 个既存 NUL 字节（git 视其为 binary），
  与本次改动无关，建议后续清理时另立任务处理。
