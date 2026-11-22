# P025 GuidancePulse — T013 独立重审第 7 轮（R7，FIX-R6 复核）

- 审查员：独立重审员 R7（全新会话，与 R1–R6 审查员无关；以下每一项数字均为本人亲自跑出的命令退出码、文件哈希、测试输出与 Drive 下载结果，不采信协调员或以往报告的转述数字）
- 审查对象：冻结 commit `4216d962328a15a432de534947d6a56483dccd7d`（简称 4216d96）；release commit `fb4d8087babd73f390a6a58a0904f8771412bb2e`（简称 fb4d808）；上一冻结 `17cbd1e26aa3877e8e48f3584ccc3d617b8c7008`（简称 17cbd1e）保持未动（`git rev-parse 17cbd1e` 仍为该哈希，无改写）
- 规格：v1.1.0；MIT；零真人；88h
- 审查时间：2026-11-17 03:36–03:50 GMT；工作目录 `~/workspace/p025-guidancepulse/`，HEAD 经 `git rev-parse` 核实为 d0b00c2（handoff commit，在 release commit fb4d808 之上）
- 审查范围：FIX-R6 全部内容（终审 R6 的 R6-P2-01、R6-P2-02 修复）+ 主动寻找新绕过 + 冻结产物自洽性 + Drive 归档 + R6 结转的 P2（F-11/12/13/25/28、F-29 PARTIAL、R6-P2-03 流程项、R6-P2-04 冻结报告归档）
- 审查方式：只读审查，未修改任何源码/测试/配置/门逻辑与冻结产物，未提交 GPT 终审 R7，未碰 GitHub，未安装、登录或伪造任何 Claude Code 证据。唯一写入工作树的是两份临时探针测试（跑完即删）与本报告 `reviews/T013_FINAL_REVIEW_R7.md`；另建两个 detached worktree（4216d96 与 fb4d808）做冻结核实，跑完即删；结束时 `git status` 仅剩审查前已有的未跟踪文件

## 结论

**结论：PASS**

**P0 = 0，P1 = 0，P2 = 7**

结论：PASS

P0 = 0, P1 = 0, P2 = 7

**FINAL_VERDICT: PASS**

FIX-R6 关闭了终审 R6 的两项新 P2：R6-P2-01（尾随点/空格段，本人重跑 R6 全部探针 T1/T2 × Write/Edit、绝对与相对两种拼写，全部 DENY exit 2）与 R6-P2-02（drive-rooted 拼写，本人重跑 R1/R2/R3 × Write/Edit，全部 DENY exit 2；UNC cwd 下 drive-rooted 按宣称 fail-closed，DENY exit 2）。S0 本人在精确冻结 commit 上重跑 PASS（p95=401.86ms，余量 98.14ms；489/489；canonical 哈希与冻结证据逐字相同）；`release:verify` 在 release commit 上重跑 64/64 PASS（首轮 58/64 是一次 /tmp 写满的环境事故，见 §六与 §十一 R7-OBS-02）；`sha256sum -c` 13/13 OK；Drive 15/15 核对通过（含冻结报告 .md，R6-P2-04 关闭）。本人主动 hunting 未在出厂默认配置下发现新的误放行；8.3 短文件名与 verify 的 /tmp 依赖各记一项不计数的观察（见 §十一）。无 P1，故结论 PASS。

---

## 一、R6-P2-01 与 R6-P2-02：真正关闭（diff 逐行核实 + R6 探针全量重跑）

### 1.1 修复代码核实（本人逐行读 diff，不采信转述）

`git show 8077c3c` 的生产改动确为**仅** `02_source/src/privacy/sanitize.ts`（+141/−16），新增测试仅 `02_source/tests/unit/fix-r6-path-spellings.test.ts`（34 个），与冻结报告、手册 §三的修复方向逐行一致：

- `stripWindowsTrailingDotsAndSpaces`：剥离单段尾随的全部空格/句点（`/[ .]+$/`）。属实。
- `normalizedSegments`：Windows-origin 路径逐段剥离；精确的 `.` / `..` 段保留原义（剥离会把 `..` 抹成空串）；剥离后为空的段（如 `...`、`.. `）按 `.` 折叠（跳过）——文档明确写这是 fail-closed 读法，只可能 over-deny。属实。
- `normalizeWindowsRelativeTarget`（新增）：相对目标在 Windows cwd 下走同样的剥离 + `.` / `..` 语义，逃出项目根返回 null。属实。
- `isDriveRootedPath`（新增）：前导 `/` 或 `\`、无盘符、非 UNC（`//` 开头除外）即 drive-rooted。属实。
- `resolveRelativeTargetPath`：drive-rooted 拼写在 Windows cwd 下先按 cwd 盘符补成 `C:/…` 再做前缀比较；UNC cwd 无盘符可补，抛 `SanitizeError` `DRIVE_ROOTED_PATH`（fail-closed）；POSIX cwd 不进该分支；相对目标在 Windows cwd 下走 `normalizeWindowsRelativeTarget`，否则走 `normalizeTargetPath`；`filePreserved` 改用补盘符后的 `target` 计算。属实。
- 大小写折叠（FIX-R5）与 drive-relative fail-closed（R5-P2-01）逻辑未动：diff 中无相关行改动。属实。

冻结 source.zip 内文件与工作树逐字节一致——`release:verify` 64/64 本身即从冻结 commit 重新生成并比对 source.zip 内容（本人在 release commit 上重跑，见 §六），不再另行解压核对。

### 1.2 本人重跑 R6 探针（临时探针，非产品代码）

本人写了一份临时探针测试 `02_source/tests/unit/r7-probe.test.ts`（与 `pre-tool-use.test.ts` 同款 harness/配置：规则 `auth-change-safety`，`applies_to: [src/auth/**, src/session/**]`，mode block；全新 `:memory:` store，**无任何 lease，即 UNSEEN**；cwd `C:\synthetic\project`），对 `handlePreToolUse`（真实门控入口）跑 R6 全部探针 + 对照组 + hunting 组，跑完即删文件。结果（日志 `~/workspace/p025-t013-r7-tmp/probe-r7.log`，52 行 `PROBE …` 原文）：

| # | 输入 `file_path`（Write，除注明外） | 结果 | 判定 |
|---|---|---|---|
| T1-abs | `C:\synthetic\project\src\session.\token.ts` | DENY，gated:true，exit 2，UNSEEN | 已修 |
| T1-rel | `src\session.\token.ts`（相对拼写） | DENY，gated:true，exit 2，UNSEEN | 已修 |
| T2-abs | `C:\synthetic\project\src\session \token.ts` | DENY，gated:true，exit 2，UNSEEN | 已修 |
| T2-rel | `src\session \token.ts`（相对拼写） | DENY，gated:true，exit 2，UNSEEN | 已修 |
| R1 | `/synthetic/project/src/session/token.ts` | DENY，gated:true，exit 2，UNSEEN | 已修 |
| R2 | `\synthetic\project\src\session\token.ts` | DENY，gated:true，exit 2，UNSEEN | 已修 |
| R3 | `/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS` | DENY，gated:true，exit 2，UNSEEN | 已修 |
| T1/T2/R1/R2/R3 | 上述 7 组（Edit） | 全部 DENY，gated:true，exit 2，UNSEEN | 已修 |
| 对照 | `C:\synthetic\project\src\session\token.ts`（规范拼写） | DENY，gated:true，exit 2，UNSEEN | 门控正常 |
| 对照 | FRESH 租约下 `C:\SYNTHETIC\PROJECT\src\SESSION\token.ts` Write | ALLOW，exit 0，state FRESH | 无误拒 |
| 对照 | 项目外 `C:\synthetic\other\src\session\token.ts` Write | ALLOW，gated:false，exit 0 | 正确 |
| 对照 | POSIX cwd 下 `/SYNTHETIC/project/...` 与 `src/session./token.ts` | 均 ALLOW，gated:false | 无过度折叠/剥离 |
| 对照 | `.` 段、`..` 回绕（`src\session\..\session\token.ts`） | 均 DENY exit 2 | 正常 |

R6 探针重跑 **14/14 DENY**（T1/T2 绝对+相对 × Write/Edit = 8，R1/R2/R3 × Write/Edit = 6），对照组全部正确。**判断：R6-P2-01 与 R6-P2-02 真正关闭。**

### 1.3 UNC cwd 下 drive-rooted 按宣称 fail-closed

同一探针，cwd `\\server\share\project`：`/src/session/token.ts` × Write/Edit 全部 DENY、gated:true、exit 2（fail-closed 抛错路径，per-rule states 为空，与 `C:foo` 的 drive-relative 路径一致）；UNC 规范目标与 UNC 下的尾随点拼写亦 DENY。冻结报告称“UNC 下 fail-closed（新码 `DRIVE_ROOTED_PATH`）”属实——错误码本身由 `tests/unit/fix-r6-path-spellings.test.ts` L258 的 `toThrowError(/DRIVE_ROOTED_PATH/)` 断言锁定，该文件本人重跑 34/34 通过。

### 1.4 FIX-R6 相关测试重跑

本人重跑 6 个文件（任务所列 5 文件 + FIX-R6 新文件），**268/268 通过**：`privacy-sanitizer` 45、`pre-tool-use` 49、`hooks-adapter` 43、`path-matcher` 19、`config` 78（此 5 文件合计 234，与 R6 的 234/234 口径一致）、`fix-r6-path-spellings` 34（日志 `~/workspace/p025-t013-r7-tmp/fixr6-files.log`）。

---

## 二、本人主动 hunting：默认配置下无新误放行

除 R6 探针外，本人在同一探针里另试多组拼写（UNSEEN，cwd `C:\synthetic\project`，除注明外均为 Write）。除 §十一的 8.3 观察外，**全部与预期一致**：

| 组 | 输入 | 预期 | 实测 | 判定 |
|---|---|---|---|---|
| 混合大小写 + 尾随点/空格 | `C:\SYNTHETIC\PROJECT\src\SESSION.\token.ts`、`C:\Synthetic\Project\src\Session \Token.ts`、`/SYNTHETIC/PROJECT/src/session./token.ts`、`\synthetic\project\src\SESSION \token.ts`、`C:\...\src.\session\token.ts`、`C:\...\src\session\.. \session\token.ts` | DENY | 全部 DENY exit 2 gated:true | 已堵住 |
| `...` 段 | `C:\...\src\session\...\token.ts`、`src\session\... \token.ts` | DENY | 均 DENY exit 2 | 已堵住（剥离成空按 `.` 折叠） |
| `.. ` 段 | `C:\...\src\session\.. \token.ts` | 见下 | DENY exit 2 gated:true | 见下（over-deny，安全方向） |
| 重复分隔符 / 混合斜杠 / cwd 尾随反斜杠 | `C:\...\project\\src\\session\token.ts`、`C:/synthetic/project\src/session/token.ts`、cwd `C:\synthetic\project\` + 规范目标 | DENY | 全部 DENY exit 2 | 已堵住 |
| 双斜杠开头 | `//synthetic//project//src//session//token.ts` | ALLOW（正确） | ALLOW gated:false | 正确——这是 UNC（server=synthetic，share=project），不是 C: 盘路径 |
| `\/` 开头 | `\/synthetic\project\src\session\token.ts` | ALLOW（正确） | ALLOW gated:false | 正确——本人用 Node `path.win32.resolve` 独立验证，该拼写解析为 UNC `\\synthetic\project\src\session\token.ts`，不是 C: 盘路径 |
| drive-relative 回归 | `C:src\session\token.ts` | DENY | DENY exit 2 | R5-P2-01 仍关闭 |
| 文件名尾随点/空格 | `...\token.ts.`、`...\token.ts ` | DENY | 均 DENY exit 2 | 正常（glob `**` 吞掉） |
| 8.3 短文件名 | `src\SESSIO~1\token.ts`（Write/Edit，绝对+相对） | 见 §十一 | ALLOW gated:false | 见 §十一（非误放行，记观察） |

**关于 `.. ` 段（本人首版探针曾误判后纠正，记录在案）：** 本人最初预期 `.. ` 剥离后读作 `..`、应解析到 `src/token.ts`（项目内但不受保护）而 ALLOW；实测 DENY。本人用 resolver 级探针核实机理：`resolveRelativeTargetPath("C:\...\src\session\.. \token.ts")` 返回 `"src/session/token.ts"`——因为 `.. ` 整段只由点与空格组成，`/[ .]+$/` 把它整体剥成空串，按 `.` 折叠（跳过），而不是读作 `..`。这正是冻结报告与 `sanitize.ts` 注释写明的“剥离后为空的段按 `.` 折叠（fail-closed 读法）”——真实 Win32 会把 `.. ` 读作 `..`（指向不受保护的 `src/token.ts`），门控 DENY 它属于 over-deny（多拦了一次本可放行的写），安全方向，不是绕过。精确的 `..` 段语义未动（`src\session\..\token.ts` 仍解析为 `src/token.ts`，resolver 级核实）。

**判断：默认配置下无新误放行。** 8.3 一项见 §十一（观察，不计入 P2）。

---

## 三、R6-P2-04：真正关闭（冻结报告已随产物归档进 Drive）

- Drive R5 文件夹 `04_release/T014_R5_2026-11-17_4216d96`（id `1luvYP-y8Py1iUPotg6TGyRu4O6dcKz26`）顶层现为 6 个文件：5 个产物 + `T014_FREEZE_REPORT_R5.md`（id `1B25PCPav8J_YFaxyEF5-ifM3_0IQYTyR`，31,255 B）。属实。
- 本人从 Drive 下载该报告并比对 SHA-256：`8965b7d755b4104b…`，与交接文件记录的 `8965b7d7…` 一致；md5Checksum `b3e526fad06d80c603e1b0d75fe26d8c` 与本地一致。属实。
- R6-P2-04 的缺失情形（R4 文件夹无报告 .md）本轮不存在。

**判断：R6-P2-04 真正关闭。**

---

## 四、R6-P2-03：仍 OPEN（在当前 HEAD 上复现，机制与 R6 完全相同）

- 本人在当前 HEAD（d0b00c2）上重跑 `npm run release:verify`（TMPDIR 指到持久磁盘，见 §六）：**63 个 [PASS]，1 个 [FAIL]**，退出码 1（日志 `~/workspace/p025-t013-r7-tmp/verify-r7-head.log`）。唯一失败项仍是 `working tree matches frozen commit (except release/)`。
- 失败原因已精确定位（本人从仓库根实测）：`git diff --stat 4216d96 HEAD -- . ':!02_source/release'` 的唯一差异是 handoff commit d0b00c2 新增的 `00_control/HANDOFF_T014_R5.md`（43 行）。除此一项外，其余 63 项（含 source.zip 与冻结 commit 树的逐字节比对、manifest、T013 引用、dist smoke）在 HEAD 上亦全部通过。
- 同一 verify 在 release commit fb4d808 上为 64/64 PASS（见 §六）。冻结报告称“verify 64/64”在当时（release commit 时）为真；但任何人在当前 HEAD 上重跑 verify 都会得到 63/64 + FAIL 退出码。

**判断：R6-P2-03 仍 OPEN**（P2，流程，不阻断产品门控；与 R6 的定性一致）。

---

## 五、亲自重跑 S0：PASS，p95=401.86ms（精确冻结 commit，detached worktree）

命令：新建 detached worktree 于精确冻结 commit `4216d96`（`~/workspace/p025-t013-r7-tmp/wt-4216d96`，`node_modules` 按冻结流程软链自主工作树；`diff_proof` 中无 `package.json` / `package-lock.json` 改动，故无漂移），`cd 02_source && TMPDIR=~/workspace/p025-t013-r7-tmp npm run s0:gate`（单次，未重试；日志 `~/workspace/p025-t013-r7-tmp/s0-r7.log`；worktree 跑完即删）。

- **verdict: PASS；退出码 0。p95=401.86ms**（n=100，p50=292.27ms，p99=498.87ms，min=155.23ms，max=1839.57ms，cold_start=1839.57ms，cold_start_sample_index=0，run_failures=0）——通过阈值（<500ms），余量 **98.14ms**。
- `environment.git_commit` = `4216d962328a15a432de534947d6a56483dccd7d`（精确冻结 commit，非 HEAD）。
- 全量测试 **489 passed / 0 failed / 23 files**；typecheck 0 错误；golden 53/53；oracle 48/48；七门全部 PASS：parity 48/48、检出 32/32、控制 16/16、100 次重放唯一哈希 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（与冻结证据逐字相同）、网络 0、隐私 0（含三轮 0 命中）。
- 0 次 `Timeout calling "onTaskUpdate"`（F-29 未触发，见 §九）。

**判断：S0 门本身 PASS，数值真实。** 但 p95 本轮 401.86ms 是有记录以来第二紧的值（仅次于 R5 审查员自跑的 497.40ms 与 R3 树内门的 492.69ms），且 p99=498.87ms 已贴近 500ms 线、冷启动单样本达 1839.57ms——阈值看的是 p95，p99 与冷启动不计入判定，但这组数说明 F-25 的负载波动仍在，余量并不宽裕（见 §九）。

p95 轮间值现为 213.76 / 216.31 / 226.51 / 217.64 / 218.92 / 203.07 / 256.07 / 492.69 / 297.30 / 497.40 / 358.93 / 360.22 / 396.58 / 228.95 / 197.95 / 199.75 / **401.86**ms（本人新增最后一点），仍全部 <500ms。

---

## 六、发布产物核对：release commit 上 verify 64/64；当前 HEAD 上 63/64（见 §四）

### 6.1 在 release commit 上重跑：64/64 PASS

本人在 detached worktree（`~/workspace/p025-t013-r7-tmp/wt-fb4d808`，HEAD = release commit fb4d808，跑完即删）上重跑 `npm run release:verify`（TMPDIR 指到持久磁盘）：**64 个 [PASS]，0 个 [FAIL]**，末行 `release:verify PASS — frozen 4216d962328a15a432de534947d6a56483dccd7d`，退出码 0（日志 `~/workspace/p025-t013-r7-tmp/verify-r7-release2.log`）。其中含两处 clean-room CLI smoke（source.zip 与 dist.zip 各 `init → install → status → uninstall` 全部 exit 0）。

### 6.2 首轮 58/64 是 /tmp 写满的环境事故，不是产物问题（见 R7-OBS-02）

首轮 verify（未设 TMPDIR，`/tmp` 为 512M tmpfs，当时已用 356M、剩 157M）得 58/64，6 个 [FAIL] 全部是 clean-room 步骤报 `ENOSPC: no space left on device`（`npm ci` 解包写满 /tmp 所致；日志 `verify-r7-release.log`）。前 58 项（含全部内容/manifest/S0 比对）当时已通过。改设 `TMPDIR=~/workspace/p025-t013-r7-tmp`（持久磁盘）后重跑即 64/64。服务重启后 /tmp 被清空（0% 已用），进一步证实这是 tmpfs 容量问题。

### 6.3 其余产物核对（全部由本人独立做出）

- `sha256sum -c release/SHA256SUMS.txt`（自 `02_source/` 根运行）：**13/13 OK**，退出码 0。
- `unzip -t release/source.zip` 与 `unzip -t release/dist.zip`：均为 `No errors detected`，退出码 0。
- 五个产物文件字节 + SHA-256 与冻结报告表逐字一致：source.zip 3,080,620 B `9aa4d786…`、dist.zip 688,475 B `c77c4224…`、RELEASE_MANIFEST.json 9,291 B `6ef6c413…`、SOURCE_MANIFEST.csv 32,717 B `e2946d9b…`、SHA256SUMS.txt 1,284 B `eefa8c85…`。
- source.zip 247 条目、dist.zip 57 条目、SOURCE_MANIFEST.csv **211 行**（210 文件 + 1 表头），与冻结报告一致；verify 日志亦确认 csv 从冻结 commit 重新生成逐字节相同、210 行。
- `npm run release:build` **未由本人重跑**，理由同 R6：build 不是只读操作——它会重新跑完整 S0 证据并重打 source.zip/dist.zip、重写 manifest 与 SHA256SUMS，从而覆盖正在审查的冻结产物本身；重跑 build 等于销毁审查对象。替代核对：冻结 build 44/44 采信冻结 build 流程，其全部输出已由本人逐项独立核对无差异（见上），且 `release:verify` 64/64（release commit 上）本身即从冻结 commit 重新生成并比对 source.zip 内容。

---

## 七、Drive 归档：15/15 独立核对通过

Drive 位置：`04_release/T014_R5_2026-11-17_4216d96`（id `1luvYP-y8Py1iUPotg6TGyRu4O6dcKz26`），其下 `s0-evidence/` 子文件夹（id `1SKa71-Acug6VRZTZSSAzfv79J7S3ttcW`）与 `logs/` 子文件夹（id `1GKG0g1HhUmZ_FRMFkD0Pv9lNTyb_5vgM`，位于 `s0-evidence/` 内）。本人用 `drive files list` 逐项列出并逐个核对（元数据与下载文件在 `~/workspace/p025-t013-r7-tmp/drive/`）：

- 顶层 6 文件：source.zip、dist.zip、RELEASE_MANIFEST.json、SOURCE_MANIFEST.csv、SHA256SUMS.txt、T014_FREEZE_REPORT_R5.md——Drive 元数据 size + md5Checksum 与本地逐个一致（6/6）。
- `s0-evidence/` 8 文件：S0_GATE.json、S0_GATE.md、fixture-results.json、oracle-results.json、perf-hook.json、repeat-hashes.json、privacy-scan.json、network-scan.json——size + md5 逐个一致（8/8）。
- `logs/s0-gate.log`：位于 `s0-evidence/logs/` 下（R4-P2-01 的布局修正仍在，不再平铺），size + md5 与本地一致（1/1）。
- 另将 7 个非 JSON 文件逐个从 Drive 下载并比对 SHA-256：source.zip `9aa4d786…`、dist.zip `c77c4224…`、SOURCE_MANIFEST.csv `e2946d9b…`、SHA256SUMS.txt `eefa8c85…`、T014_FREEZE_REPORT_R5.md `8965b7d7…`、S0_GATE.md `77c257c4…`、s0-gate.log `ecd4eb67…`——7/7 与本地/manifest 一致。8 个 JSON 文件下载时返回 0 字节（CLI 已知问题，R4/R5/R6 同样遇到），改用元数据核对，8/8 一致。

**Drive 核对：15/15 通过**（按任务口径：顶层 5 + 冻结报告 1 + s0-evidence 8 + logs 1；本人实际下载比对了 7 个非 JSON 文件，多于任务要求的 6 个）。

---

## 八、Manifest 核对：自洽，审查引用如实

本人用 Python 程序化读取 `release/RELEASE_MANIFEST.json`（非目测）：

- `frozen_commit` = `4216d962328a15a432de534947d6a56483dccd7d`。属实。
- 顶层 `s0_gate` 与 `s0_evidence` 的 verdict/p95/canonical/full_tests/generated_at_utc **逐字一致**（verdict PASS；p95 均为 `p95=199.75ms (n=100, p50=169.42ms, …)`；canonical 均为 `ef06d30f…`；full_tests 均为 489/0/23；generated 均为 `2026-11-17T03:30:33.554Z`）。属实。
- `review` 块如实引用 R6：`task: "T013 final re-review (R6)"`、`file: "reviews/T013_FINAL_REVIEW_R6.md"`、`round: 6`、`verdict: "PASS"`、`p0: 0`、`p1: 0`、`p2: 10`、`reviewed_commit: "17cbd1e26aa3877e8e48f3584ccc3d617b8c7008"`——与 R6 报告原文（PASS，P0=0，P1=0，P2=10，审查对象 17cbd1e）逐字一致；并如 R6 报告所述，该引用**不是**“R6 审查过 FIX-R6 代码”的声明——R6 从未见过 FIX-R6 代码，本轮 R7 是第一轮审查 FIX-R6 代码的 T013 审查。参数化机制未变：`release-build.mjs` 与 `release-verify.mjs` 均用正则 `R(\d+)` 解析最新审查，无硬编码轮次（`grep T013_FINAL_REVIEW_R3` 在两脚本中 0 命中）；本人重跑的 verify 日志亦确认引用解析为 R6（`latest T013 review (R6) resolves`、`verdict PASS`、`P0=0 P1=0 P2=10`，三项 [PASS]）。属实。
- `diff_proof`（位于 `s0_evidence` 内）：`from_commit 8077c3c4e68facc30f69a3474855c1d64ecc316d` → `to_commit 4216d962328a15a432de534947d6a56483dccd7d`；`name_only` 共 20 个文件：5 个 S0 产物文件（`artifacts/s0/` 下 S0_GATE.json、S0_GATE.md、logs/s0-gate.log、perf-hook.json、privacy-scan.json）+ 15 个 `release/` 删除条目（旧 R4 冻结产物：manifest、SHA256SUMS、csv、冻结报告 R4、两 zip、9 个 s0-evidence 文件）。无生产逻辑改动、无依赖改动。属实。
- 9 个证据文件与 manifest `s0_evidence.files` 的 bytes + sha256 逐个一致（9/9）；与冻结报告的 s0-evidence 表亦逐个一致（9/9）。

**判断：manifest 自洽，审查引用如实，无硬编码轮次。**

---

## 九、结转 P2 清单复核

| ID | 问题 | 本轮抽查 | 状态 |
|---|---|---|---|
| F-11 | 计划书旧章节引用、Fixture/Golden/Oracle 仍标注 v1.0.0 §5 | `00_control/v1.1.0/IMPLEMENTATION_PLAN.md` L26 仍为 v1.0.0 规格版本表；`tests/fixtures/s0/author-fixtures.py` L8/L228/L560 仍标 `v1.0.0 §5`，未变 | OPEN（P2，不阻断） |
| F-12 | Oracle 三处边缘语义参考生产源码 | `tests/oracle/reference_oracle.py` 头注释仍自述“reference for frozen edge choices that the spec leaves open”（L13），三向 48/48 中两路仍独立 | OPEN（P2，不阻断） |
| F-13 | 冷启动样本是 Read 而不是 Write | `scripts/perf-hook.ts` `seedInput()`（L206–215）仍为 PostToolUse Read | OPEN（P2，不阻断） |
| F-25 | p95 随 VM 负载波动 | 本轮新增实测点：冻结证据 199.75ms、树内门 228.95ms、本人重跑 **401.86ms**（p50 亦从 169.42 升至 292.27ms；p99=498.87ms，冷启动单样本 1839.57ms）；历轮 p95 现为 213.76 / … / 199.75 / 401.86ms——仍全部 <500ms，但本轮余量仅 98.14ms，波动幅度本身即风险 | OPEN（P2，观察，不阻断） |
| F-28 | uninstall 失败回滚没有直接回归测试 | `tests/integration/fix-t013.test.ts` 的回滚用例仍只在 install 侧（L225 起 F-19）；uninstall 侧（L159）只有成功卸载用例，仍无故障注入证明 | OPEN（P2，不阻断） |
| F-29 | Vitest worker RPC 超时，根因仍 OPEN | `vitest.config.ts` L14 `fileParallelism: false`（串行缓解）仍在；本人 S0 重跑（全量 489/489）日志中 0 次 `Timeout calling "onTaskUpdate"`；verify 三轮日志亦 0 次 | **PARTIAL**（P2，不阻断） |
| R4-P2-01 | Drive `s0-evidence/` 内无 `logs/` 子文件夹 | 本轮 Drive 核实：`logs/` 子文件夹存在，`s0-gate.log` 在其内，内容核对一致（见 §七）；本地 `release/s0-evidence/logs/` 同样存在 | **CLOSED** |
| P1-R4-01 | Windows drive-letter 绝对路径 fail-open（终审 R4 的 P1） | 本人重跑 `tests/integration/full-chain.test.ts`（真实安装的 hook launchers，项目外 Windows Write 忽略、UNSEEN 的 Windows Write/Edit DENY exit 2、Windows Read 签发 FRESH 后 Write/Edit ALLOW）：**3/3 通过**（日志 `~/workspace/p025-t013-r7-tmp/fullchain-r7.log`）；FIX-R6 未动 drive-letter 逻辑 | **CLOSED（仍关闭）** |
| P1-R5-01 | Windows 大小写变体绕过门控（终审 R5 的 P1） | 本人探针的 FRESH 组与混合大小写组（§一、§二）全部通过；FIX-R6 未动大小写折叠逻辑 | **CLOSED（仍关闭）** |
| R6-P2-01 | 尾随点/空格目录段绕过门控 | **CLOSED**（见 §一：R6 探针 14/14 复核通过，绝对+相对拼写，Write/Edit 双工具） | **CLOSED** |
| R6-P2-02 | drive-rooted / POSIX-absolute 拼写绕过门控 | **CLOSED**（见 §一、§二：R1/R2/R3 × Write/Edit 全部 DENY；UNC cwd 下 fail-closed） | **CLOSED** |
| R6-P2-03 | `release:verify` 在当前 HEAD 上 63/64（工作树比对项被冻结后新增的控制文档触发） | **仍 OPEN**（见 §四：本轮在 HEAD d0b00c2 上复现 63/64，唯一 FAIL 同一项，唯一差异仍是冻结后新增的交接文档） | OPEN（P2，不阻断） |
| R6-P2-04 | 冻结报告 .md 未归档进 Drive R4 文件夹 | **CLOSED**（见 §三：R5 报告已随产物归档进 Drive R5 文件夹，本人下载核对 SHA-256 一致） | **CLOSED** |

**计数：P0 = 0，P1 = 0，P2 = 7**（OPEN/PARTIAL 的 P2 为 F-11、F-12、F-13、F-25、F-28、F-29（PARTIAL）、R6-P2-03；R6-P2-01、R6-P2-02、R6-P2-04 已 CLOSED；P1-R5-01 与 P1-R4-01 已 CLOSED；P1-R1-03 为遗留阻断，单列，不计入）。

---

## 十、P1-R1-03（真实 Claude Code E2E）—— 单列，不计入计数

- 仍为 `blocked_external`，本轮范围外。本 VM 无 Claude Code；本人未尝试安装、登录或伪造任何 Claude Code 证据。
- 冻结报告 `T014_FREEZE_REPORT_R5.md` 设专节“遗留阻断 P1-R1-03”，明确写“本项单列，不计入 P0/P1/P2 计数”，并列出三项待验证内容；`reviews/REVIEW_INDEX.md` 同样记为 OPEN 范围外。属实。
- 不得因它未修就把本次 FIX-R6 修复判 FAIL，也不得把它算成已通过：本结论 PASS 仅由 P0=0 且 P1=0 决定，与 P1-R1-03 无关。

---

## 十一、观察项（不计入 P0/P1/P2，附不计入的理由）

### R7-OBS-01：8.3 短文件名别名未建模（条件性残口，不计入）

本人按任务要求探查了 8.3 短文件名（R6 明确未探查）。实测（UNSEEN，cwd `C:\synthetic\project`，日志 `probe-r7.log`）：

| 输入 | 结果 |
|---|---|
| `C:\synthetic\project\src\SESSIO~1\token.ts`（Write） | ALLOW，gated:false，exit 0 |
| `src\SESSIO~1\token.ts`（Write/Edit，相对拼写） | ALLOW，gated:false，exit 0 |
| `C:\...\src\session\TOKEN~1.TS`（文件名短名） | DENY exit 2（glob `**` 吞掉文件名段，正常） |

**为什么这不是本轮的误放行（不计 P2）：** `SESSIO~1` 不是 `session` 的短名。按 Win32 的 8.3 生成规则（已用公开资料核实：长名超过 8 字符、含空格或非法字符、扩展名超过 3 字符时，才截取前 6 字符 + `~` + 数字），`session` 只有 7 个字符、无空格、无扩展名，其短名就是 `SESSION` 本身——大小写折叠早已覆盖。因此在本 harness 里 `SESSIO~1` 并不指向受保护目录，门控 ALLOW 是正确的；真实 Windows 上写 `SESSIO~1` 会因目录不存在而失败，不构成绕过。

**但机制缺口是真实的（故记观察，不埋没）：** 本人另用自定义配置（`applies_to: [src/verylongdirname/**]`）探查：长目录本身 `src\verylongdirname\token.ts` DENY，而其 8.3 别名 `src\VERYLO~1\token.ts`（Write/Edit）ALLOW gated:false。门控对短名没有任何映射——它按设计从不访问文件系统，无法知道卷上的短名。于是，一个部署若保护的是长名目录（>8 字符或含空格）、且卷开启了 8.3 生成、且模型从 `dir /x` 之类输出中知道了确切短名，就存在一条条件性绕过。三个条件叠加，可达性远低于 R6-P2-01/02（尾随点/空格、drive-rooted 均只需模型写出拼写本身），且出厂默认配置保护的 `src/auth/**`、`src/session/**`（短名即 `AUTH`、`SESSION`）不受影响。按 R6 §3.3 的校准，这够不上 P2 的“已证实误放行”标准——它在本 harness 中未被证实为误放行。修复方向（仅建议，不动手）：对含 `~<数字>` 的段 fail-closed（会 over-deny 字面含 `~1` 的合法长名），或做文件系统感知的短名解析（与门控“不碰文件系统”的设计冲突，需另行裁决）。

### R7-OBS-02：`release:verify` 的 clean-room 步骤依赖 /tmp 空间（环境事故，不计入）

首轮 verify（release commit，未设 TMPDIR）得 58/64，6 个 [FAIL] 全是 clean-room 步骤报 `ENOSPC: no space left on device`：`/tmp` 是 512M tmpfs，当时已被其他任务的遗留物占到 356M（`pytest-of-root` 168M 等）、仅剩 157M，而 clean-room 的两次 `npm ci` + 两次构建解包远超该余量。改设 `TMPDIR=~/workspace/p025-t013-r7-tmp`（持久磁盘）后重跑即 64/64 PASS；服务重启后 /tmp 被清空（0% 已用），进一步证实这是 tmpfs 容量问题。冻结报告的 verify 64/64 在冻结时为真，产物本身无问题，故不计 P2。但建议：release 脚本（`release-verify.mjs` L118/L524 与 `release-build.mjs` L172–176 均经 `os.tmpdir()` 建临时目录）应明确要求/校验 TMPDIR 指向持久磁盘，或在空间不足时报出可读的提示而非 6 项连锁 FAIL——否则下次冻结时若 /tmp 恰满，verify 会再次假 FAIL。已在 §六如实记录两次运行的数字，不以第二轮覆盖第一轮。

---

## 十二、发现的新问题汇总

除 §十一的两项观察（R7-OBS-01、R7-OBS-02，均不计入）外，**无新问题**。

另记两项方法学说明（不计为问题）：

1. `release:build` 未由本人重跑（会覆盖冻结产物，见 §6.3）；其 44/44 采信冻结 build 流程，全部输出由本人逐项独立核对无差异，且 `release:verify` 64/64（release commit 上）本身即从冻结 commit 重新生成并比对 source.zip 内容。
2. 本人 HEAD verify 的第一次运行被一次服务重启中途打断（日志截断于 clean-room 步骤，`[FAIL] working tree matches…` 一项已出现）；清理残留临时目录后完整重跑一次，得干净的 63/64。两次运行的结论一致，不以截断日志为准。
3. 本轮探针曾两次误判后纠正，记录在案以免后人重蹈：(a) `.. ` 段剥离后为空、按 `.` 折叠而非读作 `..`（见 §二，over-deny，安全方向）；(b) `SESSIO~1` 不是 `session` 的短名（见 §十一），7 字符名的短名就是大写本身。

---

## 十三、证据索引（本人亲自跑出的命令与文件）

- 冻结/发布 commit：`git rev-parse HEAD` = d0b00c2e7b808032a07ce021918005608f075cba；manifest `frozen_commit` = 4216d962328a15a432de534947d6a56483dccd7d；release commit fb4d8087babd73f390a6a58a0904f8771412bb2e；上一冻结 `git rev-parse 17cbd1e` = 17cbd1e26aa3877e8e48f3584ccc3d617b8c7008；结束时 `git status` 仅审查前已有的未跟踪文件（`00_control/P025_F29_DIAGNOSIS.md`、`00_control/P025_FINAL_REVIEW_R3.md`、`00_control/P025_FINAL_REVIEW_R4.md`、`00_control/T015/`）。
- FIX-R6 diff：`git show 8077c3c`（生产：仅 `sanitize.ts` +141/−16；测试：`fix-r6-path-spellings.test.ts` +34 测试，455→489）。
- 探针日志：`~/workspace/p025-t013-r7-tmp/probe-r7.log`（R6 探针 14/14 DENY + 对照组 + hunting 组，52 行 PROBE 原文；探针文件已删，工作树已恢复）；另有一次 resolver 级核查（`.. ` → `src/session/token.ts`、`..` → `src/token.ts`，临时测试已删）。
- FIX-R6 相关测试重跑：`~/workspace/p025-t013-r7-tmp/fixr6-files.log`（6 文件，268/268，exit 0）；全量测试 `~/workspace/p025-t013-r7-tmp/full-tests.log`（489/489，23 文件）；typecheck `~/workspace/p025-t013-r7-tmp/typecheck.log`（0 错误）；golden 53/53；oracle 48/48（`--self-test` PASS + `--verify-golden` 48/48）。
- S0 重跑：`~/workspace/p025-t013-r7-tmp/s0-r7.log`（精确冻结 commit 4216d96 的 detached worktree，PASS，p95=401.86ms，489/489，canonical `ef06d30f…`，exit 0；worktree 已删）。
- release:verify：`~/workspace/p025-t013-r7-tmp/verify-r7-release.log`（release commit fb4d808 的 worktree，未设 TMPDIR，58 [PASS] / 6 [FAIL]，全为 ENOSPC）；`~/workspace/p025-t013-r7-tmp/verify-r7-release2.log`（同一 worktree，TMPDIR 指持久磁盘，64 [PASS]，0 [FAIL]，`release:verify PASS — frozen 4216d96…`，worktree 已删）；`~/workspace/p025-t013-r7-tmp/verify-r7-head.log`（当前 HEAD d0b00c2，63 [PASS]，1 [FAIL]，唯一 FAIL 为工作树比对项）。
- SHA256SUMS：`sha256sum -c release/SHA256SUMS.txt` 13/13 OK（自 `02_source/` 根）；`unzip -t` 两 zip 均 No errors；source.zip 247 条目、dist.zip 57 条目、SOURCE_MANIFEST.csv 211 行。
- Drive 核对：`~/workspace/p025-t013-r7-tmp/drive/`（top.json / s0.json / logs.json 元数据；7 个非 JSON 文件下载后 SHA-256 逐个一致；8 个 JSON 用 size + md5 核对；冻结报告 .md SHA-256 `8965b7d7…` 与交接记录一致）。
- Windows 语义独立验证：`node -e "require('path').win32.resolve(...)"`（`\/synthetic\...` → UNC `\\synthetic\...`；`/synthetic/...` → `C:\synthetic\...`）；8.3 生成规则见公开资料（Wikipedia “8.3 filename”：仅当长名不合 8.3 时截取前 6 字符 + `~` + 数字）。
- full-chain：`~/workspace/p025-t013-r7-tmp/fullchain-r7.log`（3/3 通过）。
- 参考日志（仅参考）：冻结报告 `02_source/release/T014_FREEZE_REPORT_R5.md`（build 44/44、verify 64/64、SHA256SUMS 13/13 的当时值）。
