# HANDOFF — T001 环境与 Claude Code Hook 能力探测

- **task_id:** T001
- **base_commit:** 8958b291cfd1dd38818db3406dad7e1f0dc33109
- **result_commit:** 956f6c880e7426d7252e67ec9c55aee7de9b47c1
- **project_id:** P025
- **spec_version:** 1.0.0
- **go_status:** NOT_DECLARED（施工已授权；GO 仍未宣布，施工不等于 GO）

## goal

确认实际 VM、Node/npm、Claude Code 和官方 Hook 功能支持情况，输出环境事实记录。

## inputs

- `00_control/PROJECT_BOOK.md`（§4.3 事件表、§4.4 不可观测边界）
- `00_control/IMPLEMENTATION_PLAN.md`（§1 冻结决策与 §1.1 版本门槛、§5 T001 卡、§6.1 Hook 配置目标形态）
- 本机 VM
- Claude Code 官方 Hooks reference（https://code.claude.com/docs/en/hooks，2026-11-15 13:14 UTC 抓取复核，仅用于核对事件表与 onFailure 条款）

## changed_files

- `02_source/scripts/probe-hooks.mjs`（新增，7702 B）— 合成 Hook JSON 探测 PoC（`--synthetic` / stdin 两种模式）
- `02_source/docs/environment/T001_ENVIRONMENT.md`（新增，10018 B）— 环境事实记录
- `02_source/artifacts/test-logs/T001_probe.log`（新增，4661 B）— 真实命令输出

未修改任何其他文件；未创建 `src/core/**`、`src/hooks/**`；未触碰任何用户 `.claude/settings*.json`（本机 `~/.claude` 不存在）；未动 Drive 总索引与其他项目。

## commands（均在 `02_source/` 内运行，另有探测在仓库根）

```bash
node --version            # v24.22.1
npm --version             # 10.9.4
claude --version          # command not found, exit 127
node scripts/probe-hooks.mjs --synthetic   # exit 0, 10/10 合成事件通过
```

另：`uname -a`、`cat /etc/os-release`、`lscpu`、`nproc`、`free -h`、`df -h`、
`python3 --version`、`git --version`、`which claude`、npm 全局列表、Node 冷启动计时
（python subprocess 计时，3 次重复）——输出全在 `T001_probe.log`。

## exit_codes

| 命令 | 退出码 |
|---|---|
| `node --version` | 0 |
| `npm --version` | 0 |
| `claude --version` | **127**（未安装） |
| `node scripts/probe-hooks.mjs --synthetic` | 0 |
| stdin 模式冒烟测试（合成 PreToolUse/Write/UNSEEN） | 0 |
| `git commit` | 0 |

## test_summary

- 合成 Hook PoC：10 条合成事件、9 个不同事件全部解析通过，失败 0 条；
  PreToolUse Write/UNSEEN → deny（would-be exit 2），Edit/FRESH → allow（exit 0）；
  进程内单事件解析 + 决策 < 0.4 ms。
- 未调用真实模型 API，未使用真实用户 Prompt/Transcript/源码/密钥，全部合成数据。

## 核心事实（摘要，详见 T001_ENVIRONMENT.md）

1. **环境：** Ubuntu 24.04.5 LTS，x86_64，AMD EPYC 9D25，4 vCPU，7.7 GiB 内存（快照值），
   `/home/hatch` 129G 可用；Node **v24.22.1**（符合 Node 24 LTS 要求）、npm 10.9.4、
   Python 3.12.3（符合 Oracle 要求）。
2. **Claude Code：未安装。** `claude --version` 退出 127；PATH、`/usr/local/bin`、npm 全局、
   `~/.claude` 均无 Claude Code。本机 9 个 Hook 事件的真实触发行为全部 NOT_VERIFIED。
3. **事件存在性：已核实。** 官方 Hooks reference 列出全部 9 个事件
   （PreToolUse/PostToolUse/PreCompact/PostCompact/InstructionsLoaded/CwdChanged/
   SubagentStart/SessionStart/SessionEnd）；PreToolUse 与 PreCompact 可阻断；
   InstructionsLoaded/CwdChanged 为异步观察事件。无一事件标记为 UNAVAILABLE（事件名本身存在）。
4. **`onFailure:"block"`：官方要求 Claude Code ≥ v2.1.295；本机因未安装而无法确认版本，
   严格模式 fail-closed 本机无法实测。**
5. **性能风险（实测数据）：Node 冷启动 76–99 ms，约为 S0 p95 < 10 ms 门（含子进程启动）的 8–10 倍；**
   进程内逻辑本身 < 0.4 ms/事件。按现有 `node` 命令式 Hook 口径，p95 门在本机看起来不可达——
   需协调员在 T005/T010 阶段裁决（常驻进程 / 改口径 / 接受 S0 FAIL），T001 不改规格。
6. **Windows PowerShell 对应命令未验证**（本机为 Linux VM，不得凭 Linux 推断 Windows）。

## log_paths

- `02_source/artifacts/test-logs/T001_probe.log`
- `02_source/docs/environment/T001_ENVIRONMENT.md`（§1–§8 含全部事实与表格）

## sha256

```text
d77ad5ceefdff8f0c89508f742e75bec4a7a441dd7a1c84dc97bb78ce745ee1a  02_source/docs/environment/T001_ENVIRONMENT.md
ff5a94de1c6fc5f071d5acd1b02e6ca11489dc64050856559bc1e310ecf0d3f5  02_source/artifacts/test-logs/T001_probe.log
8e6b0fce0992d1dceaf554c97854edd55814567abf1d5bc81b7fc17940a0b67a  02_source/scripts/probe-hooks.mjs
```

## known_limits

- `claude` 未安装：真实 Hook 触发、真实 PreToolUse 拦截、真实 PreCompact 失效、
  `onFailure:"block"` 的 fail-closed 行为在本机均无法验证；T003/T005/T006/T012 的
  真实端到端验证需一台 Claude Code ≥ v2.1.295 的机器。
- 合成 PoC 只验证 JSON 解析与决策输出形状；合成租约状态为脚本内写死的演示输入，
  不是真实 Lease 状态机输出。
- 内存数字为探测瞬间快照（共享 VM 会波动）；Windows 命令未验证。
- **是否宣布 BLOCKED / 停止 S0：T001 不宣布，留给总协调员判断。** 事实是核心事件
  在官方文档中存在、本机无法实测、严格模式 fail-closed 本机无法验证。

## next_task

- **T002 Guidance Rule Schema 与配置校验**（可立即开始；不依赖 Claude Code 本机安装）。
- 协调员待裁决（T001 不代行）：(a) `claude` 未安装是否构成环境阻断、是否需在有 Claude Code
  的机器上补测真实 Hook；(b) Node 冷启动 76–99 ms 与 S0 p95 < 10 ms 门的冲突如何处理
  （常驻进程 / 口径调整 / 接受风险），需在 T005/T010 前定方向。
