# P025 GuidancePulse（指令续用闸）｜项目书

**PROJECT_ID:** P025  
**PROJECT_SLUG:** guidancepulse  
**SPEC_VERSION:** 1.1.0  
**SUPERSEDES:** 1.0.0  
**SPEC_STATUS:** SPECIFICATION_REVISION_FOR_S0_REVALIDATION  
**LICENSE:** MIT  
**HUMAN_PARTICIPANTS:** 0  
**HOST_ADAPTER:** Claude Code Hooks only  
**DATE:** 2026-11-15

> 本文件是 v1.1.0 规格基线。v1.0.0 的 S0 结论仍为 FAIL；新阈值和新的 S0
> 检出定义必须由施工方按本版本重新执行 S0。本文档修订不代表 S0
> 已通过，也不解除下游任务阻塞。

## 0. 版本修订记录

| 版本       | 变更                                                                                                                                                                                                                                                                   | 原因                                                                                                           |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| v1.0.0     | 首版产品定义、Guidance Lease、Claude Code Hook 适配、48 条合成轨迹、独立 Oracle、S0 七项硬门                                                                                                                                                                           | 建立 MVP 规格                                                                                                  |
| **v1.1.0** | 保持 Node.js/TypeScript 与每次 Hook 独立子进程架构；将完整端到端 Hook p95 从 `<10ms` 调整为 `<500ms`；明确 5 次预热排除、100 次计时包含冷启动样本；把 32/32 检出改为四种逐步审计依据及优先级判定；更新 T003/T004/T005/T010/T013；修正内部章节引用与 `python3` 命令写法 | v1.0.0 实测证明 Node 进程启动已远高于 10ms；终态判定无法区分 W05/S06/W07；必须按真实用户成本与逐步租约证据验收 |

### 0.1 v1.1.0 不变项

- 产品目标、用户、场景和 Guidance Lease 三态语义不变。
- 首版仅支持 Claude Code Hooks；其他 Coding Agent 不在首版支持声明内。
- Node.js 24 / TypeScript 5、better-sqlite3、嵌入式 SQLite、React/Vite
  本地 UI 不变。
- 不增加 daemon，不切换 Rust/Go，不以 Bun 或其他运行时替换 Node。
- 不改变 `PreToolUse` 写前检查、`PostToolUse` 成功读取确认、`PreCompact`
  压缩失效等产品语义。
- 48 条 Golden Fixtures、独立 Oracle、32 条错误轨迹、16
  条控制轨迹不删减。
- 其余六项 S0 硬门保持原值。
- 零真人参与、MIT、无收费 API/GPU/数据库服务/运行时网络请求等约束不变。
- 不改变产品能力边界：能证明可观测读取与写前检查，不能证明 Agent
  理解或遵守指导。

------------------------------------------------------------------------

## 1. 一页摘要

### 1.1 一句话价值

> **Your coding agent read the project rules 50 steps ago. Is it still
> following them?**

GuidancePulse 让开发者知道：Coding Agent
在长会话里开始时读取过的项目规则，是否仍对当前这次文件修改有效。它把“读过规则”变成有范围、有失效条件、可复核的本地凭证，并在受支持的写入动作执行前检查凭证。

### 1.2 产品定义

GuidancePulse 是一个本地运行的 Claude Code Hooks 适配器、CLI
和事件时间轴。用户把指导文件映射到受保护的文件路径与开发阶段。Claude
Code 成功读取指导后，系统为当前会话和 Agent 作用域签发
`Guidance Lease`。当上下文压缩、工作目录变化、任务阶段变化、进入新的子
Agent 作用域，或成功编辑次数达到上限时，旧凭证失效。Claude Code 通过
`PreToolUse`
在受支持的文件写入前检查凭证；未满足条件时，按规则提醒、请求确认或阻止写入。

**核心能力边界：** GuidancePulse
能证明某条指导在可观测事件中被加载或成功读取，并能证明某次受支持的写入前检查了凭证；它不能证明模型理解了规则，也不能证明模型在写入后始终遵守规则。

### 1.3 当前冻结决策

| 项目           | 冻结决策                                                    |
|----------------|-------------------------------------------------------------|
| 首版宿主       | 仅 Claude Code Hooks                                        |
| 其他 Agent     | 只预留统一事件接口；不宣称首版支持                          |
| 核心状态       | `UNSEEN → FRESH → EXPIRED`                                  |
| 核心强制事件   | `PreToolUse` 写前检查、`PreCompact` 压缩前失效              |
| 读取确认       | 成功的 `PostToolUse` Read；适用时观测 `InstructionsLoaded`  |
| 辅助边界事件   | `CwdChanged`、`SubagentStart`、`SessionStart`、`SessionEnd` |
| 阶段变化       | 显式 `guidancepulse phase set <phase>`                      |
| 运行架构       | 每次 Hook 调用启动独立 Node.js 子进程                       |
| 本地存储       | 单文件嵌入式 SQLite；无数据库服务器                         |
| 隐私           | 只记录事件类型、指导 ID、路径标识、时间和会话/租约状态      |
| 不保存         | Prompt、对话正文、源代码内容、完整 Read/Write 工具输入输出  |
| 真人参与       | 0；合成轨迹 + 确定性算法 + 独立验证                         |
| 运行成本       | 无收费 API、云模型、GPU、云数据库或遥测                     |
| 许可证         | MIT                                                         |
| Hook p95 S0 门 | **完整端到端 `<500ms`，每个样本含全新 Node 子进程启动成本** |

------------------------------------------------------------------------

## 2. 用户、场景与痛点

### 2.1 目标用户

经常使用 Claude Code 等支持 Hooks 的 Coding Agent、维护
`AGENTS.md`、`CLAUDE.md`、`.claude/rules/*.md` 或 Skill
的独立开发者及小型工程团队。

首版真正可执行的宿主范围限定为 Claude
Code。不同指导文件的自动加载可观测性不同，详见 §5.4。

### 2.2 典型场景

一次开发任务持续约 50–500 个工具步骤：

1.  Agent 在任务开始时读取项目约定、架构限制或某个 Skill。
2.  Agent 继续阅读代码、修改文件、运行测试。
3.  会话经历上下文压缩，早先的指导可能没有完整保留。
4.  Agent 切换工作目录、进入另一个子
    Agent，或从“探索”转到“实现/发布”阶段。
5.  Agent
    继续修改文件，但开发者无法从普通终端记录判断旧指导是否仍然处于当前上下文中。

### 2.3 痛点量化边界

以下数字全部是**待验证的规划假设**，不是访谈结果、行业统计或已测事实。

| 指标            |                                                                     规划假设 | 证据状态                                   |
|-----------------|-----------------------------------------------------------------------------:|--------------------------------------------|
| 相关触发频率    |                                                  每位目标开发者每周约 1–3 次 | NOT_MEASURED                               |
| 痛点强度        |                                                                          4/5 | 产品判断假设                               |
| 单次返工代价    |                                                   20–90 分钟；严重时可能更长 | 工程估算，未实测                           |
| 典型会话长度    |                                                            50–500 个工具步骤 | 目标场景，不是总体分布                     |
| 当前 workaround | 重复提醒 Agent、把规则复制到新 Prompt、人工翻阅 Transcript、不断加长指导文件 | 依赖人工注意力，不能证明本次写入前重新读取 |
| 主要缺口        |                 缺少轻量、确定性、本地的“指导读取事件—失效边界—写前检查”闭环 | 产品假设，需通过 S0 与后续数据验证         |

### 2.4 需求证据与证据边界

**Thoughtworks Technology Radar Vol.35（2026-11）**

- Blip 36 `Agent instruction bloat` 位于 Caution。该条目指出，编码 Agent
  的 `AGENTS.md`、流程 Skill
  和工作流指令会逐渐变长、冲突或过时，并建议把可确定化的指令转成 hooks
  或 checks。
- Blip 37 `Agent skill cognitive surrender` 位于
  Caution。该条目提醒团队不要不加审查地导入大型 Skill 集合或 Agent
  框架。
- 这些内容支持“指导治理是当前工程问题”和“确定性 Hook 值得探索”，但不证明
  GuidancePulse 的需求频率、节省时间或商业价值。

来源：  
<https://www.thoughtworks.com/content/dam/thoughtworks/documents/radar/2026/11/tr_technology_radar_vol_35_en.pdf>  
<https://www.thoughtworks.com/radar/techniques>  
发布日期：2026-11-04；核对日期：2026-11-15。

**Google Chrome Modern Web Guidance**

- `GoogleChrome/modern-web-guidance` 是真实存在的开源 Skill 项目。
- 其源仓库 `SKILL.md` 对指定的 HTML/CSS/客户端 JS
  工作要求在开始实现时先搜索和检索相关指南，再在实现后核对指南符合性。
- 它提供指导内容检索与工作流程，不是本项目的运行时凭证、失效状态机或写前拦截器。GuidancePulse
  不复制其指南内容、检索 CLI 或 Skill 实现。

来源：  
<https://github.com/GoogleChrome/modern-web-guidance>  
<https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/modern-web-guidance/SKILL.md>  
核对日期：2026-11-15。

**Claude Code 官方 Hooks reference**

官方文档列出
`PreToolUse`、`PostToolUse`、`PreCompact`、`PostCompact`、`InstructionsLoaded`、`CwdChanged`、`SubagentStart`、`SessionStart`、`SessionEnd`
等事件，并说明触发时机、输入字段和决策能力。实现必须以官方文档和实际安装版本探测为准。

来源：<https://code.claude.com/docs/en/hooks>  
核对日期：2026-11-15。

**证据纠正原则：** 不使用未经核实的 GitHub Issue 编号；不把 Star
数作为痛点发生率；不把研究建议写成已证明的产品效果。没有证据的频率、代价、Reach、RICE
和商业评分均标为待验证规划假设。

------------------------------------------------------------------------

## 3. 产品目标与非目标

### 3.1 MVP 目标

1.  本地 YAML 定义指导
    ID、来源文件、适用路径、阶段、强制模式和最大成功编辑次数。
2.  Claude Code 成功 Read 或可确认的指导加载事件可签发 `FRESH`。
3.  上下文压缩、工作目录变化、显式阶段变化、子 Agent
    作用域切换和编辑次数耗尽使旧凭证失效或不继承。
4.  在 Claude Code 原生 `Write` / `Edit`
    工具执行前检查目标文件所需的指导凭证。
5.  未满足条件时按规则执行 `warn`、`ask` 或 `block`。
6.  本地保存最小化事件记录，提供可查看、可导出、可删除的时间轴。
7.  提供独立 Python Reference Oracle、48 条手工 Golden Fixtures、自动化
    S0 Gate 和 100 次确定性重放。
8.  运行时完全离线；无 LLM、云 API、遥测、GPU 或数据库服务器。

### 3.2 非目标

- 不判断 Agent 是否真正理解、记住或遵守指导内容。
- 不分析 Prompt、Transcript、思维过程、模型回复或源代码内容。
- 不生成、改写或自动优化 `AGENTS.md`、`CLAUDE.md`、Skill。
- 不做 Skill 文件来源、权限或符号链接安全审计（P023 SkillScope
  的不同问题）。
- 不做跨会话记忆、Checkpoint 或任务恢复兼容性（与 P011 / P019 不同）。
- 不保证拦截所有文件写入；首版硬门只覆盖 Claude Code 原生 `Write` /
  `Edit` 工具。
- 不替代 Claude Code 权限系统、代码审查、测试、沙箱或组织安全策略。
- 不接入真实模型 API，不自动读取用户完整对话。
- 不提供云端团队控制台、SaaS、集中式遥测或远程策略服务。
- 不支持其他 Coding Agent 的生产级适配器。

### 3.3 产品能力准确表述

允许：“确认某条指导在可观测事件中已加载/成功读取”；“确认当前受支持的写入前，目标路径对应的
Guidance Lease 是否有效”。

禁止：“证明 Agent 理解了规则”；“保证 Agent
遵守所有项目规范”；“防止所有未经授权的代码修改”；“完整的 Agent
忠实度检测器”；“支持全部 Coding Agent”。

------------------------------------------------------------------------

## 4. 与历史项目的机制差异

### 4.1 P023 SkillScope

P023 SkillScope
是技能文件的静态来源与作用域审计，关注技能文件来自哪里、是否跨来源归属、符号链接是否逃逸、权限是否不可读。

GuidancePulse 不生产 Skill、不审核技能文件权限，也不判断 Skill
文件本身是否安全。它只检查指导资料在实际运行中是否被重新读取，以及读取凭证在长会话边界后是否仍有效。它是**运行时约束**，不是**静态审计**。

### 4.2 P019 ResumeMatrix

P019 ResumeMatrix 验证 Agent checkpoint 跨版本恢复兼容性。GuidancePulse
不读写或迁移 checkpoint，不验证恢复数据结构；它处理同一会话或子 Agent
作用域内的指导读取凭证。

### 4.3 P011 Context Capsule

P011 Context Capsule 关注跨会话交接记忆的结构与正确性。GuidancePulse
不生成交接胶囊、不保存对话摘要或长期记忆；它关注单次会话内部指导是否在关键边界后重新加载，以及写入前是否存在有效凭证。

### 4.4 邻近项目边界

P018 DualChannel 核验 MCP 服务端结果与模型实际输入的字段完整性；P024
RepoMapVerify 核验 Agent 声称的仓库地图与静态 import
图。它们可共享本地优先、独立 Oracle、Golden Fixtures
的工程方法，但不共享产品核心对象。

------------------------------------------------------------------------

## 5. 用户流程与 Hook 事件边界

### 5.1 初始化和配置

用户运行：

``` bash
guidancepulse init
```

生成：

``` text
.guidancepulse/
  config.yaml
  state.sqlite
  path-key.bin
  reports/
```

示例配置：

``` yaml
version: 1
defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny

phases: [explore, implementation, review, release]

rules:
  - id: auth-change-safety
    source: [CLAUDE.md, .claude/rules/security.md]
    applies_to: [src/auth/**, src/session/**]
    phases: [implementation, review]
    mode: block
    max_successful_edits: 5
```

`max_successful_edits=5` 是初始默认值，不是研究结论。

### 5.2 典型旅程

1.  用户运行 `guidancepulse install --project .`；安装器备份并合并
    `.claude/settings.local.json`。
2.  `SessionStart` 建立会话作用域。
3.  Agent 成功 `Read` 指导文件；`PostToolUse` 确认成功后签发
    `FRESH`。适用的 `InstructionsLoaded` 也可作为加载观测。
4.  Agent 修改受保护文件；`PreToolUse` 检查凭证。
5.  成功写入后编辑预算减一。
6.  `PreCompact` 在压缩前使当前作用域租约失效。
7.  压缩后若指导重新加载并产生可观测事件，重新签发
    `FRESH`；否则写入前按规则提醒/询问/阻止。
8.  `CwdChanged` 异步观察目录变化；每次写入前仍由 `PreToolUse`
    同步比对当前 cwd。
9.  `SubagentStart` 为新 Agent 建立独立作用域，父租约不继承。
10. 阶段转换由显式命令标记：

``` bash
guidancepulse phase set implementation
guidancepulse phase set review
```

### 5.3 官方事件表

| 事件                          | 官方状态 | 产品用途                                   | 是否能阻断              |
|-------------------------------|----------|--------------------------------------------|-------------------------|
| `PreToolUse`                  | 已确认   | Write/Edit 写前门                          | 可以                    |
| `PostToolUse`                 | 已确认   | 成功 Read 后签发凭证                       | 不作为写前门            |
| `PreCompact`                  | 已确认   | 压缩前使租约失效                           | 可以                    |
| `PostCompact`                 | 已确认   | 非阻断观测                                 | 不可以                  |
| `InstructionsLoaded`          | 已确认   | 观察 CLAUDE.md / `.claude/rules/*.md` 加载 | 不可以，异步            |
| `CwdChanged`                  | 已确认   | 观察工作目录变化                           | 不可以，异步            |
| `SubagentStart`               | 已确认   | 创建新 Agent 作用域                        | 不可以阻止子 Agent 创建 |
| `SessionStart` / `SessionEnd` | 已确认   | 会话初始化与清理                           | 不作为写前门            |

当前官方 reference 确实列出 `InstructionsLoaded` 和
`CwdChanged`。二者是异步、无决策控制事件，不能承担写入拦截。核心强制路径仍是
`PreToolUse` 与 `PreCompact`；成功 Read 确认需要 `PostToolUse`
或适用的加载观察。

### 5.4 不可观测读取的保守处理

- `InstructionsLoaded` 只覆盖官方说明的 `CLAUDE.md` 和
  `.claude/rules/*.md` 场景。
- 官方说明该事件不覆盖通过 Project instructions 设置直接读取的所有
  `AGENTS.md`；若 `CLAUDE.md` 导入 `AGENTS.md`，可观察到对应 include
  加载。
- Skill 文件只有显式 Read 或其他经实际验证的事件才可签发凭证；不假设
  Skill 内部加载一定可见。
- `@path` 引用可能直接插入上下文而不触发 Read
  工具，不作为严格模式的成功读取证明。
- 严格模式只有在确认读取成功且事件已写入状态库后才签发
  `FRESH`。异步事件晚到时宁可先提醒/阻止，不得假造凭证。

------------------------------------------------------------------------

## 6. Guidance Lease 状态机

### 6.1 状态定义

| 状态      | 含义                                             | 写前行为              |
|-----------|--------------------------------------------------|-----------------------|
| `UNSEEN`  | 当前会话/Agent 作用域没有确认读取                | 按规则 warn/ask/block |
| `FRESH`   | 成功读取，作用域、阶段、cwd、编辑预算均有效      | 允许通过该指导门      |
| `EXPIRED` | 因压缩、目录/阶段/作用域变化或编辑预算耗尽而失效 | 按规则 warn/ask/block |

``` mermaid
stateDiagram-v2
    [*] --> UNSEEN
    UNSEEN --> FRESH: 成功 Read / 可确认加载
    FRESH --> EXPIRED: PreCompact
    FRESH --> EXPIRED: CwdChanged / cwd 校验不一致
    FRESH --> EXPIRED: phase set
    FRESH --> EXPIRED: edit budget = 0
    EXPIRED --> FRESH: 再次成功 Read / 可确认加载
```

### 6.2 租约身份与有效条件

租约身份：

``` text
(session_scope_id, agent_scope_id, guidance_id)
```

`FRESH` 必须同时满足：

1.  有成功 Read 后事件或可确认加载事件；
2.  Session 与 Agent 作用域相同；
3.  当前 phase 在规则允许范围；
4.  当前 cwd 标识与签发时一致；
5.  `remaining_successful_edits > 0`；
6.  自签发以来未发生失效边界。

新 Session 或新 Subagent 从 `UNSEEN` 开始；租约不跨 Agent 作用域继承。

### 6.3 编辑预算

默认每条租约最多允许 5 次成功的受保护编辑。成功 Write/Edit
后扣减；失败写入不扣减；剩余数变为 0 时转为
`EXPIRED`。用户可按规则修改。

### 6.4 写前算法

``` text
on PreToolUse(event):
    if tool_name not in ["Write", "Edit"]:
        return allow_without_guidance_gate

    target = normalize_path(tool_input.file_path)
    rules = match_rules(target, current_phase)

    for rule in rules:
        lease = load_lease(session_scope, agent_scope, rule.id)

        if lease missing:
            state = UNSEEN
        else if lease.cwd_id != hmac_path_id(event.cwd):
            expire(lease, "CWD_MISMATCH")
            state = EXPIRED
        else if lease.phase != current_phase:
            expire(lease, "PHASE_MISMATCH")
            state = EXPIRED
        else if lease.remaining_successful_edits <= 0:
            expire(lease, "EDIT_BUDGET_EXHAUSTED")
            state = EXPIRED
        else:
            state = lease.state

        if state != FRESH:
            collect(rule.mode, rule.id, state)

    return aggregate(block > ask > warn)
```

### 6.5 失效边界

- `PreCompact`：原子失效当前作用域租约；无法持久化失效状态时，严格模式阻止压缩。
- `CwdChanged`：异步失效旧 cwd 租约；`PreToolUse` 同步复核当前
  cwd，防止异步竞态。
- `SubagentStart`：建立独立子 Agent 作用域，初始 `UNSEEN`。
- 阶段变化：显式 `phase set`，失效当前作用域旧租约。
- `InstructionsLoaded`：只作官方支持范围内的加载观察，不具备阻断能力。
- `PostToolUse`：仅成功 Read 才签发；失败 Read 不签发。
- 首版只保证原生 `Write` / `Edit`，不保证 Bash、外部进程或 IDE
  直接写盘。

------------------------------------------------------------------------

## 7. 架构、数据与隐私

### 7.1 v1.1.0 进程架构

保持每次 Hook 调用启动独立 Node.js 子进程。没有 daemon、HTTP
本地服务、Unix socket、Named Pipe 或后台常驻状态进程。

``` mermaid
flowchart TD
  CC[Claude Code] --> H[Official Hook Events]
  H --> SPAWN[Fresh Node subprocess per Hook]
  SPAWN --> A[Node Hook Adapter]
  A --> S[Privacy Sanitizer]
  S --> C[Rule Config + Path Matcher]
  C --> M[Guidance Lease State Machine]
  M --> DB[(Embedded SQLite)]
  CLI[guidancepulse CLI] --> C
  CLI --> DB
  DB --> UI[Local Timeline UI]
```

### 7.2 模块

| 模块              | 职责                                               |
|-------------------|----------------------------------------------------|
| `hook-adapter`    | 解析官方 Hook JSON 并分发                          |
| `event-sanitizer` | 只抽取允许字段，生成路径 HMAC                      |
| `config`          | 校验规则 Schema、Glob、阶段与模式                  |
| `path-matcher`    | 路径规范化与目标规则匹配                           |
| `lease-engine`    | 状态转移、编辑预算、边界失效                       |
| `store`           | SQLite 事务、WAL、状态恢复                         |
| `cli`             | init/install/uninstall/status/phase/report/privacy |
| `timeline-ui`     | 本地事件时间轴与租约状态                           |

### 7.3 内部事件契约

``` ts
type GuidancePulseEvent =
  | { type: "READ_SUCCEEDED"; sessionScopeId: string; agentScopeId: string; guidanceId: string; pathId: string; timestampUtc: string }
  | { type: "PRE_COMPACT"; sessionScopeId: string; agentScopeId: string; timestampUtc: string }
  | { type: "CWD_CHANGED"; sessionScopeId: string; agentScopeId: string; oldPathId: string; newPathId: string; timestampUtc: string }
  | { type: "SUBAGENT_STARTED"; sessionScopeId: string; agentScopeId: string; timestampUtc: string }
  | { type: "PHASE_CHANGED"; sessionScopeId: string; agentScopeId: string; phaseId: string; timestampUtc: string }
  | { type: "WRITE_CHECKED"; sessionScopeId: string; agentScopeId: string; guidanceId: string; pathId: string; decision: "ALLOW" | "WARN" | "ASK" | "DENY"; state: "UNSEEN" | "FRESH" | "EXPIRED"; timestampUtc: string };
```

原始 Hook JSON 只在内存解析，绝不作为持久化数据。

### 7.4 允许持久化字段

- 事件类型；
- guidance ID；
- HMAC 路径标识；
- 时间戳；
- Session/Agent 作用域标识；
- 租约状态、阶段 ID、剩余编辑数、失效原因代码。

禁止持久化 Prompt、Transcript、模型回复、源代码、Read/Write
正文、绝对路径、用户名、主机名、API Key、Cookie 或访问令牌。

### 7.5 隐私操作

``` bash
guidancepulse privacy export
guidancepulse privacy delete --session <id>
guidancepulse privacy delete --all
```

`--all` 删除事件数据库与路径密钥。SQLite
是单文件嵌入式存储，不运行数据库服务端。运行时外部请求必须为 0。

------------------------------------------------------------------------

## 8. UI 规格

### 8.1 主界面四区

1.  顶部会话条：Session、Agent、phase、最近压缩时间。
2.  左侧指导清单：guidance ID、UNSEEN/FRESH/EXPIRED、剩余编辑数。
3.  中央时间轴：Read、Compact、Cwd、Phase、Subagent、Write decision。
4.  右侧详情：事件类型、时间、guidance
    ID、路径标识短码、状态变化、失效原因、决策。

### 8.2 视觉与交互

- FRESH 绿色、UNSEEN 灰色、EXPIRED 橙色、DENY 红色、ASK 黄色、WARN
  蓝色。
- 每种状态必须同时显示文字与图标，不能只靠颜色。
- 点击指导 ID 可过滤事件；点击失效事件展示原因代码。
- 被阻止的写入只显示指导 ID、路径标识和重新读取建议，不展示源代码。
- 导出 JSON/静态 HTML；UI 只读本地脱敏数据。
- Dashboard 只监听 `127.0.0.1`，不加载 CDN、远程字体或第三方脚本。

### 8.3 示例

``` text
guidance_id: auth-change-safety
state: EXPIRED
reason: CONTEXT_COMPACTION
last_confirmed_read: 2026-11-15T10:14:03Z
remaining_successful_edits: 3
target_path_id: hmac:8a12c9...
next_write: DENY
```

这是规格示例，不是实际运行输出。

------------------------------------------------------------------------

## 9. S0 自动化门禁

### 9.1 v1.0.0 历史结果与 v1.1.0 重跑规则

附件 `S0_GATE.json` 的 v1.0.0 结果为 FAIL。commit
`3bdc46a143b038fe52413e4f52024cd3fe817330`；p95=194.00ms（n=100），旧阈值
`<10ms`；其他六项 PASS。附件 `fixture-results.json` 证明 48/48
parity、32/32 检出、16/16 控制无误报。v1.1.0 不得将旧 Gate 直接改判
PASS；必须重新生成完整报告。

### 9.2 48 条合成轨迹

| 组别                |   数量 | 植入情形                                     | 期望             |
|---------------------|-------:|----------------------------------------------|------------------|
| 正常控制            |     16 | 成功读取、同一作用域/目录/阶段、预算未耗尽   | 16/16 不误报     |
| 压缩后未重读        |      8 | PreCompact 后沿用旧租约                      | 8/8 检出         |
| 目录切换            |      8 | 旧目录凭证用于新目录；含 same-cwd 反向 guard | 8/8 检出         |
| 未读取就写          |      8 | 无成功 Read 却写受保护路径                   | 8/8 检出         |
| 子 Agent / 阶段切换 |      8 | 新 Agent 作用域或新阶段沿用旧租约            | 8/8 检出         |
| **总计**            | **48** | **32 错误 + 16 控制**                        | **48/48 parity** |

### 9.3 四种检测依据与原样条件

T010 `summarizeReplay` 必须按下列优先级判定：

**1. `non_allow_decision`（28 条）**

``` ts
result.decisions.some((d) => d.decision !== "ALLOW")
```

**2. `expired_final_lease`（1 条，S07）**

``` ts
result.leases.some((l) => l.state === "EXPIRED" && l.reason !== null)
```

S07：phase 切换使规则失活，没有被门控的写；终态租约仍为
`EXPIRED`，`reason=PHASE_MISMATCH`。

**3. `expired_intermediate_lease`（2 条，W05、S06）**

``` ts
result.snapshots.some((s) =>
  s.leases.some((l) => l.state === "EXPIRED" && l.reason !== null)
)
```

W05：中间快照 `EXPIRED / CWD_MISMATCH`，后续重读恢复 `FRESH`。  
S06：中间快照 `EXPIRED / PHASE_MISMATCH`，后续重读恢复 `FRESH`。

**4. `same_cwd_no_expiry`（1 条，W07）**

``` ts
fixture.steps.some(
  (s) => s.kind === "cwd" && s.old !== undefined && s.old === s.new
) &&
result.snapshots.every(
  (s) => s.leases.every((l) => l.state === "FRESH")
)
```

W07：cwd 事件前后路径相同；租约全程 FRESH，`last_read` 不变。这是反向
guard，防止过度失效。

优先级顺序：

``` text
non_allow_decision
→ expired_final_lease
→ expired_intermediate_lease
→ same_cwd_no_expiry
```

**防作弊规则：** fixture 即使
`matchesGolden=true`，只要四种依据一条都不满足，就不得计为检出。16 条
control 的 `detection_basis=null`、`controlClean=true`，不计入 32。

### 9.4 Golden 终态不足与反向测试

W05、S06、W07 的 Golden 期望本身都是 `ALLOW + FRESH`
终态。只看终态决策和终态租约最多只能算 29/32。必须使用每步租约快照与
`fixture.steps`：

- W05/S06：中间边界快照证明确实 EXPIRED，后续重读才恢复 FRESH。
- W07：相同 cwd 事件不应让租约失效，必须全程 FRESH。
- 忽略 compact 边界的篡改反向测试必须使检出降为 31/32。

### 9.5 七项 S0 硬门

|  \# | 硬门                            | v1.1.0 阈值                 | 相对 v1.0.0          |
|----:|---------------------------------|-----------------------------|----------------------|
|   1 | 生产 / Golden / Oracle 三向一致 | 三向均 48/48                | 不变                 |
|   2 | 植入错误检出                    | 32/32，按四依据             | 固化 T010 已收紧定义 |
|   3 | 控制无误报                      | 16/16                       | 不变                 |
|   4 | Hook 端到端 p95                 | **严格小于 500ms**          | 从 `<10ms` 调整      |
|   5 | 100 次确定性重放                | 恰好 1 个 canonical SHA-256 | 不变                 |
|   6 | 运行时网络请求                  | 0                           | 不变                 |
|   7 | Prompt / 源码持久化泄露         | 0 canary 命中               | 不变                 |

七项必须全部 PASS。

### 9.6 p95 计时口径

- 先执行恰好 5 次预热；5 次全部不计入 p95。
- 随后执行 100 次计时；每次都是全新 Node.js 子进程。
- 这 100 次必须包含冷启动样本；冷启动同时属于 `n=100`。
- 每个样本包括 spawn、Node 启动、better-sqlite3 加载、JSON
  解析、字段净化、SQLite 读取、路径匹配、决策、输出和退出。
- 另行报告 `cold_start_ms`，但不得把冷启动从 100 样本剔除。
- p50/p95/p99/min/max 均从完整 100 样本计算。
- `run_failures=0`；失败调用不能静默删除。
- 阈值严格 `p95 < 500ms`，等于 500ms 为 FAIL。
- 不得用 daemon、进程内函数计时、复用进程、平均值或剔除最慢样本替代。

500ms 依据：当前项目已报告冷启动最高 462ms；v1.0.0 附件本轮记录 p95
194.00ms、单独 cold_start 285.04ms。500ms
覆盖当前最高观测并保留余量。该预算只在受保护 Write/Edit
前触发；对通常以秒级计的 Agent 工具操作，作为 MVP
写前检查成本可接受，但不是零延迟承诺。

### 9.7 确定性、网络与隐私

- 100 次完整 48 轨迹 replay 必须得到唯一 canonical SHA。
- canonical hash 包含事件顺序、状态变化、指导 ID、Fixture
  ID、决策、失效原因和逐步快照。
- 排除 `generated_at_utc`、墙钟耗时、随机临时目录和机器路径。
- 网络请求 0；Prompt/源码持久化 Canary 命中 0。

### 9.8 Gate 产物

``` text
artifacts/s0/
  S0_GATE.json
  S0_GATE.md
  fixture-results.json
  oracle-results.json
  perf-hook.json
  repeat-hashes.json
  privacy-scan.json
  network-scan.json
  logs/
```

`fixture-results.json` 必须列出 48 个 fixture 的
`matchesGolden`、`controlClean`、`errorDetected`、`detection_basis`、decisions、final
leases、snapshots 和 Golden。`perf-hook.json` 必须列出 5 次预热、100
个样本、cold-start 样本标记、p50/p95/p99/min/max、run_failures
和环境信息。

------------------------------------------------------------------------

## 10. 风险分级

| 风险                                   | 级别                  | 门禁动作                               |
|----------------------------------------|-----------------------|----------------------------------------|
| PreToolUse 未能阻止 stale write        | P0/P1                 | S0 FAIL，禁止进入 S1                   |
| PreCompact 失效状态未持久化            | P1                    | 严格模式必须阻止压缩或明确 fail closed |
| Hook p95 ≥500ms                        | P1                    | S0 FAIL，不改测量口径                  |
| Oracle 与生产共享代码/期望答案         | P1                    | S0 FAIL                                |
| Prompt/源代码写入日志或 SQLite         | P1                    | 隐私门 FAIL                            |
| detection_basis 缺失或只靠 Golden 相等 | P1                    | 32/32 检出门 FAIL                      |
| W05/S06 中间快照丢失                   | P1                    | 32/32 检出门 FAIL                      |
| W07 same-cwd 被错误失效                | P1                    | 反向 guard 失败，S0 FAIL               |
| AGENTS.md/Skill 不可观测               | P2 产品边界           | 保持 UNSEEN；不猜测                    |
| Bash/外部进程写入绕过                  | P2 产品边界           | README 明确不覆盖                      |
| Windows 路径问题                       | P2，若导致误放行则 P1 | 规范化测试；实际支持平台如实声明       |
| UI 小幅布局问题                        | P2                    | 不影响核心验收可登记非阻断             |

------------------------------------------------------------------------

## 11. 工作区运行与验收命令

以下命令是计划目标，不代表当前已执行：

``` bash
npm ci
npm run typecheck
npm test

npm run test:golden
npm run test:oracle
npm run test:s0
npm run perf:hook
npm run repeat:s0 -- --runs 100
npm run s0:gate

python3 tests/oracle/reference_oracle.py --self-test
python3 tests/oracle/reference_oracle.py --verify-golden

npm run build
npm run test:e2e
npm run test:offline
npm run test:privacy
```

本地产品体验（S0 PASS 后）：

``` bash
guidancepulse init
guidancepulse validate
guidancepulse install --project .
guidancepulse status
guidancepulse phase set implementation
guidancepulse report --format html --open
guidancepulse privacy export
```

发布冻结（所有下游门通过后）：

``` bash
npm run release:build
npm run release:verify
sha256sum -c release/SHA256SUMS.txt
git status --short
git rev-parse HEAD
```

Python 命令统一使用 `python3`。Windows PowerShell 若实际调用
`py -3`，必须在 T001 环境记录中说明，不得在规格示例中混用未定义的
`python` 命令。

------------------------------------------------------------------------

## 12. 模型工种、交接与 Git 规则

### 12.1 模型工种

Muse
只从自己已经测试可用的免费模型清单分配，不虚构模型名称、额度或账号。

| 工种            | 任务      | 必要能力                                   | 独立性                    |
|-----------------|-----------|--------------------------------------------|---------------------------|
| 技术探测        | T001      | 终端执行、版本探测、日志归档               | Muse 复核命令输出         |
| TypeScript 核心 | T002–T006 | Node/TS、Hooks、状态机                     | 每个任务新会话            |
| 存储与隐私      | T007      | SQLite、事务、HMAC                         | 尽可能不同模型            |
| UI              | T008      | React、Vite                                | 独立文件归属              |
| 测试与 Oracle   | T009–T010 | Python 3、TypeScript、确定性测试、性能测量 | Oracle 作者不写生产状态机 |
| CLI / 集成      | T011–T012 | Node CLI、Claude settings、E2E             | 只在 S0 PASS 后           |
| 独立审查        | T013      | 安全、并发、测试、证据                     | 不同模型或独立新会话      |
| 发布            | T014      | ZIP、Manifest、SHA、Git                    | Muse 独立核验             |

### 12.2 任务交接格式

``` text
TASK_ID:
PROJECT_ID: P025
SPEC_VERSION: 1.1.0
BASE_COMMIT:
RESULT_COMMIT:
GOAL:
INPUTS:
OUTPUT_PATHS:
OWNED_FILES:
FORBIDDEN_FILES:
INTERFACE_CONTRACT:
ACCEPTANCE_COMMANDS:
EXIT_CODES:
EXPECTED_EVIDENCE:
DONE_DEFINITION:
FAILURE_ROLLBACK:
```

每个 HANDOFF
还要包含变更文件、命令、退出码、测试摘要、日志路径、SHA-256、已知限制和下一任务。

### 12.3 Git 规则

- 每个任务在独立 worktree 或分支中完成。
- 不允许两个 Agent 同时修改同一文件。
- 先运行验收命令，再合并。
- 失败保留日志和分支；修复任务新建 `FIX-<TASK_ID>-NN`。
- 任何 S0 代码变化都必须重新运行完整 S0 Gate。
- T014 冻结后任何变更都必须生成新 commit、新 ZIP、新 Manifest、新
  SHA，并重新审查。

------------------------------------------------------------------------

## 13. Drive 交付结构与终审证据

``` text
P025-guidancepulse/
  00_spec/
    PROJECT_BOOK.md
    IMPLEMENTATION_PLAN.md
  01_source/
    source.zip
    SOURCE_MANIFEST.csv
  02_tests/
    S0_GATE.json
    S0_GATE.md
    fixture-results.json
    oracle-results.json
    perf-hook.json
    test-logs/
  03_reviews/
    REVIEW_INDEX.md
    REVIEW_PACK_01.md
    REVIEW_PACK_02.md
    T013_REVIEW.md
  04_release/
    dist.zip
    RELEASE_MANIFEST.json
    SHA256SUMS.txt
    T014_FREEZE_REPORT.md
  05_demo/
    screenshots/
    demo-recording/
```

`REVIEW_INDEX.md` 至少列出 `file_path`、SHA-256、字节数、source
commit、review pack 和 review status。源码审查必须有分批纯文本
`REVIEW_PACK_XX.md`，不能只提供 ZIP。

终审需核对：

- 需求覆盖与状态机实现一致；
- Hook 事件语义与官方文档一致；
- 48/48 三向 parity；
- 32/32 四依据检出，16/16 控制无误报；
- W05/S06 中间快照、S07 终态、W07 same-cwd 反向 guard；
- p95 完整样本口径，冷启动属于 100 次计时；
- 100 次 replay 唯一 hash、离线与隐私证据；
- UI 截图与真实演示；
- 依赖许可证；
- 源码、Manifest、ZIP、Git commit 和 SHA 一致；
- T013 独立审查 P0/P1=0。

------------------------------------------------------------------------

## 14. 发布清单

T014 只有在以下项目全部满足时才能标记 PASS：

- [ ] v1.1.0 S0 七项硬指标全部 PASS。
- [ ] 48/48 三向 parity。
- [ ] 32/32 四依据检出；16/16 control 无误报。
- [ ] W05/S06 中间 EXPIRED 快照保留；S07 final EXPIRED；W07 same-cwd
  全程 FRESH。
- [ ] Hook p95 \<500ms，100 个全新 Node 子进程计时样本含冷启动；5
  次预热排除。
- [ ] 100 次 replay 一个 canonical SHA。
- [ ] 外部请求 0；Prompt/源代码持久化 0。
- [ ] npm test、typecheck、build、E2E、offline、privacy 均真实运行通过。
- [ ] 安装器备份并保留用户现有 Hook；卸载只删除自有 Hook。
- [ ] UI 截图/演示可复现。
- [ ] MIT LICENSE 与第三方许可证清单完整。
- [ ] source.zip、dist.zip、Manifest、SHA256SUMS 与冻结 commit 一致。
- [ ] REVIEW_INDEX / REVIEW_PACK 覆盖全部第一方核心文件。
- [ ] T013 独立审查 P0/P1=0。
- [ ] Muse 将规格、源码、测试日志、审查包、发布包和演示证据上传 Drive
  并回读核对。

------------------------------------------------------------------------

## 15. 当前状态与授权边界

| 项目         | 当前值                               |
|--------------|--------------------------------------|
| 方向         | P025 GuidancePulse                   |
| 规格版本     | v1.1.0                               |
| v1.0.0 S0    | FAIL，历史结果保留                   |
| v1.1.0 S0    | NOT_RUN，必须重新执行                |
| T001–T010    | 既有实现存在；相关任务按 v1.1.0 重验 |
| T013 S0 审查 | 新版 S0 后执行                       |
| T011         | BLOCKED                              |
| T012         | BLOCKED                              |
| T014         | BLOCKED                              |
| 总工时       | 88h（72h 基准 + 16h 缓冲）           |
| 真人参与     | 0                                    |
| 许可证       | MIT                                  |

**本轮结束条件：** 两份 v1.1.0 Markdown 规格文件交付。施工方按 v1.1.0
更新 T003/T004/T005/T009/T010/T013 的任务验收合同，重新运行 S0。只有新
S0 七项全部 PASS 且 T013 S0 审查通过后，才可解除 T011/T012/T014
的阻塞。不得把 v1.0.0 的 S0 FAIL 改写为 PASS。
