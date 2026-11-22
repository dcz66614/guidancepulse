# P025 GuidancePulse（指令续用闸）｜项目书

**PROJECT_ID:** P025  
**SLUG:** guidancepulse  
**SPEC_VERSION:** 1.0.0  
**SPEC_STATUS:** SPECIFICATION_PENDING_USER_REVIEW  
**PROJECT_STATUS:** NOT_GO / NOT_STARTED  
**LICENSE:** MIT  
**参与政策:** ZERO_HUMAN_PARTICIPANTS  
**规格日期:** 2026-11-15

> 本文件定义产品与技术契约。当前只完成规格编写；没有开发、运行、测试或发布记录。用户核对并明确授权前，不得启动开发。

## 0. 一页摘要

### 0.1 一句话价值

**Your coding agent read the project rules 50 steps ago. Is it still
following them?**

GuidancePulse 把 Coding Agent
读取项目指导的行为变成有范围、有失效条件、可复核的本地凭证，并在受支持的文件写入前检查凭证是否仍有效。

### 0.2 产品定义

GuidancePulse 是一个本地运行的 Claude Code Hooks 适配器、CLI
和事件时间轴。用户定义指导文件、受保护路径、任务阶段和凭证有效期。Agent
成功读取指导后，系统签发
`Guidance Lease`。上下文压缩、工作目录变化、显式阶段变化、子 Agent
作用域变化或编辑预算耗尽会使旧凭证失效。Claude Code 通过 `PreToolUse`
在原生 `Write` / `Edit`
工具执行前检查凭证；不满足条件时提醒、请求确认或阻止。

**严格能力边界：**
产品能证明某条指导在可观测事件中已加载或成功读取，并能证明受支持的写入前检查了凭证；不能证明
Agent 理解规则或写入后一直遵守规则。

### 0.3 冻结决策

| 项目         | 决策                                                              |
|--------------|-------------------------------------------------------------------|
| 首版宿主     | 仅 Claude Code Hooks                                              |
| 其他 Agent   | 预留统一事件接口，不宣称首版支持                                  |
| 状态机       | `UNSEEN → FRESH → EXPIRED`                                        |
| 核心强制事件 | `PreToolUse` 写前检查、`PreCompact` 压缩前失效                    |
| 读取确认     | 成功 `PostToolUse` Read；适用时观察 `InstructionsLoaded`          |
| 辅助事件     | `CwdChanged`、`SubagentStart`、`SessionStart`、`SessionEnd`       |
| 阶段切换     | 显式 `guidancepulse phase set <phase>`                            |
| 存储         | 单文件嵌入式 SQLite；无数据库服务器                               |
| 隐私         | 只存事件类型、指导 ID、路径标识、时间和会话/租约状态              |
| 不保存       | Prompt、Transcript、模型回复、源代码内容、Read/Write 完整输入输出 |
| 真人参与     | 0；全部使用合成数据和自动化                                       |
| 运行成本     | 无收费 API、LLM、GPU、云数据库或遥测                              |
| 许可证       | MIT                                                               |

------------------------------------------------------------------------

## 1. 用户与痛点

### 1.1 目标用户

经常使用 Claude Code 等支持 Hooks 的 Coding Agent、维护
`AGENTS.md`、`CLAUDE.md`、`.claude/rules/*.md` 或 Skill
的独立开发者及小型工程团队。

首版实际适配器仅支持 Claude Code；不同指导文件的自动加载可观测性不同，见
§4.4。

### 1.2 典型场景

一次开发任务持续约 50–500 个工具步骤：

1.  Agent 在开始时读取项目约定、架构限制或某个 Skill。
2.  Agent 继续阅读代码、修改文件、运行测试。
3.  会话经历上下文压缩，早先的指导可能没有完整保留。
4.  Agent 切换工作目录、进入子 Agent，或从探索转入实现/发布阶段。
5.  Agent
    继续修改文件，但开发者无法从普通终端记录判断旧指导是否仍处于当前上下文。

### 1.3 痛点量化边界

以下均为**待验证的规划假设**，不是访谈结果、行业统计或已测事实。

| 指标            |                                                                   规划假设 | 证据状态                                   |
|-----------------|---------------------------------------------------------------------------:|--------------------------------------------|
| 相关触发频率    |                                                每位目标开发者每周约 1–3 次 | NOT_MEASURED                               |
| 痛点强度        |                                                                        4/5 | 产品判断假设                               |
| 单次返工代价    |                                                                 20–90 分钟 | 工程估算，未实测                           |
| 典型会话长度    |                                                          50–500 个工具步骤 | 目标场景，不是总体分布                     |
| 当前 workaround | 重复提醒 Agent、复制规则到新 Prompt、人工翻阅 Transcript、不断加长指导文件 | 依赖人工注意力，不能证明本次写入前重新读取 |
| 产品缺口假设    |                   缺少轻量、本地、确定性的“读取事件—失效边界—写前检查”闭环 | 待 S0 和后续使用数据验证                   |

### 1.4 需求证据与边界

**Thoughtworks Technology Radar Vol.35（2026-11）**

- Blip 36 `Agent instruction bloat` 位于 Caution：指出 `AGENTS.md`
  等指导会变长、冲突或过时，并建议把可确定化的指令转成 hooks 或 checks。
- Blip 37 `Agent skill cognitive surrender` 位于
  Caution：提醒团队不要不加审查地导入大型 Skill 集合或 Agent 框架。
- 这些内容支持“指导治理值得关注”，但不证明 GuidancePulse
  的需求频率、节省时间或商业价值。

来源：<https://www.thoughtworks.com/content/dam/thoughtworks/documents/radar/2026/11/tr_technology_radar_vol_35_en.pdf>  
发布日期：2026-11-04；核对日期：2026-11-15。

**Google Chrome Modern Web Guidance**

- `GoogleChrome/modern-web-guidance` 是真实存在的开源 Skill 项目。
- 其公开 `SKILL.md` 对指定 HTML/CSS/客户端 JS
  工作要求在开始实现时先搜索和检索相关指南，并在实现后核对符合性。
- 这是“任务开始时查找指导、实现前查证、实现后复核”的设计先例，不是本项目的运行时凭证或写前拦截器。GuidancePulse
  不复制其指南内容、CLI 或 Skill 实现。

来源：

- <https://github.com/GoogleChrome/modern-web-guidance>
- <https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/modern-web-guidance/SKILL.md>

**Claude Code 官方 Hooks reference**

官方 reference 列出
`PreToolUse`、`PostToolUse`、`PreCompact`、`PostCompact`、`InstructionsLoaded`、`CwdChanged`、`SubagentStart`、`SessionStart`、`SessionEnd`
等事件，并说明输入字段和决策能力。产品实现以该文档和 T001
实际环境探测为准，不使用未经核实的事件名或 Issue 编号。

来源：<https://code.claude.com/docs/en/hooks>  
核对日期：2026-11-15。

**证据原则：** 不用 Star
数推导故障率；不把规划数字写成已测事实；不引用未经核实的 Issue
编号；不把研究建议写成已证明的产品效果。

------------------------------------------------------------------------

## 2. 目标、非目标与产品声明

### 2.1 MVP 目标

1.  本地 YAML 定义指导
    ID、来源文件、目标路径、阶段、强制模式和最大成功编辑次数。
2.  成功 Read 或可确认的指导加载事件可签发 `FRESH`。
3.  压缩、目录变化、显式阶段变化、子 Agent
    作用域变化和编辑预算耗尽使旧凭证失效或不继承。
4.  Claude Code 原生 `Write` / `Edit` 执行前检查凭证。
5.  未满足条件时按规则 `warn`、`ask` 或 `block`。
6.  本地时间轴展示最小化事件，并允许查看、导出、删除。
7.  48 条手工 Golden Fixtures、独立 Python Oracle、自动化 S0 Gate 和 100
    次确定性重放。
8.  运行时离线，无 LLM、云 API、遥测或 GPU。

### 2.2 非目标

- 不判断 Agent 是否真正理解或遵守指导。
- 不分析 Prompt、Transcript、模型回复、思维过程或源代码内容。
- 不生成、改写或优化 `AGENTS.md`、`CLAUDE.md` 或 Skill。
- 不做技能文件来源/权限审计（P023 SkillScope 的问题）。
- 不做跨会话记忆或 Checkpoint 恢复兼容（P011 / P019 的问题）。
- 不保证拦截所有文件写入。首版强制门只覆盖 Claude Code 原生 `Write` /
  `Edit`。
- 不替代 Claude Code 权限系统、代码审查、测试、沙箱或组织安全策略。
- 不提供云端团队控制台、SaaS、远程策略服务。
- 不提供其他 Coding Agent 的生产级适配器。

### 2.3 允许与禁止的产品表述

允许：“确认某条指导在可观测事件中已加载/成功读取”；“确认当前受支持的写入前，目标路径对应的租约是否有效”。

禁止：“证明 Agent 理解规则”；“保证 Agent
遵守所有项目规范”；“防止所有未经授权的修改”；“完整的 Agent
忠实度检测器”；“支持所有 Coding Agent”。

------------------------------------------------------------------------

## 3. 与历史项目的机制差异

### 3.1 P023 SkillScope

P023
是技能文件的静态来源与作用域审计，关注技能文件来自哪里、是否跨来源归属、符号链接是否逃逸、权限是否不可读。

GuidancePulse 不生产 Skill、不审核技能文件权限，也不判断 Skill
文件本身是否安全。它只检查指导资料在实际运行中是否重新读取，以及读取凭证在长会话边界后是否仍有效。它是**运行时约束**，不是**静态审计**。

### 3.2 P019 ResumeMatrix

P019 验证 Agent checkpoint 跨版本恢复兼容性。GuidancePulse 不读写或迁移
checkpoint，不验证恢复数据结构；它处理同一会话或子 Agent
作用域内的指导读取凭证。

### 3.3 P011 Context Capsule

P011 关注跨会话交接记忆的结构与正确性。GuidancePulse
不生成交接胶囊、不保存对话摘要或长期记忆；它关注单次会话内部指导是否在关键边界后重新加载，以及写入前是否存在有效凭证。

### 3.4 邻近项目边界

P018 DualChannel 核验 MCP 服务端结果与模型实际输入的字段完整性；P024
RepoMapVerify 核验 Agent 声称的仓库地图与静态 import
图。它们可共享本地优先、独立 Oracle、Golden Fixtures
的工程方法，但不共享产品核心对象。

------------------------------------------------------------------------

## 4. 用户流程与 Hook 事件边界

### 4.1 初始化和配置

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

### 4.2 典型旅程

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

### 4.3 官方事件表

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

**重要技术纠正：** 当前官方 reference 确实列出 `InstructionsLoaded` 和
`CwdChanged`。二者是异步、无决策控制事件，不能承担写入拦截。核心强制路径仍是
`PreToolUse` 与 `PreCompact`；成功 Read 确认需要 `PostToolUse`
或适用的加载观察。

### 4.4 不可观测读取的保守处理

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

## 5. Guidance Lease 状态机

### 5.1 状态定义

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

### 5.2 租约身份与有效条件

租约身份为：

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

### 5.3 编辑预算

默认每条租约最多允许 5 次成功的受保护编辑。成功 Write/Edit
后扣减；失败写入不扣减；剩余数变为 0 时转为
`EXPIRED`。用户可按规则修改。

### 5.4 写前算法

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

### 5.5 失效边界

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

## 6. 架构、数据与隐私

### 6.1 架构

``` mermaid
flowchart TD
  CC[Claude Code] --> H[Official Hook Events]
  H --> A[Node Hook Adapter]
  A --> S[Privacy Sanitizer]
  S --> C[Rule Config + Path Matcher]
  C --> M[Guidance Lease State Machine]
  M --> DB[(Embedded SQLite)]
  CLI[guidancepulse CLI] --> C
  CLI --> DB
  DB --> UI[Local Timeline UI]
```

### 6.2 模块

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

### 6.3 内部事件契约

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

### 6.4 允许持久化字段

- 事件类型；
- guidance ID；
- HMAC 路径标识；
- 时间戳；
- Session/Agent 作用域标识；
- 租约状态、阶段 ID、剩余编辑数、失效原因代码。

禁止持久化 Prompt、Transcript、模型回复、源代码、Read/Write
正文、绝对路径、用户名、主机名、API Key、Cookie 或访问令牌。

### 6.5 隐私操作

``` bash
guidancepulse privacy export
guidancepulse privacy delete --session <id>
guidancepulse privacy delete --all
```

`--all` 删除事件数据库与路径密钥。SQLite
是单文件嵌入式存储，不运行数据库服务端。运行时外部请求必须为 0。

------------------------------------------------------------------------

## 7. UI 规格

### 7.1 主界面四区

1.  顶部会话条：Session、Agent、phase、最近压缩时间。
2.  左侧指导清单：guidance ID、UNSEEN/FRESH/EXPIRED、剩余编辑数。
3.  中央时间轴：Read、Compact、Cwd、Phase、Subagent、Write decision。
4.  右侧详情：事件类型、时间、guidance
    ID、路径标识短码、状态变化、失效原因、决策。

### 7.2 视觉与交互

- FRESH 绿色、UNSEEN 灰色、EXPIRED 橙色、DENY 红色、ASK 黄色、WARN
  蓝色。
- 每种状态必须同时显示文字与图标，不能只靠颜色。
- 点击指导 ID 可过滤事件；点击失效事件展示原因代码。
- 被阻止的写入只显示指导 ID、路径标识和重新读取建议，不展示源代码。
- 导出 JSON/静态 HTML；UI 只读本地脱敏数据。
- Dashboard 只监听 `127.0.0.1`，不加载 CDN、远程字体或第三方脚本。

### 7.3 示例

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

## 8. S0 自动化门禁

### 8.1 48 条合成轨迹

| 组别                |   数量 | 植入情形                                            | 期望             |
|---------------------|-------:|-----------------------------------------------------|------------------|
| 正常控制            |     16 | 成功读取、同一作用域/目录/阶段、预算未耗尽          | 16/16 不误报     |
| 压缩后未重读        |      8 | PreCompact 后沿用旧租约                             | 8/8 检出         |
| 目录切换            |      8 | 旧目录凭证用于新目录                                | 8/8 检出         |
| 未读取就写          |      8 | 无成功 Read 却写受保护路径                          | 8/8 检出         |
| 子 Agent / 阶段切换 |      8 | 4 个子 Agent 新作用域 + 4 个 phase 变化后沿用旧租约 | 8/8 检出         |
| **总计**            | **48** | **32 错误 + 16 控制**                               | **48/48 parity** |

### 8.2 S0 硬门槛

1.  生产 TypeScript 与独立 Python Oracle 逐字段一致：48/48。
2.  32/32 植入错误检出。
3.  16/16 正常控制不误报。
4.  Hook 端到端 p95 \<10ms；从子进程启动计至决策输出和退出，包含 Node
    启动与本地状态读取。
5.  完整 48 轨迹 100 次重放，规范化语义输出只有一个 SHA-256。
6.  外部网络请求 0。
7.  Prompt/源代码持久化泄露 0。
8.  Golden Expected 手工编写；Oracle 不复用生产算法。
9.  独立审查确认 Oracle 与生产实现没有共享预期答案生成逻辑。

**性能风险：** Node 命令式 Hook 的子进程启动可能使 10ms
目标难以达到。必须测完整端到端；若不达标，S0
FAIL，不得改成只统计纯函数耗时。

### 8.3 S0 命令与产物

``` bash
npm ci
npm run typecheck
npm run test:golden
npm run test:oracle
npm run test:s0
npm run perf:hook
npm run repeat:s0 -- --runs 100
npm run s0:gate
```

产物：

``` text
artifacts/s0/
  S0_GATE.json
  S0_GATE.md
  fixture-results.json
  oracle-results.json
  perf-hook.json
  repeat-hashes.json
  privacy-scan.json
  logs/
```

Gate 必须记录 Git commit、lockfile SHA、环境、命令、退出码。

------------------------------------------------------------------------

## 9. T001–T014 任务总表与工时

| TASK_ID  | 任务                            |    工时 | 主要输出                     |
|----------|---------------------------------|--------:|------------------------------|
| T001     | 环境与 Hook 能力探测            |      4h | 环境记录、事件矩阵           |
| T002     | Guidance Rule Schema            |      5h | Schema、配置校验器           |
| T003     | Hook Adapter 与隐私净化         |      6h | 内部事件契约、sanitizer      |
| T004     | Lease 状态机                    |      6h | 确定性状态机                 |
| T005     | PreToolUse 写前门               |      6h | warn/ask/block               |
| T006     | Compact/Cwd/Subagent/Phase 失效 |      5h | 边界处理                     |
| T007     | SQLite 与隐私存储               |      5h | 事务、HMAC、删除             |
| T008     | 时间轴 UI                       |      7h | 本地 Dashboard               |
| T009     | 48 Golden + Python Oracle       |      7h | Fixtures、Oracle             |
| T010     | S0 Gate / p95 / 100 hash        |      6h | Gate 报告                    |
| T011     | CLI 安装/卸载                   |      4h | install/uninstall、用户指南  |
| T012     | 集成、E2E、离线隐私回归         |      4h | E2E 日志                     |
| T013     | 独立审查                        |      4h | Review Index、问题清单、复审 |
| T014     | 冻结与发布包                    |      3h | ZIP、Manifest、SHA           |
| **基准** |                                 | **72h** |                              |
| **缓冲** |                                 | **16h** | 修复与环境兼容               |
| **总计** |                                 | **88h** |                              |

------------------------------------------------------------------------

## 10. 风险、任务依赖与验收

| 风险                        | 级别            | 处理                           |
|-----------------------------|-----------------|--------------------------------|
| PreToolUse 放过 stale write | P0/P1           | S0 FAIL，禁止继续              |
| PreCompact 未持久化失效     | P1              | 严格模式阻止压缩或 fail closed |
| p95 ≥10ms                   | P1              | S0 FAIL，不改测量口径          |
| Oracle 与生产共享逻辑       | P1              | S0 FAIL                        |
| Prompt/源码落盘             | P1              | 隐私门 FAIL                    |
| AGENTS.md/Skill 不可观测    | P2 产品边界     | 保持 UNSEEN，不猜测            |
| Bash/外部进程写入绕过       | P2 产品边界     | README 明确不覆盖              |
| SQLite 并发冲突             | P1              | 事务/WAL/并发测试              |
| Windows 路径误判            | P1 若导致误放行 | 分隔符和大小写测试             |
| UI 小瑕疵                   | P2              | 可延期登记                     |

停止条件：

- PreToolUse 或 PreCompact 在真实 Claude Code Hook 环境无法可靠工作；
- 48 轨迹不能与独立 Oracle 达到 48/48；
- p95 不达标；
- 外部请求不为 0 或敏感内容持久化；
- 核心机制退化为 LLM 判断“是否理解”；
- 必须引入收费 API 或真人参与才能通过核心门。

------------------------------------------------------------------------

## 11. 集成、工作树与模型调度

- 每个 TASK 使用独立新会话。
- Builder 与 Reviewer 尽可能不同模型或独立会话。
- Muse 只协调、运行门禁、核验日志和归档，不写业务代码。
- 文件所有权按 §4 目录分配；不允许并发修改同一文件。
- 每个任务先在独立分支/worktree 完成，再运行验收命令，最后由集成 Agent
  合并。
- 模型工种只从 Muse
  已实测免费平台选择；本计划不虚构模型名称、额度或新账号。

交接包至少包含：

``` text
TASK_ID
PROJECT_ID=P025
SPEC_VERSION=1.0.0
BASE_COMMIT
RESULT_COMMIT
GOAL
INPUTS
OUTPUT_PATHS
OWNED_FILES
FORBIDDEN_FILES
INTERFACE_CONTRACT
ACCEPTANCE_COMMANDS
EXIT_CODES
EXPECTED_EVIDENCE
DONE_DEFINITION
FAILURE_ROLLBACK
```

------------------------------------------------------------------------

## 12. 运行与发布命令

这些是计划命令，不代表已经执行：

``` bash
npm ci
npm run typecheck
npm test
npm run test:golden
npm run test:oracle
npm run s0:gate
npm run repeat:s0 -- --runs 100
npm run build
npm run test:e2e
npm run test:offline
npm run test:privacy

guidancepulse init
guidancepulse validate
guidancepulse install --project .
guidancepulse status
guidancepulse phase set implementation
guidancepulse report --format html --open
guidancepulse privacy export

npm run release:build
npm run release:verify
sha256sum -c release/SHA256SUMS.txt
git status --short
git rev-parse HEAD
```

Windows PowerShell 命令必须在 T001 记录并实际验证；不能根据 Linux
运行推断 Windows 已通过。

------------------------------------------------------------------------

## 13. Drive 交付结构与终审证据

``` text
P025-guidancepulse/
  00_spec/
    PROJECT_BOOK.md
    PROJECT_BOOK.docx
    IMPLEMENTATION_PLAN.md
    IMPLEMENTATION_PLAN.docx
  01_source/
    source.zip
    SOURCE_MANIFEST.csv
  02_tests/
    S0_GATE.json
    S0_GATE.md
    test-logs/
    fixtures/
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
- 48/48 Oracle parity、32/32 检出、16/16 无误报；
- p95、100 次 hash、离线与隐私证据；
- UI 截图与真实演示；
- 依赖许可证；
- 源码、Manifest、ZIP、Git commit 和 SHA 一致；
- T013 独立审查 P0/P1=0。

------------------------------------------------------------------------

## 14. 当前状态与授权边界

| 项目        | 当前值                            |
|-------------|-----------------------------------|
| 方向        | P025 GuidancePulse，用户已锁定    |
| 规格版本    | v1.0.0                            |
| 规格状态    | SPECIFICATION_PENDING_USER_REVIEW |
| GO          | NOT_DECLARED                      |
| T001–T014   | NOT_STARTED                       |
| S0          | NOT_RUN                           |
| 测试        | NOT_RUN                           |
| UI          | NOT_BUILT                         |
| 源码/发布包 | NOT_CREATED                       |
| 真人参与    | 0                                 |

**本轮只交付规格文件并等待用户核对。不得启动
T001，不得把规格完成写成产品完成，不得宣布 GO。**
