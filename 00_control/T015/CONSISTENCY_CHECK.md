# T015 包与冻结 release 一致性核对记录

核对人：T015 验证包准备协调员（构建者）
核对时间：2026-11-15 ~20:40–20:50 GMT
核对方式：**只读**。未改源码、未重新冻结、未碰 Drive、未做
GitHub 上传。核对后 `git status` 只有两个 untracked 项（终审
R3 文件本身与本 `00_control/T015/` 包），无任何已跟踪文件被
改动。

## §1 冻结 release 身份核对

| 核对项 | 期望值（任务书给定） | 实测值 | 结果 |
|---|---|---|---|
| 冻结 commit | `f4d2b2e` | `f4d2b2e7ba0698b793e8b3e70d843b6e32354f61` | ✓ |
| Release commit | `536a7c3` | `536a7c3`（`git log`，T014 release R2） | ✓ |
| HEAD | `e478bd5` | `e478bd5`（T014 R2 handoff + T013 R4） | ✓ |
| 规格版本 | v1.1.0 | manifest `spec_version: 1.1.0` | ✓ |
| dist.zip SHA-256 | `304a7c2e…eb1f` | `304a7c2e60b8796d5ba1a758ff4bd416349e53cfc4c9da5777ef83ec5ed5eb1f`（669,625 B，`sha256sum` 实测） | ✓ |
| source.zip SHA-256 | `bc607d94…f7ed7` | `bc607d947df7ea9906df6af557cffe02993f8022695e2045afa31a9b6a5f7ed7`（3,004,347 B） | ✓ |
| `sha256sum -c release/SHA256SUMS.txt` | 13/13 | 自 `02_source/` 运行：13/13 OK（注：须自 `02_source/` 根运行，SHA256SUMS 的条目以 `release/` 开头；在 `release/` 内运行会 13 项全报 No such file） | ✓ |
| dist.zip 条目 | 57 | 57 个文件（解压实测；终审 R3 独立核对 57/57） | ✓ |
| source.zip 文件 | 209 | 209（终审 R3 独立核对 209/209；SOURCE_MANIFEST 209 条） | ✓ |
| S0 门 | PASS，p95 217.64 ms，396/396 | manifest `s0_gate` 与 `s0_evidence` 一致：verdict PASS，p95=217.64ms，396/0/22，canonical `ef06d30f…af50`，generated 2026-11-15T20:10:06.363Z | ✓ |
| T013 R4 | PASS（P0=0，P1=0，P2=7） | `reviews/T013_FINAL_REVIEW_R4.md`（19,197 B）：“结论：PASS”，P0=0，P1=0，P2=7 | ✓ |
| 终审 R3 | EVIDENCE_INCOMPLETE（P0=0，P1=1，P2=6），唯一阻断 P1-R1-03 | `00_control/P025_FINAL_REVIEW_R3.md`（13,047 B）全文已读；R3 要求建 T015，构建者与验证者独立会话 | ✓ |

## §2 包内引用与冻结 release 的对应关系

| 包内引用 | 来源（冻结 release 内） | 核对 |
|---|---|---|
| 6 条 Hook（事件/matcher/命令/onFailure/timeout/async） | `IMPLEMENTATION_PLAN.md` v1.1.0 §7.1；`src/cli/install.ts` 的 `GUIDANCEPULSE_HOOKS`；`docs/USER_GUIDE.md` §5 | 三处逐字一致，已列入 `T015_TASK.md` 附录 B |
| CLI 命令（init/install/uninstall/status/phase set，exit 0/1） | `src/cli/main.ts`（`CLI_USAGE` 与 `runCli`）；IMPLEMENTATION_PLAN §7.2 | 一致；`--project` 默认为 cwd |
| DENY 输出（permissionDecision + 原因 + exit 2） | `src/hooks/decision.ts`（`buildHookOutput`、`hookExitCode`） | 一致；原因模板逐字抄入任务书 |
| FRESH 签发条件（成功 Read 才签发） | `src/hooks/adapter.ts`（PostToolUse 须 `toolSuccess===true`；InstructionsLoaded 匹配 rule `source`）；PROJECT_BOOK §5.4、§6.1–§6.2 | 一致 |
| PreCompact 失效（原因 `CONTEXT_COMPACTION`，原子，严格模式持久化失败则阻止） | `src/hooks/pre-compact.ts`；PROJECT_BOOK §6.5 | 一致 |
| 租约状态与失效原因 | `src/core/lease-machine.ts`（UNSEEN 缺席；EXPIRED 原因 CONTEXT_COMPACTION / CWD_MISMATCH / PHASE_MISMATCH / EDIT_BUDGET_EXHAUSTED）；PROJECT_BOOK §6.1–§6.4 | 一致 |
| 编辑预算默认 5 次 | PROJECT_BOOK §6.3；`init.ts` 的 `DEFAULT_CONFIG_YAML` | 一致 |
| `init` 默认配置 | `src/cli/init.ts` 的 `DEFAULT_CONFIG_YAML`（规则 `auth-change-safety`） | 一致；任务书已说明须覆盖为 T015 配置 |
| 安装行为（备份一次、只合并自有 Hook、编译入口、随装依赖、失败回退、卸载只移除自有 Hook 与 `.build/`） | `src/cli/install.ts`、`src/cli/uninstall.ts`；`docs/USER_GUIDE.md` §1、§4 | 一致 |
| 启动脚本缺失入口时 exit 2 + `HOOK_ENTRY_MISSING` | `install.ts` 的 `launcherScript()` | 一致 |
| Claude Code ≥ v2.1.295 门槛 | IMPLEMENTATION_PLAN §2.2；`docs/USER_GUIDE.md` §1 | 一致 |
| Node ≥ 24 | `package.json` 的 `engines`；`docs/USER_GUIDE.md` §1 | 一致 |
| `npm run guidancepulse -- <命令>` 入口 | `package.json` 的 `scripts.guidancepulse`（`vite-node src/cli/main.ts`）；`README.md` | 一致 |
| 解压 + `npm ci` 后可运行 | T014 R2 冻结报告（两处 smoke 实测：树外临时项目 `init → install → status → uninstall` 全部 exit 0） | 一致 |

## §3 关键发现：Windows 绝对路径不设门（已实测）

构建者用**冻结代码本身**（`02_source` 与冻结 commit
`f4d2b2e` 之间，`src/config/`、`src/core/`、`src/hooks/`、
`scripts/hook-entry.ts`、`src/cli/` 均无任何改动——`git log
f4d2b2e..HEAD` 为空）做了两级实测：

**第一级——适配器直接调用**（`adaptHookEvent` + T015 配置）：

| 输入 `file_path` | 结果 |
|---|---|
| `C:\t015-test\protected\notes.txt`（Windows 绝对路径） | `{"kind":"ignored","reason":"no-matching-rule"}`——不设门 |
| `C:/t015-test/protected/notes.txt`（Windows 绝对路径，斜杠） | 同上，不设门 |
| `protected/notes.txt`（相对路径） | `{"kind":"write-check","ruleIds":["t015-guard"]}`——设门 |
| `/tmp/t015-test/protected/notes.txt`（POSIX 绝对路径） | `{"kind":"write-check","ruleIds":["t015-guard"]}`——设门 |
| Read `C:\t015-test\GUIDANCE.md`（Windows 绝对路径） | `{"kind":"ignored","reason":"no-matching-guidance"}`——不签发 FRESH |

**第二级——Hook 入口端到端**（`scripts/hook-entry.ts` 经
vite-node，stdin 喂合成 Hook JSON，真实 T015 配置与全新
SQLite 状态库）：

| 输入 | stdout | exit |
|---|---|---|
| Windows 绝对路径 Write | `{"ignored":true,"reason":"no-matching-rule"}` | 0 |
| 相对路径 Write | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"GuidancePulse: write blocked — guidance is stale: t015-guard (UNSEEN, block). Re-read the guidance file(s), then retry the write."}}` | 2 |

**根因（代码级）：** `sanitize.ts` 的 `readToolFilePath` 与
`adapter.ts` 的 `resolveRelativeTarget` 只对 `/` 开头的路径做
cwd 前缀剥离；`C:\…` 被规范化为 `C:/t015-test/protected/
notes.txt`（盘符成了一个路径段），与相对 glob
`protected/**` 永不匹配。`readLoadedPaths` 同理丢弃绝对路径
（`/` 开头的直接跳过；`C:/…` 留下但匹配不上 rule `source`），
所以 InstructionsLoaded 在 Windows 上同样签发不了凭证。

**覆盖缺口：** 冻结单元测试 `tests/unit/path-matcher.test.ts`、
`config.test.ts`、`hooks-adapter.test.ts` 中含 Windows /
drive-letter 的用例均为 **0** 个。规格 §10 风险表要求的是
“规范化测试；实际支持平台如实声明”，该测试从未写过。

**定级：** 规格 §10 风险表原话——“Windows 路径问题 | P2，
若导致误放行则 P1”。本实测表明它**导致误放行**（写入在无
门状态下直接通过；Read 也不签发凭证）。是否在真机上成立，
取决于 Claude Code 在 Windows 上实际发送的 `file_path` 格式
（官方行为为绝对路径）——这正是 T015 live 测试要判定的事。
任务书已把这一预测、S6 探针与“不得变通”的纪律写进正文，并
要求执行人从 transcript 里抄下实际 `file_path` 格式作为证据
（E06-2）。

## §4 其他核对说明与不一致项

1. **Manifest 引用的审查版本是 R3，不是 R4。** Release
   commit `536a7c3` 内 `RELEASE_MANIFEST.json` 的 `review`
   字段写的是 `T013 final re-review (R3)`。R4（同样 PASS，
   P0=0，P1=0，P2=7）写于 release 之后，存在于 HEAD
   `e478bd5` 的 `reviews/T013_FINAL_REVIEW_R4.md` 与
   `REVIEW_INDEX.md` 中，不在冻结 release 内。这是冻结时序
   造成的文字滞后，不是 T015 的阻断项；特此记录，T015 包引
   用 R4 时以仓库 HEAD 为准。
2. **`guidancepulse.example.yaml` 的头注释写着
   `SPEC_VERSION 1.0.0`，而冻结规格是 v1.1.0。** 该文件语义
   由 T002 冻结、能通过 schema 校验，头注释只是滞后。T015
   配置没有照抄该头注释，明确写 v1.1.0。
3. **dist.zip 的 SHA 在 R1/R2 两轮冻结中完全相同
   （`304a7c2e…`）。** 按冻结报告，这是确定性 STORE zip 的
   设计行为，不是异常；source.zip 跨轮不同只因每次重跑的 S0
   证据时间戳不同。
4. **“安装不联网”与 `npm ci` 的区分。** USER_GUIDE §1 的
   “安装不联网”指目标项目安装时不跑 `npm install`（依赖靠
   本地文件复制随装）；但首次搭建解压后的 dist 树需要 `npm
   ci`（访问 npm registry，且不能 `--omit=dev`，因为 `tsc`/
   `vite-node` 在 devDependencies 里）。任务书 §2 已把两者
   分开写明。
5. **dist.zip 内没有 Windows 启动器。** 57 个文件里没有
   `.cmd`/`.ps1`/`.bat`；`bin/guidancepulse` 是 sh 脚本。
   Windows 上运行 CLI 的正规方式是 `npm run guidancepulse --
   …`（PowerShell/cmd）或 Git Bash 下的 `bin/guidancepulse`
   （任务书附录 C）。不要自写启动器放进发行包。
6. **`GP_PHASE` 在真实会话里永远为空。** 启动脚本只设置
   `GP_CONFIG`/`GP_DB`/`GP_PATH_KEY`，不设 `GP_PHASE`；
   `hook-entry.ts` 因此取 `livePhaseId = null`。核对结论：
   签发与检查两端都是 null，`null !== null` 为假，不会误触
   `PHASE_MISMATCH`；`isRuleActiveInPhase` 在 `phaseId ===
   null` 时返回 true，规则正常生效。T015 设计依赖这一点；
   如果测试 1b 在真机上以 `PHASE_MISMATCH` 被拒，那本身就是
   一个产品发现，如实记录，不要绕过。
7. **规格章节引用已逐一核对。** 本包引用的 §5.1、§5.3、
   §5.4、§6.1–§6.5、§7.1–§7.4 与 `PROJECT_BOOK.md` v1.1.0
   的实际标题一致；§7.2 是“模块”表，不是失效契约——失效契
   约在 §6.5（与 `pre-compact.ts`、`pre-tool-use.ts` 内注
   明的 F-11 类错引一致，本包引用 §6.5）。Hook 配置目标形
   态在 `IMPLEMENTATION_PLAN.md` §7.1，CLI 契约在 §7.2。
8. **T015 配置已用冻结解析器验证。** 构建者用冻结
   `parseConfigYaml` 解析本包的
   `guidancepulse-config.yaml`：version 1；defaults
   warn/5/deny；phases 全部 4 个；规则唯一（`t015-guard`，
   source `[GUIDANCE.md]`，applies_to `[protected/**]`，
   mode block，max 5）。解析器把省略的 `phases` 展开为全部
   已声明阶段，与任务书的说法一致。
9. **合成文件 SHA 已实测。** 见 `T015_TASK.md` §1 的表
   （GUIDANCE.md `127c33c7…`；protected/notes.txt
   `177ff890…`；unprotected/scratch.txt `6cf28776…`；
   guidancepulse-config.yaml `b37272bd…`）。
10. **本 VM 无 Claude Code。** `claude --version` exit 127
    （T001 环境记录）；本包只准备、不执行真机验证，未尝试
    安装/登录 Claude Code，未伪造任何验证证据。
