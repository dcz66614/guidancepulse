# P025 GuidancePulse — T013 独立重审第 4 轮（R4，FIX-R2 复核）

- 审查员：独立重审员 R4（全新会话，与 R1/R2/R3 审查员无关；以下每一项数字均为本人亲自跑出的命令退出码、文件哈希与 Drive 下载结果，不采信协调员或以往报告的转述数字）
- 审查对象：冻结 commit `f4d2b2e7ba0698b793e8b3e70d843b6e32354f61`（简称 f4d2b2e）；FIX-R2 修复 commit `17a92a5`；上一冻结 `adba7af`
- 规格：v1.1.0；MIT；零真人；88h
- 审查时间：2026-11-15 20:12–20:21 GMT；工作目录 `~/workspace/p025-guidancepulse/`，HEAD 经 `git rev-parse` 核实为 f4d2b2e
- 审查范围：仅 FIX-R2 的全部内容（终审 R2 的 P1-R2-01 证据归档缺口、R2 §六 manifest 字段统一、R1-P2-04 状态文字同步）
- 审查方式：只读审查，未修改任何源码，未提交，未碰 GitHub，未安装、登录或伪造任何 Claude Code 证据

## 结论

**结论：PASS**

**P0 = 0，P1 = 0，P2 = 7**

**FINAL_VERDICT: PASS**

FIX-R2 的三项内容全部真正关闭：(a) manifest 顶层 `s0_gate` 与冻结证据逐项统一，两项新增 verify 检查均通过，本人重跑 `release:verify` 得 64/64 PASS；(b) R1-P2-04 状态文字在两处均已同步为 CLOSED，且 Drive R1 文件夹内三件归档文件俱在（本人逐个核对）；(c) P1-R2-01 的核心证据——Drive `s0-evidence/` 子文件夹内 9 个证据文件全部可独立取得，字节数与 SHA-256（JSON 文件因 CLI 0 字节问题改用 size + md5Checksum 元数据核对）9/9 一致，另 5 个顶层文件亦全部一致。本人重跑 S0 第二次得 PASS（p95=218.92ms，396/396）。唯一新增问题是 Drive 上 `s0-gate.log` 未放在 `logs/` 子文件夹下（见 R4-P2-01），为 P2 非阻断，不影响 9/9 内容核对。

---

## 一、修复 (a)：manifest 顶层 s0_gate 字段统一 —— 真正关闭

### 1.1 代码改动核实（`git show 17a92a5` 逐行读 diff）

`02_source/scripts/release-build.mjs`：

- `runFrozenS0Evidence()` 返回值新增 `full_tests`（取自 `gate.supporting_evidence.test_full` 的 passed/failed/files），属实；
- manifest 顶层 `s0_gate` 的 verdict/p95/canonical_replay_sha256/full_tests/generated_at_utc 改为取自冻结证据运行 `s0Evidence`，仅在 `s0Evidence` 不可用时才回退到树内门 `s0`，属实；
- `evidence` 字段文案改为“the values above ARE this run”，`in_tree_evidence` 文案改为“it is NOT the source of the values above”，属实。

`02_source/scripts/release-verify.mjs` §7b 新增两项检查，属实：

- 顶层 `s0_gate` 与冻结证据的 verdict/p95/canonical/generated_at_utc 一致；
- 顶层 `s0_gate.full_tests` 与证据 S0_GATE.json 的 `supporting_evidence.test_full` 一致。

### 1.2 新冻结 manifest 逐项一致性（本人用 Python 程序化比对，非目测）

| 检查项 | 结果 |
|---|---|
| `frozen_commit` == f4d2b2e7ba0698b793e8b3e70d843b6e32354f61 | PASS |
| `s0_evidence.git_commit` == `frozen_commit` | PASS |
| 顶层 verdict == `s0_evidence.verdict` == 证据 S0_GATE.json verdict（PASS） | PASS |
| 顶层 p95 == `s0_evidence.p95` == 证据门实测 p95（`p95=217.64ms (n=100, …)`） | PASS |
| 顶层 canonical == `s0_evidence.canonical_replay_sha256` == 证据值（`ef06d30f…`） | PASS |
| 顶层 generated_at_utc == `s0_evidence.generated_at_utc` == 证据值（`2026-11-15T20:10:06.363Z`） | PASS |
| 顶层 full_tests == `s0_evidence.full_tests`（396/0/22） | PASS |
| full_tests == 证据 `test_full`（passed 396 / failed 0 / files 22） | PASS |
| `source.zip` bytes/sha（3,004,347 B，`bc607d94…`） | PASS |
| `dist.zip` bytes/sha（669,625 B，`304a7c2e…`） | PASS |

R2 §六指出的一致性问题（顶层 213.76ms vs evidence 301.09ms）已不存在：本轮顶层与 evidence 均为 217.64ms，逐字相同。

### 1.3 亲自跑 `release:verify`

- 首次运行（与本人 S0 重跑并行）：63 项 PASS，1 项 FAIL——`working tree matches frozen commit (except release/)`。该 FAIL 是本人并行运行 S0 污染了工作树（`02_source/artifacts/s0/` 被 S0 写入）所致，不是冻结产物问题；两项 FIX-R2 新检查在该次运行中已均为 [PASS]。
- 清理后重跑（`git checkout -- 02_source/artifacts`，删 `.hook-build/`、`.perf-fixture/` 残留，`git status` 仅剩未跟踪的 `release/`）：**64 个 [PASS]，0 个 [FAIL]，`release:verify PASS — frozen f4d2b2e…`**。完整日志：`~/workspace/p025-fix-r2-tmp/verify-r4.log`。
- 两项新检查在本人重跑日志中均为 [PASS]（见上表 1.2 的逐字值亦可佐证）。

**判断：修复 (a) 真正关闭。**

---

## 二、修复 (b)：R1-P2-04 状态文字同步为 CLOSED —— 真正关闭

### 2.1 两处文件文字核实

- `reviews/REVIEW_INDEX.md` L175：R1-P2-04 状态为 `**CLOSED**（2026-11-15 FIX-R2 同步：Drive 04_release/T014_R1_2026-11-15_adba7af 内含 REVIEW_INDEX.md、T013_FINAL_REVIEW_R3.md、REVIEW_PACKS.zip，9/9 回读核对通过；终审 R2 亦独立确认归档层面 CLOSED）`。属实。
- `02_source/release/T014_FREEZE_REPORT_R1.md`（该文件已在冻结 commit 中移出跟踪，本人用 `git show 17a92a5:…` 读取）：三处提及 R1-P2-04 均已改为 CLOSED（L199 表格行、L224 汇总行、L257 要点行），每处均注明“2026-11-15 FIX-R2 状态同步修正”及理由。属实。
- `git show 17a92a5` 的 diff 证实该文件在 FIX-R2 中仅改了 R1-P2-04 相关 3 行文字（另 2 行行尾标点），未动任何哈希链内数据；文件自述“叙述性文档，不在 SHA256SUMS / manifest 哈希链内”，属实。

### 2.2 所述理由的独立核实（Drive R1 文件夹 `1JflHGsoZ_F3NX4pp4O_wQtffmklXQnJF`）

本人用 `drive files list` 逐项列出该文件夹，确认三件文件俱在：

| 文件 | 大小 | md5Checksum（Drive） | 核对 |
|---|---|---|---|
| REVIEW_INDEX.md | 17,206 B | 9d4731318d84118f12a8de9f78ae312e | 与本地 HEAD 版 md5 完全一致 |
| T013_FINAL_REVIEW_R3.md | 22,871 B | eebfe93895db7f800b07462a82ad38c6 | 在列 |
| REVIEW_PACKS.zip | 53,310 B | 2b950599a7ceff7d5be5060a13a92fa2 | 在列 |
| （同文件夹另有）T014_FREEZE_REPORT_R1.md | 21,233 B | 见下 | 本人下载后与 `git show 17a92a5` 版逐字节 diff 为 0，md5 eebfe938… 一致 |

补充说明：首次 `files list` 返回的 T014_FREEZE_REPORT_R1.md 的 md5（e4c6a9c9…）与实际下载文件不符；本人随后用单文件 `files get`（带 fields）重新查询，返回的 md5 为 eebfe938…，与下载文件及 git 版三方一致。判定为列表接口返回的快照 md5 过时，不是文件本身问题。R1-P2-04 所依赖的“Drive 内确实有三件文件”这一事实不受影响。

**判断：修复 (b) 真正关闭。理由属实。**

---

## 三、P1-R2-01 核心证据：Drive s0-evidence 9/9 独立核对 —— 9/9 通过

Drive 位置：release 文件夹 `T014_R2_2026-11-15_f4d2b2e`（id `149D7McRYEx6MaikZYtEWhFMt0rS2jzdx`，位于 04_release 文件夹 `1-QrdC2we1HRd4kjliVo4PbHNQlzDpG6s` 下），其下 `s0-evidence/` 子文件夹（id `1hUf94wh0usFjmLDP_Xspnj7muidhQVhR`）。本人用 `drive files list` 确认顶层 5 文件 + `s0-evidence/` 子文件夹结构存在，逐个下载全部 14 个文件到 `~/workspace/p025-fix-r2-tmp/drive-r4/` 并核对。

### 3.1 核对方式说明（先写明方法，再列结果）

- 已知工具坑如实发生：8 个 `application/json` 文件用 CLI 下载时全部返回 0 字节空文件（RELEASE_MANIFEST.json、S0_GATE.json、fixture-results.json、oracle-results.json、perf-hook.json、repeat-hashes.json、privacy-scan.json、network-scan.json）。这是 CLI/Drive 的序列化问题，不是文件损坏——本人改用 Drive 元数据核对（`files list` 返回的 size + md5Checksum 与本地文件 md5 逐个比对），8/8 一致。
- 其余 6 个非 JSON 文件下载成功，SHA-256 与本地/manifest 逐个比对，6/6 一致；其中 source.zip、dist.zip 的 SHA-256 与 manifest 记录完全一致。
- 本地 9 个证据文件与 manifest `s0_evidence.files` 的 bytes + sha256，本人另用 Python 逐个比对，9/9 一致（见 §六）。

### 3.2 9 个证据文件逐项结果

| 文件（Drive 内路径） | 字节 | SHA-256 前 12 位（本地/manifest） | 核对方式 | 结论 |
|---|---|---|---|---|
| S0_GATE.json | 8,994 | e2906806db19 | size + md5（JSON 下载 0 字节，改用元数据） | PASS |
| S0_GATE.md | 2,350 | 0fd84c3ac43b | 下载文件 SHA-256 | PASS |
| fixture-results.json | 187,747 | 79daa09bbf4a | size + md5（JSON 下载 0 字节，改用元数据） | PASS |
| oracle-results.json | 48,427 | 712e024d5bf6 | size + md5（JSON 下载 0 字节，改用元数据） | PASS |
| perf-hook.json | 2,882 | caa019398b69 | size + md5（JSON 下载 0 字节，改用元数据） | PASS |
| repeat-hashes.json | 7,476 | 1fe3e5429e6a | size + md5（JSON 下载 0 字节，改用元数据） | PASS |
| privacy-scan.json | 4,587 | 83a3f33416c1 | size + md5（JSON 下载 0 字节，改用元数据） | PASS |
| network-scan.json | 415 | d93b0840e778 | size + md5（JSON 下载 0 字节，改用元数据） | PASS |
| s0-gate.log（见 §3.4 路径说明） | 1,816 | dd85c74d7a88 | 下载文件 SHA-256 | PASS |

**Drive s0-evidence 核对：9/9 通过。**

### 3.3 顶层 5 文件逐项结果

| 文件 | 字节 | SHA-256 前 12 位 | 核对方式 | 结论 |
|---|---|---|---|---|
| source.zip | 3,004,347 | bc607d947df7 | 下载文件 SHA-256，与 manifest 一致 | PASS |
| dist.zip | 669,625 | 304a7c2e60b8 | 下载文件 SHA-256，与 manifest 一致 | PASS |
| RELEASE_MANIFEST.json | 8,306 | 577c60aa394c（本地文件 SHA-256） | size + md5（JSON 下载 0 字节，改用元数据；本地 md5 7d184534… 与 Drive 一致） | PASS |
| SOURCE_MANIFEST.csv | 32,549 | 7f4975bc6f83 | 下载文件 SHA-256 | PASS |
| SHA256SUMS.txt | 1,284 | f0b96bf8795b | 下载文件 SHA-256 | PASS |

合计 14/14 文件（9 证据 + 5 顶层）全部与本地/manifest 一致。P1-R2-01 所述“9 份证据有 4 份原始文件无法从当前 Drive 归档取得”在本轮已不存在。

### 3.4 路径偏差（新增 P2，见 R4-P2-01）

Drive 的 `s0-evidence/` 内**没有 `logs/` 子文件夹**：本人用 `files list`（`mimeType = 'application/vnd.google-apps.folder' and '1hUf94wh…' in parents`）查询返回空；9 个文件全部平铺在 `s0-evidence/` 下，其中 `s0-gate.log` 位于 `s0-evidence/s0-gate.log`，而不是 manifest/SHA256SUMS 记录的 `s0-evidence/logs/s0-gate.log`。文件内容本身无误（字节数、md5、SHA-256 均与本地 `logs/s0-gate.log` 一致），9/9 内容核对不受影响；但按记录路径查找的复核者会在 Drive 上找不到 `logs/` 这一层。记为新增 P2（非阻断）。

---

## 四、亲自重跑 S0

命令：`cd 02_source && TMPDIR=~/workspace/p025-fix-r2-tmp npm run s0:gate`（TMPDIR 指到持久磁盘，未用 /tmp）。按 R3 惯例，F-29 抖动时最多重试 5 次。

### 第 1 次（2026-11-15 20:12:57–20:15:17 UTC）：verdict FAIL，但属于已知的 F-29 抖动

- 退出码 1；`npm test exit=1 passed=396 failed=0 files=22`——396 个测试全部通过、0 失败，仅退出码非 0；
- 7 个门逐项全部 PASS：parity 48/48、检测 32/32、控制 16/16、p95=203.07ms、100 次重放唯一哈希 1 个（`ef06d30f…`，与冻结证据相同）、网络 0、隐私 0；
- 门脚本据此把 supporting-evidence 判为 tests=FAIL，整体 verdict FAIL。这是 R3 已记录的 F-29（Vitest worker RPC 超时）签名：测试本身 0 失败，门因退出码失败。本人未把这次运行当作产品失败，也未修改任何代码，直接按既定重试惯例重跑。

### 第 2 次（2026-11-15 20:15:33–20:17:30 UTC）：verdict PASS，退出码 0

- **verdict: PASS；p95=218.92ms**（n=100，p50=160.09ms，p99=271.82ms，min=149.10ms，max=374.54ms，cold_start=374.54ms，run_failures=0）；**全量测试 396 passed / 0 failed / 22 files**；typecheck exit 0；golden 53/53；oracle 48/48；
- 7 个门全部 PASS：parity 48/48、检测 32/32、控制 16/16、p95 218.92ms <500ms、100 次重放唯一哈希 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（与冻结证据逐字相同）、网络调用点 0、隐私 canary 0；
- 写入 `artifacts/s0/S0_GATE.json`（8,926 B，sha256 `8275d8ae…`）、`S0_GATE.md`（2,350 B），read_back_match=true。

### 与冻结证据交叉核对

- 冻结证据 p95=217.64ms；本人两次重跑 p95 分别为 203.07ms 与 218.92ms——三者均 <500ms 阈值，差异在 VM 负载波动范围内（F-25 观察仍成立）；
- canonical replay hash 三次完全一致（`ef06d30f…`）；
- 全量测试三次均为 396/396。

跑完后已把 `02_source/artifacts/` 恢复到 HEAD（`git checkout -- 02_source/artifacts`，并删除 `.hook-build/`、`.perf-fixture/` 残留）；结束时 `git status` 仅剩未跟踪的 `02_source/release/`，工作树干净。

---

## 五、P1-R1-03（真实 Claude Code E2E）—— 单列，不计入计数

- 仍为 `blocked_external`，本轮范围外。本 VM 无 Claude Code（冻结报告草稿亦记录 `which claude` 无输出，与 R2 一致）；本人未尝试安装、登录或伪造任何 Claude Code 证据。
- 冻结报告草稿 `02_source/release/T014_FREEZE_REPORT_R2.md`（未跟踪，不在冻结 commit 内）设专节“遗留阻断 P1-R1-03（本次修复范围外，等 Sam 决定）”，明确写“本项单列，不计入 P0/P1/P2 计数”，并列出三项待验证内容（Read→FRESH→Write、PreCompact→EXPIRED、Hook 崩溃/超时时 onFailure: "block"）；`reviews/REVIEW_INDEX.md` L165 同样记为“OPEN，范围外，等 Sam 决定（不计入计数）”。如实单列，属实。
- 不得因它未修就把本次 FIX-R2 修复判 FAIL，也不得把它算成已通过：本结论 PASS 仅针对 FIX-R2 范围（P1-R2-01、字段统一、R1-P2-04），不构成完整产品验收通过。
- 另如实记录分歧：终审 R2 明确拒绝了 R3 的范围排除处理、把此项计为剩余 P1（完整产品验收层面）；冻结报告草稿亦承认“这是终审裁决层面的分歧，不由本冻结解决；如 Sam 提供真机则补验证，否则终审 R3 由 GPT 再次裁决”。本轮不替终审裁决。

---

## 六、其余一致性抽查

- `sha256sum -c release/SHA256SUMS.txt`（须在 `02_source/` 下运行，条目路径以 `release/` 开头；本人在 `release/` 内误跑一次得 13 个 FAILED open or read，属路径用法错误，纠正后重跑）：**13/13 OK**，退出码 0。
- source.zip 3,004,347 B（sha `bc607d947df7ea9906df6af557cffe02993f8022695e2045afa31a9b6a5f7ed7`）、dist.zip 669,625 B（sha `304a7c2e60b8796d5ba1a758ff4bd416349e53cfc4c9da5777ef83ec5ed5eb1f`，与 R1 相同，确定性结果），均与 manifest 一致。
- manifest 的 `frozen_commit` 与 `s0_evidence.git_commit` 均为 f4d2b2e7ba0698b793e8b3e70d843b6e32354f61。
- 本地 9 个证据文件与 manifest `s0_evidence.files` 的 bytes + sha256 程序化比对 9/9 PASS（见 §1.2 末行逐项表）。
- 参考日志（仅作参考，本人亲自跑出的结果才算数）：`~/workspace/p025-fix-r2-tmp/build-r2.log` 末行 `release:build PASS — frozen f4d2b2e…`；`~/workspace/p025-fix-r2-tmp/verify-r2b.log` 末行 `release:verify PASS`，本人清点其中 64 个 [PASS]，与本人重跑的 64/64 一致。

---

## 七、OPEN 的 P2 清单（P2 = 7）

沿用 R3 的 6 项（本人抽查确认状态未变）+ 新增 1 项：

| ID | 问题 | 本轮抽查 | 状态 |
|---|---|---|---|
| F-11 | 计划书旧章节引用、Fixture/Golden/Oracle 仍标注 v1.0.0 §5 | `00_control/IMPLEMENTATION_PLAN.md` 仍含 v1.0.0 规格版本表（L988）；旧编号引用未变 | OPEN（P2，不阻断） |
| F-12 | Oracle 三处边缘语义参考生产源码 | `reference_oracle.py` 头注释仍自述“reading the production sources only as a semantic [reference]”；三向 48/48 中两路仍独立 | OPEN（P2，不阻断） |
| F-13 | 冷启动样本是 Read 而不是 Write | `perf-hook.ts` `seedInput()` 仍为 PostToolUse Read | OPEN（P2，不阻断） |
| F-25 | p95 随 VM 负载波动 | 本轮三跑 p95 为 217.64（冻结证据）/ 203.07 / 218.92ms，均 <500ms；波动观察仍成立 | OPEN（P2，观察，不阻断） |
| F-28 | uninstall 失败回滚没有直接回归测试 | `fix-t013.test.ts` 的 rollback 用例仍只在 install 侧（F-19 失败安装恢复）；uninstall 侧仍无故障注入证明 | OPEN（P2，不阻断） |
| F-29 | Vitest worker RPC 超时，根因仍 OPEN | 本轮 S0 第 1 次重跑即命中（`npm test` exit 1、396 passed / 0 failed）；第 2 次一次通过；根因仍未解决，只做重试缓解 | OPEN（P2，不阻断） |
| **R4-P2-01（新增）** | Drive `s0-evidence/` 内无 `logs/` 子文件夹，`s0-gate.log` 平铺在子文件夹顶层，与 manifest/SHA256SUMS 记录的 `release/s0-evidence/logs/s0-gate.log` 路径不一致 | 本人用文件夹查询核实无 `logs/` 子文件夹；文件内容本身 9/9 核对无误（字节、md5、SHA-256 均一致） | OPEN（P2，不阻断） |

R3 的 P2=7 中 R1-P2-04 已由 FIX-R2 关闭（见 §二）；新增 R4-P2-01 后 P2 总数仍为 7。

**计数：P0 = 0，P1 = 0，P2 = 7**（OPEN 的 P2 为 F-11、F-12、F-13、F-25、F-28、F-29、R4-P2-01；P1-R1-03 为遗留阻断，单列，不计入）。

---

## 八、发现的新问题

除 R4-P2-01（Drive `s0-gate.log` 路径平铺、无 `logs/` 子文件夹，P2 非阻断）外，**无新问题**。

另记两项方法学观察（不计为问题）：

1. 本轮 `release:verify` 首次运行因本人并行跑 S0 污染工作树而出现 1 项 FAIL；清理后重跑 64/64 PASS。已如实披露，不影响结论。
2. Drive `files list` 对 R1 文件夹的 T014_FREEZE_REPORT_R1.md 返回的 md5 快照过期（与实际文件不符）；单文件查询与实际下载均证实文件正确。属列表接口快照问题，不是归档问题。

---

## 九、证据索引（本人亲自跑出的命令与文件）

- 冻结 commit：`git rev-parse HEAD` = f4d2b2e7ba0698b793e8b3e70d843b6e32354f61；结束时 `git status` 仅 `?? 02_source/release/`。
- FIX-R2 diff：`git show 17a92a5`（release-build.mjs +45/−? 行、release-verify.mjs +25 行、REVIEW_INDEX.md、T014_FREEZE_REPORT_R1.md、P025_FINAL_REVIEW_R2.md）。
- S0 重跑日志：`~/workspace/p025-fix-r2-tmp/s0-r4.log`（第 1 次，FAIL，F-29 抖动）、`~/workspace/p025-fix-r2-tmp/s0-r4b.log`（第 2 次，PASS，p95=218.92ms，396/396）。
- release:verify 日志：`~/workspace/p025-fix-r2-tmp/verify-r4.log`（64 [PASS]，0 [FAIL]，`release:verify PASS`）。
- Drive 下载核对文件：`~/workspace/p025-fix-r2-tmp/drive-r4/`（14 个文件；8 个 JSON 为 0 字节空文件，系 CLI 已知问题，改用元数据核对）。
- 参考日志（仅参考）：`~/workspace/p025-fix-r2-tmp/build-r2.log`（`release:build PASS`）、`~/workspace/p025-fix-r2-tmp/verify-r2b.log`（`release:verify PASS`，64 [PASS]）。
