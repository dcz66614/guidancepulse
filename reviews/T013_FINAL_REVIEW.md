# T013 最终审查报告 — P025 GuidancePulse

- **审查对象 commit：** `143f4e5`（FIX-T013-PRE handoff）
- **规格版本：** v1.1.0（`00_control/v1.1.0/PROJECT_BOOK.md`、
  `00_control/v1.1.0/IMPLEMENTATION_PLAN.md`）
- **审查员：** T013 最终审查员（与 T001–T012、FIX-T011、FIX-T013-PRE
  实现者均为不同会话；结论独立得出，未代写实现方结论，未修改任何
  生产源码、测试、Golden、Fixture 或 `00_control/` 文件）
- **审查日期：** 2026-11-15
- **结论：FAIL**（P0 = 0，**P1 = 1**，P2 = 14）
- **FAIL 的直接原因：** F-17（P1）——已安装的 Hook 入口在源码树外的
  任意真实项目中无法解析 `yaml` / `better-sqlite3`，全部 Hook 调用失败；
  T012 的全链路 PASS 证据只在树内临时项目中成立。S0 七门本身全部 PASS，
  代码与规格的一致性除 F-17 外无 P0/P1 问题；但 T011/T012 交付的
  “安装进真实项目即可用”不成立，T014 不得冻结。

## 1. 结论与复算结果

审查员亲自在 `02_source/` 下按顺序运行全部验收命令
（2026-11-15 ~16:14–16:18 GMT，Node v24.22.1、npm 10.9.4、Python 3.12.3）：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm test` | 0 | **381/381 通过**（20 文件） |
| `npm run test:e2e` | 0 | 2/2 通过 |
| `npm run test:offline` | 0 | 2/2 通过 |
| `npm run test:privacy` | 0 | 16/16 通过 |
| `npm run test:installer` | 0 | 16/16 通过 |
| `npm run typecheck` | 0 | 0 错误 |
| `npm run build` | 0 | vite 构建成功 |
| `npm run s0:gate` | 0 | **S0 overall verdict: PASS**（见下） |

### S0 七门（审查员复跑值 vs 阈值）

| 门 | 规格阈值（v1.1.0） | HEAD 提交值 | 审查员复跑值 | 结论 |
|---|---|---|---|---|
| 生产/Golden/Oracle 三向一致 | 48/48 | 48/48 | 48/48 | PASS |
| 植入错误检出（四依据） | 32/32 | 32/32 | 32/32（28/1/2/1） | PASS |
| 控制无误报 | 16/16 | 16/16 | 16/16 | PASS |
| Hook 端到端 p95 | 严格 <500ms | 199.79ms | **422.92ms**（n=100，p50=177.50，p99=621.61，min=147.09，max=780.23，cold_start=780.23，cold_start_sample_index=0，run_failures=0） | PASS（余量 15%，见 F-25） |
| 100 次确定性重放 | 恰好 1 个 canonical SHA-256 | `ef06d30f…af50` | 同值 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（1/100） | PASS |
| 运行时网络请求 | 0 | 0（38 文件） | 0（38 文件） | PASS |
| Prompt/源码持久化泄露 | 0 canary 命中 | 0（11 文件） | 0（11 文件） | PASS |
| 支撑证据 | typecheck + 全量测试 | typecheck 0；golden 53/53；全量 381/381 | 同值复现（golden 53/53，oracle PASS 48/48） | PASS |

工作区状态说明：审查员复跑改写了磁盘上的 S0 产物
（`S0_GATE.json` 现为复跑值，sha256
`3356442ea24658ae4ebf6b1b4dec05e80026deeca131b6644fba0b0604c1f72e`；
`fixture-results.json` 内容未变，sha256 仍为
`79daa09bbf4a624e5921f66e367fc0c73fe1384344e7beff01648d0561a25f74`）。
本次提交**仅含 `reviews/`**，S0 产物改动保持未提交，由协调员决定
提交或丢弃；审查结论以 HEAD 提交产物为准，复跑值作为独立验证证据。

## 2. T013 卡逐项检查结果（IMPLEMENTATION_PLAN §6 T013，10 项 + 最终审查扩展）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 通读 `src/core`、`src/hooks`、`src/store`、隐私模块，确认实现与规格一致 | ✅ 通过。状态机（§6.1–§6.5）、写前门（§6.4）、失效边界（§6.5）、存储（WAL + `BEGIN IMMEDIATE`）、隐私 allowlist（§7.4）均与 v1.1.0 一致；`leaseKey` 以 NUL 分隔三段防碰撞；纯函数无 I/O |
| 2 | 独立复核 48 Fixtures 与 Oracle 独立性 | ✅ 通过，附 P2 保留（F-12 = 原 F-02）：Oracle 独立重实现、零共享代码；Golden 手工编写并经独立复核；但 Oracle 文档自述三处边缘语义取自生产源码 |
| 3 | 检查 detection_basis 四条件、字段名、优先级与 28/1/2/1 计数 | ✅ 通过。`summarizeReplay` 四条件与 PROJECT_BOOK §9.3 / IMPLEMENTATION_PLAN §8.1 逐字一致；复跑计数 `non_allow_decision` 28、`expired_final_lease` 1（S07）、`expired_intermediate_lease` 2（W05、S06）、`same_cwd_no_expiry` 1（W07）；16 control 全 null |
| 4 | 确认 W05/S06 中间 EXPIRED 快照在后续重读恢复 FRESH 后仍可审计 | ✅ 通过。W05 快照 step 1 `EXPIRED / CWD_MISMATCH`（last_read 仍 10:00:00Z），step 2 重读后 FRESH（10:02:00Z）；S06 同理 `PHASE_MISMATCH`；快照已进入 canonical hash |
| 5 | 确认 S07 终态 EXPIRED + PHASE_MISMATCH | ✅ 通过。终态租约 `EXPIRED`，`reason=PHASE_MISMATCH`，remaining=5（未扣减）；无被门控的写（规则在 explore 阶段失活），符合 §9.3 定义 |
| 6 | 确认 W07 same-cwd 不失效、全部 snapshots FRESH、last_read 不变 | ✅ 通过。三步快照全部 FRESH，`last_read` 全程 `2026-11-15T10:00:00Z`；cwd 步骤 old==new==`/proj` |
| 7 | 确认 matchesGolden 不参与独立检出计数 | ✅ 通过，F-04 已闭环（见 §3）。反事实实验：matchesGolden=false 时汇总计数仍为 basis-only |
| 8 | 复算 S0 hash 与 p95 口径：5 次预热排除、100 次计时含冷启动、每次 spawn 新 Node 子进程 | ✅ 通过。`perf-hook.json`：warmup_runs=5，n=100，cold_start_sample_index=0，durations[0]==cold_start_ms，`spawn()` 每次全新 `node` 进程，p95 取排序后 `ceil(0.95·n)-1` 位，严格 `<500`。附 P2（F-13 = 原 F-03）：冷启动样本为 Read 而非 Write |
| 9 | 核对 onFailure:block、PreCompact、异步事件竞态、Bash 绕过边界 | ⚠️ 部分通过。内部 fail-closed 已实现并测试（PreToolUse 任意内部错误 → DENY + exit 2；PreCompact 持久化失败严格模式 → blocked + exit 2；CwdChanged 竞态由 PreToolUse 同步复核关闭；Bash/外部进程明确不拦截，符合规格边界）；安装器现已生成 `onFailure:block` 配置并有测试；但 live 端到端仍无法验证（F-14 = 原 F-05，blocked_external 三项诚实） |
| 10 | 检查项目书/计划书内部章节引用和 `python3` 命令统一 | ⚠️ 发现残留（F-11 = 原 F-01 部分）：源码/脚本/单元测试注释已闭环；计划书 §6 任务卡 7 处旧引用与 Fixture/Golden/Oracle 的 `v1.0.0 §5` 标注仍在；`python3` 统一：全部验收命令与脚本调用均为 `python3`，无裸 `python` 命令使用 |
| 11 | 复核 T011/FIX-T011：启动器不再改写 cwd、`--project .` 落点正确 | ✅ 通过（除 F-17 外）。`bin/guidancepulse` 无 `cd`，以绝对路径调 vite-node；审查员在树外临时项目实测 init/install/status 均落在调用者目录，`02_source/.claude` 未被触碰 |
| 12 | 复核 T012：`phase set` 分发修复是否真实有效 | ✅ 通过。`src/cli/main.ts:174` 已补 `"phase"` 词（`parsePhaseArgs(["guidancepulse", "phase", ...rest])`）；审查员实测 `phase set implementation` 成功。附 P2（F-18）：未声明阶段也被接受 |
| 13 | 复核 T012 blocked_external 三项标记是否诚实 | ✅ 通过。本机 `claude --version` 退出 127；三项（真实触发、onFailure:block 端到端、真实会话 Read 观测）均明确标注未验证，未假装通过 |
| 14 | 检查备份语义（仅合并改文件时写备份） | ✅ 通过，附 P2（F-19）：正常路径正确（仅 changed 且无既存备份时写备份、原子写、失败删文件）；但失败回滚从“最早备份”恢复而非本次运行前状态 |
| 15 | 检查发布就绪状态（T014 前置） | ❌ 不通过。缺 LICENSE 与 THIRD_PARTY_NOTICES.md（F-22）；v1.1.0 规格目录未入库、工作树不干净（F-23）；另有 F-17（P1）阻断 |

### 补充通读记录（最终审查新增范围）

- **CLI/安装器**（`src/cli/init|install|uninstall|main|phase`）：6 条 Hook
  与计划书 §7.1 逐字一致；合并只加自有条目、卸载只移除自有条目、
  幂等、原子写均已实现并有 16/16 测试；`phase set` 同阶段强制失效
  经 sentinel 比较法实现且 sentinel 永不落盘
  （`checkWriteAndPersist` 只持久化租约，不写 WRITE_CHECKED 事件）。
- **Hook 入口**（`scripts/hook-entry.ts`）：除 F-20（畸形输入 exit 1）
  外符合契约；环境变量 GP_CONFIG/GP_DB/GP_PATH_KEY/GP_PHASE/GP_NOW
  均本地化；错误只输出 code，不含原始输入。
- **报告/UI**（`src/report/report.ts`、`src/ui/timeline.ts`、`App.tsx`）：
  四区、文字+图标、HMAC 短码、HTML 转义均符合 §8.1–§8.3；
  演示截图 3 张在 `artifacts/screenshots/`；`test:ui-offline` 实测通过。
- **Oracle/Golden/反向测试**：篡改测试（忽略 compact 边界 → 31/32）
  存在；`npm run test:golden` 53/53；Oracle `--self-test` /
  `--verify-golden` 均 PASS。

## 3. S0 审查 7 项 P2 的复核结论

| ID | 原问题 | 复核结果 | 状态 |
|---|---|---|---|
| F-01 | 源码注释与计划书章节引用滞后 | 源码/脚本/单元测试注释**已闭环**（grep `v1.0.0 §` 清零）；计划书 §6 任务卡 7 处旧引用与 Fixture/Golden/Oracle 的 `v1.0.0 §5` 标注仍在 | 部分闭环 → F-11（P2） |
| F-02 | Oracle 文档独立性保留 | 未变：头注释仍自述三处边缘语义取自生产源码 | OPEN → F-12（P2） |
| F-03 | 冷启动样本为 Read 而非 Write | 未变：`perf-hook.ts` 种子仍为 PostToolUse Read，`durations[0]==cold_start_ms` | OPEN → F-13（P2） |
| F-04 | 汇总计数 matchesGolden AND | **已闭环（真实）**：`s0-replay.ts:498–499` 改为 basis-only；审查员独立反事实实验（vite-node 直调 `summarizeReplay`，matchesGolden=false 的 error fixture 仍计入 `errorDetected=1/1`，control 仍 `controlClean=1/1`）；改前改后 `fixture-results.json` sha 同为 `79daa09b…`，数值无变 | CLOSED |
| F-05 | onFailure:block 端到端待 live 验证 | 收窄：安装器现生成该配置且有测试；live 三项仍 blocked_external，标记诚实 | OPEN → F-14（P2） |
| F-06 | Oracle 无 cwd 租约抛错 | 未变：`apply_cwd` 对 `new_cwd=None` 无守卫，`compute_path_id` 抛 ValueError；生产侧已忽略 | OPEN → F-15（P2） |
| F-07 | 扫描范围缺口 | 部分缓解：T012 offline 测试已把 `hook-entry.ts` 纳入网络扫描；S0 门本身仍只扫 `src/`，隐私扫描仍不含 S0_GATE.json/.md 与自身 | OPEN → F-16（P2） |

## 4. 问题清单

### P0（0 项）

无。F-17 是 fail-closed 的功能失效，无 stale write 被误放行，故不列 P0。

### P1（1 项）

| ID | 问题 | Pack |
|---|---|---|
| F-17 | 已安装 Hook 入口在源码树外无法解析 `yaml` / `better-sqlite3`，任意真实项目中全部 Hook 失败（exit 2，`HOOK_ENTRY_FAILED`）；T012 全链路证据只在树内临时项目成立 | REVIEW_PACK_F-17.md |

### P2（14 项）

| ID | 问题 | Pack |
|---|---|---|
| F-11 | F-01 残留：计划书任务卡 7 处旧章节引用 + Fixture/Golden/Oracle 的 `v1.0.0 §5` 标注 | REVIEW_PACK_F-11.md |
| F-12 | F-02 仍成立：Oracle 文档自述三处边缘语义取自生产源码 | REVIEW_PACK_F-12.md |
| F-13 | F-03 仍成立：冷启动样本为 Read 而非 Write | REVIEW_PACK_F-13.md |
| F-14 | F-05 收窄但仍 OPEN：onFailure:block 代码已生成，live 端到端仍未验证 | REVIEW_PACK_F-14.md |
| F-15 | F-06 仍成立：Oracle 对无 cwd 租约抛 ValueError | REVIEW_PACK_F-15.md |
| F-16 | F-07 仍成立（部分缓解）：S0 门扫描范围缺口 | REVIEW_PACK_F-16.md |
| F-18 | `phase set <未声明阶段>` 被接受；拼错阶段静默解除全部规则门控 | REVIEW_PACK_F-18.md |
| F-19 | 安装/卸载失败回滚从“最早备份”恢复，而非本次运行前状态 | REVIEW_PACK_F-19.md |
| F-20 | hook-entry 对净化/适配抛错无兜底：畸形输入 exit 1、无 stdout JSON | REVIEW_PACK_F-20.md |
| F-21 | `init` 的 `reportsCreated` 恒为 false（cosmetic） | REVIEW_PACK_F-21.md |
| F-22 | LICENSE 与 THIRD_PARTY_NOTICES.md 缺失（T014 前置） | REVIEW_PACK_F-22.md |
| F-23 | v1.1.0 规格目录未入库；工作树不干净（T014 前置） | REVIEW_PACK_F-23.md |
| F-24 | README 引用 §6.4 为 allowlist（应为 §7.4）；install.ts 头注释指向不存在的“module footer” | REVIEW_PACK_F-24.md |
| F-25 | p95 轮间波动大；本次冷启动 780ms 超出规格 §9.6 的 462ms 立论最大值（观察） | REVIEW_PACK_F-25.md |

## 5. 对 T014 的意见

- **T014 不得冻结。** 须先立 FIX 任务修复 F-17（打包或随装依赖），
  并补一条树外临时项目的全链路回归测试；修复后重跑全部验收命令
  （`npm test`、`test:e2e`、`test:offline`、`test:privacy`、
  `test:installer`、`typecheck`、`build`、`s0:gate`），再由新的独立
  会话复审（T013 重审）。
- F-18/F-19/F-20/F-21 建议与 F-17 同批修复（均小）；F-22/F-23 须在
  冻结前补齐/入库；F-11/F-12/F-13/F-15/F-16/F-24/F-25 可登记为
  已知项随 T014 冻结报告注明，不阻断冻结本身；
  F-14 的 live 三项待有 Claude Code 的机器后验证。
- 审查员未修改任何生产源码、测试、Golden、Fixture 与 `00_control/`；
  只新增 `reviews/` 文件。
