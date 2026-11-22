# REVIEW_INDEX — P025 GuidancePulse T013 审查（S0 审查 + 最终审查）

- **审查对象 commit（S0 审查）：** `042e5c8177863e0da175079dcca5b971d9ce34d4`
- **审查对象 commit（最终审查）：** `143f4e53d632ebe23db4404618914a1acb847c18`
- **规格版本：** v1.1.0
- **S0 审查结论：** PASS（P0/P1 = 0，P2 = 7）
- **最终审查结论：** **FAIL**（P0 = 0，P1 = 1，P2 = 14）
- **审查日期：** 2026-11-15
- **最终审查员复跑：** `npm run s0:gate` 退出 0，S0 PASS，p95=422.92ms，
  canonical SHA `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`；
  全量测试 381/381；`test:e2e` 2/2、`test:offline` 2/2、`test:privacy` 16/16、
  `test:installer` 16/16、`typecheck` 0、`build` 0

## 最终审查（第二轮，T013 重审）

- **审查对象 commit：** `eaeca8873ba0645d2663e95572fea65df45eea51`
- **规格版本：** v1.1.0
- **结论：** **PASS**（P0 = 0，P1 = 0，P2 = 10）
- **审查日期：** 2026-11-15
- **重审员复跑：** `npm run s0:gate` 第二轮退出 0，S0 PASS，p95=218.74ms，
  canonical SHA `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`；
  全量测试 390/390；`test:e2e` 2/2、`test:offline` 2/2、`test:privacy` 16/16、
  `test:installer` 16/16、`test:oracle` self-test PASS + 48/48、
  `test:golden` 53/53、`typecheck` 0、`build` 0。
  第一轮 `s0:gate` 复跑七门全 PASS 但总 verdict FAIL，系 vitest worker
  RPC 超时抖动（390/390 通过，0 失败），见 F-29；第二轮 PASS 为准。
- **F-17 独立复现：** 树外全新项目（`/tmp/r2-t013/proj`，无 NODE_PATH）
  init → install → status 全过；合成 PostToolUse Read / PreToolUse Write /
  PreCompact 三路均返回真实决策；卸载移除 `.build/`，启动器随后
  `HOOK_ENTRY_MISSING` exit 2。见 `REVIEW_PACK_R2-F17.md`。

### 第二轮问题总表

| ID | 严重度 | 问题 | 状态 | Pack |
|---|---|---|---|---|
| F-17 | P1 | 树外 Hook 无法解析 yaml/better-sqlite3 | **CLOSED**（独立复现） | REVIEW_PACK_R2-F17.md |
| F-18 | P2 | `phase set <未声明阶段>` 被接受 | **CLOSED** | T013_FINAL_REVIEW_R2.md §3 |
| F-19 | P2 | 失败回滚从“最早备份”恢复 | **CLOSED**（残留 → F-28） | T013_FINAL_REVIEW_R2.md §3 |
| F-20 | P2 | hook-entry 畸形输入 exit 1 | **CLOSED** | T013_FINAL_REVIEW_R2.md §3 |
| F-21 | P2 | `init` 的 `reportsCreated` 恒为 false | **CLOSED** | T013_FINAL_REVIEW_R2.md §3 |
| F-22 | P2 | LICENSE 与 THIRD_PARTY_NOTICES.md 缺失 | **CLOSED** | T013_FINAL_REVIEW_R2.md §3 |
| F-24 | P2 | README §6.4 误引；install.ts 悬空引用 | **CLOSED** | T013_FINAL_REVIEW_R2.md §3 |
| F-15 | P2 | Oracle 对无 cwd 租约抛 ValueError | **CLOSED** | T013_FINAL_REVIEW_R2.md §3 |
| F-16 | P2 | S0 门扫描范围缺口 | **CLOSED**（残留 → F-26） | T013_FINAL_REVIEW_R2.md §3 |
| F-11 | P2 | 计划书 7 处旧引用 + Fixture/Golden/Oracle 的 `v1.0.0 §5` 标注 | OPEN（不阻断） | REVIEW_PACK_F-11.md |
| F-12 | P2 | Oracle 三处边缘语义取自生产源码 | OPEN（不阻断） | REVIEW_PACK_F-12.md |
| F-13 | P2 | 冷启动样本为 Read 而非 Write | OPEN（不阻断） | REVIEW_PACK_F-13.md |
| F-14 | P2 | live Claude Code 端到端仍 blocked_external | OPEN（不阻断） | REVIEW_PACK_F-14.md |
| F-25 | P2 | p95 轮间波动（观察） | OPEN（不阻断） | REVIEW_PACK_F-25.md |
| F-23 | P2 | v1.1.0 规格目录未入库；工作树不干净 | OPEN（T014 前置） | REVIEW_PACK_F-23.md |
| F-26 | P2 | S0 第二轮后 `S0_GATE.json` 内自哈希过期（新） | OPEN | REVIEW_PACK_R2-26.md |
| F-27 | P2 | uninstall 两条提前返回路径遗留 `.build/`（新） | OPEN | REVIEW_PACK_R2-27.md |
| F-28 | P2 | F-19 卸载侧回滚无直接回归测试（新） | OPEN | REVIEW_PACK_R2-28.md |
| F-29 | P2 | S0 门对 vitest worker 抖动过脆（新） | OPEN | REVIEW_PACK_R2-29.md |
| `reviews/T013_FINAL_REVIEW_R2.md` | — | 最终审查（第二轮）主报告（结论 PASS） | PASS | — |
| `reviews/HANDOFF_T013_FINAL_R2.md` | — | 最终审查（第二轮）交接说明 | — | — |

## 最终审查问题总表

| ID | 严重度 | 问题 | 状态 | Pack |
|---|---|---|---|---|
| F-01 | P2 | 源码注释与计划书章节引用滞后 | 部分闭环（源码注释已闭环；计划书 7 处 + Fixture 标注残留 → F-11） | REVIEW_PACK_04.md / REVIEW_PACK_F-11.md |
| F-02 | P2 | Oracle 三处边缘语义取自生产源码 | OPEN → F-12 | REVIEW_PACK_05.md / REVIEW_PACK_F-12.md |
| F-03 | P2 | 冷启动样本为 Read 而非 Write | OPEN → F-13 | REVIEW_PACK_06.md / REVIEW_PACK_F-13.md |
| F-04 | P2 | 汇总检出计数要求 matchesGolden AND basis | **CLOSED**（反事实实验验证 basis-only，数值无变） | REVIEW_PACK_07.md |
| F-05 | P2 | onFailure:block 端到端保证 S0 阶段无法验证 | OPEN（范围收窄：配置已生成，live 仍待验证 → F-14） | REVIEW_PACK_08.md / REVIEW_PACK_F-14.md |
| F-06 | P2 | Oracle 对无 cwd 租约抛 ValueError | OPEN → F-15 | REVIEW_PACK_09.md / REVIEW_PACK_F-15.md |
| F-07 | P2 | 证据扫描范围缺口（隐私/网络扫描） | OPEN（T012 部分缓解 → F-16） | REVIEW_PACK_10.md / REVIEW_PACK_F-16.md |
| F-11 | P2 | F-01 残留：计划书 7 处旧引用 + Fixture `v1.0.0 §5` 标注 | OPEN | REVIEW_PACK_F-11.md |
| F-12 | P2 | F-02 仍成立：Oracle 文档独立性保留 | OPEN | REVIEW_PACK_F-12.md |
| F-13 | P2 | F-03 仍成立：冷启动样本为 Read 而非 Write | OPEN | REVIEW_PACK_F-13.md |
| F-14 | P2 | F-05 收窄但仍 OPEN：live 端到端未验证 | OPEN（blocked_external） | REVIEW_PACK_F-14.md |
| F-15 | P2 | F-06 仍成立：Oracle 无 cwd 租约抛 ValueError | OPEN | REVIEW_PACK_F-15.md |
| F-16 | P2 | F-07 仍成立（部分缓解）：S0 门扫描范围缺口 | OPEN | REVIEW_PACK_F-16.md |
| F-17 | **P1** | 已安装 Hook 入口在源码树外无法解析 `yaml`/`better-sqlite3`，真实项目中全部 Hook 失败 | **OPEN（FAIL 直接原因）** | REVIEW_PACK_F-17.md |
| F-18 | P2 | `phase set <未声明阶段>` 被接受；拼错阶段静默解除门控 | OPEN | REVIEW_PACK_F-18.md |
| F-19 | P2 | 安装/卸载失败回滚从“最早备份”恢复 | OPEN | REVIEW_PACK_F-19.md |
| F-20 | P2 | hook-entry 畸形输入 exit 1、无 stdout JSON | OPEN | REVIEW_PACK_F-20.md |
| F-21 | P2 | `init` 的 `reportsCreated` 恒为 false | OPEN | REVIEW_PACK_F-21.md |
| F-22 | P2 | LICENSE 与 THIRD_PARTY_NOTICES.md 缺失 | OPEN（T014 前置） | REVIEW_PACK_F-22.md |
| F-23 | P2 | v1.1.0 规格目录未入库；工作树不干净 | OPEN（T014 前置） | REVIEW_PACK_F-23.md |
| F-24 | P2 | README §6.4 allowlist 误引；install.ts 悬空“module footer”引用 | OPEN | REVIEW_PACK_F-24.md |
| F-25 | P2 | p95 轮间波动大；冷启动 780ms 超出 §9.6 立论最大值（观察） | OPEN | REVIEW_PACK_F-25.md |
| `reviews/T013_FINAL_REVIEW.md` | — | 最终审查主报告（结论 FAIL） | FAIL | — |
| `reviews/HANDOFF_T013_FINAL.md` | — | 最终审查交接说明 | — | — |

## S0 审查包清单（原文保留）

| Pack | 内容 | 状态 |
|---|---|---|
| `reviews/REVIEW_PACK_01.md` | core（lease-machine、match-rules）+ contracts（events） | PASS，无问题；1 处观察（未使用的 reason 码） |
| `reviews/REVIEW_PACK_02.md` | hooks（adapter、pre-tool-use、decision、pre-compact、cwd-changed、subagent-start、instructions-loaded）+ store + 隐私模块 + phase CLI | PASS，无 P0/P1 |
| `reviews/REVIEW_PACK_03.md` | Oracle + 48 fixtures + Golden + gate/perf/repeat 脚本 + S0 证据复算 | PASS，无 P0/P1 |
| `reviews/REVIEW_PACK_04.md` | 问题 F-01（P2）：计划书与源码注释章节引用仍为 v1.0.0 编号 | 部分闭环（源码注释已闭环；残留见 F-11） |
| `reviews/REVIEW_PACK_05.md` | 问题 F-02（P2）：Oracle 三处边缘语义取自生产源码 | OPEN（复核见 F-12） |
| `reviews/REVIEW_PACK_06.md` | 问题 F-03（P2）：冷启动样本为 Read 而非 Write，样本不同构 | OPEN（P2） |
| `reviews/REVIEW_PACK_07.md` | 问题 F-04（P2）：汇总检出计数要求 matchesGolden AND basis | **CLOSED**（终审反事实实验验证） |
| `reviews/REVIEW_PACK_08.md` | 问题 F-05（P2）：onFailure:block 端到端保证 S0 阶段无法验证 | OPEN（范围收窄，复核见 F-14） |
| `reviews/REVIEW_PACK_09.md` | 问题 F-06（P2）：Oracle 对无 cwd 租约抛 ValueError | OPEN（复核见 F-15） |
| `reviews/REVIEW_PACK_10.md` | 问题 F-07（P2）：证据扫描范围缺口（隐私/网络扫描） | OPEN（部分缓解，复核见 F-16） |
| `reviews/T013_REVIEW.md` | 主审查报告（结论、逐项检查、问题清单） | PASS |
| `reviews/HANDOFF_T013.md` | 交接说明（本审查的交付与后续） | — |

## 被审查文件清单（source commit `042e5c8`，磁盘内容与该 commit 一致；S0 产物除外，见注）

路径以 `02_source/` 为根。SHA-256 与字节数为审查时实测值。

| file_path | sha256 | bytes | review pack | review status |
|---|---|---|---|---|
| `src/core/lease-machine.ts` | `1409671febc6cb002d82a66059220e79a61f4607554b400f5e7b7d620c9f9e35` | 17358 | REVIEW_PACK_01 | PASS |
| `src/core/match-rules.ts` | `db21e15a61d9d81d77e22f5b431b2fe0882de5ab01e25b1df973aad1fc0e80ed` | 3672 | REVIEW_PACK_01 | PASS |
| `src/core/index.ts` | `6f1e8b5beccad4e5470c1c2ffcd21a809ee60a3bea9ada0b2f845e2fb538b6fe` | 620 | REVIEW_PACK_01 | PASS |
| `src/contracts/events.ts` | `ad76cf82957a72b33b25ec546a17193b0ba1f25ae03d89693ca5600fca30e853` | 7801 | REVIEW_PACK_01 | PASS |
| `src/contracts/index.ts` | `aee9e3ce2ca31a689f2cbb8d3ea735418d79397cec331b3c7483deb0b3bd9dab` | 368 | REVIEW_PACK_01 | PASS |
| `src/hooks/adapter.ts` | `c280d4dca1917e24660869ddc28a7a5a6f51946b4ee276a8a25de4d1b75ea844` | 12495 | REVIEW_PACK_02 | PASS |
| `src/hooks/pre-tool-use.ts` | `8810948cef46e8fa506c786a5e9f8375d325b0ee2b581a00c5fd580a2daf0ce9` | 13024 | REVIEW_PACK_02 | PASS |
| `src/hooks/decision.ts` | `ad1b9ba1fa28c367df014cce57e269cc2eb7b6a0111d20bc9e4ab4cc853437e6` | 7120 | REVIEW_PACK_02 | PASS |
| `src/hooks/pre-compact.ts` | `d6dfcf57ba51b0b06a7a95cf0338749f4f755f7f5d02f47792e831308635e1c0` | 5806 | REVIEW_PACK_02 | PASS |
| `src/hooks/cwd-changed.ts` | `4b451d22b12357c630b4847d1a94687b454379f02123ae704795aad7ee67e77a` | 4785 | REVIEW_PACK_02 | PASS |
| `src/hooks/subagent-start.ts` | `d990da52dab236aa2ed049d33f0610543883a99f3d4885cd7329d1f295e3a457` | 4157 | REVIEW_PACK_02 | PASS |
| `src/hooks/instructions-loaded.ts` | `e752aa0727114173d049da0826d4a71b9bfd1bda617ec70bc7e0c8bd1a3866e1` | 3818 | REVIEW_PACK_02 | PASS |
| `src/hooks/index.ts` | `6bef6f0b935559963f34eb6ec84c19440df4fc02e5a1f71a149ae2e78bf1a80d` | 713 | REVIEW_PACK_02 | PASS |
| `src/store/store.ts` | `d68eed895356a47ea3b41dc91032e6cc23961ce48cee1e9c68f4538cbb0d7bd1` | 26336 | REVIEW_PACK_02 | PASS |
| `src/store/schema.ts` | `22c185489131bc34ba3a3aecc4b4c6781498dcb9253a9b50df326eba11af7f1f` | 2904 | REVIEW_PACK_02 | PASS |
| `src/store/index.ts` | `3317792d237b88009f0a39698229f0e5ae50a3c8abf1c33c6946c8852b3aa92c` | 457 | REVIEW_PACK_02 | PASS |
| `src/store/errors.ts` | `59fa65c4119566c55a7b92f09b4e27e8da90427829d5888c7f6d91f44f4c57a9` | 2239 | REVIEW_PACK_02 | PASS |
| `src/privacy/sanitize.ts` | `876a81d269dbb91827ebd00e666c59a0df57e467c41566ee93a9e4d5614fd2ad` | 13252 | REVIEW_PACK_02 | PASS |
| `src/privacy/path-id.ts` | `bca0816119bf446bfd205e4556e34fcc447613ea1efff88fa5d62a7d14faa97d` | 5502 | REVIEW_PACK_02 | PASS |
| `src/privacy/retention.ts` | `d8e812c99a248700818d510053993af3efd7ea81b4b3c4eb04d4642d7a8183a0` | 6355 | REVIEW_PACK_02 | PASS |
| `src/privacy/index.ts` | `d37897c7947c5db1b6d48feb509d7f720c74433b2efb3f787acebd4a4d678624` | 814 | REVIEW_PACK_02 | PASS |
| `src/cli/phase.ts` | `c5590ada784d2dffba286fe2e8e86866a29fd16da090a02ce2862cec74857ebf` | 9281 | REVIEW_PACK_02 | PASS |
| `scripts/s0-replay.ts` | `f4f7e5caa56114896d1f60b86e6f3ca81af5ac72bf4f1ee94b0850b2ffe97771` | 18457 | REVIEW_PACK_03 | PASS（F-04 另见 PACK_07） |
| `scripts/s0-gate.ts` | `8b81ba0f86472290f67b4db85cff33d1d9677b0ccdc6ace73d3b13cefe58d37b` | 27439 | REVIEW_PACK_03 | PASS（F-07 另见 PACK_10） |
| `scripts/perf-hook.ts` | `c52c7b8414a9c162e0d00b734b0bb5a4f9fbf0023427b1c28851bc294814360e` | 15336 | REVIEW_PACK_03 | PASS（F-03 另见 PACK_06） |
| `scripts/repeat-s0.ts` | `3ede6364f8071486d27f7af63fcf6a0b06f7b38d795dc30a2ef392250356823d` | 2511 | REVIEW_PACK_03 | PASS |
| `scripts/hook-entry.ts` | `0ef561c38c387d93239e8e245b76898e71b5e229625572a7f5f1954fe6524fda` | 7201 | REVIEW_PACK_03 | PASS（F-07 另见 PACK_10） |
| `tests/oracle/reference_oracle.py` | `aab127649fdfc526cf958dde8d4b091073bb4ca427bf862fece2558ac670d984` | 24917 | REVIEW_PACK_03 | PASS（F-02/F-06 另见 PACK_05/09） |
| `tests/fixtures/s0/author-fixtures.py` | `af243fb410e8c3eeb3f9270f6f767478c983f3be40988011dfeed3cb522d2b09` | 28332 | REVIEW_PACK_03 | PASS |
| `tests/golden/expected-v1.json` | `f266da7005eeb990ee5b248aa94558b30ce887472076ce753f1ff4a8eceecb7b` | 39429 | REVIEW_PACK_03 | PASS |

注：上表 SHA-256 取自审查时磁盘文件；`src/**`、`scripts/**`、`tests/**` 在审查期间未被修改，与 source commit `042e5c8` 一致（`git status` 仅显示 `02_source/artifacts/s0/` 下 5 个产物文件被复跑改动）。S0 证据产物（`S0_GATE.json` 等）的 HEAD 提交值与审查员复跑值均记录在 `T013_REVIEW.md` §1，不在此表重复列出 SHA（产物每次运行都会变化）。

## 最终审查（第三轮，T013 重审 R3，FIX-R1 后）

- **审查对象 commit：** `6874984fad927bc2435c9084fa9dd50ab365490a`
  （FIX-R1: fresh S0 PASS with fixed gate，p95 213.76ms，396/396）
- **规格版本：** v1.1.0
- **结论：** **PASS**（P0 = 0，P1 = 0，P2 = 7）
- **审查日期：** 2026-11-15
- **审查员复跑：** `npm run s0:gate` 退出 0，S0 PASS，p95=239.88ms
  （审查员用 100 个 `durations_ms` 独立重算 239.877516ms 一致），
  canonical SHA `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`；
  全量测试 396/396（22 文件）；`npm run typecheck` 退出 0；
  targeted 证据测试：直接调用 `runFrozenS0Evidence("6874984…")`
  exit 0，第 1/5 次通过，返回块 `git_commit === 6874984`，
  p95=206.26ms，9/9 证据文件字节 + SHA 一致。
  报告：`reviews/T013_FINAL_REVIEW_R3.md`。

### 第三轮问题总表

| ID | 严重度 | 问题 | 状态 | Pack |
|---|---|---|---|---|
| P1-R1-01 | P1 | S0 证据没有绑定冻结 commit | **CLOSED**（机制 + 工 2 实测 + HEAD targeted 测试） | T013_FINAL_REVIEW_R3.md §3 |
| P1-R1-02 | P1 | S0 隐私第二轮扫描没有覆盖最终文件（F-26 升级） | **CLOSED**（代码 + 审查员复跑：三轮均为 0、无 canary、无自哈希、读回 SHA 一致） | T013_FINAL_REVIEW_R3.md §2 |
| P1-R1-03 | P1（遗留阻断） | 真实 Claude Code 集成仍未验证 | **OPEN，范围外，等 Sam 决定**（不计入计数） | T013_FINAL_REVIEW_R3.md §6 |
| R1-P2-01 | P2 | lease-machine.ts 存在两个 NUL 字节 | **CLOSED**（NUL 计数 0，`\u001F` 转义，3 回归测试） | T013_FINAL_REVIEW_R3.md §4 |
| R1-P2-02 | P2 | dist.zip 启动器权限为 0770，而 source.zip 为 0755 | **CLOSED**（launcher 0o100755，57 条目 0 坏 mode） | T013_FINAL_REVIEW_R3.md §4 |
| R1-P2-03 | P2 | Clean-room smoke 实际链接仓库 node_modules，没有真正执行独立 npm ci | **CLOSED**（真实 `npm ci --offline --ignore-scripts`，无软链回退） | T013_FINAL_REVIEW_R3.md §4 |
| F-11 | P2 | 计划书 7 处旧引用 + Fixture `v1.0.0 §5` 标注 | OPEN | REVIEW_PACK_F-11.md |
| F-12 | P2 | Oracle 三处边缘语义取自生产源码 | OPEN | REVIEW_PACK_F-12.md |
| F-13 | P2 | 冷启动样本为 Read 而非 Write | OPEN | REVIEW_PACK_F-13.md |
| F-25 | P2 | p95 轮间波动（观察；本轮三跑 213.76 / 239.88 / 206.26ms） | OPEN | REVIEW_PACK_F-25.md |
| F-28 | P2 | F-19 卸载侧回滚无直接回归测试 | OPEN | — |
| F-29 | P2 | Vitest worker RPC 超时，根因仍 OPEN（只做缓解：证据重试 3→5） | OPEN | — |
| R1-P2-04 | P2 | Drive 未找到独立 REVIEW_INDEX / REVIEW_PACK 归档 | **CLOSED**（2026-11-15 FIX-R2 同步：Drive 04_release/T014_R1_2026-11-15_adba7af 内含 REVIEW_INDEX.md、T013_FINAL_REVIEW_R3.md、REVIEW_PACKS.zip，9/9 回读核对通过；终审 R2 亦独立确认归档层面 CLOSED） | 本文件 + REVIEW_PACK_*.md |
| F-23 | P2 | v1.1.0 规格目录未入库；工作树不干净 | **CLOSED** | — |
| F-27 | P2 | uninstall 两条提前返回路径遗留 `.build/` | **CLOSED** | REVIEW_PACK_R2-F17.md（同文件，R2 已确认） |
| F-17 | P1 | 树外 Hook 无法解析 yaml/better-sqlite3 | **CLOSED**（R2 独立复现；本轮未动相关代码） | REVIEW_PACK_R2-F17.md |

注：终审 R1（`00_control/P025_FINAL_REVIEW_R1.md`，EVIDENCE_INCOMPLETE，
P0=0 P1=3 P2=10）为本轮修复的输入，其 P1-R1-01/02 与新增 P2-01/02/03
均已由 R3 验证关闭；P1-R1-03 仍为遗留阻断，等 Sam 决定。
终审 R2 将在 T014 R1 冻结后于同一 GPT 对话中进行。

## 最终审查（第四轮，T013 重审 R4，FIX-R2 后）

- **审查对象 commit：** `f4d2b2e7ba0698b793e8b3e70d843b6e32354f61`
  （T014 重新冻结 R2；FIX-R2 修复 commit `17a92a5`）
- **规格版本：** v1.1.0
- **结论：** **PASS**（P0 = 0，P1 = 0，P2 = 7）
- **审查日期：** 2026-11-15
- **审查员复跑：** `npm run s0:gate` 第 1 次 F-29 抖动 FAIL（396 passed /
  0 failed，7 门全 PASS，p95=203.07ms），第 2 次退出 0，S0 PASS，
  p95=218.92ms，canonical SHA
  `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`
  与冻结证据逐字相同；全量测试 396/396（22 文件）；
  `npm run release:verify` 64/64 PASS（含两项 FIX-R2 新检查）；
  `sha256sum -c release/SHA256SUMS.txt` 13/13 OK。
  报告：`reviews/T013_FINAL_REVIEW_R4.md`。

### 第四轮问题总表

| ID | 严重度 | 问题 | 状态 | Pack |
|---|---|---|---|---|
| P1-R2-01 | P1 | Drive s0-evidence 9 个文件无独立归档、无法逐个取得 | **CLOSED**（Drive R2 文件夹 s0-evidence/ 子文件夹内 9 文件齐全，审查员独立下载核对 9/9；另 5 顶层文件亦一致，合计 14/14） | T013_FINAL_REVIEW_R4.md §3 |
| 字段统一 | P2 | manifest 顶层 `s0_gate.p95` 与 evidence 字段不一致（R2 §六） | **CLOSED**（顶层五字段改取冻结证据；程序化比对 9 项一致，均为 217.64ms；verify 新增两项检查 PASS） | T013_FINAL_REVIEW_R4.md §1 |
| R1-P2-04 | P2 | 冻结报告与本文件中的 R1-P2-04 状态文字滞后为 OPEN | **CLOSED**（两处均已同步；Drive R1 文件夹三件归档文件俱在，R1 报告 Drive 副本与 git 版逐字节一致） | T013_FINAL_REVIEW_R4.md §2 |
| P1-R1-03 | P1（遗留阻断） | 真实 Claude Code 集成仍未验证 | **OPEN，范围外，等 Sam 决定**（不计入计数；Sam 已于 2026-11-15 20:21 GMT 确认其电脑上装有 Claude Code，验证待其回到电脑前进行，非无可用机器） | T013_FINAL_REVIEW_R4.md §5 |
| F-11 | P2 | 计划书 7 处旧引用 + Fixture `v1.0.0 §5` 标注 | OPEN | REVIEW_PACK_F-11.md |
| F-12 | P2 | Oracle 三处边缘语义取自生产源码 | OPEN | REVIEW_PACK_F-12.md |
| F-13 | P2 | 冷启动样本为 Read 而非 Write | OPEN | REVIEW_PACK_F-13.md |
| F-25 | P2 | p95 轮间波动（观察；本轮五跑 213.76 / 216.31 / 226.51 / 217.64 / 218.92ms） | OPEN | REVIEW_PACK_F-25.md |
| F-28 | P2 | F-19 卸载侧回滚无直接回归测试 | OPEN | — |
| F-29 | P2 | Vitest worker RPC 超时，根因仍 OPEN（只做缓解：证据重试 5 次；本轮 R4 复跑第 1 次即命中，第 2 次通过） | OPEN | — |
| R4-P2-01 | P2 | Drive `s0-evidence/` 内无 `logs/` 子文件夹，`s0-gate.log` 平铺顶层，与记录路径不一致 | **CLOSED**（R4 评审后协调员在 Drive 上新建 `logs/` 子文件夹并移入该文件，内容不变；移入后重新下载核对 SHA-256 与本地/manifest 一致） | T013_FINAL_REVIEW_R4.md §3.4 |

注：终审 R2（`00_control/P025_FINAL_REVIEW_R2.md`，EVIDENCE_INCOMPLETE，
P0=0 P1=1 P2=6）为本轮修复的输入，其 P1-R2-01、字段统一、R1-P2-04
文字三项均已由 R4 验证关闭；P1-R1-03 仍为遗留阻断，等 Sam 回到电脑前验证。
终审 R3 将在 T014 R2 冻结后于同一 GPT 对话中进行。
