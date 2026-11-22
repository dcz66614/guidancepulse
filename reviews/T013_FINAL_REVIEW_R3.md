# T013 最终审查报告（第三轮）— P025 GuidancePulse

- **审查对象 commit：** `6874984`（FIX-R1: fresh S0 PASS with fixed gate）
- **规格版本：** v1.1.0（`00_control/v1.1.0/PROJECT_BOOK.md`、
  `00_control/v1.1.0/IMPLEMENTATION_PLAN.md`）
- **审查员：** T013 独立终审前置评审（第 3 轮，与 FIX-R1 施工方、R1 终审员及
  R2 评审员均为不同会话；结论独立得出，未代写实现方结论，未修改任何生产
  源码、测试、Golden、Fixture 或 `00_control/` 文件）
- **审查日期：** 2026-11-15
- **结论：PASS**（P0 = 0，**P1 = 0**，P2 = 7）
- **PASS 的依据：** P1-R1-02（隐私第二轮 + 自哈希）已由审查员亲自重跑完整 S0
  验证为真正关闭（三轮隐私扫描均为 0、最终文件内无任何 canary 原文、
  无自哈希、读回 SHA 与扫描字节一致）；P1-R1-01（S0 证据绑定冻结 commit）
  已由代码复核 + 工 2 端到端实测（release:build 44/44、release:verify 62/62）
  + 审查员在 HEAD 上亲自跑的 targeted worktree 测试验证为真正关闭
  （证据 `git_commit === 6874984`，9/9 文件与 manifest 块字节 + SHA 一致）；
  R1 新增 P2（R1-P2-01/02/03）逐项复核全部真实闭环；全量测试 396/396。
  P1-R1-03（真实 Claude Code E2E）为**遗留阻断，本次修复范围外，等 Sam
  决定**，见 §6 单列，不计入 P0/P1/P2 计数，也不得因它未修就把本次修复判
  为 FAIL——本轮 verdict 只针对本次修复范围（P1-R1-01/02 + 新增 P2）。

## 1. 结论与复算结果

审查员亲自在 `02_source/` 下按顺序运行全部验收命令
（2026-11-15 ~19:18–19:22 GMT，Node v24.22.1、npm 10.9.4、Python 3.12.3）。
退出码均为以 `> log 2>&1; echo $?` 方式取到的真实退出码。
`TMPDIR` 指到持久磁盘 `~/workspace/p025-fix-r1-tmp/r3`（未用 `/tmp`）。

| 命令 | 真实退出码 | 结果 |
|---|---|---|
| `npm run s0:gate`（审查员复跑，第二轮，见 §1.1） | 0 | **S0 overall verdict: PASS**（见下） |
| `npm run typecheck` | 0 | 0 错误 |
| `npm test` | 0 | **396/396 通过**（22 文件，75.94s；无 unhandled error） |

### S0 七门（审查员复跑值 vs 阈值）

| 门 | 规格阈值（v1.1.0） | 审查员复跑值（PASS） | 结论 |
|---|---|---|---|
| 生产/Golden/Oracle 三向一致 | 48/48 | 48/48 | PASS |
| 植入错误检出（四依据） | 32/32 | 32/32（28/1/2/1；`fixture-results.json` sha 与 R2 记录一致为 `79daa09b…` 全值 `79daa09bbf4a624e5921f66e367fc0c73fe1384344e7beff01648d0561a25f74`，数值无变） | PASS |
| 控制无误报 | 16/16 | 16/16 | PASS |
| Hook 端到端 p95 | 严格 <500ms | **239.88ms**（n=100，p50=159.08，p99=266.53，min=144.41，max=287.50，cold_start=262.37，cold_start_sample_index=0，run_failures=0；审查员用 `perf-hook.json` 的 100 个 `durations_ms` 独立重算 p95 = 239.877516ms，与报告值一致） | PASS（余量 52%） |
| 100 次确定性重放 | 恰好 1 个 canonical SHA-256 | 同值 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（1/100） | PASS |
| 运行时网络请求 | 0 | 0（40 文件） | PASS |
| Prompt/源码持久化泄露 | 0 canary 命中 | 0（三轮均为 0，见 §2） | PASS |
| 支撑证据 | typecheck + 全量测试 | typecheck 0；golden 53/53；oracle PASS 48/48；全量 396/396 | PASS |

p95 口径已逐项核对：`perf-hook.json` 载明 warmup_runs=5、runs=100、
`durations_ms` 长度 100、`durations[0]==cold_start_ms`、
每次 spawn 全新 Node 子进程、p95 取排序后 `ceil(0.95·n)-1` 位、阈值
严格 `<500`。三轮 p95 对照：HEAD 提交产物 213.76ms、审查员复跑
239.88ms、§3 targeted 证据运行 206.26ms——均 <500ms（F-25 波动观察仍成立）。

### §1.1 第一轮 `s0:gate` 复跑曾无声中断（审查员调用方式问题，非产品问题）

审查员第一轮用 `nohup … &` 以 detached 方式启动 `npm run s0:gate`，
进程在 oracle 步骤后无声消失（日志停在 `test:oracle exit=0`，无报错、
无 verdict，进程已不存在），系 exec 会话结束时进程组被回收所致。
改用 runtime 跟踪的后台会话重跑后一次即 PASS（上表值）。
与 R2 的 `cmd | tail` 退出码教训同类：本次报告只采用第二轮跟踪会话的
真实退出码与数值。

工作区状态说明：审查员复跑改写了磁盘上的 S0 产物；写报告前已用
`git checkout -- 02_source/artifacts/s0/` 恢复到 HEAD，
`git status` 干净；本次提交**仅含 `reviews/`**。
审查结论以 HEAD 提交产物为准，复跑值作为独立验证证据。
Scratch 证据见 `~/workspace/p025-fix-r1-tmp/r3/`（`r3-s0-gate2.log`、
`r3-typecheck.log`、`r3-npm-test.log`、`r3-evidence-test.log`）。

## 2. P1-R1-02（隐私第二轮 + 自哈希）：CLOSED

### 代码层复核（`02_source/scripts/s0-gate.ts`，commit `baa7d2d`）

逐行核对新逻辑，R1 的四项要求全部落实：

- **第二轮只记数字，不记 canary 原文。** 新增 `scanPrivacyBytes`
  只返回 `{path, bytes, total_hits}` 计数，不以 canary 字符串为键；
  `privacy_second_pass` 结构改为 `{second_pass, final_pass, verdict}`，
  两轮各含 `files/total_hits/verdict`，无 canary 字段。
- **第二轮扫内存草稿字节。** `serializeGateJson()` + `buildGateMd()`
  先在内存中序列化草稿（此时 `privacy_second_pass` 仍为 null），
  `scanPrivacyBytes` 扫这两个 Buffer，不碰磁盘。
- **最终字节扫描在写入之前。** 填入 `privacy_second_pass` 后重新序列化
  得到最终字节，再次 `scanPrivacyBytes`；只有 0 命中才落盘。
  FAIL 翻转路径亦有处理：翻转 verdict 后重建字节并**再扫一次**
  （rescan，结果记入日志）；翻转只改 verdict/计数字样，不引入 canary，
  故 rescan 计数与首扫一致——该路径本轮未触发（全程 0 命中）。
- **无自哈希。** `artifacts_sha256` 改为防御性拷贝 `{...artifactHashes}`，
  且 `S0_GATE.json` 自始至终不加入（旧的写后补哈希两行已删除）；
  `S0_GATE.json/.md` 的 SHA-256 只出现在 `logs/s0-gate.log` 中。
- **`privacy-scan.json` 哈希与最终字节一致。** 该文件在
  `artifactHashes` 计算之前写定，此后全程不再触碰（旧的“第二轮后追加
  元数据再刷新哈希”已删除）；审查员复跑验证：记录值与最终字节一致（§1）。
- **落盘后读回 SHA 核对。** 写盘后 `readFileSync` 读回两文件，
  `sha256Buffer` 与扫描字节的 `sha256Text` 逐一比对，
  `readBackOk=false` 时 verdict 强制 FAIL 且不重写（只验证、不修复）。
  `final_pass` 的 `files` 条目按设计省略 `bytes`（文件无法内嵌自身
  字节数），字节数改由读回 SHA + 日志记录——设计自洽，审查员接受。

### 审查员复跑实测（HEAD `6874984`，19:18–19:20 GMT，exit 0）

| 检查 | 审查员实测值 |
|---|---|
| Round 1（11 持久化文件） | 0 命中（`privacy-scan.json` total_hits=0） |
| Round 2（草稿字节，8284/2115 B） | 0 命中，verdict PASS |
| Final byte scan（最终字节） | 0 命中，verdict PASS |
| `S0_GATE.json` 内 canary 原文 | 3 条 canary 各 0 次（逐字 grep `CANARY-S0GATE-PROMPT-5c1e8a04-syn-101` / `-SOURCE-7d2b9f31-syn-102` / `-TOKEN-3a9e6c58-syn-103`，取自 `scripts/perf-hook.ts`） |
| `S0_GATE.md` 内 canary 原文 | 3 条各 0 次 |
| `artifacts_sha256` | 6 个文件，记录哈希与最终字节逐一核对全部一致；`S0_GATE.json` 不在其中 |
| 读回核对 | `S0_GATE.json` 8928 B sha `8a19aea1578e1f208717b800e092f757ab122a3bd991fdec195ae2a9d31f2e97` `read_back_match=true`；`S0_GATE.md` 2350 B sha `49bd5bf05ea740b08d1f58cb562e53071e914c9f8c4d7812f0ef083c07ccc53e` `read_back_match=true`；两值与审查员独立 `sha256sum` 一致 |
| `S0_GATE.json` 记录的 commit | `6874984fad927bc2435c9084fa9dd50ab365490a`（即本次复跑的 HEAD，见 §3） |

**结论：P1-R1-02 真正关闭。** R1 指出的“第二轮零命中不是最终文件
的验证结果”与“自哈希过期”两项均已消除，且审查员在新门上独立复现为 PASS。

## 3. P1-R1-01（S0 证据绑定冻结 commit）：CLOSED

### 机制代码复核（commit `bd3fb23`、`1e029e3`、`65ea6c7`）

- **`runFrozenS0Evidence()`（`release-build.mjs`）：** 在 `$TMPDIR` 下
  `git worktree add --detach <frozenCommit>` 建干净 worktree（与主树隔离，
  `finally` 中 `worktree remove --force` + `prune` 清理）；将仓库
  `node_modules` 软链入 worktree（文档注明：与 clean-room 相同的无网络偏差）；
  在 worktree 内跑完整 `npm run s0:gate`，F-29 抖动时最多重试 5 次
  （`1e029e3`：3 次在并行负载下已证不够；失败诊断改为读 `s0-gate.log`
  尾部而非空 stderr，见工 2 `build.log` 的 `exit 1: ` 空诊断）；
  门通过后强制检查四项：`verdict === PASS`、
  `environment.git_commit === frozenCommit`、
  `canonical_replay_sha256` 为已知值、full tests `failed === 0`，
  任一不符即抛错；9 个证据文件（`S0_GATE.json/.md`、
  `fixture/oracle/perf-hook/repeat-hashes/privacy/network-scan.json`、
  `logs/s0-gate.log`）原样拷入 `release/s0-evidence/` 并逐文件记
  `bytes + sha256`；manifest 的 `s0_evidence` 块另含 verbatim
  `git diff --stat` / `--name-only`（in-tree gate commit → frozen commit）
  作为 `diff_proof`；`SHA256SUMS.txt` 覆盖全部 9 个证据文件；
  `s0_gate.evidence` 改指 `release/s0-evidence/S0_GATE.json`，
  树内证据另记为 `in_tree_evidence` 并注明其 commit 恒为上一提交。
- **`release-verify.mjs` §7b 绑定检查：** manifest 含 `s0_evidence` 块；
  `s0_evidence.frozen_commit` 与 `git_commit` 均等于 manifest 的
  `frozen_commit`；证据 `S0_GATE.json` 可解析且
  `environment.git_commit === frozen`、verdict PASS、canonical hash 为
  已知值、full tests 0 失败、`generated_at_utc` 与 manifest 一致；
  `files` 恰为预期的 9 个、逐文件存在且字节 + SHA 一致；
  `SHA256SUMS.txt` 覆盖每个证据文件。§7 另保留旧检查（冻结 commit 的
  树内门 PASS + canonical hash + 0 失败）。
- **`release-zip.mjs` `readZipEntries`：** 从 central directory 读
  `external attributes` 高 16 位 Unix `st_mode`（creator 为 Unix 且
  mode 非 0 时有效），其余逻辑（CRC、去重）与原 `readZip` 一致；
  `readZip` 改为包一层 `readZipEntries`，无行为变化。
- **`65ea6c7`：** build 与 verify 的终审引用由 R2 改为 R3
  （`reviews/T013_FINAL_REVIEW_R3.md`，要求 `结论：PASS` 且 P0/P1=0），
  与本轮重审衔接。

### 工 2 验证日志的可信度（`~/workspace/p025-fix-r1-tmp/w2/test-run-release/`）

`build3.log`：**44 个 `[PASS]`、0 个 `[FAIL]`**；
`verify3.log`：**62 个 `[PASS]`、0 个 `[FAIL]`**（审查员 `grep -c` 独立计数）。
日志可信，细节真实：

- S0 证据运行第 1、2 次均命中 F-29（`npm test` exit 1、393 passed / 0 failed，
  七门其余全 PASS，p95 分别为 406.50 / 231.51ms），第 3/5 次通过——
  与 `1e029e3` 的重试理由完全吻合，且证明重试未放宽门（verdict 仍须 PASS）。
- 证据 `S0_GATE.json` 的 `git_commit` 确为冻结 commit
  `0a5696493d18e136b118927e65e0f4e642b6bf98`，verdict PASS，canonical hash
  同值，`s0_evidence` 含 9 文件 + `diff_proof`（`5f1e6fd → 0a56964`，9 文件，
  含 release 脚本本身的改动——diff 内容不削弱绑定，绑定靠的是重跑本身）。
- clean-room 与 dist smoke 均 `npm ci --offline` 成功、
  `node_modules` 为真实目录（非软链）、CLI smoke 全部 exit 0；
  dist launcher mode `100755`、全部条目 0644/0755；
  `sha256sum -c release/SHA256SUMS.txt` 13 行全部 OK。
- **局限（审查员指出，非扣分）：** 工 2 的 scratch 冻结 commit
  `0a56964` 是 `1e029e3` 之后、`baa7d2d` 之前的代码（393 测试、旧隐私门
  形状——其证据 `privacy_second_pass` 仍以 canary 字符串为键），
  故该次端到端只验证了 P1-R1-01 机制与 R1-P2-02/03，**不验证新隐私门**。
  新隐私门由 §2 审查员复跑与下述 targeted 测试验证。

### 审查员 targeted 测试（HEAD `6874984`，scratch worktree，19:24 GMT）

审查员在 `~/workspace/p025-fix-r1-tmp/r3/wt-r3`（`git worktree add --detach`
于 `6874984`，`node_modules` 软链自主树，主树未动）中直接调用
`runFrozenS0Evidence("6874984…", "65ea6c7…")`（`release-build.mjs` 的
`isMain` 守卫使函数可单独 import，不跑 `main()`）。结果 **exit 0，
第 1/5 次即通过**：

| 检查 | 结果 |
|---|---|
| 返回块 `frozen_commit` / `git_commit` | 均为 `6874984fad927bc2435c9084fa9dd50ab365490a`（精确 HEAD） |
| verdict / p95 / canonical hash | PASS / `p95=206.26ms`（n=100，p50=162.74，p99=330.41，min=147.00，max=362.64，cold_start=330.41，sample 0，0 失败）/ `ef06d30f…` 同值 |
| 9 个证据文件 | 逐文件字节 + SHA 与返回块一致（审查员独立重算，9/9 匹配）；拷入 scratch worktree 的 `release/s0-evidence/`，主树 `release/` 未动 |
| 证据门自身 | verdict PASS，`git_commit === 6874984`，full tests 396/0，`privacy_second_pass` 三轮均为 0、无 canary、无自哈希，读回 `read_back_match=true`（`S0_GATE.json` 9003 B sha `f507566c…`） |
| `diff_proof`（`65ea6c7 → 6874984`） | 仅 5 个 S0 产物文件（`S0_GATE.json/.md`、`logs/s0-gate.log`、`perf-hook.json`、`privacy-scan.json`；187 行增 / 206 行删） |

测试后 scratch worktree 已 `git worktree remove --force`，主树干净。

### 关于“树内 S0_GATE.json 仍记录上一提交”

**已被新机制充分桥接，不构成证据缺口。** HEAD 的树内门记录
`65ea6c7` 是固有性质——一个 commit 无法包含自身的哈希，树内门永远
只能记录上一提交。桥接由三层构成：(1) 证据重跑本身——干净 worktree
在精确冻结 commit 上重跑完整 S0，门内 `git_commit === frozen`，
这才是绑定；(2) verbatim `diff_proof`——`65ea6c7 → 6874984` 之间
只有 5 个 S0 产物文件，无任何源码、测试、脚本改动，说明树内门与
冻结 commit 的唯一差别就是一次新的 S0 运行；(3) `release-verify.mjs`
§7b 在每次发布验证时强制复核 (1) 的全部绑定条件。
`65ea6c7` 与 `6874984` 之间 `git diff --stat` 审查员已独立核对，
与 `diff_proof` 一致。

**剩余步骤（非本轮缺口，T014 流程内）：** HEAD 上尚未实际跑过一次
完整 `release:build`——因为 build 要求冻结 commit 内含本 R3 报告
（`结论：PASS` 且 P0/P1=0），而本报告尚未提交。机制本身已在本轮
验证通过；待协调员将本报告提交进新的冻结 commit 后，T014 重新冻结
时跑一次完整 `release:build` + `release:verify` 即可（届时
`release/` 将新增 `s0-evidence/` 与更新的 manifest/SHA256SUMS；
`source.zip`/`dist.zip` 对同一冻结 commit 保持字节一致）。

**结论：P1-R1-01 真正关闭。**

## 4. 新增 P2 核对（R1-P2-01/02/03）：全部 CLOSED

| ID | 复核 | 状态 |
|---|---|---|
| R1-P2-01 | `lease-machine.ts`：审查员 `python` 字节检查 NUL 计数 **0**（修复前 blob 为 2，`git show 6edd5df:…`）；文件 17865 B，`git grep` 可正常检索（Git 已视为文本）；分隔符改为 `\u001F` 转义（L109–121 注释写明：仅作 Map 键、从不拆回组件、该控制字符不会出现在 scope/guidance id 中）；新增 3 个回归测试（`\u001F` 连接、三元组互不相同、源码无 NUL），全量 396/396 含其通过；canonical hash `ef06d30f…` 不变，语义无变 | **CLOSED** |
| R1-P2-02 | `normalizeDistMode`（`release-build.mjs`）：任一 exec 位 → `0o100755`，否则 `0o100644`，目录 `0o40755`；`collectDistEntries` 三处调用点均已改用；build 自检（launcher 0755、全部条目 0644/0755）与 verify §6 检查（`readZipEntries` 读 central directory，非解压后文件系统）均已就位；审查员用 Python `zipfile` 独立验证工 2 的 `dist.zip`：launcher `0o100755`，57 条目、0 个坏 mode；该 dist.zip sha `fe570302…` 与 T014 的 `64a4a939…` 不同（同为 669142 B 系巧合） | **CLOSED** |
| R1-P2-03 | build 与 verify 的 clean-room、dist smoke 均改为真实 `npm ci --offline --ignore-scripts`（无软链回退、无静默 fallback；失败即 fail）；另有 `node_modules` 为真实目录（非软链）的显式检查；`--ignore-scripts` 的理由已写明（better-sqlite3 安装时 node-gyp 重建无法离线跑，预编译 binary 可直接加载）；工 2 实测：两次 `npm ci --offline` 均成功、两次 CLI smoke 全部 exit 0 | **CLOSED** |

## 5. 旧 P2 复核

| ID | 原问题 | 复核结果 | 状态 |
|---|---|---|---|
| F-11 | 计划书旧章节引用、Fixture/Golden/Oracle 仍标注 v1.0.0 §5 | 未变：`IMPLEMENTATION_PLAN.md` L323/336 仍引旧编号；规格文件不得改，冻结报告注明即可 | OPEN（P2，不阻断） |
| F-12 | Oracle 三处边缘语义参考生产源码 | 未变：`reference_oracle.py` 头注释仍自述三处边缘语义参照生产源码定稿；三向 48/48 中两路仍独立 | OPEN（P2，不阻断） |
| F-13 | 冷启动样本是 Read 而不是 Write | 未变：`perf-hook.ts` `seedInput()` 仍为 PostToolUse Read；§9.6 未要求冷启动样本全为 Write，已裁决合规 | OPEN（P2，不阻断） |
| F-25 | p95 随 VM 负载波动 | 观察仍成立：本轮三跑 p95 为 213.76 / 239.88 / 206.26ms（工 2 证据运行另有 406.50 / 231.51ms）；无一轮超 500ms 阈值 | OPEN（P2，观察，不阻断） |
| F-28 | uninstall 失败回滚没有直接回归测试 | 未变：回滚回归测试仍只有 install 侧（`fix-t013.test.ts` F-19）；uninstall 侧行为经代码复核对称（`settingsRaw: Buffer` 精确字节），仍无故障注入证明 | OPEN（P2，不阻断） |
| F-29 | Vitest worker RPC 超时，根因仍 OPEN | 未变：根因仍 OPEN，只做缓解——证据重试由 3 升至 5（`1e029e3`），失败诊断改为读 `s0-gate.log` 尾部（工 2 `build.log` 证实旧 `??` 回退曾打出空诊断）；本轮审查员的三次重型运行（S0、npm test、证据 worktree）均一次通过，未命中抖动；但工 2 `build3.log` 中同一机制两连败已证实抖动仍在 | OPEN（P2，不阻断） |
| F-27 | uninstall 两条提前返回路径遗留 `.build/` | 仍关闭：`uninstall.ts` L111–119 两条提前返回路径均调用 `removeHookBuild()` 并如实报告 `hookBuildRemoved`；R1 已独立确认关闭 | **CLOSED** |
| F-23 | v1.1.0 规格目录未入库；工作树不干净 | 仍关闭：`00_control/v1.1.0/` 两文件已入库（`git ls-files` 确认）；审查员复跑产物已恢复，工作树干净 | **CLOSED** |
| R1-P2-04 | Drive 未找到独立 REVIEW_INDEX / REVIEW_PACK 归档 | 未变：仓库内 `reviews/REVIEW_INDEX.md` 与 `REVIEW_PACK_*.md` 俱在，但本轮未做 Drive 上传（评审只读、不对外发布）；Drive 侧归档仍缺，待 T014/Drive 归档时补 | OPEN（P2，不阻断） |

另两处代码阅读观察（不单独立项，不计 P2）：

- `s0-gate.ts` 的 FAIL 翻转路径中，rescan 结果只记入日志，未写回
  `privacy_second_pass.final_pass` 的内嵌计数。翻转只改 verdict/计数字样、
  不引入 canary，故 rescan 计数与首扫恒等，该不一致在可实现情形下
  不会发生；且 verdict 翻转为 FAIL 的处理本身正确。
- `runFrozenS0Evidence` 把仓库 `node_modules` 软链入证据 worktree。
  若冻结 commit 改了依赖而 `node_modules` 未同步，证据运行用的依赖
  会与冻结 commit 的 lockfile 不符。当前 `diff_proof` 使此类漂移可见
  （本轮 diff 仅含 S0 产物，无依赖改动），且该偏差已在代码注释中
  声明为与 clean-room 相同的无网络偏差；未来若冻结 commit 含依赖改动，
  应在冻结前重装 `node_modules`。

## 6. 遗留阻断 P1-R1-03（本次修复范围外，等 Sam 决定）

真实 Claude Code ≥v2.1.295 端到端验证仍未完成：本 VM 未安装 Claude Code
（`which claude` 无输出，与 R2 一致），三项真实触发验证
（Read → FRESH → Write allow/deny；PreCompact → EXPIRED → 重新读取；
Hook 崩溃/超时时 onFailure: "block" 是否真正阻止写入）仍为
`blocked_external`。合成 Hook 全链通过不能等同于真实宿主集成通过，
此项为产品的核心运行环境，须在有 Claude Code + 登录的机器上验证，
由 Sam 决定。

**本项单列，不计入 P0/P1/P2 计数；不得因它未修就把本次修复判为 FAIL。**
本次修复范围（P1-R1-01/02 + 新增 P2）的 verdict 只由 §2–§4 决定。

## 7. 问题总表（本轮）

| ID | 严重度 | 问题 | 状态 |
|---|---|---|---|
| P1-R1-01 | P1 | S0 证据没有绑定冻结 commit | **CLOSED**（§3：机制 + 工 2 实测 + HEAD targeted 测试） |
| P1-R1-02 | P1 | S0 隐私第二轮扫描没有覆盖最终文件（F-26 升级） | **CLOSED**（§2：代码 + 审查员复跑） |
| P1-R1-03 | P1（遗留阻断） | 真实 Claude Code 集成仍未验证 | **OPEN，范围外，等 Sam 决定**（§6；不计入计数） |
| R1-P2-01 | P2 | lease-machine.ts 存在两个 NUL 字节 | **CLOSED** |
| R1-P2-02 | P2 | dist.zip 启动器权限为 0770，而 source.zip 为 0755 | **CLOSED** |
| R1-P2-03 | P2 | Clean-room smoke 实际链接仓库 node_modules，没有真正执行独立 npm ci | **CLOSED** |
| F-11 | P2 | 计划书 7 处旧引用 + Fixture `v1.0.0 §5` 标注 | OPEN |
| F-12 | P2 | Oracle 三处边缘语义取自生产源码 | OPEN |
| F-13 | P2 | 冷启动样本为 Read 而非 Write | OPEN |
| F-25 | P2 | p95 轮间波动（观察） | OPEN |
| F-28 | P2 | F-19 卸载侧回滚无直接回归测试 | OPEN |
| F-29 | P2 | Vitest worker RPC 超时，根因仍 OPEN（只做缓解） | OPEN |
| R1-P2-04 | P2 | Drive 未找到独立 REVIEW_INDEX / REVIEW_PACK 归档 | OPEN |
| F-23 | P2 | v1.1.0 规格目录未入库；工作树不干净 | **CLOSED** |
| F-27 | P2 | uninstall 两条提前返回路径遗留 `.build/` | **CLOSED** |
| F-17 | P1 | 树外 Hook 无法解析 yaml/better-sqlite3 | **CLOSED**（R2 独立复现；本轮未动相关代码） |

**计数：P0 = 0，P1 = 0，P2 = 7**（OPEN 的 P2 为 F-11、F-12、F-13、
F-25、F-28、F-29、R1-P2-04；P1-R1-03 为遗留阻断，单列，不计入）。

审查员未修改任何生产源码、测试、Golden、Fixture 与 `00_control/`；
只新增 `reviews/` 文件；复跑改动的 S0 产物已恢复到 HEAD，
scratch worktree 已移除，工作树干净。
