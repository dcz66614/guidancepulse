# P025 GuidancePulse — T013 独立重审第 5 轮（R5，FIX-R4 复核）

- 审查员：独立重审员 R5（全新会话，与 R1/R2/R3/R4 审查员无关；以下每一项数字均为本人亲自跑出的命令退出码、文件哈希、测试输出与 Drive 下载结果，不采信协调员或以往报告的转述数字）
- 审查对象：冻结 commit `8e04562d6cc9cea8f4875b0cca78df27fbe4e17a`（简称 8e04562）；release commit `dcf22893a646565570d1c0110ba477ade5185828`（简称 dcf2289）；上一冻结 `f4d2b2e7ba0698b793e8b3e70d843b6e32354f61`（简称 f4d2b2e）保持未动
- 规格：v1.1.0；MIT；零真人；88h
- 审查时间：2026-11-17 02:11–02:25 GMT；工作目录 `~/workspace/p025-guidancepulse/`，HEAD 经 `git rev-parse` 核实为 dcf2289
- 审查范围：FIX-R4 全部内容（终审 R4 的 P1-R4-01 修复、新增 drive-letter 测试、MSVC 文档、F-29 缓解）+ 冻结产物自洽性 + Drive 归档 + R4 结转的 6 项 P2
- 审查方式：只读审查，未修改任何源码/测试/配置/门逻辑与冻结产物，未提交 GPT 终审 R5，未碰 GitHub，未安装、登录或伪造任何 Claude Code 证据。唯一写入工作树的是一份临时探针测试（跑完即删，见 §二），跑完后 `git checkout -- 02_source/artifacts` 恢复 S0 产物，结束时 `git status` 仅剩审查前已有的未跟踪文件

## 结论

**结论：FAIL**

**P0 = 0，P1 = 1，P2 = 9**

结论：FAIL

P0 = 0, P1 = 1, P2 = 9

**FINAL_VERDICT: FAIL**

FIX-R4 关闭了终审 R4 确认的 P1-R4-01 的字面范围（规范 drive-letter 拼写：`C:/…`、`C:\…`、小写盘符、UNC——本人重跑新增测试与 hook-entry E2E 全部通过），但**同一缺陷类留下一个可实证的 fail-open 残口**：Windows 路径大小写变体仍绕过写前门控（新 P1-R5-01，见 §二）。按规格 PROJECT_BOOK v1.1.0 §10 风险表（L709）“Windows 路径问题：P2，若导致误放行则 P1”，本人已在真实门控入口 `handlePreToolUse` 上实测误放行（Write/Edit 均为 ALLOW、gated:false、exit 0，而对照组为 DENY、gated:true、exit 2），故判 P1，结论 FAIL。其余方面：S0 本人重跑 PASS（但 p95 余量仅 2.60ms，见 §三）；`release:verify` 本人重跑 64/64 PASS；`sha256sum -c` 13/13 OK；Drive 14/14 核对通过（含 `logs/` 布局修正）；R4-P2-01 已关闭；F-29 由 OPEN 改为 PARTIAL（缓解有效，未根治）。

---

## 一、P1-R4-01：字面范围真正关闭，缺陷类未完全关闭

### 1.1 修复代码核实（本人逐行读 diff，不采信转述）

`git diff f4d2b2e 8e04562` 中 FIX-R4 的生产改动确为：

- `02_source/src/privacy/sanitize.ts`：新增 `isAbsolutePath`（L88，仅认 `/` 开头、`^[A-Za-z]:/`、UNC）、`canonicalizeDriveLetter`（L99，仅大写首字母盘符）、`resolveRelativeTargetPath`（L160，绝对路径对 cwd 做前缀匹配，项目外返回 null）、`normalizePathForId` 增加 drive 前缀 floor（L122）；`readToolFilePath`（L307，L323 改为 `isAbsolutePath` 判断）与 `readLoadedPaths`（L347，L358 绝对条目丢弃）同步改用新判断。属实。
- `02_source/src/hooks/adapter.ts`：`resolveRelativeTarget`（L338–349）删除旧的 `startsWith("/")` 分支，委托给共享 `resolveRelativeTargetPath`。属实。
- `02_source/src/hooks/pre-tool-use.ts`：`toRelativeTarget`（L312）同样委托给共享函数，门控与适配器不再可能对同一目标意见不一致。属实。
- `02_source/src/privacy/index.ts`：导出新增的两个函数。属实。

冻结 source.zip 内 `src/privacy/sanitize.ts` 的 SHA-256（`43313a1b…`）与工作树文件逐字节一致——本人从 source.zip 解压到临时目录核对，不只信工作树。manifest `frozen_commit` == `s0_evidence.git_commit` == 8e04562d6cc9cea8f4875b0cca78df27fbe4e17a；顶层 `s0_gate`（verdict PASS、p95=297.30ms、canonical `ef06d30f…`、full_tests 423/0/22、generated 2026-11-17T02:06:37.288Z）与 `s0_evidence` 逐字一致（本人用 Python 程序化比对，非目测）。

### 1.2 本人重跑新增测试：规范拼写全部通过

命令：`cd 02_source && TMPDIR=~/workspace/p025-r5-tmp npx vitest run tests/unit/privacy-sanitizer.test.ts tests/unit/pre-tool-use.test.ts tests/unit/hooks-adapter.test.ts`（与探针同批运行，见 §二）：

- 3 个文件全部通过；其中 FIX-R4 新增的 drive-letter 用例（sanitize 层 drive 字母规范化、UNC 折叠、`..` 不越 drive 前缀、`isAbsolutePath` 接受/拒绝表、`resolveRelativeTargetPath` 的 Win/UNC/项目外/相对路径、PreToolUse 的 Windows Write/Edit UNSEEN→DENY exit 2、FRESH→ALLOW、项目外不设门、Windows Read 签发 FRESH 后 Write ALLOW）逐项均在通过之列。
- `tests/integration/full-chain.test.ts` 本人重跑通过：真实安装的 hook launchers（plain node 子进程）上，项目外 Windows Write 被忽略（exit 0，`ignored:true`，`reason:"target-outside-project"`）、UNSEEN 的 Windows Write/Edit 均为 DENY exit 2、Windows Read 签发 FRESH 后 Write/Edit 均为 ALLOW exit 0，审计链 `["DENY","DENY","ALLOW","ALLOW"]`，无 canary 泄漏。

**判断：P1-R4-01 在 GPT 确认的字面范围（规范 drive-letter 拼写）内真正关闭。** 但 §二的残口属于同一缺陷类（Windows 路径拼写绕过门控），须另立 P1，不得视为 P1-R4-01 已彻底解决。

---

## 二、新 P1：Windows 大小写变体仍绕过门控（P1-R5-01）

### 2.1 本人实测（临时探针，非产品代码）

本人写了一份临时探针测试 `02_source/tests/unit/r5-probe.test.ts`（与 `pre-tool-use.test.ts` 同款 harness/配置：规则 `auth-change-safety`，`applies_to: [src/auth/**, src/session/**]`，mode block；全新 `:memory:` store，**无任何 lease，即 UNSEEN**；cwd `C:\synthetic\project`），对 `handlePreToolUse`（真实门控入口）跑 7 组输入，跑完即删文件。结果（日志 `~/workspace/p025-r5-tmp/probe-r5.log`，`PROBE …` 行原文）：

| # | 输入 `file_path`（Write，除注明外） | 结果 | 判定 |
|---|---|---|---|
| 1 | `C:src\session\token.ts`（drive-relative，反斜杠） | ALLOW，gated:false，exit 0 | 误放行（见 R5-P2-01，另计 P2） |
| 2 | `C:src/session/token.ts`（drive-relative，正斜杠） | ALLOW，gated:false，exit 0 | 误放行（同上） |
| 3 | `C:\SYNTHETIC\PROJECT\src\session\token.ts`（cwd 前缀大小写变体） | ALLOW，gated:false，exit 0 | **误放行（P1）** |
| 4 | `c:\Synthetic\Project\src\session\token.ts`（Edit，混合大小写） | ALLOW，gated:false，exit 0 | **误放行（P1）** |
| 5 | `C:\synthetic\project\src\SESSION\token.ts`（cwd 精确，仅受保护段大小写变体） | ALLOW，gated:false，exit 0 | **误放行（P1）** |
| 6 | `C:\synthetic\project\SRC\session\token.ts`（同上，`SRC`） | ALLOW，gated:false，exit 0 | **误放行（P1）** |
| 对照 | `C:\synthetic\project\src\session\token.ts`（规范拼写） | DENY，gated:true，exit 2 | 门控正常 |

6/6 非常规范拼写全部误放行，对照组 DENY——探针 harness 本身无误，结论不是测试替身问题。

### 2.2 两个独立的失效机理（均已定位到文件+行）

机理 A——cwd 前缀大小写不匹配（#3、#4）：`resolveRelativeTargetPath`（`sanitize.ts` L160–175）只对盘符做大小写折叠（`canonicalizeDriveLetter` L99，仅 `^[a-z]:/` → 大写），其余路径段逐字节比较。`C:/SYNTHETIC/PROJECT/src/…` 与 cwd 规范化值 `C:/synthetic/project` 前缀不等 → 返回 null → 适配器/门控按“项目外目标”处理 → `ignored` → ALLOW（`pre-tool-use.ts` L183–196 的 no-gate 分支）。Windows 文件系统（NTFS 默认）大小写不敏感，`C:\SYNTHETIC\PROJECT\src\session\token.ts` 与 `C:\synthetic\project\src\session\token.ts` 是同一文件。

机理 B——glob 段大小写不匹配（#5、#6）：路径已正确相对化为 `src/SESSION/token.ts`，但 `matchGlob`（`src/config/glob.ts` L228）是大小写敏感的（语法说明 L15：“A literal segment matches exactly”），`src/session/**` 不匹配 `src/SESSION/token.ts` → 无规则命中 → `ignored` → ALLOW。这是更易触发的一路：**不需要 cwd 不匹配，模型只要把受保护段写成 `SRC`、`Session`、`Token.ts` 之类的大小写变体即可绕过**；而模型生成的路径大小写本来就不稳定（cwd 来自进程启动方式、file_path 来自模型文本，两处来源的大小写没有一致性保证）。

### 2.3 为什么是 P1 不是 P2

- 规格依据：PROJECT_BOOK v1.1.0 §10 风险表 L709：`Windows 路径问题 | P2，若导致误放行则 P1`。本人实测的就是误放行，无附加条件。
- 同类先例：GPT R4 把规范拼写的同一失效签名（ignored、exit 0、onFailure 不触发）定为 P1-R4-01；本残口是同一缺陷类、同一失效签名，只是拼写变体不同。不能因为规范拼写修好了，就把同类误放行降级。
- 可达性：不依赖任何奇异拼写——#5/#6 只需模型把一个路径段的大小写写错，这是模型生成路径时的常见波动；#3/#4 只需 cwd 与 file_path 来源不同（进程启动 vs 模型文本），大小写不一致在 Windows 上是日常现象。不得以“Claude Code 可能会规范化路径”来抵消——本 VM 无 Claude Code（P1-R1-03 未验证），没有任何已验证证据表明宿主会把大小写规范化；用未经证实的宿主行为为产品级 fail-open 开脱，正是 T013 不应犯的错误。
- 修复方向（仅建议，不动手）：Windows 路径比较应全路径大小写折叠（cwd 前缀比较与 glob 匹配均按 Windows 语义处理，或大小写存疑时 fail-closed 拒绝），而非只折叠盘符。

**P1-R5-01：Windows 大小写变体路径绕过写前门控（Write/Edit，UNSEEN 下 ALLOW、gated:false、exit 0）。证据：`~/workspace/p025-r5-tmp/probe-r5.log` 的 4 行 PROBE 记录（#3–#6）+ 对照组 DENY；机理文件 `02_source/src/privacy/sanitize.ts` L99/L160–175 与 `02_source/src/config/glob.ts` L15/L228。**

另注：Read 侧的大小写变体（`C:\SYNTHETIC\PROJECT\CLAUDE.md`）按代码阅读同样会被忽略而不签发 FRESH——该方向是 fail-closed（不签发凭证），单独不构成绕过；但与 Write 侧残口结合，净效果仍是 fail-open，故不在此单独立项。

---

## 三、亲自重跑 S0：PASS，但 p95 余量仅 2.60ms

命令：`cd 02_source && TMPDIR=~/workspace/p025-r5-tmp npm run s0:gate`（单次，未重试；日志 `~/workspace/p025-r5-tmp/s0-r5.log`）。

- **verdict: PASS；退出码 0。p95=497.40ms**（n=100，p50=310.52ms，p99=530.40ms，min=158.88ms，max=662.13ms，cold_start=530.40ms，run_failures=0）——通过阈值（<500ms），但余量仅 **2.60ms**。
- 全量测试 **423 passed / 0 failed / 22 files**；typecheck exit 0；golden 53/53；oracle 48/48；7 门全部 PASS：parity 48/48、检出 32/32、控制 16/16、100 次重放唯一哈希 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（与冻结证据逐字相同）、网络 0、隐私 0。
- 说明：本次重跑的 `environment.git_commit` 为 dcf2289（本人在 HEAD release commit 上运行；源码与冻结 commit 一致，仅 release/ 文件不同）；冻结证据运行的 `git_commit` 为 8e04562，p95=297.30ms。两次运行的 p95 差异（297.30 vs 497.40）与 p50 差异（173.41 vs 310.52）均为 VM 负载波动，见 F-25。
- 跑完后已把 `02_source/artifacts/` 恢复到 HEAD（`git checkout -- 02_source/artifacts`，并删除残留）；结束时 `git status` 仅剩审查前已有的未跟踪文件。

**判断：S0 门本身 PASS，数值真实。但 p95 已两次逼近阈值（本轮树内门 492.69ms、本人重跑 497.40ms），F-25 的波动观察升级为实质性 flakiness 风险（见 §七），仍记 P2 观察，不阻断。**

---

## 四、发布产物核对：verify 64/64、SHA256SUMS 13/13；build 未由本人重跑（有理由）

- `sha256sum -c release/SHA256SUMS.txt`（自 `02_source/` 根运行）：**13/13 OK**，退出码 0。
- `npm run release:verify` 本人重跑：**64 个 [PASS]，0 个 [FAIL]**，末行 `release:verify PASS — frozen 8e04562d6cc9cea8f4875b0cca78df27fbe4e17a`，退出码 0（日志 `~/workspace/p025-r5-tmp/verify-r5.log`）。其中含 dist.zip CLI smoke（树外临时项目 `init → install → status → uninstall` 全部 exit 0）。
- `npm run release:build` **未由本人重跑**，理由：build 不是只读操作——它会重新跑完整 S0 证据并重打 source.zip/dist.zip、重写 manifest 与 SHA256SUMS，从而覆盖正在审查的冻结产物本身；重跑 build 等于销毁审查对象。替代核对（全部由本人独立做出）：(a) 冻结 build 日志 `~/workspace/p025-fix-r3-tmp/build-r3.log` 末行 `release:build PASS — frozen 8e04562…`，其中 44 项检查均通过（日志含 45 行 PASS 计数，含末行汇总）；(b) 本人独立核对 build 的全部输出：source.zip 3,030,363 B sha `74139057…`、dist.zip 674,468 B sha `d9160228…`、RELEASE_MANIFEST.json 8,784 B sha `7b898cb0…`、SOURCE_MANIFEST.csv 32,550 B sha `65219058…`、SHA256SUMS.txt 1,284 B sha `7fa96aa2…`，与任务书给定值逐字一致；(c) source.zip 解压后 246 条目、SOURCE_MANIFEST 209 行文件 + 1 行表头，与 manifest 一致；(d) `release:verify` 64/64 本身即从冻结 commit 重新生成并比对 source.zip 内容。build 44/44 未由本人逐项复跑，但其输出已由本人逐项独立核对，无差异。
- manifest 一致性（本人 Python 程序化比对）：`frozen_commit` == `s0_evidence.git_commit` == 8e04562…；顶层 `s0_gate` 与冻结证据的 verdict/p95/canonical/full_tests/generated_at_utc 逐字一致（p95=297.30ms，generated 2026-11-17T02:06:37.288Z）；本地 9 个证据文件与 manifest `s0_evidence.files` 的 bytes + sha256 逐个一致。

---

## 五、Drive 归档：14/14 独立核对通过

Drive 位置：`04_release/T014_R3_2026-11-17_8e04562`（id `1DN4AX4XD29TNooHAtzOHbt8k50p6zyLh`，位于 04_release `1-QrdC2we1HRd4kjliVo4PbHNQlzDpG6s` 下），其下 `s0-evidence/` 子文件夹（id `1jiriWm7-rhJfksHz3weUJaRJcbOgdF9s`）与 `logs/` 子文件夹（id `1eOp5MPWNyx50GzdRxjFb0JNOjDhUTK39`）。本人用 `drive files list` 逐项列出并逐个核对（日志与下载文件在 `~/workspace/p025-r5-tmp/drive/`）：

- 顶层 6 文件：source.zip、dist.zip、RELEASE_MANIFEST.json、SOURCE_MANIFEST.csv、SHA256SUMS.txt、T014_FREEZE_REPORT_R3.md——Drive 元数据 size + md5Checksum 与本地逐个一致（6/6）。
- `s0-evidence/` 8 文件：S0_GATE.json、S0_GATE.md、fixture-results.json、oracle-results.json、perf-hook.json、repeat-hashes.json、privacy-scan.json、network-scan.json——size + md5 逐个一致（8/8）。
- `logs/s0-gate.log`：位于 `s0-evidence/logs/` 下（**R4-P2-01 的布局问题已修正，不再平铺**），size + md5 与本地一致（1/1）。
- 另将 7 个非 JSON 文件逐个从 Drive 下载并比对 SHA-256：source.zip `74139057…`、dist.zip `d9160228…`、SOURCE_MANIFEST.csv `65219058…`、SHA256SUMS.txt `7fa96aa2…`、S0_GATE.md `617abc17…`、T014_FREEZE_REPORT_R3.md `1da92e04…`、s0-gate.log `2fa35963…`——7/7 与本地/manifest 一致。8 个 JSON 文件下载时返回 0 字节（CLI 已知问题，R4 同样遇到），改用元数据核对，8/8 一致。

**Drive 核对：14/14 通过。R4-P2-01（`s0-gate.log` 平铺、无 `logs/` 子文件夹）确认 CLOSED，不再计入 P2。**

---

## 六、MSVC 前置条件文档：核心说法与事实不符（新 P2，R5-P2-02）

FIX-R4 新增的文档（commit 9477143，`02_source/README.md` L29–36 与 `02_source/docs/USER_GUIDE.md` L50–57）称：`npm ci` 会跑 `better-sqlite3@13.2.0` 的安装脚本（`node-gyp rebuild`）现场编译原生模块，且 Node 24（v137）win32-x64 没有预编译包；没装工具链时 `npm ci` 会在 `better-sqlite3` 这一步失败；须装 VS Build Tools 2022 + “Desktop development with C++” 工作负载（管理员权限），装前用 `vswhere -requires VC.Tools` 核对。本人按锁定的包内容逐项核实，结果是**核心机制说法错误**：

1. **没有安装脚本**：`node_modules/better-sqlite3/package.json` 的 scripts 只有 build-release、build-debug、test、benchmark、download、clean——无 `install`/`preinstall`/`postinstall`。GuidancePulse 自身的 `package.json` 也无 postinstall。整棵依赖树中有安装脚本的包只有一个：esbuild（预编译包下载，无编译）。`npm ci` 不可能在 `better-sqlite3` 这一步触发 `node-gyp rebuild`。
2. **预编译包存在，且与 Node 版本无关**：锁定的 tarball（`package-lock.json`：`better-sqlite3-13.2.0.tgz`，integrity `sha512-Z8Q/…SKWZQ==`；`package.json` 的 `files` 含 `prebuilds/**`）内含 `prebuilds/win32-x64.node`，本人验证为有效 PE32+ DLL。且该模块是 N-API 模块（依赖 `node-addon-api@^8.0.0`；Linux 预编译包内 72 处 `napi_` 导入；加载逻辑 `lib/binding.js` 直接 `require('../prebuilds/win32-x64.node')`，无下载、无版本匹配），**不存在“Node 24（v137）没有对应预编译包”这个问题**——同一二进制在任何受支持的 Node 上加载。本人实测 Linux 侧等价预编译包在 Node v24.22.1 上加载正常（`better-sqlite3 loads OK on v24.22.1`）。
3. **连运行时依赖都不需要 MSVC**：`win32-x64.node` 的 PE 导入表只有 `KERNEL32.dll` 与 `libnode.dll`，不链接 `VCRUNTIME140.dll`/`MSVCP140.dll`/UCRT——即加载它既不需要 C++ 工具链，也不需要 VC++ Redistributable。
4. **真正原因未知**：T015 S1 的实际 `npm ci` 日志（E01）从未归档进 Drive（GPT R4 §4.2 亦已指出），`00_control/T015/` 内亦无该日志。文档断言的失败原因没有一手证据支撑；按锁定的包内容，该原因不成立。S1 到底为什么失败，须凭实际日志重新诊断，不得沿用此说法。

**R5-P2-02：MSVC 前置条件文档事实错误（README.md L29–36、USER_GUIDE.md L50–57）。** 影响：该文档会让 Sam 做一次大型管理员级系统变更（安装 C++ 工作负载），而按证据该变更对 `better-sqlite3@13.2.0` 既非必要也非相关；且它把 T015 S1 的阻塞原因写错，会误导后续排查。记 P2（文档，不阻断产品门控），但须纠正：删除 MSVC 工作负载要求，改为“better-sqlite3 自带 N-API 预编译包，无需编译工具链；如 `npm ci` 失败请保留完整日志重新诊断”。

---

## 七、结转 P2 清单复核与新 P2

### 7.1 R4 的 6 项结转 P2 + R4-P2-01

| ID | 问题 | 本轮抽查 | 状态 |
|---|---|---|---|
| F-11 | 计划书旧章节引用、Fixture/Golden/Oracle 仍标注 v1.0.0 §5 | `00_control/IMPLEMENTATION_PLAN.md` L988 仍为 v1.0.0 规格版本表；`tests/fixtures/s0/author-fixtures.py` L8/L228/L560 与 `tests/fixtures/s0/control/C01.json` L5 等仍标 `v1.0.0 §5`，未变 | OPEN（P2，不阻断） |
| F-12 | Oracle 三处边缘语义参考生产源码 | `tests/oracle/reference_oracle.py` 头注释仍自述“reading the production sources only as a semantic reference for frozen edge choices that the spec leaves open (fail-closed on unknown cwd/phase, budget-0 leases, lazy expiry)”；三向 48/48 中两路仍独立 | OPEN（P2，不阻断） |
| F-13 | 冷启动样本是 Read 而不是 Write | `scripts/perf-hook.ts` `seedInput()`（L206–215）仍为 PostToolUse Read | OPEN（P2，不阻断） |
| F-25 | p95 随 VM 负载波动 | 本轮新增两个实测点：冻结证据 297.30ms 与本人重跑 **497.40ms**（余量仅 2.60ms，p50 亦从 173.41 升至 310.52ms）；历轮 p95 现为 213.76 / 216.31 / 226.51 / 217.64 / 218.92 / 203.07 / 256.07 / 492.69 / 297.30 / 497.40ms——两次逼近阈值（492.69、497.40），门随时可能因负载抖动而 FAIL，属实质性 flakiness 风险，但本次仍 PASS | OPEN（P2，观察，不阻断） |
| F-28 | uninstall 失败回滚没有直接回归测试 | `tests/integration/fix-t013.test.ts` 的回滚用例（L227 起，F-19）仍只在 install 侧（构建失败后恢复用户编辑）；uninstall 侧（L159）只有成功卸载用例，仍无故障注入证明 | OPEN（P2，不阻断） |
| F-29 | Vitest worker RPC 超时，根因仍 OPEN | 见 §7.2 | **PARTIAL**（P2，不阻断） |
| R4-P2-01 | Drive `s0-evidence/` 内无 `logs/` 子文件夹 | 本轮 Drive 核实：`logs/` 子文件夹存在，`s0-gate.log` 在其内，内容核对一致（见 §五） | **CLOSED** |

### 7.2 F-29 改为 PARTIAL：缓解真实有效，未根治

- 诊断与修复一致：`00_control/P025_F29_DIAGNOSIS.md` 定位根因为 Vitest worker→main birpc `onTaskUpdate` 60s 硬编码超时 + 并行负载下慢文件超 60s，推荐方案 1（降并行）；`490fdc8` 实施的正是该方案（`vitest.config.ts` L14 `fileParallelism: false`，注释亦如实记录 `maxForks: 2` 无效：4 errors、文件达 107s）。本人全量重跑 `npm test`：**423/423，22 文件，exit 0，耗时 131.33s，0 次 `Timeout calling "onTaskUpdate"`**（日志 `~/workspace/p025-r5-tmp/full-r5.log`）；冻结证据跑亦首轮通过。并行争用这一系统性触发因素已被消除。
- 但未根治：60s 悬崖仍在 Vitest 内硬编码；最慢单文件耗时随负载波动（本人串行跑最慢 25.97s；诊断报告中同文件单跑曾达 48.5s，串行下仍可能逼近 60s）。本轮两次绿跑证明的是“当前负载下不触发”，不是“不可能触发”。冻结报告亦自述“不得宣称根治”。故由 OPEN 改为 **PARTIAL**，仍计 1 个 P2。

### 7.3 新增 P2

| ID | 问题 | 证据 | 状态 |
|---|---|---|---|
| **R5-P2-01（新增）** | Drive-relative 拼写 `C:foo` 仍绕过门控 | 探针 #1/#2：`C:src\session\token.ts` 与 `C:src/session/token.ts` 在 UNSEEN 下均为 ALLOW、gated:false、exit 0（日志 `probe-r5.log`）。Windows 语义上 `C:foo` = C 盘当前目录下的 foo，cwd 在 C 盘时即项目内文件，却被当作相对路径 `C:src/session/token.ts` 处理，匹配不到任何 glob。`isAbsolutePath`（`sanitize.ts` L88）有意将其判为非绝对（新测试亦明文断言 `C:foo`、`C:protected/notes.txt` 不是绝对路径），但“非绝对”不等于“安全”——它仍应被解析或 fail-closed，而非忽略放行。降为 P2 的理由：该拼写在模型/工具输出中极罕见（cmd 习语，模型几乎只写 `C:\…`），且宿主可能在传参前规范化；与 P1 的大小写变体不同，可达性低。建议：drive-relative 拼写按同盘 cwd 解析，或无法解析时 fail-closed | OPEN（P2，不阻断） |
| **R5-P2-02（新增）** | MSVC 前置条件文档事实错误 | 见 §六：无安装脚本、预编译包在 tarball 内且为 N-API（与 v137 无关）、DLL 不链接 VC++ 运行时、S1 真实原因未知 | OPEN（P2，不阻断） |
| **R5-P2-03（新增）** | Manifest 的 T013 引用仍钉在 R3 | `scripts/release-build.mjs` L558 与 `scripts/release-verify.mjs` L458 硬编码读取 `reviews/T013_FINAL_REVIEW_R3.md`；manifest `review` 块仍为 R3（PASS，P0=0，P1=0，P2=7）。R3 审查的是 commit 6874984（FIX-R1 时代），从未见过 FIX-R4 代码；R4 审查 f4d2b2e、R5（本轮）审查 8e04562，manifest 仍引 R3。冻结报告已披露此缺口，但引用本身会让日后读者误以为“本次冻结已通过 T013 审查”。修复：下次重冻时将引用参数化为实际审查报告 | OPEN（P2，不阻断） |

**计数：P0 = 0，P1 = 1，P2 = 9**（OPEN/PARTIAL 的 P2 为 F-11、F-12、F-13、F-25、F-28、F-29（PARTIAL）、R5-P2-01、R5-P2-02、R5-P2-03；R4-P2-01 已 CLOSED；P1-R1-03 为遗留阻断，单列，不计入）。

---

## 八、P1-R1-03（真实 Claude Code E2E）—— 单列，不计入计数

- 仍为 `blocked_external`，本轮范围外。本 VM 无 Claude Code；本人未尝试安装、登录或伪造任何 Claude Code 证据。
- 冻结报告 `T014_FREEZE_REPORT_R3.md` 设专节“遗留阻断 P1-R1-03”，明确写“本项单列，不计入 P0/P1/P2 计数”，并列出三项待验证内容（Read→FRESH→Write、PreCompact→EXPIRED、Hook 崩溃/超时时 onFailure: "block"）；`reviews/REVIEW_INDEX.md` 同样记为 OPEN 范围外。属实。
- 不得因它未修就把本次 FIX-R4 修复判 FAIL，也不得把它算成已通过：本结论 FAIL 仅由新 P1-R5-01 导致，与 P1-R1-03 无关。
- 另记：§六的发现使 P1-R1-03 的 BLOCKED_SETUP 叙述本身存疑——S1 失败的归因（better-sqlite3 需现场编译）与锁定的包内容不符，真实原因须凭 E01 日志重新诊断。这不改变 P1-R1-03 仍为 OPEN 的事实，只改变“为什么阻塞”的说法。

---

## 九、发现的新问题汇总

除 P1-R5-01（§二）与 R5-P2-01/02/03（§七）外，**无新问题**。

另记两项方法学说明（不计为问题）：

1. `release:build` 未由本人重跑（会覆盖冻结产物，见 §四）；其 44/44 采信冻结 build 日志为参考，全部输出由本人逐项独立核对无差异。
2. 本人 S0 重跑的 p95=497.40ms 是在工作树刚跑完一次全量测试、VM 负载较高时测得；数值波动本身即 F-25 的内容，不代表产品回归（canonical hash 与 423/423 均与冻结证据一致）。

---

## 十、证据索引（本人亲自跑出的命令与文件）

- 冻结/发布 commit：`git rev-parse HEAD` = dcf22893a646565570d1c0110ba477ade5185828；manifest `frozen_commit` = 8e04562d6cc9cea8f4875b0cca78df27fbe4e17a；结束时 `git status` 仅审查前已有的未跟踪文件（`00_control/P025_F29_DIAGNOSIS.md`、`00_control/P025_FINAL_REVIEW_R3.md`、`00_control/P025_FINAL_REVIEW_R4.md`、`00_control/T015/`）。
- FIX-R4 diff：`git diff f4d2b2e 8e04562`（生产：`sanitize.ts` +89、adapter/pre-tool-use 委托共享函数；测试：4 文件 +27 测试，396→423；`vitest.config.ts` +8 行；文档 2 文件）。
- 探针日志：`~/workspace/p025-r5-tmp/probe-r5.log`（7 组输入，6 组 ALLOW 误放行 + 1 组对照 DENY；探针文件已删，工作树已恢复）。
- 新增测试重跑：与探针同批，`tests/unit/privacy-sanitizer.test.ts`、`tests/unit/pre-tool-use.test.ts`、`tests/unit/hooks-adapter.test.ts` 全部通过（111 通过，含对照组；另 4 个失败仅为探针的预期失败）；`tests/integration/full-chain.test.ts` 通过。
- 全量测试：`~/workspace/p025-r5-tmp/full-r5.log`（423/423，22 文件，exit 0，131.33s，最慢单文件 installer 25.97s，0 次 RPC 超时）。
- S0 重跑：`~/workspace/p025-r5-tmp/s0-r5.log`（PASS，p95=497.40ms，423/423，canonical `ef06d30f…`，exit 0）。
- release:verify：`~/workspace/p025-r5-tmp/verify-r5.log`（64 [PASS]，0 [FAIL]，`release:verify PASS — frozen 8e04562…`）。
- SHA256SUMS：`sha256sum -c release/SHA256SUMS.txt` 13/13 OK（自 `02_source/` 根）。
- 冻结 source.zip 解出核对：`~/workspace/p025-r5-tmp/frozen/guidancepulse/`（`sanitize.ts` SHA-256 与工作树一致；246 条目；SOURCE_MANIFEST 209 行 + 表头）。
- Drive 核对：`~/workspace/p025-r5-tmp/drive/`（7 个非 JSON 文件下载后 SHA-256 逐个一致；8 个 JSON 用 size + md5 核对；`logs/s0-gate.log` md5 与本地一致）。
- MSVC 核对：`node_modules/better-sqlite3/package.json`（无 install 脚本，依赖 `node-addon-api@^8.0.0`）、`lib/binding.js`（直接 require 预编译包）、`prebuilds/win32-x64.node`（PE32+ DLL，仅导入 KERNEL32.dll 与 libnode.dll）、`package-lock.json`（锁定 `better-sqlite3-13.2.0.tgz`，integrity `sha512-Z8Q/…SKWZQ==`）。
- 参考日志（仅参考）：`~/workspace/p025-fix-r3-tmp/build-r3.log`（末行 `release:build PASS — frozen 8e04562…`，44 项通过）。
