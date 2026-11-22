# T013 独立审查报告（S0 审查阶段）— P025 GuidancePulse

- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`（`T010 handoff (v1.1.0): S0=PASS, p95 214.19ms <500ms, 7/7 gates`）
- **规格版本：** v1.1.0（`00_control/v1.1.0/PROJECT_BOOK.md`、`00_control/v1.1.0/IMPLEMENTATION_PLAN.md`）
- **审查员：** T013 独立审查员（与 T010 实现者不同会话；结论独立得出，未代写实现方结论）
- **审查日期：** 2026-11-15
- **结论：PASS**（S0 审查通过；P0/P1 = 0，7 项 P2 已登记，非阻断）
- **范围说明：** 这是 **S0 审查**，不是最终审查。最终审查还需 T012 PASS 后再做（IMPLEMENTATION_PLAN §6 T013）。

## 1. 审查结论与复算结果

审查员亲自在 `02_source/` 下重新运行 `npm run s0:gate`（2026-11-15 15:24 GMT，退出码 0）：

| 门 | 规格阈值（v1.1.0） | HEAD 提交值 | 审查员复跑值 | 结论 |
|---|---|---|---|---|
| 生产/Golden/Oracle 三向一致 | 48/48 | 48/48 | 48/48 | PASS |
| 植入错误检出（四依据） | 32/32 | 32/32 | 32/32 | PASS |
| 控制无误报 | 16/16 | 16/16 | 16/16 | PASS |
| Hook 端到端 p95 | 严格 <500ms | **214.19ms**（n=100，p50=168.48，p99=262.74，min=144.41，max=382.18，cold_start=382.18） | **182.37ms**（n=100，p50=159.62，p99=205.61，min=146.04，max=259.97，cold_start=259.97，cold_start_sample_index=0，durations[0]==cold_start_ms，warmup=5，failures=[]） | PASS |
| 100 次确定性重放 | 恰好 1 个 canonical SHA-256 | `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50` | 同值 `ef06d30f…af50`（1/100） | PASS |
| 运行时网络请求 | 0 | 0（34 文件） | 0（34 文件） | PASS |
| Prompt/源码持久化泄露 | 0 canary 命中 | 0（11 文件） | 0（11 文件） | PASS |
| 支撑证据 | typecheck + 全量测试 | typecheck 0；golden 53/53；oracle 0；全量 359/359（15 文件） | 同值复现 | PASS |

三轮 S0 值（HEAD 提交 214.19ms；协调员复跑 205.09ms；审查员复跑 182.37ms）均为 PASS，且 canonical 哈希三轮完全相同，p95 余量充足（最高观测 214.19ms，距 500ms 阈值余量 57%）。

**工作区状态说明：** 审查开始前工作区已有未提交的 S0 产物改动（协调员 15:22 复跑，p95 205.09ms）；审查员复跑又将其更新为 15:24 复跑值（p95 182.37ms，`S0_GATE.json` sha256 `9aeb9e3bb20348766c1a80e91de759a13130aa472f88fed6c0a977527112f501`）。本次提交**仅含 `reviews/`**，S0 产物改动保持未提交状态，由协调员决定是否提交或丢弃；审查结论以 HEAD 提交产物（214.19ms）为准，复跑值作为独立验证证据记录于此。

## 2. T013 卡逐项检查结果（IMPLEMENTATION_PLAN §6 T013，10 项）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 通读 `src/core`、`src/hooks`、`src/store` 与隐私模块，确认实现与规格一致 | ✅ 通过。见 §3 与 REVIEW_PACK_01/02。唯一偏差是代码注释沿用 v1.0.0 章节号（P2，F-01），语义本身与 v1.1.0 一致 |
| 2 | 独立复核 48 Fixtures 与 Oracle 的独立性（Oracle 不得与生产共享逻辑；Golden 为手工期望） | ✅ 通过，附一项 P2 保留（F-02）：Oracle 为独立 Python 重实现、零共享代码；Golden 由 `author-fixtures.py` 手工编写并经独立复核（commit `95bf699` GOLDEN-REVIEW-T009 PASS）；但 Oracle 文档自述三处边缘语义取自生产源码 |
| 3 | 检查 detection_basis 四个条件、字段名、优先级与 28/1/2/1 计数是否与规格逐字一致 | ✅ 通过。`summarizeReplay`（`scripts/s0-replay.ts`）四条件与 PROJECT_BOOK §9.3 / IMPLEMENTATION_PLAN §8.1 逐字一致；实测计数 `non_allow_decision` 28（K01–K08、S01–S05、S08、U01–U08、W01–W04、W06、W08）、`expired_final_lease` 1（S07）、`expired_intermediate_lease` 2（W05、S06）、`same_cwd_no_expiry` 1（W07）；16 control 全为 null |
| 4 | 确认 W05/S06 的中间 EXPIRED 快照在后续重读恢复 FRESH 后仍可审计 | ✅ 通过。W05 快照 step 1 为 `EXPIRED / CWD_MISMATCH`（last_read 仍为 10:00:00Z），step 2 重读后 FRESH（last_read 10:02:00Z）；S06 快照 step 1 为 `EXPIRED / PHASE_MISMATCH`，step 2 重读后 FRESH；快照已进入 canonical hash |
| 5 | 确认 S07 终态 EXPIRED + PHASE_MISMATCH | ✅ 通过。终态租约 `EXPIRED`，`reason=PHASE_MISMATCH`，remaining=5（未扣减）；写步骤 per_rule 为空（规则在 explore 阶段失活，无门控写），符合规格 §9.3 定义 |
| 6 | 确认 W07 same-cwd 不失效、全部 snapshots FRESH、last_read 不变 | ✅ 通过。三步快照全部 FRESH，`last_read` 全程 `2026-11-15T10:00:00Z` 不变；cwd 步骤 old==new==`/proj` |
| 7 | 确认 matchesGolden 不参与独立检出计数（只看终态最多 29/32） | ✅ 通过（附 P2，F-04）。逐 fixture 的 `errorDetected` 只由 detection_basis 决定，与 matchesGolden 无关；篡改测试（忽略 compact 边界 → 31/32）存在且通过；只看终态时 W05/S06/W07 无终态信号，29/32 上限成立 |
| 8 | 独立复算 S0 哈希与 p95 口径：5 次预热排除、100 次计时含冷启动、每次全新 Node 子进程、阈值严格 p95 <500ms | ✅ 通过。复跑 `npm run s0:gate` 退出 0；`perf-hook.json`：warmup_runs=5，n=100，cold_start_sample_index=0，durations[0]==cold_start_ms，`spawn()` 每次全新 `node` 进程（`scripts/perf-hook.ts`），p95 取排序后 `ceil(0.95·n)-1` 位，严格 `<500`（`perf.verdict` 要求 `p95 < 500 && failures.length === 0`）。附 P2（F-03）：冷启动样本为 PostToolUse Read 而非 PreToolUse Write |
| 9 | 核对 onFailure:block、PreCompact、异步事件竞态、Bash 绕过边界 | ⚠️ 部分通过，P2（F-05）。内部 fail-closed 已实现并测试（PreToolUse 任意内部错误 → DENY + exit 2；PreCompact 持久化失败严格模式 → blocked + exit 2；CwdChanged 异步竞态由 PreToolUse 同步复核关闭；Bash/外部进程明确不拦截，符合规格边界）；但 `onFailure:block` 的端到端保证在本机**无法验证**：Claude Code 未安装（T001：`claude --version` 退出 127），且无任何代码生成含 `onFailure:block` 的 Hook 配置（T011 未开始），须待 T012 在装有 Claude Code ≥v2.1.295 的机器上验证 |
| 10 | 检查项目书/计划书内部章节引用和 `python3` 命令统一 | ⚠️ 发现 P2（F-01）。`python3` 命令统一：全部验收命令与脚本调用均为 `python3`，无裸 `python` 命令使用（两处裸 `python` 字样均为“不得混用未定义的 `python` 命令”的禁令表述本身）；但 IMPLEMENTATION_PLAN v1.1.0 仍有多处沿用 v1.0.0 的项目书章节号（§10/§10.3/§8.1/§9 等），与 v1.1.0 实际编号不符 |

## 3. 实现一致性摘要（通读记录）

- **状态机**（`src/core/lease-machine.ts`）：`UNSEEN → FRESH → EXPIRED` 三态、租约身份 `(session, agent, guidance)`、六项 FRESH 条件、编辑预算（成功扣减/失败不扣减/0 预算即时 EXPIRED）、`checkWrite` 懒失效（cwd → phase → budget 顺序）均与 PROJECT_BOOK v1.1.0 §6 一致；`leaseKey` 以 `\x00` 分隔三段，防拼接碰撞；纯函数、无 I/O、无时钟、无随机数。
- **写前门**（`src/hooks/pre-tool-use.ts` + `decision.ts`）：仅 Write/Edit 门控；warn→allow+additionalContext、ask→`permissionDecision:"ask"`、block→deny + exit 2；无匹配规则返回 `{}`（无意见）exit 0；任意内部错误 fail-closed DENY + exit 2；预算只在写成功后（PostToolUse 路径）扣减，门本身不扣减。
- **失效边界**（`pre-compact.ts` / `cwd-changed.ts` / `subagent-start.ts` / `instructions-loaded.ts` / `cli/phase.ts`）：PreCompact 原子失效（同一 `BEGIN IMMEDIATE` 事务）且持久化失败时严格模式阻止压缩（exit 2）；CwdChanged 仅异步观测，PreToolUse 同步复核关闭竞态；Subagent 新作用域以缺席表示 UNSEEN，父租约不动；`phase set` 同阶段也强制失效（sentinel 比较法，不写脏数据）。
- **存储**（`src/store/store.ts`）：WAL + `busy_timeout=5000` + `BEGIN IMMEDIATE` 事务（事件行与租约转移同提交）；`synchronous=NORMAL` 的取舍已在 HANDOFF_T007 记录；只持久化 §7.4 允许字段；`deleteSession` + `VACUUM` 语义正确。
- **隐私**（`src/privacy/sanitize.ts`）：allowlist 抽取（`tool_response` 只留 success 布尔，`transcript_path`/Prompt/content/env/未知字段丢弃）；路径只存 `hmac:<64 hex>`；BANNED_FIELD_NAMES 键名扫描 + `redactForLog`；三 canary 实测 0 命中。
- **Oracle 与 Golden**：Oracle 为独立 Python 标准库重实现（状态转移、Glob、HMAC 均自写，不导入 TS、不调用生产 CLI）；`--self-test` 与 `--verify-golden` 均 PASS；48 条 fixture 内联 expected 与 `expected-v1.json` 逐项一致（审查员复核 0 差异）；Golden 手工编写并经独立复核 PASS（commit `95bf699`）。
- **Gate 与计时**：`scripts/s0-gate.ts` 七门判定与阈值无后门（失败即 exit 1、报告照写）；`perf-hook.ts` 先以 PostToolUse Read 做冷启动种子（首个 spawn，在 5 次预热之前），再 5 次预热（不计入），再 99 次计时 Write，每次全新 `node` 子进程；`repeat-s0.ts` 哈希覆盖 fixture id/决策/终态租约/逐步快照，排除墙钟与机器路径。

## 4. 发现的问题清单（P0/P1 = 0，P2 = 7）

| ID | 严重度 | 问题 | 证据 | Pack |
|---|---|---|---|---|
| F-01 | P2 | IMPLEMENTATION_PLAN v1.1.0 多处项目书章节引用仍为 v1.0.0 编号；源码注释普遍标注 `v1.0.0 §…` | 计划书行 323/336/366/500/526/555/567；≥10 个源码文件头注释 | REVIEW_PACK_04.md |
| F-02 | P2 | Oracle 文档自述三处边缘语义取自生产源码，独立性有保留 | `tests/oracle/reference_oracle.py` 头注释 | REVIEW_PACK_05.md |
| F-03 | P2 | 冷启动样本为 PostToolUse Read 而非 PreToolUse Write，100 样本不同构 | `scripts/perf-hook.ts` 种子步骤；`perf-hook.json` durations[0] | REVIEW_PACK_06.md |
| F-04 | P2 | 汇总检出计数 `errorDetected` 要求 matchesGolden AND basis，与 §8.1“不从 matchesGolden 推导”有出入 | `scripts/s0-replay.ts` `summarizeReplay` 汇总行 | REVIEW_PACK_07.md |
| F-05 | P2 | `onFailure:block` 端到端保证在 S0 阶段无法验证（Claude Code 未安装；无代码生成该配置） | T001 环境记录 §4；全仓库 grep `onFailure` | REVIEW_PACK_08.md |
| F-06 | P2 | Oracle 对无 cwd 租约会抛 ValueError 而非 fail-closed（fixture 外） | `reference_oracle.py` `check_write` / `apply_cwd` | REVIEW_PACK_09.md |
| F-07 | P2 | 证据扫描范围缺口：隐私扫描不含事后写入的 S0_GATE.json/.md；网络扫描不含实际运行入口 `scripts/hook-entry.ts` | `scripts/s0-gate.ts` 扫描顺序与 `scanNetwork` 范围 | REVIEW_PACK_10.md |

无 P0/P1 问题。7 项 P2 均为文档、口径严谨性或 deferred 验证项，无一改变 S0 七门结论；建议在 T013 最终审查前闭环 F-01/F-04（纯文档/计数口径），F-05 随 T012 验证，F-02/F-03/F-06/F-07 在最终审查时复核。

## 5. 不在本次审查范围内的事项（明确记录）

- T011/T012/T014 仍 BLOCKED（待本 S0 审查 PASS 后按计划解除 T011）；UI（`src/ui/**`）与 CLI 安装器未纳入本次通读范围（T013 S0 审查卡只要求 core/hooks/store/隐私模块）。
- 真实 Claude Code 上的端到端验证（T012）未做——本机无 Claude Code。
- 审查员未修改任何生产源码、Golden、Oracle 或 `00_control/` 文件；只新增 `reviews/` 文件。

## 6. 审查包索引

见 `reviews/REVIEW_INDEX.md`。分批包：PACK_01（core + contracts）、PACK_02（hooks + store + 隐私 + phase CLI）、PACK_03（Oracle + fixtures + Golden + gate/perf/repeat 脚本 + S0 证据）；PACK_04–PACK_10 每项问题一份。
