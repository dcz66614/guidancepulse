# T013 最终审查报告（第二轮）— P025 GuidancePulse

- **审查对象 commit：** `eaeca88`（FIX-T013 交接）
- **规格版本：** v1.1.0（`00_control/v1.1.0/PROJECT_BOOK.md`、
  `00_control/v1.1.0/IMPLEMENTATION_PLAN.md`）
- **审查员：** T013 最终重审员（与 T001–T012、FIX-T011、FIX-T013-PRE、
  FIX-T013 实现者及第一轮最终审查员均为不同会话；结论独立得出，
  未代写实现方结论，未修改任何生产源码、测试、Golden、Fixture 或
  `00_control/` 文件）
- **审查日期：** 2026-11-15
- **结论：PASS**（P0 = 0，**P1 = 0**，P2 = 10）
- **PASS 的依据：** F-17（P1）已由审查员在树外全新项目中独立复现验证
  为真正修复；FIX-T013 宣称修复的 8 项 P2 经逐项复核全部真实闭环
  （F-19 卸载侧回滚缺直接测试，另立 P2 F-28）；S0 七门两次复跑均
  PASS；全量测试 390/390。本轮新发现 4 项 P2（F-26/F-27/F-28/F-29）
  均为证据自洽性、卸载边角与门禁稳健性问题，无一触及门控语义，
  不阻断 T014；另有 5 项旧 P2（F-11/F-12/F-13/F-14/F-25）与
  F-23（T014 前置）继续作为已知项登记。

## 1. 结论与复算结果

审查员亲自在 `02_source/` 下按顺序运行全部验收命令
（2026-11-15 ~16:41–16:52 GMT，Node v24.22.1、npm 10.9.4、Python 3.12.3）。
注意：第一批重跑中审查员曾用 `cmd | tail` 取退出码——该写法测到的是
`tail` 的退出码，无效；下表为第二批以真实退出码重跑的结果
（脚本 `/tmp/r2-acceptance2.sh`，逐条 `> log 2>&1; echo $?`），
`npm test` 另有一次直接重跑（真实 exit 0）。

| 命令 | 真实退出码 | 结果 |
|---|---|---|
| `npm test` | 0 | **390/390 通过**（21 文件；另见 §1.1 的一次抖动） |
| `npm run test:e2e` | 0 | 2/2 通过 |
| `npm run test:offline` | 0 | 2/2 通过 |
| `npm run test:privacy` | 0 | 16/16 通过 |
| `npm run test:installer` | 0 | 16/16 通过 |
| `npm run test:oracle` | 0 | self-test PASS；`--verify-golden` 48/48 PASS |
| `npm run test:golden` | 0 | 53/53 通过 |
| `npm run typecheck` | 0 | 0 错误 |
| `npm run build` | 0 | vite 构建成功 |
| `npm run s0:gate`（第二轮） | 0 | **S0 overall verdict: PASS**（见下） |

### S0 七门（审查员复跑值 vs 阈值）

| 门 | 规格阈值（v1.1.0） | 审查员复跑值（第二轮，PASS） | 结论 |
|---|---|---|---|
| 生产/Golden/Oracle 三向一致 | 48/48 | 48/48 | PASS |
| 植入错误检出（四依据） | 32/32 | 32/32（28/1/2/1；`fixture-results.json` sha 仍为 `79daa09b…`，数值无变） | PASS |
| 控制无误报 | 16/16 | 16/16 | PASS |
| Hook 端到端 p95 | 严格 <500ms | **218.74ms**（n=100，p50=163.24，p99=332.10，min=146.32，max=408.44，cold_start=332.10，cold_start_sample_index=0，run_failures=0） | PASS（余量 56%） |
| 100 次确定性重放 | 恰好 1 个 canonical SHA-256 | 同值 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（1/100） | PASS |
| 运行时网络请求 | 0 | 0（40 文件，含 `scripts/hook-entry.ts`） | PASS |
| Prompt/源码持久化泄露 | 0 canary 命中 | 0（首轮 11 文件 + 第二轮 2 文件） | PASS |
| 支撑证据 | typecheck + 全量测试 | typecheck 0；golden 53/53；oracle PASS 48/48；全量 390/390 | PASS |

p95 口径已逐项核对：`perf-hook.json` 载明 warmup_runs=5、runs=100、
`durations_ms` 长度 100、`durations[0]==cold_start_ms`、
每次 spawn 全新 Node 子进程（`spawnHook`）、p95 取排序后
`ceil(0.95·n)-1` 位、阈值严格 `<500`；计时入口现为随装后形态
（`build.dependencies_vendored=["yaml","better-sqlite3"]`），与真实
安装一致。

### §1.1 第一轮 `s0:gate` 复跑曾判 FAIL（抖动，已定位，非产品问题）

审查员第一轮 `npm run s0:gate`（16:44–16:46 GMT）七门硬门全部 PASS
（p95=233.76ms，hash 同值，网络 0/40，隐私 0/11 + 第二轮 0/2），
但总 verdict 为 FAIL，原因是支撑证据中内部 `npm test` exit=1——而其
输出为 21 文件全过、390/390、失败 0 个，唯一错误是 1 个 vitest
unhandled error：`[vitest-worker]: Timeout calling "onTaskUpdate"`
（worker RPC 回调在 1.5 共享核负载下超时）。审查员随即直接重跑
`npm test`：真实 exit 0，390/390；第二轮 `s0:gate` 亦为 PASS。
同一 commit 一次 exit 1、一次 exit 0，属运行器层环境抖动，与产品
代码无关。详见新 P2 F-29（`REVIEW_PACK_R2-29.md`）。

工作区状态说明：审查员复跑改写了磁盘上的 S0 产物（`S0_GATE.json`
现为第二轮复跑值，sha256
`695955149d01dc27bf70f03081ba7598b2ea4032579d797ed32be82276af26c7`）。
本次提交**仅含 `reviews/`**，S0 产物改动保持未提交，由协调员决定
提交或丢弃；审查结论以 HEAD 提交产物为准，复跑值作为独立验证证据。

## 2. F-17（原 P1）独立复现：CLOSED

详见 `REVIEW_PACK_R2-F17.md`。审查员自写复现脚本
（`/tmp/r2-t013-repro.sh`），在 `/tmp/r2-t013/proj`（上层目录无任何
`node_modules`，全程 `env -u NODE_PATH`，不调用实现方测试 helper）
中用 `bin/guidancepulse` CLI 与 `node .guidancepulse/hooks/*.js`
启动器实测：init → install → status 全部 exit 0；随装
`.build/node_modules/{yaml,better-sqlite3}` 就位，8 个 `.node`
预编译齐全（合计 18 MB）；合成 PostToolUse Read、PreToolUse Write、
PreCompact 三路调用均返回真实决策（`persisted:true` /
`permissionDecision:"allow"` / `invalidatedGuidanceIds:
["auth-change-safety"]`），无 `HOOK_ENTRY_FAILED`、无
`Cannot find package 'yaml'`；卸载后 `.build/` 已移除，启动器调用
返回 `HOOK_ENTRY_MISSING` exit 2（fail-closed）。

代码层亦已复核：`vendor-deps.ts` 的复制子集完备——`lib/` 内无任何
`require('node-addon-api')`（该包仅为头文件构建依赖）；缺失包时
抛错转 `HOOK_BUILD_FAILED`；安装全程本地 `cpSync`，无 `npm install`、
无网络调用；计时入口同步随装，p95 口径与真实安装形态一致。

## 3. 第一轮 14 项 P2 的逐项复核

| ID | 原问题 | 复核结果 | 状态 |
|---|---|---|---|
| F-17 | 树外 Hook 无法解析 yaml/better-sqlite3（P1） | 见 §2，独立复现 CLOSED | **CLOSED** |
| F-18 | `phase set <未声明阶段>` 被接受 | **真实闭环**：CLI 实测 `phase set bogus` exit 1，错误列出已声明阶段（explore, implementation, review, release）；`phase set implementation` exit 0；`setPhase` 内 `validatePhaseId(allowedPhases)` 为第二层校验。残留：无配置时仍只作 slug 校验 + stderr 告警（实现方设计如此，有告警为证，可接受） | **CLOSED** |
| F-19 | 失败回滚从“最早备份”恢复 | **真实闭环（install 侧）**：`install.ts`/`uninstall.ts` 均改为写回本次运行开始时读到的精确字节（`settingsRaw: Buffer`），读失败时不碰文件；install 侧回归测试覆盖精确场景（预置备份→用户改设置→注入 tsc 失败→恢复改后内容、备份仍为最初内容）。残留：uninstall 侧无直接回归测试 → 新 P2 F-28 | **CLOSED**（残留见 F-28） |
| F-20 | hook-entry 畸形输入 exit 1、无 stdout JSON | **真实闭环**：审查员实测 `{}` 输入 exit 2、stdout 0 字节、stderr 恰一行 `{"hook_entry_error":"HOOK_ENTRY_INVALID_INPUT"}`；测试覆盖 4 种畸形输入；`run()` 外 `try/catch` 在 `fail()` 前关闭 store | **CLOSED** |
| F-21 | `init` 的 `reportsCreated` 恒为 false | **真实闭环**：`existsSync` 检查已移到 `mkdirSync` 之前；审查员复现中 `init` 输出含 `reports/`；测试断言首次 true、二次 false | **CLOSED** |
| F-22 | LICENSE 与 THIRD_PARTY_NOTICES.md 缺失 | **真实闭环**：`LICENSE` 为 MIT（Copyright (c) 2026 dcz66614）；`THIRD_PARTY_NOTICES.md` 18 条逐一核对已安装的 `node_modules/*/package.json`（版本与许可证全部一致：直接依赖 better-sqlite3 MIT / react MIT / react-dom MIT / yaml ISC；开发依赖 12 MIT + playwright-core 与 typescript Apache-2.0；含 SQLite public domain 说明）；随装副本保留各自 `package.json` 与 `LICENSE` | **CLOSED** |
| F-24 | README §6.4 误引；install.ts 悬空引用 | **真实闭环**：README 现为 §7.4；install.ts 头注释改为指向 `00_control/HANDOFF_T001.md` 与 `docs/environment/T001_ENVIRONMENT.md`；README 随装自包含说明与 USER_GUIDE §6 回滚表述同步更新 | **CLOSED** |
| F-15（旧 F-06） | Oracle 对无 cwd 租约抛 ValueError | **真实闭环**：`apply_cwd` 对 `new_cwd is None` 直接返回（与生产 `adaptCwdChanged` 的 `ignored` 对称）；回放处改用 `step.get("new")`；`--self-test` 新增断言；审查员 `test:oracle` 实测 PASS | **CLOSED** |
| F-16（旧 F-07） | S0 门扫描范围缺口 | **真实闭环**：网络扫描扩到 `src/` + `scripts/hook-entry.ts`（本次 40 文件，0 命中）；隐私追加第二轮（S0_GATE.json/.md，0 命中）。残留：第二轮实现自身的自哈希记录问题 → 新 P2 F-26 | **CLOSED**（残留见 F-26） |
| F-11 | F-01 残留：计划书 7 处旧引用 + Fixture/Golden/Oracle 的 `v1.0.0 §5` 标注 | 未变：计划书 v1.1.0 §6 任务卡 7 处引用仍为旧编号（L323/336/366/500/526/555/567 逐行核对仍在）；Fixture/Golden/Oracle 的 `v1.0.0 §5` 标注仍在（48 个 fixture JSON + author-fixtures.py 3 处 + expected-v1.json 1 处 + Oracle 头注释 1 处，其中 Oracle 一处因跨行才被上一轮的单行 grep 漏计，实为 L3–4 “PROJECT_BOOK.md v1.0.0 / §5”）。规格文件不得改；冻结报告注明即可 | OPEN（P2，不阻断） |
| F-12 | Oracle 文档自述三处边缘语义取自生产源码 | 未变：`reference_oracle.py` 头注释（L10–14）仍自述三处边缘语义（未知 cwd/phase fail-closed、budget-0 租约、懒失效）参照生产源码定稿；三向 48/48 中生产↔Golden、Oracle↔Golden 两路仍独立 | OPEN（P2，不阻断） |
| F-13 | 冷启动样本为 Read 而非 Write | 未变：`perf-hook.ts` `seedInput()` 仍为 PostToolUse Read；§9.6 未要求冷启动样本全为 Write，已裁决合规 | OPEN（P2，不阻断） |
| F-14 | onFailure:block live 端到端未验证 | 未变：本机 `claude` 命令不存在（`which claude` 无输出）；三项 live 验证仍为 `blocked_external`，标记诚实；安装器生成配置已有测试 | OPEN（P2，blocked_external，不阻断） |
| F-25 | p95 轮间波动大；冷启动曾超 §9.6 立论最大值 | 观察仍成立但已收窄：p95 各轮 422.92（R1）→ 239.66（FIX）→ 205.98（磁盘 16:39 运行）→ 233.76 / 218.74（本轮两跑）；冷启动本轮 276.89 / 332.10ms，均 <500ms；无一轮超阈 | OPEN（P2，观察，不阻断） |
| F-23 | v1.1.0 规格目录未入库；工作树不干净 | 未变：`00_control/v1.1.0/`、`P025_SPEC_REVISION_v1.1.0_CONVERSATION.pdf`、`P025_SPEC_V110_VERIFICATION.md` 仍为 untracked；S0 产物因复跑改动仍未提交 | OPEN（P2，T014 前置） |

## 4. 本轮新问题（P2，4 项）

| ID | 问题 | Pack |
|---|---|---|
| F-26 | S0 隐私第二轮改写后，`S0_GATE.json` 内记录的自哈希过期（第一版哈希 c8f65258… vs 最终字节 89456fa9…），且 `notes` 称“自身不在 artifacts_sha256 中”已不为真；最终版字节本身未被第二轮扫描 | REVIEW_PACK_R2-26.md |
| F-27 | `uninstall` 在“设置文件不存在”与“设置中无自有 Hook”两条提前返回路径下遗留 `.build/`（实测 19 MB 残留，exit 0 报告 nothing removed），与“卸载移除 `.build/`”的契约不符 | REVIEW_PACK_R2-27.md |
| F-28 | F-19 卸载侧失败回滚无直接回归测试（FIX-T013 交接已披露；行为经代码复核对称） | REVIEW_PACK_R2-28.md |
| F-29 | S0 支撑证据门对 vitest worker 抖动过脆：390/390 通过仅因 `[vitest-worker]: Timeout calling "onTaskUpdate"` 即判整门 FAIL（本轮第一跑命中，第二跑 PASS） | REVIEW_PACK_R2-29.md |

另两处观察（不单独立项，建议与 F-26/F-27 同批顺手修）：
- 约 18 MB/项目的随装物中约 17 MB 是 8 平台 `.node` 预编译，当前
  平台实际只需 1 个；全量复制是 FIX-T013 为“跨平台同步后无需重装”
  作的稳妥选择，合理但未写进规格，未来若对体积敏感可只随装当前平台。
- `README.md` 称 `test:installer` 为 “T011 installer suite (14 tests)”；
  实际为 16 个测试（`installer.test.ts` 16 个 `it`，实测 16/16）——
  一行文档滞后。

## 5. T013 卡与发布就绪状态（T014 前置）

- **T013 卡（IMPLEMENTATION_PLAN §6，10 项）：** 验收标准为
  P0/P1=0 且所有问题有证据与复核状态——满足。第 1–8 项结论沿用
  第一轮（FIX-T013 未动 `src/core`、`src/hooks`、`src/store`、
  隐私模块与 Fixture/Golden）；第 9 项 onFailure:block 内部
  fail-closed 已实现，live 端到端仍 blocked_external（F-14）；
  第 10 项 `python3` 统一（全部验收命令与脚本调用均为 `python3`），
  章节引用残留见 F-11。
- **发布就绪：** LICENSE（MIT）与 THIRD_PARTY_NOTICES.md 已就位
  （F-22 闭环）；README/USER_GUIDE 与实现一致（除 §4 末两处观察）；
  工作树仍不干净（F-23）：v1.1.0 规格目录与两份规格验证文档仍
  untracked，S0 产物因复跑改动未提交——T014 冻结前由协调员决定
  入库与提交；冻结 commit 须与 manifest 一致，S0 Gate 须与最终
  冻结版本对应（本轮复跑 S0 对应 commit `eaeca88`）。
- **对 T014 的意见：PASS，可冻结。** 建议冻结报告注明：F-11/F-12/
  F-13/F-14/F-25 为已知项；F-23 在冻结时处理；F-26/F-27/F-28/F-29
  为 P2，可随冻结报告登记，不必另开修复轮次（其中 F-27 的文档
  契约表述应在冻结前收窄或补清理路径，二者择一）。

## 6. 问题总表（本轮）

| ID | 严重度 | 问题 | 状态 |
|---|---|---|---|
| F-17 | P1 | 树外 Hook 无法解析 yaml/better-sqlite3 | **CLOSED**（§2 独立复现） |
| F-18 | P2 | `phase set <未声明阶段>` 被接受 | **CLOSED** |
| F-19 | P2 | 失败回滚从“最早备份”恢复 | **CLOSED**（残留 → F-28） |
| F-20 | P2 | hook-entry 畸形输入 exit 1 | **CLOSED** |
| F-21 | P2 | `init` 的 `reportsCreated` 恒为 false | **CLOSED** |
| F-22 | P2 | LICENSE 与 THIRD_PARTY_NOTICES.md 缺失 | **CLOSED** |
| F-24 | P2 | README §6.4 误引；install.ts 悬空引用 | **CLOSED** |
| F-15 | P2 | Oracle 对无 cwd 租约抛 ValueError | **CLOSED** |
| F-16 | P2 | S0 门扫描范围缺口 | **CLOSED**（残留 → F-26） |
| F-11 | P2 | 计划书 7 处旧引用 + Fixture `v1.0.0 §5` 标注 | OPEN |
| F-12 | P2 | Oracle 三处边缘语义取自生产源码 | OPEN |
| F-13 | P2 | 冷启动样本为 Read 而非 Write | OPEN |
| F-14 | P2 | live Claude Code 端到端仍 blocked_external | OPEN |
| F-25 | P2 | p95 轮间波动（观察） | OPEN |
| F-23 | P2 | v1.1.0 规格目录未入库；工作树不干净 | OPEN（T014 前置） |
| F-26 | P2 | S0 第二轮后自哈希过期（新） | OPEN |
| F-27 | P2 | uninstall 两条提前返回路径遗留 `.build/`（新） | OPEN |
| F-28 | P2 | F-19 卸载侧回滚无直接回归测试（新） | OPEN |
| F-29 | P2 | S0 门对 vitest worker 抖动过脆（新） | OPEN |

审查员未修改任何生产源码、测试、Golden、Fixture 与 `00_control/`；
只新增 `reviews/` 文件；复跑改动的 S0 产物保持未提交。
