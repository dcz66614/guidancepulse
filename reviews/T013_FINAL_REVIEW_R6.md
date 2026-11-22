# P025 GuidancePulse — T013 独立重审第 6 轮（R6，FIX-R5 复核）

- 审查员：独立重审员 R6（全新会话，与 R1–R5 审查员无关；以下每一项数字均为本人亲自跑出的命令退出码、文件哈希、测试输出与 Drive 下载结果，不采信协调员或以往报告的转述数字）
- 审查对象：冻结 commit `17cbd1e26aa3877e8e48f3584ccc3d617b8c7008`（简称 17cbd1e）；release commit `e9a84725623808aa53d083e874cb9a0d90cf4d36`（简称 e9a8472）；上一冻结 `8e04562d6cc9cea8f4875b0cca78df27fbe4e17a`（简称 8e04562）保持未动
- 规格：v1.1.0；MIT；零真人；88h
- 审查时间：2026-11-17 02:55–03:10 GMT；工作目录 `~/workspace/p025-guidancepulse/`，HEAD 经 `git rev-parse` 核实为 9a20e17（handoff commit，在 release commit e9a8472 之上；见 §七对 verify 63/64 的说明）
- 审查范围：FIX-R5 全部内容（终审 R5 的 P1-R5-01 修复、R5-P2-01/02/03 修复）+ 主动寻找新绕过 + 冻结产物自洽性 + Drive 归档 + R5 结转的 6 项 P2
- 审查方式：只读审查，未修改任何源码/测试/配置/门逻辑与冻结产物，未提交 GPT 终审 R6，未碰 GitHub，未安装、登录或伪造任何 Claude Code 证据。唯一写入工作树的是两份临时探针测试（跑完即删）与本报告 `reviews/T013_FINAL_REVIEW_R6.md`；另建两个 detached worktree（17cbd1e 与 e9a8472）做冻结核实，跑完即删；结束时 `git status` 仅剩审查前已有的未跟踪文件

## 结论

**结论：PASS**

**P0 = 0，P1 = 0，P2 = 10**

结论：PASS

P0 = 0, P1 = 0, P2 = 10

**FINAL_VERDICT: PASS**

FIX-R5 关闭了终审 R5 的全部三项：P1-R5-01（Windows 大小写变体绕过，本人重跑 R5 探针 #3–#6 + 混合大小写 + 对照组，全部 DENY exit 2；FRESH 租约下大小写变体 Write 仍 ALLOW）与 R5-P2-01（drive-relative fail-closed，Write/Edit × 2 拼写 + 小写盘符 + 裸 `C:` 全部 DENY exit 2，`error.code = DRIVE_RELATIVE_PATH`）、R5-P2-02（MSVC 文档已纠正）、R5-P2-03（manifest 审查引用已参数化，本轮 manifest 如实引用 R5 FAIL 0/1/9，审查对象 8e04562）。S0 本人在精确冻结 commit 上重跑 PASS（p95=396.58ms，余量 103.42ms；455/455；canonical 哈希与冻结证据逐字相同）；`release:verify` 在 release commit 上重跑 64/64 PASS；`sha256sum -c` 13/13 OK；Drive 14/14 核对通过。本人主动 hunting 复现出两组新的 fail-open 残口（尾随点/空格段、drive-rooted 拼写），均判 P2（见 §三，附与 R5 的 P1 定级标准的显式校准）；另有两项流程类 P2（verify 在当前 HEAD 上 63/64、冻结报告 .md 未进 Drive R4 文件夹）。无 P1，故结论 PASS。

---

## 一、P1-R5-01：真正关闭（R5 探针全量重跑 + 折叠逻辑逐行核实）

### 1.1 修复代码核实（本人逐行读 diff，不采信转述）

`git show 5f93c64` 的生产改动确为：

- `02_source/src/privacy/sanitize.ts`：`normalizedSegments` 增加 `foldWindowsCase`（Windows 拼写：盘符保持大写、其余段 lower-case；POSIX 不折叠）；`normalizePathForId` 始终折叠（同一 NTFS 文件一个 HMAC id）；`resolveRelativeTargetPath` 在折叠后的段上做 cwd 前缀逐段比较、返回目标自身拼写；drive-relative 拼写抛 `SanitizeError` `DRIVE_RELATIVE_PATH`。属实。
- `02_source/src/config/glob.ts`：`matchGlob` 增加 `{ caseInsensitive }`（默认 false；折叠时 pattern 与 target 一并 `toLowerCase`，字符类随之折叠）。属实。
- `02_source/src/core/match-rules.ts`：`ruleMatchesTarget` / `matchRules` / `matchRuleIds` / `matchRulesAnyPhase` 透传该选项。属实。
- `02_source/src/hooks/adapter.ts` 与 `pre-tool-use.ts`：两者用同一 Windows-origin 判定（`isWindowsPath(cwd) || isWindowsPath(toolFilePath)`）决定是否大小写不敏感匹配，门控与适配器不可能在大小写上意见不一致。属实。
- `isWindowsPath`（`sanitize.ts`）：drive-letter（任一斜杠、任一盘符大小写）或 UNC（`//` 开头）即判 Windows；POSIX 前导 `/` 永不判 Windows。属实。

冻结 source.zip 内文件与工作树逐字节一致——`release:verify` 64/64 本身即从冻结 commit 重新生成并比对 source.zip 内容（本人在 release commit 上重跑，见 §七），不再另行解压核对。

### 1.2 本人重跑 R5 探针（临时探针，非产品代码）

本人写了一份临时探针测试 `02_source/tests/unit/r6-probe.test.ts`（与 `pre-tool-use.test.ts` 同款 harness/配置：规则 `auth-change-safety`，`applies_to: [src/auth/**, src/session/**]`，mode block；全新 `:memory:` store，**无任何 lease，即 UNSEEN**；cwd `C:\synthetic\project`），对 `handlePreToolUse`（真实门控入口）跑全部 R5 探针 + 对照组 + FRESH 组，跑完即删文件。结果（日志 `~/workspace/p025-t013-r6-tmp/probe-r6.log` 与 `probe-r6b.log`，`PROBE …` 行原文）：

| # | 输入 `file_path`（Write，除注明外） | 结果 | 判定 |
|---|---|---|---|
| R5#3 | `C:\SYNTHETIC\PROJECT\src\session\token.ts`（cwd 前缀大小写变体） | DENY，gated:true，exit 2，UNSEEN | 已修 |
| R5#4 | `c:\Synthetic\Project\src\session\token.ts`（Edit，混合大小写） | DENY，gated:true，exit 2，UNSEEN | 已修 |
| R5#5 | `C:\synthetic\project\src\SESSION\token.ts`（受保护段大小写变体） | DENY，gated:true，exit 2，UNSEEN | 已修 |
| R5#6 | `C:\synthetic\project\SRC\session\token.ts`（同上，`SRC`） | DENY，gated:true，exit 2，UNSEEN | 已修 |
| MIXED | `C:\SyNtHeTiC\PrOjEcT\SrC\SeSsIoN\ToKeN.tS`（全混合大小写） | DENY，gated:true，exit 2，UNSEEN | 已修 |
| 对照 | `C:\synthetic\project\src\session\token.ts`（规范拼写） | DENY，gated:true，exit 2，UNSEEN | 门控正常 |
| FRESH | FRESH 租约下 `C:\SYNTHETIC\PROJECT\src\SESSION\token.ts` Write | ALLOW，exit 0，state FRESH | 无误拒 |

7/7 与预期一致。FIX-R5 新增的 5 个文件测试本人重跑 **234/234 通过**（`privacy-sanitizer`、`pre-tool-use`、`hooks-adapter`、`path-matcher`、`config`，日志 `~/workspace/p025-t013-r6-tmp/fixr5-files.log`），与 commit message 的计数一致。

### 1.3 本人主动 hunting：其余拼写均已堵住

除 R5 探针外，本人在同一探针里另试 18 组拼写（UNSEEN，cwd `C:\synthetic\project`，除注明外均为 Write），其中 14 组预期 DENY、4 组预期 ALLOW（文件确实在受保护 glob 之外，ALLOW 是正确的），**全部与预期一致**：

- DENY exit 2：`..` 回绕（`src\session\..\session\token.ts`、`..\..\synthetic\project\src\session\token.ts`）、`.` 段（`.\src\.\session\.\token.ts`）、重复分隔符（`\\src\\session\\token.ts`）、全正斜杠大写（`C:/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS`）、混合斜杠小写盘符（`c:/Synthetic/Project/Src/Session/Token.ts`）、相对路径大小写变体（`src\SESSION\token.ts`、`SRC/SESSION/TOKEN.TS`——Windows-origin 由 cwd 判定，故相对路径同样折叠）、仅文件名大小写（`TOKEN.TS`）、cwd 尾随反斜杠（cwd `C:\synthetic\project\` + 规范目标）、UNC 大小写变体（cwd `\\server\share\project`，目标 `\\SERVER\SHARE\project\src\session\token.ts` 与 `...\src\SESSION\token.ts`）。
- ALLOW gated:false（正确）：`..` 逃出受保护 glob 的两组（`src\..\session\token.ts` = 项目根 `session/token.ts`；`src\session\..\..\SESSION\Token.ts` = 项目根 `SESSION/Token.ts`——本人首版探针曾误判这两组为应 DENY，逐段算清后纠正：它们确实不在 `src/session/**` 内，ALLOW 是正确的，见 `probe-r6b.log`）；项目外大小写变体（`C:\SYNTHETIC\OTHER\...`）、前缀 sibling（`C:\synthetic\projectx\...`，逐段比较防前缀冒充）、不匹配段（`src\sessionX\...`）、POSIX 对照组（cwd `/synthetic/project` 下相对 `SRC/session/token.ts` 与绝对 `/SYNTHETIC/project/...` 均 ALLOW——POSIX 不折叠，无过度折叠）。

**判断：P1-R5-01 真正关闭。** 但 §三的两组新残口属于同一缺陷类（Windows 路径拼写绕过门控）的更边缘拼写，另立 P2，不得视为 P1-R5-01 未彻底解决——它们的拼写形态与 R5 的大小写变体不同，可达性亦不同（见 §三的定级校准）。

---

## 二、R5-P2-01：真正关闭（drive-relative fail-closed）

同一探针（UNSEEN，cwd `C:\synthetic\project`），6 组 drive-relative 输入全部 DENY、gated:true、exit 2、`error.code = DRIVE_RELATIVE_PATH`：

| 输入 | 工具 | 结果 |
|---|---|---|
| `C:src\session\token.ts` | Write | DENY exit 2，DRIVE_RELATIVE_PATH |
| `C:src/session/token.ts` | Write | DENY exit 2，DRIVE_RELATIVE_PATH |
| `C:src\session\token.ts` | Edit | DENY exit 2，DRIVE_RELATIVE_PATH |
| `C:src/session/token.ts` | Edit | DENY exit 2，DRIVE_RELATIVE_PATH |
| `c:src\session\token.ts`（小写盘符，本人加测） | Write | DENY exit 2，DRIVE_RELATIVE_PATH |
| `C:`（裸盘符，本人加测） | Write | DENY exit 2，DRIVE_RELATIVE_PATH |

机理已定位：`resolveRelativeTargetPath`（`sanitize.ts`）先判 `isDriveRelativePath`（`^[A-Za-z]:($|[^/])`）即抛错，`handlePreToolUse` 外层 catch 转 fail-closed DENY（`pre-tool-use.ts` `failClosedResult`），与缺 `file_path` 同路。**判断：R5-P2-01 真正关闭。**

---

## 三、新发现的两组 fail-open 残口（均本人实测，Write 与 Edit 双工具复现）

### 3.1 R6-P2-01：尾随点/空格的目录段绕过门控

Win32 命名规则：文件/目录名不得以空格或句点结尾，Win32 在把 DOS 路径转为 NT 路径时会剥离各段尾随的空格与句点（即 `session.` 与 `session` 是同一目录，`session ` 亦然）。但产品的词法规范化（`normalizedSegments` / `normalizeTargetPath`）不做这种剥离，glob 段按字面比较。实测（UNSEEN，cwd `C:\synthetic\project`，日志 `probe-r6.log`，Edit 复现见 `probe-r6-edit.log`）：

| # | 输入 `file_path` | 结果 | 判定 |
|---|---|---|---|
| T1 | `C:\synthetic\project\src\session.\token.ts`（Write） | ALLOW，gated:false，exit 0 | **误放行** |
| T2 | `C:\synthetic\project\src\session \token.ts`（Write，段尾空格） | ALLOW，gated:false，exit 0 | **误放行** |
| T3 | 上述两组（Edit） | ALLOW，gated:false，exit 0 | **误放行** |
| 对照 | `C:\synthetic\project\src\session\token.ts.`（文件名尾随点，Write） | DENY exit 2 | 正常（glob `**` 吞掉该段） |
| 对照 | `C:\synthetic\project\src\session\token.ts `（文件名尾随空格，Write） | DENY exit 2 | 正常（同上） |

注意：Node 自身的 `path.win32.resolve` 也不剥离 `session.`（本人实测：仍返回含 `session.` 的路径），所以这不是“漏调现成库”的问题，而是门控的 Windows 语义模型本身缺了一条 Win32 规则。修复方向（仅建议，不动手）：Windows-origin 目标在规范化时剥离每段尾随的空格与句点（或无法判定时刻 fail-closed），与大小写折叠同理。

### 3.2 R6-P2-02：drive-rooted / POSIX-absolute 拼写在 Windows cwd 下绕过门控

Win32 中以 `\` 或 `/` 开头、无盘符的路径是“当前盘符根目录相对路径”：cwd 为 `C:\synthetic\project` 时，`/synthetic/project/src/session/token.ts` 与 `\synthetic\project\src\session\token.ts` 均指 `C:\synthetic\project\src\session\token.ts`。本人用 Node 的 `path.win32.resolve('C:\\synthetic\\project', '/synthetic/project/src/session/token.ts')` 独立验证，返回正是 `C:\synthetic\project\src\session\token.ts`。但产品的 `resolveRelativeTargetPath` 用 `absolute` 标志（是否以 `/` 开头）比较目标与 cwd：Windows 目标的 `absolute=false`、POSIX 式目标的 `absolute=true`，标志不等即返回 null → 按“项目外目标”处理 → 忽略放行。实测（UNSEEN，cwd `C:\synthetic\project`，日志同上）：

| # | 输入 `file_path` | 结果 | 判定 |
|---|---|---|---|
| R1 | `/synthetic/project/src/session/token.ts`（Write） | ALLOW，gated:false，exit 0 | **误放行** |
| R2 | `\synthetic\project\src\session\token.ts`（Write） | ALLOW，gated:false，exit 0 | **误放行** |
| R3 | `/SYNTHETIC/PROJECT/SRC/SESSION/TOKEN.TS`（Write，全大写） | ALLOW，gated:false，exit 0 | **误放行** |
| R4 | 上述 R1/R2（Edit） | ALLOW，gated:false，exit 0 | **误放行** |

修复方向（仅建议，不动手）：Windows cwd 下的 drive-rooted 目标（前导 `/` 或 `\`、无盘符）应按 cwd 所在盘符解析后再做前缀比较，或无法解析时 fail-closed。

### 3.3 为什么这两组是 P2 不是 P1（显式定级校准）

规格 PROJECT_BOOK v1.1.0 §10 风险表 L709 写“Windows 路径问题：P2，若导致误放行则 P1”——字面上两组都是误放行。但 R5 已确立一条先例校准：R5-P2-01（drive-relative `C:foo`，同样是实测误放行）被判 P2，理由是“该拼写在模型/工具输出中极罕见（cmd 习语，模型几乎只写 `C:\…`），且宿主可能在传参前规范化”；而 P1-R5-01 被判 P1，理由是大小写变体是“模型生成路径时的常见波动”、“大小写不一致在 Windows 上是日常现象”。按同一标准：

- R6-P2-01（尾随点/空格）：模型几乎从不把路径段写成 `session.` 或 `session `；这不是模型输出的常见波动，是刻意构造的边缘拼写。P2。
- R6-P2-02（drive-rooted / POSIX-absolute）：模型在 Windows 上看到的 cwd 与工具回显全是 `C:\…` 式路径，自发丢掉盘符、只写 `/synthetic/...` 远比写 `C:/...`（已堵住）罕见；且与 drive-relative 同属“无盘符的盘相关拼写”一类。P2。

此定级是判断，不是测量：若后续终审认为 drive-rooted 拼写属于模型常见输出，可升级为 P1；本轮按 R5 的先例标准判 P2。另注：8.3 短文件名（如 `SESSIO~1`）未探查（是否生效取决于卷设置、模型须先知道短名），不是本轮发现，不计入。

**新 P2 计数：R6-P2-01、R6-P2-02。**

---

## 四、R5-P2-02：真正关闭（MSVC 文档已纠正）

- `02_source/README.md` L29–34：现为“**Windows: no C++ toolchain needed.** `better-sqlite3@13.2.0` ships N-API prebuilt binaries (including `win32-x64.node`) and has no install script, so `npm ci` does not run `node-gyp` and does not need MSVC / Visual Studio Build Tools”，并注明旧版说法错误。**不再要求安装 C++ 工作负载。**
- `02_source/docs/USER_GUIDE.md` L50–59：中文同款更正，结尾“给 Muse 重新诊断，不要自行安装 C++ 工作负载”。属实。
- `00_control/T015/T015_NPM_INSTALL_PROMPT.md`：全文已是诊断收集版（标题即注明“只收集诊断材料，不安装、不修复、不继续后续步骤”；“不许做的事”一节明文禁止装 C++ 工作负载 / Visual Studio Build Tools / MSVC、禁止改系统与 npm 配置、禁止继续 S2–S6；第 4 步只跑一次 `npm ci` 取完整日志交 Muse 诊断）。属实。
- release 脚本内旧说法注释已修正：`scripts/release-build.mjs` L76–79、L826–829、L963–965 均已改为“better-sqlite3@13.2.0 has no install script, so `npm ci` never triggers a node-gyp rebuild; the package ships an N-API prebuilt binary in prebuilds/”，`--ignore-scripts` 保留但注明仅为 belt-and-braces。属实。

**判断：R5-P2-02 真正关闭。**

---

## 五、R5-P2-03：真正关闭（manifest 审查引用已参数化）

- 本轮 manifest `review` 块（本人用 Python 程序化读取，非目测）：`task: "T013 final re-review (R5)"`、`file: "reviews/T013_FINAL_REVIEW_R5.md"`、`round: 5`、`verdict: "FAIL"`、`p0: 0`、`p1: 1`、`p2: 9`、`reviewed_commit: "8e04562d6cc9cea8f4875b0cca78df27fbe4e17a"`——与 R5 报告原文（FAIL，P0=0，P1=1，P2=9，审查对象 8e04562）逐字一致，且明确标注“FAIL does not block re-freeze”。属实。
- 参数化机制（本人逐行读代码）：`scripts/release-build.mjs` 的 `resolveLatestT013ReviewFromCommit` 用 `git ls-tree` 从**冻结 commit 的树内**取最新 `reviews/T013_FINAL_REVIEW_R*.md`（最大轮次号），再 `git show` 读出并用 `parseT013ReviewReport` 解析 verdict 与 P0/P1/P2 与审查对象 commit；`scripts/release-verify.mjs` L472–474 用同一对 helper 从**磁盘 `reviews/` 目录**解析最新审查。两处均无硬编码轮次（`grep T013_FINAL_REVIEW_R3` 在两脚本中 0 命中）。属实。
- 本轮 build/verify 的实际引用均为 R5（build 日志见冻结报告；本人重跑的 verify 日志 `verify-r6-release.log` L67–70：`latest T013 review (R5) resolves`、`verdict parses — verdict FAIL`、`P0/P1/P2 counts parse — P0=0 P1=1 P2=9`，三项 [PASS]）。属实。
- 另核：manifest 顶层 `s0_gate` 与 `s0_evidence` 的 verdict/p95/canonical/full_tests/generated_at_utc 逐字一致（p95 均为 `p95=360.22ms (n=100, …)`，canonical 均为 `ef06d30f…`，full_tests 均为 455/0/22，generated 均为 `2026-11-17T02:44:58.190Z`）；9 个证据文件与 manifest `s0_evidence.files` 的 bytes + sha256 逐个一致（9/9）；`diff_proof`（`04074d1 → 17cbd1e`）仅含 5 个 S0 产物文件与 `release/` 删除条目，无生产逻辑改动、无依赖改动。

**判断：R5-P2-03 真正关闭。**

---

## 六、亲自重跑 S0：PASS，p95=396.58ms（精确冻结 commit，detached worktree）

命令：新建 detached worktree 于精确冻结 commit `17cbd1e`（`~/workspace/p025-t013-r6-tmp/wt-17cbd1e`，`node_modules` 按冻结流程软链自主工作树；`diff_proof` 中无 `package.json` / `package-lock.json` 改动，故无漂移），`cd 02_source && TMPDIR=~/workspace/p025-t013-r6-tmp npm run s0:gate`（单次，未重试；日志 `~/workspace/p025-t013-r6-tmp/s0-r6.log`；worktree 跑完即删）。

- **verdict: PASS；退出码 0。p95=396.58ms**（n=100，p50=293.25ms，p99=421.82ms，min=227.80ms，max=452.36ms，cold_start=452.36ms，run_failures=0）——通过阈值（<500ms），余量 **103.42ms**，比 R5 审查员自跑的 2.60ms 宽松得多，但 p50 仍明显高于冻结证据跑的 175.73ms，属 VM 负载波动（F-25）。
- `environment.git_commit` = `17cbd1e26aa3877e8e48f3584ccc3d617b8c7008`（精确冻结 commit，非 HEAD）。
- 全量测试 **455 passed / 0 failed / 22 files**；typecheck 0 错误；golden 53/53；oracle 48/48；七门全部 PASS：parity 48/48、检出 32/32、控制 16/16、100 次重放唯一哈希 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（与冻结证据逐字相同）、网络 0、隐私 0（含三轮 0 命中）。
- 0 次 `Timeout calling "onTaskUpdate"`（F-29 未触发，见 §九）。

**判断：S0 门本身 PASS，数值真实。p95 轮间值现为 213.76 / 216.31 / 226.51 / 217.64 / 218.92 / 203.07 / 256.07 / 492.69 / 297.30 / 497.40 / 358.93 / 360.22 / 396.58ms（本人新增最后一点），仍全部 <500ms；F-25 的波动观察维持 P2，不阻断。**

---

## 七、发布产物核对：release commit 上 verify 64/64；当前 HEAD 上 63/64（新 P2，见 R6-P2-03）

### 7.1 在 release commit 上重跑：64/64 PASS

本人在 detached worktree（`~/workspace/p025-t013-r6-tmp/wt-e9a8472`，HEAD = release commit e9a8472，跑完即删）上重跑 `npm run release:verify`：**64 个 [PASS]，0 个 [FAIL]**，末行 `release:verify PASS — frozen 17cbd1e26aa3877e8e48f3584ccc3d617b8c7008`，退出码 0（日志 `~/workspace/p025-t013-r6-tmp/verify-r6-release.log`）。其中含 dist.zip CLI smoke（树外临时项目 `init → install → status → uninstall` 全部 exit 0）。

### 7.2 在当前 HEAD 上重跑：63/64，唯一 FAIL 是工作树比对项（R6-P2-03）

本人在主工作树（HEAD 9a20e17）上同样重跑 `npm run release:verify`：**63 个 [PASS]，1 个 [FAIL]**，退出码 1（日志 `~/workspace/p025-t013-r6-tmp/verify-r6.log`）。唯一失败项是 `working tree matches frozen commit (except release/)`——其实现是 `git diff --quiet 17cbd1e -- . ':!02_source/release'`（`release-verify.mjs` L520–521）。失败原因已精确定位：handoff commit 9a20e17 在 release commit 之上新增了 `00_control/HANDOFF_T014_R4.md`（110 行，`git diff --stat 17cbd1e HEAD` 唯一差异），该文件在 `release/` 之外，故 diff 非空。除此一项外，其余 63 项（含 source.zip 与冻结 commit 树的逐字节比对、manifest、T013 引用、dist smoke）在 HEAD 上亦全部通过。

影响：冻结报告称“verify 64/64”在当时（release commit 时）为真；但任何人在当前 HEAD 上重跑 verify 都会得到 63/64 + FAIL 退出码——报告标题数字在 handoff commit 落地后即不可复现。这是 verify 检查的作用域问题（它把“工作树 == 冻结树”等同于“正在审查冻结产物”，未给冻结后的控制文档留口子），不是冻结产物本身的问题。记 P2（流程，不阻断产品门控），建议：下次冻结时 verify 应以 release commit（或冻结 commit + release/）为基准运行，或把该检查改为比对 HEAD 的 release commit 树。

**R6-P2-03：`release:verify` 在当前 HEAD（9a20e17，含 handoff 文档）上为 63/64 FAIL，仅因 `working tree matches frozen commit` 一项被冻结后新增的控制文档触发；同一 verify 在 release commit e9a8472 上为 64/64 PASS。**

### 7.3 其余产物核对（全部由本人独立做出）

- `sha256sum -c release/SHA256SUMS.txt`（自 `02_source/` 根运行）：**13/13 OK**，退出码 0。
- `unzip -t release/source.zip` 与 `unzip -t release/dist.zip`：均为 `No errors detected`，退出码 0。
- 五个产物文件字节 + SHA-256 与冻结报告表逐字一致：source.zip 3,059,647 B `c5bcbc5f…`、dist.zip 682,849 B `d78d5ff8…`、RELEASE_MANIFEST.json 9,290 B `bc6146be…`、SOURCE_MANIFEST.csv 32,550 B `3192ff54…`、SHA256SUMS.txt 1,284 B `4d93f48e…`。
- source.zip 246 条目、dist.zip 57 条目、SOURCE_MANIFEST.csv 210 行（209 文件 + 1 表头），与冻结报告一致。
- `npm run release:build` **未由本人重跑**，理由同 R5：build 不是只读操作——它会重新跑完整 S0 证据并重打 source.zip/dist.zip、重写 manifest 与 SHA256SUMS，从而覆盖正在审查的冻结产物本身；重跑 build 等于销毁审查对象。替代核对：冻结 build 日志留存于冻结流程（44/44），其全部输出已由本人逐项独立核对无差异（见上），且 `release:verify` 64/64 本身即从冻结 commit 重新生成并比对 source.zip 内容。

---

## 八、Drive 归档：14/14 独立核对通过；冻结报告 .md 未进 R4 文件夹（新 P2，R6-P2-04）

Drive 位置：`04_release/T014_R4_2026-11-17_17cbd1e`（id `1Px7lTxZf-B1XF80EYJS2cL78mL7AgUx2`，位于 04_release `1-QrdC2we1HRd4kjliVo4PbHNQlzDpG6s` 下），其下 `s0-evidence/` 子文件夹（id `1vvtoanlnVdRKBD-8plIY1nVLhNunm22C`）与 `logs/` 子文件夹（id `1N4F3i3ROGD8Hhqg_wiEF5eIgzb0MZMQK`）。本人用 `drive files list` 逐项列出并逐个核对（元数据与下载文件在 `~/workspace/p025-t013-r6-tmp/drive/`）：

- 顶层 5 文件：source.zip、dist.zip、RELEASE_MANIFEST.json、SOURCE_MANIFEST.csv、SHA256SUMS.txt——Drive 元数据 size + md5Checksum 与本地逐个一致（5/5）。
- `s0-evidence/` 8 文件：S0_GATE.json、S0_GATE.md、fixture-results.json、oracle-results.json、perf-hook.json、repeat-hashes.json、privacy-scan.json、network-scan.json——size + md5 逐个一致（8/8）。
- `logs/s0-gate.log`：位于 `s0-evidence/logs/` 下（**R4-P2-01 的布局修正仍在，不再平铺**），size + md5 与本地一致（1/1）。
- 另将 6 个非 JSON 文件逐个从 Drive 下载并比对 SHA-256：source.zip `c5bcbc5f…`、dist.zip `d78d5ff8…`、SOURCE_MANIFEST.csv `3192ff54…`、SHA256SUMS.txt `4d93f48e…`、S0_GATE.md `f11d8193…`、s0-gate.log `c864f669…`——6/6 与本地/manifest 一致。8 个 JSON 文件下载时返回 0 字节（CLI 已知问题，R4/R5 同样遇到），改用元数据核对，8/8 一致。

**Drive 核对：14/14 通过（按冻结报告的 5+8+1 口径）。R4-P2-01（`s0-gate.log` 平铺、无 `logs/` 子文件夹）确认仍 CLOSED。**

**R6-P2-04：冻结报告 `T014_FREEZE_REPORT_R4.md` 本身未归档进 Drive R4 文件夹。** R3 的做法是在 R3 文件夹内归档 `T014_FREEZE_REPORT_R3.md`（R5 曾下载核对 SHA `1da92e04…`）；本轮 R4 文件夹顶层只有上述 5 个文件，无报告 .md。本人在全 Drive 按名搜索 `T014_FREEZE_REPORT_R4.md`，唯一命中是另一项目的文件（P020 CheckPath 的 T014 报告，2026-11-10，17,768 B，md5 `dab266a1…`，位于 `01_release_R4` 文件夹）——与本地 P025 报告（28,403 B，md5 `a292dab0…`）完全不同。这不 contradict 冻结报告的 14 文件口径（它只宣称 5+8+1），但按“Drive 是官方成果库”的工厂规则与 R3 的先例，冻结报告本身应随冻结产物一并归档；缺失它，Drive 上的 R4 归档就没有那份为冻结背书的报告。记 P2（归档，不阻断产品门控），修复极便宜：把本地报告 .md 上传进 R4 文件夹即可。

---

## 九、结转 P2 清单复核

### 9.1 R5 的 6 项结转 P2 + R4-P2-01 + P1-R4-01

| ID | 问题 | 本轮抽查 | 状态 |
|---|---|---|---|
| F-11 | 计划书旧章节引用、Fixture/Golden/Oracle 仍标注 v1.0.0 §5 | `00_control/v1.1.0/IMPLEMENTATION_PLAN.md` L26 仍为 v1.0.0 规格版本表；`tests/fixtures/s0/author-fixtures.py` L8/L228/L560 与 `tests/fixtures/s0/control/C01.json` L5 等仍标 `v1.0.0 §5`，未变 | OPEN（P2，不阻断） |
| F-12 | Oracle 三处边缘语义参考生产源码 | `tests/oracle/reference_oracle.py` 头注释仍自述“reading the production sources only as a semantic reference for frozen edge choices…”；三向 48/48 中两路仍独立 | OPEN（P2，不阻断） |
| F-13 | 冷启动样本是 Read 而不是 Write | `scripts/perf-hook.ts` `seedInput()`（L206–215）仍为 PostToolUse Read | OPEN（P2，不阻断） |
| F-25 | p95 随 VM 负载波动 | 本轮新增实测点：冻结证据 360.22ms、树内门 358.93ms、本人重跑 **396.58ms**（p50 亦从 175.73 升至 293.25ms）；历轮 p95 现为 213.76 / 216.31 / 226.51 / 217.64 / 218.92 / 203.07 / 256.07 / 492.69 / 297.30 / 497.40 / 358.93 / 360.22 / 396.58ms——仍全部 <500ms，但波动幅度本身即风险，门随时可能因负载抖动而逼近阈值 | OPEN（P2，观察，不阻断） |
| F-28 | uninstall 失败回滚没有直接回归测试 | `tests/integration/fix-t013.test.ts` 的回滚用例仍只在 install 侧；uninstall 侧（L159）只有成功卸载用例，仍无故障注入证明 | OPEN（P2，不阻断） |
| F-29 | Vitest worker RPC 超时，根因仍 OPEN | 见 §9.2 | **PARTIAL**（P2，不阻断） |
| R4-P2-01 | Drive `s0-evidence/` 内无 `logs/` 子文件夹 | 本轮 Drive 核实：`logs/` 子文件夹存在，`s0-gate.log` 在其内，内容核对一致（见 §八）；本地 `release/s0-evidence/logs/` 同样存在 | **CLOSED** |
| P1-R4-01 | Windows drive-letter 绝对路径 fail-open（终审 R4 的 P1） | 本人重跑 `tests/integration/full-chain.test.ts`（真实安装的 hook launchers，项目外 Windows Write 忽略、UNSEEN 的 Windows Write/Edit DENY exit 2、Windows Read 签发 FRESH 后 Write/Edit ALLOW）：**3/3 通过**；FIX-R4 新增的 drive-letter 单元测试亦在 §一的 234/234 之列 | **CLOSED（仍关闭）** |

### 9.2 F-29 维持 PARTIAL：缓解真实有效，未根治

- `vitest.config.ts` L14 `fileParallelism: false`（串行缓解）仍在；本人 S0 重跑（全量 455/455，耗时约 239s）日志中 0 次 `Timeout calling "onTaskUpdate"`；verify 两轮日志亦 0 次。并行争用这一系统性触发因素仍被消除。
- 但未根治：60s 悬崖仍在 Vitest 内硬编码（`00_control/P025_F29_DIAGNOSIS.md` L13/L21 定位的 `onTaskUpdate` 60s 超时未变）；最慢单文件耗时随负载波动，串行下仍可能逼近 60s。本轮绿跑证明的是“当前负载下不触发”，不是“不可能触发”。故维持 **PARTIAL**，仍计 1 个 P2。

### 9.3 R5 的三项 P2：全部关闭，不再计入

| ID | 问题 | 本轮结论 |
|---|---|---|
| R5-P2-01 | Drive-relative 拼写 `C:foo` 绕过门控 | **CLOSED**（见 §二） |
| R5-P2-02 | MSVC 前置条件文档事实错误 | **CLOSED**（见 §四） |
| R5-P2-03 | Manifest 的 T013 引用仍钉在 R3 | **CLOSED**（见 §五） |

### 9.4 新增 P2

| ID | 问题 | 证据 | 状态 |
|---|---|---|---|
| **R6-P2-01（新增）** | 尾随点/空格的目录段绕过门控（`src\session.\`、`src\session \`） | 探针 T1/T2：UNSEEN 下 Write/Edit 均为 ALLOW、gated:false、exit 0（日志 `probe-r6.log`、`probe-r6-edit.log`）。Win32 剥离段尾空格/句点，`session.` 即 `session`，却被当作不匹配的段放行。文件名尾随点/空格不绕过（glob `**` 吞掉）。判 P2 的理由：模型几乎从不写出这种拼写，可达性远低于大小写变体（见 §3.3 校准） | OPEN（P2，不阻断） |
| **R6-P2-02（新增）** | Drive-rooted / POSIX-absolute 拼写在 Windows cwd 下绕过门控（`/synthetic/...`、`\synthetic\...`） | 探针 R1–R3：UNSEEN 下 Write/Edit 均为 ALLOW、gated:false、exit 0；Node `path.win32.resolve` 独立证实该拼写即 `C:\synthetic\project\src\session\token.ts`。根因是 `resolveRelativeTargetPath` 的 `absolute` 标志比较把 Windows 目标与 POSIX 式目标判为不同根。判 P2 的理由：模型在 Windows 上全程见 `C:\…`，自发丢掉盘符远比写 `C:/...`（已堵住）罕见（见 §3.3 校准） | OPEN（P2，不阻断） |
| **R6-P2-03（新增）** | `release:verify` 在当前 HEAD 上 63/64 FAIL | 见 §7.2：唯一 FAIL 是 `working tree matches frozen commit`，由冻结后新增的 handoff 文档触发；同一 verify 在 release commit 上 64/64 PASS。流程问题，非产物问题 | OPEN（P2，不阻断） |
| **R6-P2-04（新增）** | 冻结报告 `T014_FREEZE_REPORT_R4.md` 未归档进 Drive R4 文件夹 | 见 §八：R4 文件夹顶层仅 5 文件；全 Drive 同名搜索唯一命中是无关的 P020 报告（17,768 B vs 本地 28,403 B，md5 不同）。R3 曾归档报告 .md，R4 未归档 | OPEN（P2，不阻断） |

**计数：P0 = 0，P1 = 0，P2 = 10**（OPEN/PARTIAL 的 P2 为 F-11、F-12、F-13、F-25、F-28、F-29（PARTIAL）、R6-P2-01、R6-P2-02、R6-P2-03、R6-P2-04；R5-P2-01、R5-P2-02、R5-P2-03 与 R4-P2-01 已 CLOSED；P1-R5-01 与 P1-R4-01 已 CLOSED；P1-R1-03 为遗留阻断，单列，不计入）。

---

## 十、P1-R1-03（真实 Claude Code E2E）—— 单列，不计入计数

- 仍为 `blocked_external`，本轮范围外。本 VM 无 Claude Code；本人未尝试安装、登录或伪造任何 Claude Code 证据。
- 冻结报告 `T014_FREEZE_REPORT_R4.md` 设专节“遗留阻断 P1-R1-03”，明确写“本项单列，不计入 P0/P1/P2 计数”，并列出三项待验证内容（Read→FRESH→Write、PreCompact→EXPIRED、Hook 崩溃/超时时 onFailure: "block"）；`reviews/REVIEW_INDEX.md` 同样记为 OPEN 范围外。属实。
- 不得因它未修就把本次 FIX-R5 修复判 FAIL，也不得把它算成已通过：本结论 PASS 仅由 P0=0 且 P1=0 决定，与 P1-R1-03 无关。
- 另记：R5 §六的 MSVC 纠正已被 FIX-R5 落实为文档（见 §四），P1-R1-03 的 BLOCKED_SETUP 叙述现为“T015 S1 真实原因未知，须凭 E01 日志重新诊断”——这不改变 P1-R1-03 仍为 OPEN 的事实，只改变“为什么阻塞”的说法。

---

## 十一、发现的新问题汇总

除 R6-P2-01/02（§三）与 R6-P2-03/04（§七、§八）外，**无新问题**。

另记两项方法学说明（不计为问题）：

1. `release:build` 未由本人重跑（会覆盖冻结产物，见 §7.3）；其 44/44 采信冻结 build 流程，全部输出由本人逐项独立核对无差异，且 `release:verify` 64/64（release commit 上）本身即从冻结 commit 重新生成并比对 source.zip 内容。
2. 本人 S0 重跑的 p95=396.58ms 是在精确冻结 commit 的 detached worktree 上、与主工作树的其他核对串行测得；数值波动本身即 F-25 的内容，不代表产品回归（canonical hash 与 455/455 均与冻结证据一致）。
3. 本轮探针曾两次误判后纠正，记录在案以免后人重蹈：(a) `src\..\session\token.ts` 与 `src\session\..\..\SESSION\Token.ts` 解析后确实在 `src/session/**` 之外，ALLOW 是正确的，不是绕过；(b) 8.3 短文件名未探查，不是不存在问题，只是不在本轮证据内。

---

## 十二、证据索引（本人亲自跑出的命令与文件）

- 冻结/发布 commit：`git rev-parse HEAD` = 9a20e17f3c258f04087cc0df1ae9b5f231b6f01a；manifest `frozen_commit` = 17cbd1e26aa3877e8e48f3584ccc3d617b8c7008；release commit e9a84725623808aa53d083e874cb9a0d90cf4d36；结束时 `git status` 仅审查前已有的未跟踪文件（`00_control/P025_F29_DIAGNOSIS.md`、`00_control/P025_FINAL_REVIEW_R3.md`、`00_control/P025_FINAL_REVIEW_R4.md`、`00_control/T015/`）。
- FIX-R5 diff：`git show 5f93c64`（生产：`sanitize.ts` +169、`glob.ts`、`match-rules.ts`、`adapter.ts`、`pre-tool-use.ts`；测试：5 文件 +32 测试，423→455）、`git show e73df08`（文档 3 文件）、`git show 04074d1`（release 脚本 2 文件）。
- 探针日志：`~/workspace/p025-t013-r6-tmp/probe-r6.log` 与 `probe-r6b.log`（R5 探针 7/7 + hunting 18 组 + 对照组；探针文件已删，工作树已恢复）、`~/workspace/p025-t013-r6-tmp/probe-r6-edit.log`（Edit 复现两组新绕过，4/4 ALLOW）。
- FIX-R5 新增测试重跑：`~/workspace/p025-t013-r6-tmp/fixr5-files.log`（5 文件，234/234，exit 0）；`tests/integration/full-chain.test.ts` 本人重跑通过（`~/workspace/p025-t013-r6-tmp/fullchain-r6.log`，3/3）。
- S0 重跑：`~/workspace/p025-t013-r6-tmp/s0-r6.log`（精确冻结 commit 17cbd1e 的 detached worktree，PASS，p95=396.58ms，455/455，canonical `ef06d30f…`，exit 0；worktree 已删）。
- release:verify：`~/workspace/p025-t013-r6-tmp/verify-r6-release.log`（release commit e9a8472 的 worktree，64 [PASS]，0 [FAIL]，`release:verify PASS — frozen 17cbd1e…`，worktree 已删）；`~/workspace/p025-t013-r6-tmp/verify-r6.log`（当前 HEAD 9a20e17，63 [PASS]，1 [FAIL]，唯一 FAIL 为工作树比对项）。
- SHA256SUMS：`sha256sum -c release/SHA256SUMS.txt` 13/13 OK（自 `02_source/` 根）；`unzip -t` 两 zip 均 No errors。
- Drive 核对：`~/workspace/p025-t013-r6-tmp/drive/`（top.json / s0.json / logs.json 元数据；6 个非 JSON 文件下载后 SHA-256 逐个一致；8 个 JSON 用 size + md5 核对；`logs/s0-gate.log` md5 与本地一致；`report-R4-drive.md` 为无关的 P020 报告）。
- Windows 语义独立验证：`node -e "require('path').win32.resolve('C:\\synthetic\\project','/synthetic/project/src/session/token.ts')"` → `C:\synthetic\project\src\session\token.ts`；Win32 尾随点/空格规则见公开文档（文件/目录名不得以空格或句点结尾，Win32 剥离之）。
- 参考日志（仅参考）：冻结报告 `02_source/release/T014_FREEZE_REPORT_R4.md`（build 44/44、verify 64/64、SHA256SUMS 13/13 的当时值）。
