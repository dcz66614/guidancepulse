# P025 GuidancePulse — T014 Freeze Report R5（重新冻结，FIX-R6 后）

- TASK_ID: T014（重新冻结，FIX-R6 后）
- STATUS: **PASS**
- 规格版本：v1.1.0（`00_control/v1.1.0/PROJECT_BOOK.md`、
  `00_control/v1.1.0/IMPLEMENTATION_PLAN.md`）
- 冻结 commit（freeze commit）: `4216d962328a15a432de534947d6a56483dccd7d`
  （冻结 commit 日期 2026-11-17T03:23:34+00:00）
- 取代的旧冻结：`17cbd1e26aa3877e8e48f3584ccc3d617b8c7008`
  （2026-11-17T02:41:28+00:00；release commit `e9a8472`；旧冻结报告
  `T014_FREEZE_REPORT_R4.md` 保留在 git 历史与 Drive 旧版中，不覆盖）
- License: `MIT`（Sam 于 2026-11-13 决定全部项目许可证均为 MIT；
  LICENSE 内容哈希 `50b8b302ffcb53aec1866ad4b94721c200400e6aac8cee12db03b85f24e39ed2`，
  与 P021/P023 的 LICENSE 字节一致）
- 生成命令：`npm run release:build`（`scripts/release-build.mjs`）、
  `npm run release:verify`（`scripts/release-verify.mjs`）、
  `sha256sum -c release/SHA256SUMS.txt`（自 `02_source/` 根运行）
- 生成时间（UTC）：2026-11-17 ~03:23–03:31（树内门 03:20–03:23，
  build 第一轮 ~03:24–03:27，第二轮 03:28–03:31，verify 两轮
  03:31–03:32；manifest 内时间戳取冻结证据运行的生成时间，
  `s0_evidence` 块与 `release/s0-evidence/` 每次重跑都会变，
  见“确定性”一节）

## 产物

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `release/source.zip` | 3,080,620 | `9aa4d7867166f88cde575330d8f4455deb3af60a667b0d21ae9361cef33b9144` |
| `release/dist.zip` | 688,475 | `c77c4224aef4cc3a12cfa14de975f9d3e3d83a0e77867376d163d1db515d8016` |
| `release/RELEASE_MANIFEST.json` | 9,291 | `6ef6c41308ba87c842a73683c84ec69dc248a346a4b1fa53c1e8330df4bafb06` |
| `release/SOURCE_MANIFEST.csv` | 32,717 | `e2946d9b4d12bff83762887ac5028986a284c74ba908f353ce35a9e826236fe7` |
| `release/SHA256SUMS.txt` | 1,284 | `eefa8c8520f72c1e827dc173dece4493fa0539cb29a2e1f0e5afdb388610cc60` |

另有 `release/s0-evidence/`（9 个文件，冻结 commit 上重跑的 S0 证据，
见下节）：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `release/s0-evidence/S0_GATE.json` | 8,984 | `037f5ace7230fd9e397f8f8d9b547ffd7d9320899e67191cf304eb91d8f9a698` |
| `release/s0-evidence/S0_GATE.md` | 2,350 | `77c257c49b7cc1768dc9f458521bbc6f7cc6129a40e8a4700dcb18ebd3d59a9c` |
| `release/s0-evidence/fixture-results.json` | 187,747 | `79daa09bbf4a624e5921f66e367fc0c73fe1384344e7beff01648d0561a25f74` |
| `release/s0-evidence/oracle-results.json` | 48,427 | `712e024d5bf681d91522239a449c5678272e3a52e78965a9265500605957df5f` |
| `release/s0-evidence/perf-hook.json` | 2,866 | `ebc11bb7a953b1fbc1a9e6181f1f7be0dc16341538980b431aa9ea63e0fd34a5` |
| `release/s0-evidence/repeat-hashes.json` | 7,476 | `1fe3e5429e6ab72141bd2e4b150aecf791508d03d5b55447ef02cba5bba0ecc7` |
| `release/s0-evidence/privacy-scan.json` | 4,587 | `19abf7efd1e6bebd5a572476becce3f96e05cf59242c2679e6401fe5f1348a34` |
| `release/s0-evidence/network-scan.json` | 415 | `d93b0840e7783fef0634717c9e868f0a2496fd852df112c1fa821d26a0937e06` |
| `release/s0-evidence/logs/s0-gate.log` | 1,816 | `ecd4eb67ae8ce1836079e7e2b849a3fd4bf76f8391ffd2f03afbd32b933224bf` |

- `source.zip`：`git archive --format=tar 4216d96… -- 02_source` 解出后
  以确定性 STORE zip 重打（固定 1980-01-01 时间戳、按路径排序、保留
  Unix 模式），前缀 `guidancepulse/`，247 条目（210 个文件 + 37 个目录
  条目；比 R4 的 246 多 1，即 FIX-R6 新增的测试文件）。内容与
  `SOURCE_MANIFEST.csv`（210 行文件 + 1 行表头，每行 zip 路径、字节、
  内容 SHA-256、git blob SHA）逐字节一致，verify 已从冻结 commit
  重新生成并比对。`bin/guidancepulse` 在 zip 内为 0o755，解压后可直接
  执行。比 R4 冻结大 20,973 B（3,080,620 vs 3,059,647），差额来自
  FIX-R6 的生产修复与新增测试（尾随点/空格段剥离、drive-rooted 解析、
  UNC 下 fail-closed），见“相对 R4 的变化”。
- `dist.zip`：57 条目（同为确定性 STORE zip），与 R4 冻结的 dist.zip
  SHA 不同（`c77c4224…` vs R4 的 `d78d5ff8…`，源于 FIX-R6 生产代码
  改动，预期内）：`package.json`、`package-lock.json`、
  `README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、
  `guidancepulse.example.yaml`、`index.html`、`vite.config.ts`、
  `tsconfig.json` 在根目录，`dist/`（vite UI 构建产物）、`bin/`（CLI
  启动器，0o755）、`src/`（TypeScript CLI 与 Hook，经 vite-node
  运行）、`scripts/hook-entry.ts`（Hook 构建用 tsc 编译它）、`schemas/`、
  `docs/`。无 `tests/`、`artifacts/`、`node_modules/`、`release/`。
  解压 + `npm ci` 后可运行（build 与 verify 各跑 smoke，共 4 次，见下）。
- `SHA256SUMS.txt` 覆盖 source.zip、dist.zip、RELEASE_MANIFEST.json、
  SOURCE_MANIFEST.csv 与全部 9 个 `s0-evidence/` 文件，共 13 行，
  条目以 `release/` 开头，故 `sha256sum -c release/SHA256SUMS.txt`
  自 `02_source/` 根运行，全部 OK（见验收表）。
- 两处烟囱 CLI smoke 均通过（build 与 verify 各跑一次，共 4 次）：
  在树外临时项目中 `init → install → status → uninstall` 全部 exit 0；
  install 确实把 `yaml` 随装进 `.build/node_modules/`，uninstall 后
  `.build/` 已移除（F-27 行为亦在 clean-room 中覆盖）。
- **确定性说明**：本轮 build 跑了两轮（见“冻结过程”）。两轮产出的
  source.zip 与 dist.zip **逐字节相同**（SHA 完全一致：
  `9aa4d786…` / `c77c4224…`），确定性重建得到证实。manifest 与
  SHA256SUMS 不跨轮字节一致——按设计每次重跑都会在精确冻结 commit
  上重新跑完整 S0（P1-R1-01 修复），证据文件的计时与
  `generated_at_utc` 每次都变（第一轮冻结证据 p95=197.95ms，
  生成于 2026-11-17T03:26:06.592Z；第二轮 p95=199.75ms，生成于
  2026-11-17T03:30:33.554Z；磁盘上的 manifest 取第二轮的值），故
  manifest 的 `s0_evidence` 块与 SHA256SUMS 的 9 行证据条目亦变；
  manifest 的 `generation.note` 已写明此点。核对冻结请以
  `release:verify`（64/64）与 SHA256SUMS 自检为准，不要拿两轮的
  manifest 哈希直接对比。四个证据文件与 R4 冻结逐字节相同
  （`fixture-results.json` `79daa09b…`、`oracle-results.json`
  `712e024d…`、`network-scan.json` `d93b0840…`、`repeat-hashes.json`
  `1fe3e542…`），检出数值与 canonical hash 无变。
- **Drive 归档**：本轮 release 已在 Drive
  `04_release/T014_R5_2026-11-17_4216d96`（id
  `1luvYP-y8Py1iUPotg6TGyRu4O6dcKz26`）下归档：5 个顶层文件 +
  `s0-evidence/` 子文件夹（id `1SKa71-Acug6VRZTZSSAzfv79J7S3ttcW`）内
  8 个证据文件 + `logs/` 子文件夹（id
  `1GKG0g1HhUmZ_FRMFkD0Pv9lNTyb_5vgM`，位于 `s0-evidence/` 内）内
  `s0-gate.log` + 本报告 `T014_FREEZE_REPORT_R5.md`（Drive 文件 id
  `1B25PCPav8J_YFaxyEF5-ifM3_0IQYTyR`，见下）——沿用 R4 的修正后布局（`logs/` 子文件夹，与
  manifest/SHA256SUMS 记录的 `logs/s0-gate.log` 路径一致），并落实
  R6-P2-04（冻结报告 .md 随冻结产物一并归档）。协调员已从 Drive
  逐个重新下载核对：6 个非 JSON 文件 SHA-256 直接比对通过；8 个
  JSON 文件因 Drive CLI 下载时返回 0 字节（CLI 对
  `application/json` 的已知问题，非文件损坏），改用 Drive 元数据
  （size + md5Checksum）核对，8/8 与本地一致。合计 14/14 个文件
  核对通过，9/9 证据文件与 manifest `s0_evidence.files` 的 SHA-256
  一致。归档过程中的一次操作失误如实记录：`logs/` 子文件夹最初
  误建在 R5 文件夹顶层（空文件夹，未放任何文件），当场删除后在
  `s0-evidence/` 内重建；最终布局与 R4 一致，无文件错放。

## 审查覆盖范围缺口（必读：manifest 的 T013 引用不是覆盖声明）

**本冻结的 manifest `review` 块引用的是 T013 R6**——这是 FIX-R5
（`04074d1`）把引用参数化后的结果：`release-build.mjs` 从冻结 commit
的树内解析最新审查（在 `4216d96` 的树内最新的是
`reviews/T013_FINAL_REVIEW_R6.md`），`release-verify.mjs` 从磁盘
`reviews/` 解析最新审查；两者在本轮均指向 R6。**该引用是诚实的，
但它不是“R6 审查过本次冻结代码”的声明**，以下为事实：

- T013 R6 审查的对象是冻结 commit `17cbd1e`（FIX-R5 时代），结论
  PASS（P0=0，P1=0，P2=10），从未见过任何 FIX-R6 代码。
- 本次冻结的 FIX-R6 代码（`8077c3c` 尾随点/空格段剥离 +
  drive-rooted 解析 + UNC 下 fail-closed，见下节）**迄今未经过任何
  一轮 T013 审查**。
- 按 R2 前例冻结：先冻结，再由 T013 在冻结后审查冻结 commit。本轮
  冻结后**下一轮 T013 R7 将是第一轮审查 FIX-R6 代码的 T013 审查**，
  审查对象即本次冻结产物（`4216d96`），届时再定 R6-P2-01 与
  R6-P2-02 的 CLOSED 与否。
- 在 R7 完成之前，**不得把本冻结表述为“已通过 T013 对 FIX-R6 的
  审查”**；本报告的 PASS 仅指：S0 七门 + build 44/44 + verify
  64/64 + SHA256SUMS 13/13 全部通过（见验收表），即冻结产物自洽，
  不含 T013 对 FIX-R6 代码的审查结论。

## 冻结 commit 与 release commit 的关系（P023 T014 惯例）

一个 commit 无法包含自身的哈希，因此 manifest 只能钉住源码冻结
commit，而 release 产物与本报告必须提交在其上层：

- **冻结 commit**（manifest 的 `frozen_commit`）：`4216d96`
  （含 FIX-R6 全部修复、release 脚本、T013 R6 审查；`release/` 已从
  跟踪中移除，见“冻结过程”）。`source.zip` 与该 commit 的
  `02_source/` 树逐字节一致，`release:verify` 对照的是该 commit，
  从不是 HEAD。
- **release commit**（本报告提交时）：在 `4216d96` 之上，仅含
  `02_source/release/` 与本报告。提交后 `git rev-parse HEAD` 将是
  release commit，而非冻结 commit——这是自指不可能的直接后果，
  不是冻结失效。核对冻结请用 manifest 的 `frozen_commit`，
  或 `git show 4216d96:02_source/...`。

## 冻结过程

- **冻结 commit `4216d96`**：提交树内 S0 产物（5 个文件：
  `S0_GATE.json`、`S0_GATE.md`、`logs/s0-gate.log`、
  `perf-hook.json`、`privacy-scan.json`，均为协调员已核实的 PASS
  运行结果，git_commit `8077c3c`），并把旧 `release/` 的 15 个文件
  从跟踪中移除（`git rm -r`，仅删文件，不动任何源码/测试/脚本），
  冻结 commit 成为纯源码 + R6 审查；新 `release/` 仍按惯例提交在
  冻结 commit 之上。`17cbd1e` 本身未动。
- **build 第一轮（~03:24–03:27）**：exit 0，末行
  `release:build PASS — frozen 4216d96…`；但输出只留了 tail -30，
  未留存完整计数。本轮不以此为据，见下。
- **build 第二轮（03:28–03:31，完整日志 `build-r5.log`）**：
  **44/44 通过，0 FAIL**；冻结 commit S0 证据重跑第 1/5 次即通过
  （p95=199.75ms），未命中 F-29 抖动；verify 64/64 通过；SHA256SUMS
  13/13 OK。两轮 build 产出的 source.zip 与 dist.zip SHA 逐字节
  相同（见“确定性说明”），故第二轮的 44/44 计数可作为本冻结的
  build 计数；第一轮未留存计数的疏漏如实记录，不补编数字。
- **树内门 p95 余量说明**：协调员核实的树内门 p95 为 228.95ms，
  距 500ms 阈值余量 271.05ms；本次冻结证据重跑（manifest 记录的值，
  第二轮）为 199.75ms，余量 300.25ms；第一轮冻结证据重跑为
  197.95ms。三跑均远离阈值，R5 审查员自跑的 497.40ms（余量仅
  2.60ms）未重现，仍属 VM 负载波动（F-25），阈值与测量口径均未动。

## S0 证据（与冻结版本对应）

冻结 commit 内的 S0 由两处运行交叉验证：

1. **树内门**（冻结 commit 自带，`02_source/artifacts/s0/S0_GATE.json`，
   2026-11-17T03:23:20.814Z，commit `8077c3c` 的运行结果，协调员已核实）：
   七门全部 PASS，p95=228.95ms（n=100，p50=167.14，p99=345.64，
   min=148.35，max=590.26，cold_start=590.26，index=0，run_failures=0），
   全量测试 489/489（23 文件），golden 53/53。
2. **冻结 commit 证据重跑**（`release:build` 内 `runFrozenS0Evidence()`，
   干净 detached worktree 于精确冻结 commit `4216d96`，第 1/5 次即通过，
   未命中 F-29 抖动；2026-11-17T03:30:33.554Z，第二轮的值）：七门全部
   PASS，`environment.git_commit === 4216d96`，p95=199.75ms（n=100，
   p50=169.42，p99=261.64，min=152.24，max=277.66，cold_start=277.66，
   index=0，run_failures=0），全量 489/489（0 失败），canonical hash 同值，
   9 个证据文件归档进 `release/s0-evidence/` 并逐文件记字节 + SHA，
   manifest 含 verbatim `diff_proof`（`8077c3c → 4216d96`；其中的
   `release/` 删除条目即本轮从跟踪中移除旧冻结产物，其余 5 项为
   S0 产物文件，无生产逻辑改动、无依赖改动——见下“node_modules 软链”
   一节）。
   **FIX-R2 的关键变化（仍有效）**：manifest 顶层 `s0_gate` 的
   verdict/p95/canonical/full_tests/generated_at_utc 现取自本次冻结
   证据运行（p95=199.75ms，generated 2026-11-17T03:30:33.554Z），
   不再取自树内门；`release-verify.mjs` §7b 新增两项检查已实测
   通过（见验收表）。

| 门 | 阈值（v1.1.0） | 冻结证据值（重跑） | 结论 |
|---|---|---|---|
| 生产/Golden/Oracle 三向一致 | 48/48 | 48/48 | PASS |
| 植入错误检出（四依据） | 32/32 | 32/32（28/1/2/1） | PASS |
| 控制无误报 | 16/16 | 16/16 | PASS |
| Hook 端到端 p95 | 严格 <500ms | **199.75ms**（n=100，p50=169.42，p99=261.64，min=152.24，max=277.66，cold_start=277.66，index=0，run_failures=0） | PASS |
| 100 次确定性重放 | 恰好 1 个 canonical SHA-256 | 同值 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（1/100） | PASS |
| 运行时网络请求 | 0 | 0（40 文件，含 `scripts/hook-entry.ts`） | PASS |
| Prompt/源码持久化泄露 | 0 canary 命中 | 0（三轮均为 0，见下） | PASS |
| 支撑证据 | typecheck + 全量测试 | typecheck 0 错误；golden 53/53；oracle PASS 48/48；全量 **489/489**（23 文件） | PASS |

**隐私三轮（P1-R1-02 的修复验证，冻结证据运行值）**：
Round 1（11 个持久化文件）0 命中；Round 2（内存草稿字节）0 命中；
Final byte scan（落盘前的最终字节）0 命中。`S0_GATE.json/.md` 内
3 条 canary 原文各 0 次。`artifacts_sha256` 恰为 6 个文件，
`S0_GATE.json` 不在其中（无自哈希）；其 SHA 只记在 `logs/s0-gate.log`
中，落盘后读回核对两文件均为 `read_back_match=true`（json 8,984 B
sha `037f5ace…`，md 2,350 B sha `77c257c4…`，与协调员独立 `sha256sum`
一致）。`fixture-results.json` sha `79daa09b…` 与 R1/R2/R3/R4 记录
完全一致，检出数值无变。

**p95 轮间值**（FIX-R2 以来全部 S0 PASS 轮）：213.76（R2 树内门，
`65ea6c7`）/ 216.31（FIX-R2 修复验证跑）/ 226.51（R2 首轮冻结证据
跑）/ 217.64（R2 复核冻结证据跑）/ 218.92（R4 审查员复跑第 2 次；
第 1 次 F-29 抖动 FAIL 时 p95=203.07ms，7 门全 PASS）/ 256.07
（FIX-R3 prep 在 `eba4719` 的 S0，418/418）/ **492.69**（R3 树内门，
`490fdc8`，距阈值仅 7.31ms）/ **297.30**（R3 冻结证据跑，
`8e04562`，第 1/5 次通过）/ **497.40**（R5 审查员自跑，有记录以来
最紧，余量仅 2.60ms）/ **358.93**（R4 树内门，`04074d1`）/
**360.22**（R4 冻结证据跑，`17cbd1e`，第 1/5 次通过）/
**396.58**（R6 审查员自跑，精确冻结 commit `17cbd1e`）/
**228.95**（本轮树内门，`8077c3c`）/ **197.95**（本轮冻结证据
第一轮，`4216d96`）/ **199.75**（本轮冻结证据第二轮，`4216d96`）
ms，均 <500ms；canonical hash 各轮完全相同。

## 相对 R4 的变化（FIX-R6）

| 变化 | 内容 |
|---|---|
| FIX-R6 生产修复 | `8077c3c` 尾随点/空格段剥离 + drive-rooted 解析 + UNC 下 fail-closed（即 T013 R6 的 R6-P2-01 与 R6-P2-02 的修复），见下节核对表 |
| 全量测试 | 455/455（R4，22 文件）→ **489/489**（23 文件；+34 FIX-R6 测试） |
| 产物尺寸 | source.zip 3,059,647 → 3,080,620 B（+20,973）；dist.zip 682,849 → 688,475 B（+5,626），SHA 随之变化（预期内） |
| S0 p95 | 树内门 358.93ms（R4）→ 228.95ms（本轮，余量 271.05ms）；冻结证据 360.22ms（R4）→ 199.75ms（本轮第二轮，余量 300.25ms） |
| Manifest 审查引用 | R5（FAIL，0/1/9，审查对象 `8e04562`）→ **R6（PASS，0/0/10，审查对象 `17cbd1e`）**；参数化机制未变，本轮 build/verify 均如实引用 R6 |
| 未变的证据 | `fixture-results.json`、`oracle-results.json`、`network-scan.json`、`repeat-hashes.json` 四文件 SHA 与 R4 冻结逐字节相同；canonical replay hash `ef06d30f…` 各轮相同 |

## FIX-R6 修复核对（T013 R6 → 本冻结；T013 R7 待审）

| ID | T013 R6 要求 | 状态 |
|---|---|---|
| R6-P2-01 | 尾随点/空格目录段绕过门控（`src\session.\token.ts`、`src\session \token.ts`，Write/Edit 均 ALLOW；Win32 剥离段尾空格/句点） | **代码已修，未审**——`8077c3c` 在 `normalizedSegments` 中对 Windows-origin 路径逐段剥离尾随空格/句点，相对目标在 Windows cwd 下走 `normalizeWindowsRelativeTarget`（同样剥离，`..` 解析前做）。协调员独立探针 17/17 通过（R6 的 T1/T2 × Write/Edit 全部 DENY exit 2；见下）。T013 R7 待审 |
| R6-P2-02 | drive-rooted / POSIX-absolute 拼写在 Windows cwd 下绕过门控（`/synthetic/...`、`\synthetic\...`、全大写变体，Write/Edit 均 ALLOW） | **代码已修，未审**——`8077c3c` 新增 `isDriveRootedPath`；`resolveRelativeTargetPath` 中 drive-rooted 拼写在 Windows cwd 下先按 cwd 盘符补成 `C:/…` 再做前缀比较；POSIX cwd 不进该分支。协调员独立探针 17/17 通过（R6 的 R1/R2/R3 × Write/Edit 全部 DENY exit 2；见下）。T013 R7 待审 |
| R6-P2-03 | `release:verify` 在当前 HEAD（9a20e17，含 handoff 文档）上 63/64 FAIL，唯一失败是工作树比对项 | **流程问题，不追**——R6 报告本身定性为流程问题、非产物问题；同一 verify 在 release commit 上 64/64 PASS。本轮 verify 以 release commit 为准（见验收表）；冻结后新增的控制文档仍会触发该检查，是已知结构性表现 |
| R6-P2-04 | 冻结报告 `T014_FREEZE_REPORT_R4.md` 未归档进 Drive R4 文件夹 | **本轮已修复**——本报告 `T014_FREEZE_REPORT_R5.md` 已随冻结产物一并归档进 Drive R5 文件夹（见“Drive 归档”）；R4 文件夹的缺失由 FIX-R5 协调员事后补传解决，不追溯改写 R4 报告 |
| P1-R5-01 | Windows 大小写变体绕过门控（T013 R5 的 P1） | **CLOSED（R6 已确认关闭）**——R6 审查员重跑 R5 探针 #3–#6 + 混合大小写 + 对照组全部通过；FIX-R6 未动大小写折叠逻辑 |
| P1-R4-01 | Windows drive-letter 绝对路径 fail-open（终审 R4 的 P1） | **CLOSED（仍关闭）**——R6 审查员重跑 full-chain 3/3 通过；FIX-R6 未动 drive-letter 逻辑 |
| P1-R1-03 | 真实 Claude Code E2E（终审 R5/R6 仍 OPEN，blocked_external） | **仍 OPEN**——T015 在 S1（`npm ci`）受阻，真实失败原因未知（见下节“遗留阻断”）。本项仍为 `blocked_external`，等 Sam 决定；单列，不计入 P0/P1/P2 计数（R3/R4/R5/R6 同样处理） |
| P1-R2-01 | Drive 归档缺口（s0-evidence 9 文件须可逐个取得并核对） | **CLOSED（仍关闭）**——本轮沿用 R3/R4 的归档方式，直接按修正后布局归档（`logs/` 子文件夹）；Drive 核对见上节 |

**协调员独立探针（FIX-R6 复核，非产品代码，跑完即删）**：
临时探针 `tests/unit/r6-coordinator-probe.test.ts`（与
`pre-tool-use.test.ts` 同款 harness：规则 `auth-change-safety`，
`applies_to: [src/auth/**, src/session/**]`，mode block；全新
`:memory:`…实际为临时目录 sqlite store，**无任何 lease，即 UNSEEN**；
cwd `C:\synthetic\project`），对 `handlePreToolUse`（真实门控入口）
跑 R6 全部探针 + 对照组，**17/17 通过**：T1/T2 × Write/Edit 全部
DENY exit 2 gated:true；R1/R2/R3 × Write/Edit 全部 DENY exit 2
gated:true；对照组规范拼写 DENY、`.` 段 DENY、`..` 回绕 DENY、
FRESH 租约下大小写变体 Write ALLOW、项目外路径 ALLOW
gated:false、POSIX cwd 下 `/SYNTHETIC/...` 与 `session.` 拼写
ALLOW（不折叠、不剥离）。探针文件已删，工作树已恢复；实施 agent
的回归测试 `tests/unit/fix-r6-path-spellings.test.ts`（34 个）亦
由协调员独立重跑 34/34 通过。

**实施 agent 报告的三个有意偏差（均在 fail-closed 方向，协调员已复核）**：
1. UNC cwd + drive-rooted 目标：UNC 无盘符可解析，fail-closed，抛
   新码 `DRIVE_ROOTED_PATH`（DENY exit 2），理由同 R5-P2-01 的
   drive-relative 处理；已写测试锁定该行为。
2. 剥离强度：实现剥离每段全部尾随空格/句点（宽读法）。更窄的 Win32
   读法（非末段只剥一个尾随点、从不剥尾随空格）只影响“写不成的
   路径”（目录不存在则 Write/Edit 本就失败），宽剥离只会多 DENY、
   绝不会少 DENY，无 mis-allow 风险。
3. `.. ` / `...` 段：剥离后为空的段按 `.` 折叠（跳过），不读作 `..`
   （fail-closed 读法，只可能 over-deny）；精确的 `.` / `..` 段语义
   经测试确认未动。第一版实现曾把精确 `..` 也剥成空串而跳过，被
   实施 agent 自己的新测试当场抓住，已加 guard 修复并固化进测试；
   协调员探针的 `..` 回绕用例亦通过。

## 遗留阻断 P1-R1-03（本次修复范围外，等 Sam 决定）

真实 Claude Code ≥v2.1.295 端到端验证仍未完成，但**机器已经存在**：
Sam 于 2026-11-15 20:21 GMT 确认，他的电脑上已经装了 Claude Code。
三项真实触发验证（Read → FRESH → Write allow/deny；PreCompact →
EXPIRED → 重新读取；Hook 崩溃/超时时 onFailure: "block" 是否真正
阻止写入）仍为 `blocked_external`——不是没有可用的机器，而是验证
本身尚未进行，需等 Sam 回到电脑前操作。合成 Hook 全链通过不能等同于
真实宿主集成通过，此项为产品的核心运行环境，须在 Sam 的电脑上
（Claude Code 已安装 + 登录）验证，由 Sam 决定何时进行。**本项单列，
不计入 P0/P1/P2 计数；终审 R5 仍会看到它为 OPEN，但不得因它未修就把
本次冻结判为 FAIL**（T013 R3/R4/R5/R6 同样处理）。

**MSVC 纠正（仍有效，本轮无变化）**：R3 报告“遗留阻断”一节写
“`9477143`：需安装 'Desktop development with C++' 工作负载，管理员
权限，系统级变更，等 Sam 决定”——该说法经 T013 R5 审查与协调员核实
**是错误的**：已安装的 better-sqlite3@13.2.0 的 package.json 无
install 脚本，npm ci 不会触发 node-gyp；该包随 tarball 自带 N-API
预编译，prebuilds/ 含 win32-x64.node，DLL 不链接 VC++ 运行时。
T015 S1 的真实失败原因**未知**——E01 日志从未归档，只在 Sam 电脑
`C:\t015-evidence\`。**不要再让 Sam 去装 C++ 工作负载。**`e73df08`
已把 README 与 USER_GUIDE 改成诚实表述，并把
`00_control/T015/T015_NPM_INSTALL_PROMPT.md` 改写为诊断收集版
（收集 E01_setup.md、E01_npm_ci_debug.log、node/npm 版本、
better-sqlite3 的 package.json 脚本与 prebuilds 目录清单，交给 Muse
诊断，不装任何东西）。T015 S1 的重新诊断本身因缺 E01 日志而阻塞——
如实记录，不编造原因。

## 已知 P2 清单（登记，不阻断）

T013 R6 复核（P0=0，P1=0，P2=10；报告 `reviews/T013_FINAL_REVIEW_R6.md`，
审查对象冻结 commit `17cbd1e`）——**R6 是迄今最新一轮 T013 审查；R7
尚未进行**，故下表沿用 R6 结论，FIX-R6 代码不在其审查范围内（见
“审查覆盖范围缺口”）：

| ID | 问题 | 状态 |
|---|---|---|
| R6-P2-01 | 尾随点/空格目录段绕过门控 | **代码已修，未审**——T013 R7 待定 |
| R6-P2-02 | drive-rooted / POSIX-absolute 拼写绕过门控 | **代码已修，未审**——T013 R7 待定 |
| R6-P2-03 | `release:verify` 在当前 HEAD 上 63/64（工作树比对项被冻结后新增的控制文档触发） | OPEN（流程，不阻断；本轮未追） |
| R6-P2-04 | 冻结报告 .md 未归档进 Drive R4 文件夹 | **本轮已修复**——R5 报告随产物归档（见“Drive 归档”） |
| F-11 | 计划书 v1.1.0 §6 任务卡 7 处旧编号引用 + Fixture/Golden/Oracle 的 `v1.0.0 §5` 标注仍在；规格文件不得改 | OPEN |
| F-12 | Oracle 文档自述三处边缘语义取自生产源码；三向 48/48 中生产↔Golden、Oracle↔Golden 两路仍独立 | OPEN |
| F-13 | 冷启动样本为 Read 而非 Write；§9.6 未要求冷启动样本全为 Write，已裁决合规 | OPEN |
| F-25 | p95 轮间波动（观察；本轮三跑为 228.95（树内门）/ 197.95 / 199.75（冻结证据两轮）ms，均 <500ms，余量 ~270–300ms；R5 审查员自跑 497.40ms 仍是有记录以来最紧的一次，见上节） | OPEN |
| F-28 | F-19 卸载侧失败回滚无直接回归测试（行为经代码复核对称） | OPEN |
| F-29 | Vitest worker RPC 超时，根因仍 OPEN，只做缓解——证据重试 5 次；本轮 `8077c3c` 的串行缓解仍在，冻结证据运行第 1/5 次即通过，未命中抖动；但 60s 悬崖仍在，不得宣称根治 | PARTIAL |
| R4-P2-01 | Drive `s0-evidence/` 内无 `logs/` 子文件夹，`s0-gate.log` 平铺在子文件夹顶层，与 manifest/SHA256SUMS 记录的 `logs/s0-gate.log` 路径不一致（内容本身 9/9 无误） | **CLOSED**——R5 评审确认 `logs/` 子文件夹存在、内容核对一致；本轮 R5 归档直接按修正后布局执行，不再平铺 |
| R1-P2-04 | Drive 未找到独立 REVIEW_INDEX / REVIEW_PACK 归档 | **CLOSED**（2026-11-15 FIX-R2 同步修正；见 R2 报告） |
| F-26 | S0 自哈希过期 + 第二轮未覆盖最终文件（R1 由 P2 升级为 P1-R1-02） | **CLOSED by FIX-R1**（见 R2 报告；R3/R5/R6 审查员复跑验证） |
| F-27 | uninstall 两条提前返回路径遗留 `.build/` | **CLOSED**（上一冻结已修；本轮未动相关代码） |
| F-23 | v1.1.0 规格目录未入库；工作树不干净 | **CLOSED**（仍关闭；`00_control/v1.1.0/` 两文件已入库） |

另两处既有代码阅读观察（不单独立项，不计 P2）：`s0-gate.ts` 的
FAIL 翻转路径中 rescan 结果只记日志、未写回内嵌的 `final_pass`
计数（翻转只改 verdict/计数字样、不引入 canary，该路径本轮未触发）；
`runFrozenS0Evidence` 把仓库 `node_modules` 软链入证据 worktree
（若冻结 commit 改了依赖而 `node_modules` 未同步会漂移；当前
`diff_proof`（`8077c3c → 4216d96`）中无 `package.json` /
`package-lock.json` 改动、无依赖变更，漂移不成立；代码注释亦已声明
该偏差。终审 R2 §六亦指出此点不构成阻断，未来修改依赖时必须重新核对）。

## 验收命令与退出码（全部真实跑出）

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `npm run s0:gate`（树内门，协调员核实，03:23） | 0 | **S0 overall verdict: PASS**，p95=228.95ms，`git_commit=8077c3c…`，489/489 |
| `npm run s0:gate`（冻结证据重跑，第一轮，~03:26） | 0 | **PASS**，p95=197.95ms，`git_commit=4216d96…`，第 1/5 次通过 |
| `npm run s0:gate`（冻结证据重跑，第二轮，03:30） | 0 | **PASS**，p95=199.75ms，`git_commit=4216d96…`，第 1/5 次通过 |
| `npm run release:build`（第一轮，~03:24–03:27） | 0 | `release:build PASS — frozen 4216d96…`（仅留 tail -30，未留存完整计数；见“冻结过程”） |
| `npm run release:build`（第二轮，03:28–03:31，完整日志 `build-r5.log`） | 0 | **44/44 通过** |
| `npm run release:verify`（03:31–03:32，完整日志 `verify-r5b.log`） | 0 | **64/64 通过** |
| `sha256sum -c release/SHA256SUMS.txt`（自 `02_source/` 根） | 0 | 13 行全部 OK |
| `unzip -t release/source.zip` | 0 | No errors detected |
| `unzip -t release/dist.zip` | 0 | No errors detected |
| 协调员独立探针（临时测试，跑完即删） | 0 | 17/17 通过（R6 的 T1/T2/R1–R3 × Write/Edit 全部 DENY；对照组全部正确） |
| `npm test`（协调员核实，03:18） | 0 | 489/489（23 文件） |
| `npx tsc --noEmit`（协调员核实，03:18） | 0 | 0 错误 |
| `git status --short`（提交 release/ 与本报告后） | 0 | 空（树干净；R7 报告与交接另提交后复核） |
| `git rev-parse HEAD`（提交后） | — | release commit（见交接文件；冻结 commit 为 `4216d96`，见上节） |

## 发布清单（IMPLEMENTATION_PLAN §14）核对

- v1.1.0 S0 七项硬指标全部 PASS（冻结证据值见上表；树内门 228.95ms
  亦 PASS，余量 271.05ms）。
- 48/48 三向 parity；32/32 四依据检出；16/16 control 无误报。
- W05/S06 中间 EXPIRED 快照保留；S07 final EXPIRED；W07 same-cwd
  全程 FRESH（T013 R6 已复核，FIX-R6 未动 `src/core`、`src/hooks`、
  `src/store`、隐私模块与 Fixture/Golden——除路径规范化
  （`sanitize.ts` 的尾随段剥离与 drive-rooted 解析）外；该门控路径
  的审查待 T013 R7）。
- Hook p95 <500ms，100 个全新 Node 子进程计时样本含冷启动；5 次预热排除。
- 100 次 replay 一个 canonical SHA。
- 外部请求 0；Prompt/源代码持久化 0。
- npm test、typecheck、build、E2E、offline、privacy 均真实运行通过。
- 安装器备份并保留用户现有 Hook；卸载只删除自有 Hook（+ F-27
  修复后亦清理 `.build/`）。

## 交付文件清单

- `02_source/release/source.zip`、`02_source/release/dist.zip`、
  `02_source/release/RELEASE_MANIFEST.json`、
  `02_source/release/SOURCE_MANIFEST.csv`、
  `02_source/release/SHA256SUMS.txt`、
  `02_source/release/s0-evidence/`（9 个文件）
- `02_source/release/T014_FREEZE_REPORT_R5.md`（本报告）
- 交接文件：`00_control/HANDOFF_T014_R5.md`（另提交）
- T013 R7 报告：`reviews/T013_FINAL_REVIEW_R7.md`（评审完成后另提交；
  Drive R5 文件夹内亦归档）

## 冻结范围外说明

- 本任务未改任何生产逻辑（除 FIX-R6 已提交的修复本身）、未动阈值
  与测量口径、未改 `00_control/` 下任何规格文件与历史文件、未对外
  发布、未上传 GitHub、未提交 GPT 终审 R5。
- 冻结 commit `4216d96` 与被取代的旧冻结 `17cbd1e`（及其 release
  commit `e9a8472`）均保留在 git 历史中；旧冻结产物仍在 Drive 旧版
  与 git 历史中，本轮只在新位置归档新版，不覆盖旧版。
