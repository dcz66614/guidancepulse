# T001 环境事实记录 — P025 GuidancePulse

- **TASK_ID:** T001
- **PROJECT_ID:** P025
- **SPEC_VERSION:** 1.0.0
- **BASE_COMMIT:** 8958b291cfd1dd38818db3406dad7e1f0dc33109
- **探测时间 (UTC):** 2026-11-15T13:19:39Z（首次探测）/ 验收命令复跑同日 13:2xZ
- **探测机:** 本机云 VM（Muse 工作 VM，非 Sam 本地 PC）
- **原始日志:** `02_source/artifacts/test-logs/T001_probe.log`
- **探测脚本:** `02_source/scripts/probe-hooks.mjs`
- **数据性质:** 全部合成数据；未调用真实模型 API，未使用真实用户 Prompt / Transcript / 源码 / 密钥；未修改任何用户 `.claude/settings*.json`（本机不存在 `~/.claude` 目录）

## 1. 操作系统与硬件（实测命令输出）

| 项目 | 实测值 | 命令 |
|---|---|---|
| OS | Ubuntu 24.04.5 LTS (Noble Numbat) | `cat /etc/os-release` |
| 内核 | Linux 7.0.0-44-generic, x86_64 | `uname -a` |
| 架构 | x86_64 | `uname -m` |
| CPU | AMD EPYC 9D25 126-Core Processor，4 vCPU（1 socket × 4 core，单线程/core） | `lscpu`, `nproc` |
| 内存 | 总 7.7 GiB；探测瞬间已用 6.7 GiB，可用 1.1 GiB；Swap 1.0 GiB（已用 180 MiB）——为快照值，共享 VM 上会波动 | `free -h` |
| 磁盘 | `/home/hatch`：150G 总，22G 已用，129G 可用（15%）；`/tmp` 为 512M tmpfs | `df -h` |
| Git | git 2.43.0 | `git --version` |
| 浏览器 | PATH 内无 chromium / google-chrome / firefox 二进制 | `which chromium chromium-browser google-chrome firefox` |

## 2. 运行时版本（实测）

| 项目 | 实测值 | 规格要求 | 结论 |
|---|---|---|---|
| Node.js | **v24.22.1** | Node 24 LTS（计划书 §1） | ✅ 符合（补丁版本已记录） |
| npm | **10.9.4** | —（随 Node） | ✅ |
| Python | **3.12.3** | Python 3.12 标准库（Oracle，计划书 §1） | ✅ 符合 |
| V8 | 13.6.233.17-node.58 | — | 记录 |
| Claude Code (`claude`) | **未安装** | 需 `claude --version` 记录实际版本；`onFailure:"block"` 需 ≥ v2.1.295 | ❌ **未安装**，见 §4 |

`claude --version` 退出码 **127**（`command not found`）；`which claude` 无结果；
`/usr/local/bin` 内无 claude/codex；npm 全局包列表（`npm ls -g`）中无 Claude Code，
仅有 `@deepseek-ai/dsh`、`@github/copilot`、`cline`、`pnpm`；`~/.claude` 目录不存在。
本机未安装 Claude Code，也未尝试安装（T001 不安装、不登录、不改配置）。

## 3. Hook 事件支持情况表

事件存在性以 **Claude Code 官方 Hooks reference**（https://code.claude.com/docs/en/hooks，
2026-11-15 13:14 UTC 抓取复核）为准；“本机实测”列指本 VM 上能否实际触发/验证。

| 事件 | 官方 reference 状态 | 能否阻断（按官方文档） | 本机实测状态 |
|---|---|---|---|
| `PreToolUse` | 已列出（每工具调用前，可阻断） | **可以**（`permissionDecision: "deny"` 或 exit code 2） | **NOT_VERIFIED** — `claude` 未安装，无法实测触发 |
| `PostToolUse` | 已列出（工具调用成功后） | 不可以（非写前门） | **NOT_VERIFIED** — 同上 |
| `PreCompact` | 已列出（压缩前） | **可以** | **NOT_VERIFIED** — 同上 |
| `PostCompact` | 已列出（压缩完成后） | 不可以 | **NOT_VERIFIED** — 同上 |
| `InstructionsLoaded` | 已列出（CLAUDE.md / `.claude/rules/*.md` 加载时；session start 与懒加载时触发） | 不可以，异步观察事件 | **NOT_VERIFIED** — 同上 |
| `CwdChanged` | 已列出（工作目录变化时；无 matcher 支持） | 不可以，异步观察事件 | **NOT_VERIFIED** — 同上 |
| `SubagentStart` | 已列出（子 Agent 生成时） | 不可以阻止子 Agent 创建 | **NOT_VERIFIED** — 同上 |
| `SessionStart` | 已列出（会话开始/恢复时） | 不作为写前门 | **NOT_VERIFIED** — 同上 |
| `SessionEnd` | 已列出（会话终止时） | 不作为写前门 | **NOT_VERIFIED** — 同上 |

**结论：9 个事件全部在官方 reference 中有据可查，无一标记为 UNAVAILABLE（事件名本身存在）；
但本机 9 个事件的真实触发行为全部 NOT_VERIFIED。** 本任务不假设任何事件在本机可用；
T003/T005/T006 的真实 Hook 行为验证必须在装有 Claude Code 的机器上进行。

补充核实（官方 reference 原文，2026-11-15 抓取）：
- `PreToolUse` / `PostToolUse` 在每次工具调用时触发（`EndConversation` 除外）；
  matcher 按工具名过滤，`Edit|Write` 精确匹配二者。
- `InstructionsLoaded` matcher 按加载原因过滤（`session_start`、`nested_traversal`、
  `path_glob_match`、`include`、`compact`）；官方说明其覆盖范围为 CLAUDE.md 与
  `.claude/rules/*.md`，与项目书 §4.4 一致。
- `CwdChanged` 无 matcher 支持，每次目录变化都触发。

## 4. `onFailure: "block"` 支持结论

- 官方 reference 明确：`onFailure` 取 `"continue"` 或 `"block"`；设为 `"block"` 时，
  Hook 失败（含无法启动、超时、非 2xx 等）会阻止触发动作；**要求 Claude Code v2.1.295 或更高版本**
  （配置表两处均有此标注，另见 "Block the action when a hook fails" 一节）。
- **本机结论：无法确认。** 因 `claude` 未安装，无版本号可比对 v2.1.295；
  严格模式的 fail-closed 保证在本机**无法实测**，只能以合成 JSON 演练决策输出形状。
- 严格模式 fail-closed 的真实验证（Hook 崩溃/超时是否确实阻止 Write/Edit）必须在
  Claude Code ≥ v2.1.295 的机器上进行；低于该版本时按计划书 §1.1 不得宣称严格模式可用。

## 5. 本地 Hook PoC（合成 JSON，`node scripts/probe-hooks.mjs --synthetic`）

验收命令在 `02_source/` 内运行，退出码 **0**。10 条合成事件、9 个不同事件全部解析通过，
失败 0 条（完整输出见 `T001_probe.log`）：

| 合成事件 | 结果 | PoC 决策输出（形状演示，非真实裁决） |
|---|---|---|
| SessionStart | ok | — |
| InstructionsLoaded | ok | —（异步观察） |
| PostToolUse (Read 成功) | ok | —（签发凭证由 T003/T004 实现） |
| PreToolUse Write，合成租约 UNSEEN | ok | `permissionDecision: "deny"`，would-be exit code 2 |
| PreToolUse Edit，合成租约 FRESH | ok | `permissionDecision: "allow"`，would-be exit code 0 |
| PreCompact | ok | 作用域内租约失效（合成） |
| PostCompact | ok | — |
| CwdChanged | ok | —（异步观察） |
| SubagentStart | ok | —（新作用域 UNSEEN，由 T004/T006 实现） |
| SessionEnd | ok | — |

另做 stdin 模式冒烟测试：单条合成 PreToolUse/Write/UNSEEN JSON 经 stdin 输入，
输出 deny 决策，退出码 0。进程内单事件解析 + 决策耗时均 < 0.4 ms。

**PoC 边界（必须明示）：** 该脚本只验证合成 JSON 的字段解析与决策输出形状；
不连接 Claude Code，不调用模型 API；合成租约状态（UNSEEN/FRESH）是脚本内写死的
演示输入，不是真实 Lease 状态机（T004）的输出。

## 6. 性能基线：Node 冷启动 vs S0 p95 < 10ms 门

S0 硬门要求 Hook 端到端 p95 < 10ms，**含 Node 子进程启动**（计划书 §7.4、§8.2）。
本机实测（`T001_probe.log` 末段，3 次重复）：

| 测量项 | 实测值 |
|---|---|
| `node -e ''` 空进程冷启动 | 75.7 / 81.1 / 98.7 ms（另一次 82.4 / 82.5 / 90.3 ms） |
| `node scripts/probe-hooks.mjs --synthetic` 全程（含 10 事件） | 80.7 / 89.1 / 92.6 ms |
| 进程内单事件解析 + 决策 | < 0.4 ms / 事件 |

**发现（记录事实，不改规格）：仅 Node 冷启动就约 76–99 ms，约为 10 ms 预算的 8–10 倍。**
按计划书现有口径（`node` 命令式 Hook、每次调用起新子进程），S0 的 p95 < 10 ms 门
在本机环境下**看起来不可达**——进程内逻辑本身很快，瓶颈在子进程启动。
这不是 T001 能裁决的事：是否调整 Hook 形态（如常驻进程）、放宽口径或接受 S0 FAIL，
留给总协调员与后续任务（T005/T010）判断；T001 只记录实测数据，不擅自改规格。

## 7. 其他环境事实与未验证项

- **Windows PowerShell 对应命令：未验证。** 本机为 Linux VM，无 Windows 环境；
  按计划书 §11/§12，不得凭 Linux 运行推断 Windows 已通过。Windows 支持声明
  需在 Windows 机器上另行探测。
- **网络：** 运行时外部请求为 0（本任务未发任何模型/付费 API 请求；唯一外部读取
  是对官方 Hooks reference 文档的公开页面抓取，用于核对事件表，非产品运行时行为）。
- **用户现有配置：** 未修改任何 `.claude/settings*.json`；本机 `~/.claude` 不存在，
  无既有 Hook 可冲突。
- **产品根目录约定：** 按任务卡，`02_source/` 为产品根；本任务的脚本、文档、
  日志均已按此布局放置（`02_source/scripts/`、`02_source/docs/environment/`、
  `02_source/artifacts/test-logs/`）。计划书 §4 的布局以 `02_source/` 为根解读。

## 8. 对后续任务的影响（事实层面）

1. **T002–T010 可在无 Claude Code 的本机继续**（Schema、状态机、Oracle、Golden
   均为确定性本地逻辑，可用合成事件验证）；但任何“Claude Code 真实触发 Hook”
   的断言在本机都无法成立。
2. **T005/T006/T012 的真实端到端验证**（PreToolUse 真实拦截、PreCompact 真实失效、
   `onFailure:"block"` 真实 fail-closed）需要一台装有 Claude Code ≥ v2.1.295 的机器，
   否则只能以合成输入 + 本地 PoC 代替，并在证据中如实标注。
3. **T010 的 p95 门**面临 §6 的冷启动数据；需在 T005/T010 阶段复测并由协调员裁决，
   不得在 T001 阶段悄悄改口径。
4. **是否宣布 BLOCKED / 停止 S0：不由 T001 宣布。** 按任务卡，`claude` 未安装
   如实记录为未安装，结论留给总协调员判断。事实是：核心事件在官方文档中存在，
   本机无法实测；严格模式 fail-closed 本机无法验证。
