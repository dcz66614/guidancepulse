# P025 GuidancePulse（指令续用闸）｜实施计划书

**PROJECT_ID:** P025  
**SLUG:** guidancepulse  
**SPEC_VERSION:** 1.0.0  
**PLAN_STATUS:** SPECIFICATION_PENDING_USER_REVIEW  
**GO_STATUS:** NOT_DECLARED  
**LICENSE:** MIT  
**参与政策:** ZERO_HUMAN_PARTICIPANTS  
**任务数:** T001–T014（14 项）  
**基准工时:** 72h  
**缓冲:** 16h  
**总预算:** 88h  
**计划日期:** 2026-11-15

> 本计划是可派发的任务合同，不是已执行记录。所有任务当前均为
> `NOT_STARTED`。用户核对并明确授权前，不得启动
> T001，不得创建代码仓库或修改 Claude Code 配置。

------------------------------------------------------------------------

## 0. 执行总则

1.  产品首版只支持 Claude Code Hooks；其他 Agent
    仅保留统一事件接口，不宣称可用。
2.  Muse 是 Owner
    代理、调度员、进度追踪员和质量门禁，不编写业务代码、不代替 Coding
    Agent 写测试或实现算法。
3.  所有编码、修复、审查、集成任务都在对应模型平台开启全新会话。每张任务卡必须带项目书、计划书、当前
    commit、接口契约和上一步 HANDOFF。
4.  构建者与独立审查者尽可能使用不同模型平台或独立会话。模型名称、额度和能力由
    Muse 现有实测清单决定，本计划不指定不存在的模型。
5.  每个任务先验收后合并。不得并发修改相同文件；必要时用 Git worktree
    隔离。
6.  S0 是硬门。S0 未 PASS，T011、T012、T014
    不得开始；不得用降低阈值或删掉失败 Fixture 的方式通过。
7.  0
    名真人参与者。所有测试轨迹、指导文件、仓库、路径和事件均为合成数据；不用真实用户
    Prompt、Transcript、源码或 API 密钥。
8.  运行时网络请求必须为 0。开发期依赖安装只能使用锁定的免费开源依赖。
9.  不得把“读取过指导”表述成“理解或遵守了指导”。不得宣称完整 Agent
    忠实度检测。
10. 规格状态为 `SPECIFICATION_PENDING_USER_REVIEW`；当前
    `GO_STATUS=NOT_DECLARED`。

------------------------------------------------------------------------

## 1. 固定技术与产品决策

| 项目          | 冻结值                                                                            |
|---------------|-----------------------------------------------------------------------------------|
| 运行时        | Node.js 24 LTS，实际补丁版本由 T001 记录                                          |
| 语言          | TypeScript 5.x，`strict: true`                                                    |
| 首版宿主      | Claude Code Hooks                                                                 |
| 核心强制 Hook | `PreToolUse`（Write/Edit）                                                        |
| 读取成功确认  | `PostToolUse`（Read 成功）                                                        |
| 压缩失效      | `PreCompact`                                                                      |
| 辅助事件      | `InstructionsLoaded`、`CwdChanged`、`SubagentStart`、`SessionStart`、`SessionEnd` |
| 本地状态      | better-sqlite3 + 单文件 SQLite，无数据库服务器                                    |
| UI            | React 19 + Vite 7，本地静态资源                                                   |
| Oracle        | Python 3.12 标准库，独立实现，仅测试使用                                          |
| 测试          | Vitest + Playwright + 48 手工 Golden Fixtures                                     |
| 许可证        | MIT                                                                               |
| 真人参与      | 0                                                                                 |
| 外部服务      | 0；无收费 API、LLM、GPU、遥测或远程数据库                                         |

### 1.1 Claude Code 版本门槛

- `onFailure: "block"` 官方 reference 标注需要 Claude Code v2.1.295
  或更高版本。
- T001 必须运行 `claude --version` 并记录实际版本。
- 低于 v2.1.295
  时，严格模式的故障关闭保证不可宣称；必须先确认可升级到符合要求的版本，或将项目标为
  `BLOCKED_ENVIRONMENT`。
- `InstructionsLoaded`、`CwdChanged` 在当前官方 reference
  中列出，但属于异步、无决策控制的观察事件；不得让它们承担写前阻断。
- `PreToolUse` 同步写前检查、`PreCompact` 压缩前失效是核心门；成功 Read
  凭证还需 `PostToolUse` 或适用的 `InstructionsLoaded` 事件确认。

### 1.2 已知宿主边界

- `InstructionsLoaded` 只覆盖官方说明的 `CLAUDE.md` 和
  `.claude/rules/*.md` 加载场景；不覆盖所有通过 Project instructions
  设置直接读取的 `AGENTS.md`。
- Skill 文件只有在显式 Read 或其他经实测确认的事件中才授予凭证；不假定
  Skill 内部加载一定可见。
- `@path` 引用可能不触发 Read 工具，不作为严格模式的成功读取证明。
- `Bash`、外部进程、IDE 直接写盘不在首版写前强制保证内。首版只承诺
  Claude Code 原生 `Write` / `Edit`。

------------------------------------------------------------------------

## 2. 阶段门槛与任务总表

| 阶段                      | 任务                      | 目标                                                                             | 退出门槛                                                                                                   |  基准工时 |
|---------------------------|---------------------------|----------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|----------:|
| S0 核心可行性与正确性硬门 | T001–T010 + T013 首次审查 | 环境探测、Schema、Hook、状态机、存储、UI、48 Fixtures、独立 Oracle、性能与确定性 | 48/48 Oracle parity；32/32 检出；16/16 无误报；p95 \<10ms；100 次 1 hash；离线与隐私通过；独立审查无 P0/P1 |       61h |
| S1 安装与卸载             | T011                      | CLI 安装、备份、幂等合并、卸载                                                   | 不覆盖其他 Hook；重复安装稳定；卸载只移除自有配置                                                          |        4h |
| S2 集成与端到端           | T012                      | Hook 生命周期、CLI、UI、数据库、离线 E2E                                         | 所有 E2E 与回归通过；0 外部请求；无 Prompt/源码落盘                                                        |        4h |
| S3 独立最终复核           | T013 最终审查             | 独立审查最终源码与 S0/S2 证据                                                    | P0/P1=0；发现项闭环；review pack 覆盖完整                                                                  | 已计入 4h |
| S4 冻结与发布包           | T014                      | 冻结 commit、源码/分发包、清单和哈希                                             | 产物与 Git commit 一致；哈希可独立重算                                                                     |        3h |
| **基准工时**              | **T001–T014**             |                                                                                  |                                                                                                            |   **72h** |
| **缓冲**                  |                           | 修复、环境兼容、复审                                                             | 不得用于降低门槛                                                                                           |   **16h** |
| **总预算**                |                           |                                                                                  |                                                                                                            |   **88h** |

工时是施工估算，不是已消耗工时。88h
是两周原型的总容量预算，不代表必须连续无人值守运行。

### 2.1 第一周日程（按用户确认的顺序）

| 日期  | 任务                | 目标交付                                            |
|-------|---------------------|-----------------------------------------------------|
| Day 1 | T001 → T002         | 环境事实、Hook 能力矩阵、规则 Schema                |
| Day 2 | T003                | Hook JSON 事件采集与隐私净化                        |
| Day 3 | T004 + T007         | Guidance Lease 状态机、SQLite 事务存储              |
| Day 4 | T005 + T006         | 写前提醒/阻止、压缩/目录/子 Agent/阶段失效          |
| Day 5 | T008                | 本地时间轴可视化                                    |
| Day 6 | T009 + T010         | 48 条合成轨迹、独立 Oracle、性能与 100 次 hash Gate |
| Day 7 | T013（S0 独立审查） | 独立复核 S0 代码、Fixtures、Oracle 和性能证据       |

第一周基准工时为 61h。T011–T014 在 S0 PASS
后进入第二周；不得因排期紧张而提前绕过 S0。

### 2.2 第二周日程

| 日期   | 任务                   | 目标交付                          |
|--------|------------------------|-----------------------------------|
| Day 8  | T011                   | 安装/卸载 CLI、配置备份和用户文档 |
| Day 9  | T012                   | 完整端到端、离线和隐私回归        |
| Day 10 | T013（最终审查）+ T014 | 独立最终审查、冻结和发布包        |

------------------------------------------------------------------------

## 3. 依赖图与集成顺序

``` mermaid
flowchart TD
  T001[T001 环境与 Hook 探测] --> T002[T002 规则 Schema]
  T002 --> T003[T003 Hook 事件适配器]
  T003 --> T004[T004 Lease 状态机]
  T003 --> T007[T007 SQLite 与隐私存储]
  T004 --> T005[T005 PreToolUse 写前门]
  T004 --> T006[T006 失效边界事件]
  T005 --> T008[T008 时间轴 UI]
  T006 --> T008
  T007 --> T008
  T004 --> T009[T009 Golden + 独立 Oracle]
  T005 --> T009
  T006 --> T009
  T007 --> T009
  T009 --> T010[T010 S0 Gate + 性能 + hash]
  T010 --> T013A[T013 S0 独立审查]
  T013A -->|PASS| T011[T011 CLI 安装/卸载]
  T011 --> T012[T012 集成与 E2E]
  T012 --> T013B[T013 最终独立审查]
  T013B -->|PASS| T014[T014 发布冻结]
```

- T008 可在核心接口冻结后开发；不得改变 S0 状态机契约。
- T009 的 Oracle
  与生产代码独立；不得共享状态转移函数或由生产代码自动生成期望答案。
- T013A 和 T013B 使用独立新会话；审查者不直接修改代码。修复由新建 FIX
  任务承担。
- T014 只冻结已经通过审查的版本。

------------------------------------------------------------------------

## 4. 工作区布局与文件归属

工作区实际绝对路径由 T001 探测，不假设 `D:` 盘、用户名或 Linux home
路径。

``` text
P025-guidancepulse/
  README.md
  LICENSE
  THIRD_PARTY_NOTICES.md
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  guidancepulse.example.yaml
  src/
    contracts/
    config/
    hooks/
    core/
    store/
    privacy/
    cli/
    report/
    ui/
  tests/
    unit/
    integration/
    e2e/
    fixtures/s0/
    golden/
    oracle/
    performance/
  scripts/
    s0-gate.ts
    verify-release.ts
  docs/
    USER_GUIDE.md
    HOW_TO_REPRODUCE.md
    ARCHITECTURE.md
  artifacts/
    s0/
    test-logs/
    screenshots/
  reviews/
    REVIEW_INDEX.md
    REVIEW_PACK_01.md
    REVIEW_PACK_02.md
  release/
    source.zip
    dist.zip
    RELEASE_MANIFEST.json
    SOURCE_MANIFEST.csv
    SHA256SUMS.txt
```

### 4.1 目录规则

- `src/core` 只包含纯确定性算法，不直接访问
  `process.stdin`、文件系统或网络。
- `src/hooks` 负责 Claude Code Hook JSON 的适配和决策输出。
- `src/privacy` 负责 HMAC 路径标识与敏感字段剔除。
- `src/store` 负责 SQLite 事务和并发。
- `src/ui` 只读取脱敏报告数据。
- `tests/oracle` 是独立 Python Oracle，不导入 TypeScript 生产代码。
- `tests/golden` 中的 Expected 由人工独立编写并审查。
- `artifacts` 中保存真实日志和测试输出，不保存 Prompt 或源代码正文。

------------------------------------------------------------------------

## 5. T001–T014 原子任务卡

### T001 — 环境与 Claude Code Hook 能力探测

**工时：** 4h  
**目标：** 确认实际 VM、Node/npm、Claude Code 和官方 Hook 功能支持情况。

- **输入：** `PROJECT_BOOK.md`、本计划 §1、Muse 当前 VM。
- **输出：**
  `docs/environment/T001_ENVIRONMENT.md`、`artifacts/test-logs/T001_probe.log`。
- **允许修改：** 仅环境探测脚本与环境记录。
- **禁止修改：** `src/core/**`、`src/hooks/**`、用户现有
  `.claude/settings*.json`。
- **操作：**
  1.  记录 OS、架构、CPU、内存、磁盘、Node、npm、浏览器。
  2.  运行 `claude --version`。
  3.  核对
      `PreToolUse`、`PostToolUse`、`PreCompact`、`SessionStart`、`SessionEnd`、`SubagentStart`、`InstructionsLoaded`、`CwdChanged`。
  4.  核对 `onFailure: "block"` 是否支持；严格模式要求 Claude Code
      \>=2.1.295。
  5.  使用合成 JSON 触发本地 Hook PoC，不调用真实模型 API。
- **验收命令：**
  ``` bash
  node --version
  npm --version
  claude --version
  node scripts/probe-hooks.mjs --synthetic
  ```
- **完成定义：** 环境事实全部有命令输出；未支持事件标记为
  `UNAVAILABLE`，不得假设可用。
- **失败回退：** 若 `PreToolUse` 或 `PreCompact` 不可用，停止
  S0，提交环境阻断报告；不得换成未验证的事件名。

### T002 — Guidance Rule Schema 与配置校验

**工时：** 5h  
**目标：** 冻结规则字段、默认值、Glob 语义和冲突决策。

- **输入：** T001 环境记录、项目书 §4/§7。
- **输出：**
  `src/config/**`、`schemas/guidance-rule-v1.schema.json`、`guidancepulse.example.yaml`。
- **允许修改：** 配置 Schema、配置解析器、配置单元测试。
- **禁止修改：** `src/hooks/**`、`src/core/lease-machine.ts`、Oracle。
- **验收命令：**
  ``` bash
  npm run test:config
  npm run typecheck
  ```
- **验收标准：** 48 个配置边界单测；重复 ID、非法 Glob、未知 mode、空
  guidance source 均明确拒绝；不静默修剪用户配置。
- **完成定义：** Schema 与项目书 §7.2 一致，示例配置可通过校验。
- **失败回退：** 保留失败输入和错误日志，建立独立
  FIX-T002，不自行改变产品语义。

### T003 — Claude Code Hook 事件适配器与隐私净化

**工时：** 6h  
**目标：** 把官方 Hook JSON 转成内部事件，不落盘原始敏感字段。

- **输入：** T001 Hook 事件样本、T002 Schema。
- **输出：**
  `src/hooks/adapter.ts`、`src/contracts/events.ts`、`src/privacy/sanitize.ts`。
- **允许修改：** Hook 输入解析、事件契约、净化器。
- **禁止修改：** Lease 状态机、SQLite Schema、UI。
- **关键规则：**
  - Read 事件只保留成功标志、指导 ID、路径 HMAC、作用域和时间。
  - Write/Edit 事件只保留目标路径 HMAC，不保留 `content`。
  - 丢弃 `tool_response`、`transcript_path`、Prompt 和环境变量。
  - 对未知事件字段不做持久化。
- **验收命令：**
  ``` bash
  npm run test:hooks-adapter
  npm run test:privacy-sanitizer
  ```
- **验收标准：** 合成输入中植入的 canary Prompt 和源码字符串在
  SQLite、日志、报告中均为 0 次出现。
- **完成定义：** 内部事件契约与项目书 §7.1 一致。
- **失败回退：** 任何敏感字段泄露均为 P1 阻断；不允许通过“隐藏 UI
  字段”代替不落盘。

### T004 — Guidance Lease 确定性状态机

**工时：** 6h  
**目标：** 实现 `UNSEEN → FRESH → EXPIRED` 和作用域隔离。

- **输入：** T002 规则模型、T003 规范化事件。
- **输出：** `src/core/lease-machine.ts`、`src/core/match-rules.ts`。
- **允许修改：** 纯状态机、路径规则匹配器、单元测试。
- **禁止修改：** Hook adapter、SQLite、UI、Oracle。
- **验收命令：**
  ``` bash
  npm run test:lease-machine
  npm run test:path-matcher
  ```
- **验收标准：**
  - 读成功签发 FRESH；
  - 未读保持 UNSEEN；
  - compact/cwd/phase/edit-budget 失效转 EXPIRED；
  - 子 Agent 作用域不继承父租约；
  - 成功 Write/Edit 扣减预算，失败不扣减；
  - 相同输入序列输出相同规范化状态。
- **完成定义：** 纯函数可由生产 Adapter 调用；没有
  I/O、时间随机数或网络依赖。
- **失败回退：** 不允许在状态机中加入 LLM
  判定或“模型似乎理解了”之类启发式。

### T005 — PreToolUse 写前提醒/询问/阻止

**工时：** 6h  
**目标：** 对 Claude Code 原生 Write/Edit 工具实施同步凭证检查。

- **输入：** T003 Adapter、T004 Lease Engine、T007 Store 接口（先用
  Mock）。
- **输出：** `src/hooks/pre-tool-use.ts`、`src/hooks/decision.ts`。
- **允许修改：** PreToolUse 决策与测试。
- **禁止修改：** SQLite Schema、UI、Oracle。
- **决策：**
  - warn：附加上下文，不改变正常权限流；
  - ask：`permissionDecision: "ask"`；
  - block：`permissionDecision: "deny"` 或 exit code 2；
  - Hook 失败：严格模式 `onFailure: "block"`。
- **验收命令：**
  ``` bash
  npm run test:pre-tool-use
  ```
- **验收标准：** 未读/过期租约不能在 block
  模式下通过；有效租约正常通过；无匹配规则不产生误报。
- **完成定义：** 只拦截 `Write` / `Edit`；不声称覆盖 Bash 或外部进程。
- **失败回退：** PreToolUse 误放行属于
  P1；停止后续集成并建立独立修复任务。

### T006 — 压缩、目录、阶段、子 Agent 失效边界

**工时：** 5h  
**目标：** 实现 PreCompact 失效和其他边界事件处理。

- **输入：** T003 事件适配器、T004 状态机。
- **输出：**
  `src/hooks/pre-compact.ts`、`src/hooks/instructions-loaded.ts`、`src/hooks/cwd-changed.ts`、`src/hooks/subagent-start.ts`、`src/cli/phase.ts`。
- **允许修改：** 失效事件处理与阶段命令。
- **禁止修改：** PreToolUse 决策语义、Store Schema。
- **验收标准：**
  - PreCompact 原子使当前作用域租约 EXPIRED；
  - 若失效状态无法持久化，严格模式阻止压缩；
  - CwdChanged 只作为异步观察，PreToolUse 还需同步比较当前 cwd；
  - SubagentStart 建立新的 UNSEEN 作用域；
  - `guidancepulse phase set <phase>` 使当前作用域旧租约失效；
  - InstructionsLoaded 不承担阻断。
- **验收命令：**
  ``` bash
  npm run test:invalidation-boundaries
  npm run test:phase-cli
  ```
- **完成定义：** 四类边界事件在独立 Fixture 中有可复现状态变化。
- **失败回退：** 如果异步事件存在竞态，强制检查必须回到同步
  PreToolUse，不允许以等待异步事件完成作为前置条件。

### T007 — SQLite 本地存储、并发与隐私删除

**工时：** 5h  
**目标：** 建立单文件嵌入式 SQLite，安全处理多个 Hook 子进程并发。

- **输入：** T003 事件契约、T004 状态模型。
- **输出：**
  `src/store/**`、`src/privacy/path-id.ts`、`src/privacy/retention.ts`。
- **允许修改：** SQLite Schema、事务、路径 HMAC、隐私 CLI 接口。
- **禁止修改：** Hook 事件名称和状态机语义。
- **验收标准：**
  - 事务原子写入；WAL；并发 Hook 不丢事件；
  - 不保存绝对路径、Prompt、Transcript、源代码；
  - 路径 HMAC 使用本地随机密钥；
  - 删除密钥和数据库后无法恢复原路径映射；
  - 任何错误只记录错误码，不记录原始 Hook JSON。
- **验收命令：**
  ``` bash
  npm run test:store
  npm run test:privacy
  npm run test:concurrency
  ```
- **完成定义：** 多进程并发测试通过，数据字段符合项目书 §7.4。
- **失败回退：** SQLite 锁冲突若无法在预算内解决，禁止退回无锁 JSON
  覆盖写；建立独立 FIX-T007。

### T008 — 本地事件时间轴 UI

**工时：** 7h  
**目标：** 展示指导读取、租约状态、失效边界和写前决策。

- **输入：** Store 查询接口、项目书 §8。
- **输出：** `src/ui/**`、`src/report/**`。
- **允许修改：** React 页面、CSS、静态 HTML/JSON 报告。
- **禁止修改：** Lease Engine、Hook adapter、SQLite Schema。
- **验收标准：**
  - 显示 session/agent/phase；
  - 显示指导 ID、UNSEEN/FRESH/EXPIRED、剩余编辑数；
  - 时间轴能显示 Read、Compact、Cwd、Phase、Subagent、Write decision；
  - 不展示 Prompt、源代码、绝对路径；
  - UI 无 CDN、远程字体或外部网络。
- **验收命令：**
  ``` bash
  npm run test:ui
  npm run build
  npm run test:ui-offline
  ```
- **完成定义：** 提供本地浏览器演示截图和录屏或可复现演示步骤。
- **失败回退：** 只允许删减非核心动画，不得删掉事件原因和状态文字。

### T009 — 48 条 Golden Fixtures 与独立 Python Oracle

**工时：** 7h  
**目标：** 构建 S0 的 48 条合成轨迹、手工 Golden Expected 和独立
Oracle。

- **输入：** 项目书 §10、T004–T007 接口契约。
- **输出：**
  `tests/fixtures/s0/**`、`tests/golden/**`、`tests/oracle/reference_oracle.py`。
- **允许修改：** Fixture、Golden Expected、独立 Oracle。
- **禁止修改：** 生产 `src/core/**`、`src/hooks/**`。
- **Fixture 分组：**
  - 16 正常控制；
  - 8 compact 未重读；
  - 8 cwd 变化后沿用旧租约；
  - 8 未读取指导就写；
  - 8 子 Agent / phase 变化后沿用旧租约。
- **验收标准：**
  - Golden Expected 手工独立编写；
  - Oracle 使用 Python 标准库，独立实现状态转移；
  - Oracle 不导入 TypeScript 代码、不运行生产 CLI；
  - 48 条均有唯一 fixture ID、输入事件序列和期望输出。
- **验收命令：**
  ``` bash
  python tests/oracle/reference_oracle.py --verify-golden
  npm run test:golden
  ```
- **完成定义：** Oracle 自身测试通过，48 个 Golden Expected
  经第二个独立会话复核。
- **失败回退：** Golden
  与生产结果不一致时先判失败，不得自动用生产结果覆盖 Golden。

### T010 — S0 Gate、性能、100 次确定性重放

**工时：** 6h  
**目标：** 生成可独立复核的 S0 Gate 报告。

- **输入：** T009 Fixtures/Oracle、T005/T006/T007 生产代码。
- **输出：** `scripts/s0-gate.ts`、`artifacts/s0/**`。
- **允许修改：** Gate 编排、性能计时器、报告生成器。
- **禁止修改：** 生产状态机语义、Golden Expected。
- **验收命令：**
  ``` bash
  npm run s0:gate
  npm run repeat:s0 -- --runs 100
  ```
- **硬门槛：**
  - 生产/Oracle parity 48/48；
  - 32/32 植入错误检出；
  - 16/16 控制不误报；
  - Hook 端到端 p95 \<10ms，包含 Node 子进程启动；
  - 100 次完整重放只有一个规范化 SHA-256；
  - 网络请求 0；
  - Prompt/源码持久化泄露 0。
- **完成定义：** `S0_GATE.json` 可由独立命令复算，所有命令退出码为 0。
- **失败回退：** 任一硬门失败，`S0=FAIL`，T011/T012/T014
  BLOCKED；不得降低阈值。

### T011 — CLI 安装、卸载和用户操作

**工时：** 4h  
**前置：** S0 PASS  
**目标：** 提供可安全安装与卸载的用户入口。

- **输入：** S0 PASS 代码、Hook 配置 Schema。
- **输出：**
  `src/cli/install.ts`、`src/cli/uninstall.ts`、`README.md`、`docs/USER_GUIDE.md`。
- **验收命令：**
  ``` bash
  guidancepulse init
  guidancepulse install --project .
  guidancepulse status
  guidancepulse uninstall --project .
  npm run test:installer
  ```
- **验收标准：** 安装幂等；先备份
  `.claude/settings.local.json`；只合并自有
  Hook；卸载只移除自有条目；不覆盖用户原有 Hook。
- **失败回退：** 恢复安装前备份，保留失败日志；不得覆盖用户配置。

### T012 — 集成、E2E、离线与隐私回归

**工时：** 4h  
**前置：** S0 PASS、T011 PASS  
**目标：** 验证完整用户路径和本地运行。

- **输入：** T011 安装器、Hook Adapter、UI、SQLite。
- **输出：**
  `tests/integration/**`、`tests/e2e/**`、`artifacts/test-logs/T012_*`。
- **验收命令：**
  ``` bash
  npm test
  npm run test:e2e
  npm run test:offline
  npm run test:privacy
  npm run typecheck
  npm run build
  ```
- **验收标准：** 安装→Read→FRESH→Write allow→PreCompact→EXPIRED→Write
  deny→Read→FRESH 全链路通过；无外部请求；隐私扫描无敏感字段。
- **失败回退：** 保留日志与 Fixture，建立 FIX-T012；不覆盖 S0 原始证据。

### T013 — 独立代码与证据审查

**工时：** 4h  
**前置：** S0 核心代码完成；最终审查还需 T012 PASS  
**目标：** 独立审查核心实现、Golden、Oracle、隐私、Hook 语义和发布材料。

- **输入：** 当前 commit、项目书、计划书、全部接口契约、S0
  Gate、测试日志。
- **输出：**
  `reviews/T013_REVIEW.md`、`reviews/REVIEW_INDEX.md`、`reviews/REVIEW_PACK_XX.md`。
- **审查者：** 与实现作者不同模型或独立新会话；Muse 不代写审查结论。
- **禁止修改：** 所有生产源码与 Golden；审查者只提交问题和证据。
- **验收标准：**
  - 通读所有核心 `src/core`、`src/hooks`、`src/store`、隐私模块；
  - 独立复核 48 Fixtures 和 Oracle 独立性；
  - 复算 S0 hash 与 p95 口径；
  - 检查 `onFailure:block`、PreCompact、异步事件竞态、Bash 绕过边界；
  - P0/P1=0。
- **失败回退：** 每个问题创建独立
  FIX-T013-XX；修复后新会话复审；不覆盖原始报告。

### T014 — 发布冻结与哈希归档

**工时：** 3h  
**前置：** T011、T012、T013 最终审查 PASS  
**目标：** 冻结源码和分发包，形成可复核交付。

- **输入：** 最终 commit、审查 PASS、测试日志、UI 证据。
- **输出：**
  `release/source.zip`、`release/dist.zip`、`RELEASE_MANIFEST.json`、`SOURCE_MANIFEST.csv`、`SHA256SUMS.txt`、`T014_FREEZE_REPORT.md`。
- **验收命令：**
  ``` bash
  npm run release:build
  npm run release:verify
  sha256sum -c release/SHA256SUMS.txt
  git status --short
  git rev-parse HEAD
  ```
- **验收标准：** 工作树干净；冻结 commit 与 manifest 一致；ZIP
  解压后文件清单一致；SHA256 可独立重算；S0 Gate hash 不变。
- **失败回退：** 不覆盖旧冻结包；新建 freeze revision 并保留历史版本。

------------------------------------------------------------------------

## 6. 接口契约与 Hook 配置

### 6.1 Hook 配置目标形态

以下是结构示例，最终由 `guidancepulse install` 根据 T001 验证的 Claude
Code 版本生成。不得直接覆盖用户现有配置。

``` json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-tool-use.js"],
            "onFailure": "block",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/post-tool-use.js"],
            "timeout": 10
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-compact.js"],
            "onFailure": "block",
            "timeout": 10
          }
        ]
      }
    ],
    "InstructionsLoaded": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/instructions-loaded.js"],
            "async": true
          }
        ]
      }
    ],
    "CwdChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/cwd-changed.js"],
            "async": true
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/subagent-start.js"]
          }
        ]
      }
    ]
  }
}
```

注意：

- 这是目标结构，不是已验证配置。
- `InstructionsLoaded` / `CwdChanged` 是异步观察事件，不能作写前拦截。
- `PreToolUse` 仅匹配 Write/Edit。
- 生产 Hook 超时需根据实际环境测量；上例 timeout 是配置示意，不是 p95
  证据。
- 若安装版本不支持 `onFailure`，严格模式不可启用。

### 6.2 CLI 命令契约

| 命令                                          | 行为                        | 网络 |
|-----------------------------------------------|-----------------------------|------|
| `guidancepulse init`                          | 初始化本地配置与 SQLite     | 0    |
| `guidancepulse validate`                      | 校验配置 Schema 与路径规则  | 0    |
| `guidancepulse install --project .`           | 备份并合并 Claude Code Hook | 0    |
| `guidancepulse uninstall --project .`         | 只移除自身 Hook             | 0    |
| `guidancepulse status`                        | 查看会话与租约状态          | 0    |
| `guidancepulse phase set <id>`                | 标记阶段并使旧租约失效      | 0    |
| `guidancepulse report --format html --open`   | 打开本地时间轴              | 0    |
| `guidancepulse privacy export`                | 导出脱敏记录                | 0    |
| `guidancepulse privacy delete --session <id>` | 删除会话记录                | 0    |
| `guidancepulse privacy delete --all`          | 删除所有记录与路径密钥      | 0    |

------------------------------------------------------------------------

## 7. 测试与独立审查策略

### 7.1 测试层次

1.  **Unit：** 状态机、Glob、路径规范化、编辑预算、决策聚合。
2.  **Contract：** Claude Code Hook JSON 输入/输出、官方事件字段样本。
3.  **Golden：** 48 条手工 Fixture 对照。
4.  **Independent Oracle：** Python 参考实现与生产 TypeScript 对照。
5.  **Mutation：** 注入 stale lease、错 scope、忽略 compact、忽略
    cwd、编辑预算不扣减等错误，确认检测。
6.  **Performance：** Hook 进程端到端 p95，包含 Node 启动。
7.  **Determinism：** 完整 S0 100 次重放、一个 canonical SHA。
8.  **Privacy/Offline：** 网络请求 0；敏感 Canary 不落盘。
9.  **E2E：** 安装、读取、写前检查、压缩、失效、重新读取、恢复写入。
10. **Release：** ZIP、Manifest、SHA、Git commit 一致。

### 7.2 S0 Fixture 目录

``` text
tests/fixtures/s0/
  control/
    C01.json ... C16.json
  compact/
    K01.json ... K08.json
  cwd/
    W01.json ... W08.json
  unread/
    U01.json ... U08.json
  scope/
    S01.json ... S08.json

tests/golden/
  expected-v1.json

tests/oracle/
  reference_oracle.py
```

每条 Fixture 包含固定 session/agent scope、固定 logical
timestamp、事件序列、期望租约状态和期望 Hook 决策。路径 HMAC
使用固定测试密钥；不使用随机 UUID 或当前系统时间进入 canonical hash。

### 7.3 100 次哈希规则

- 每次运行完整 48 条轨迹。
- 排除真实墙钟耗时、随机临时目录和运行机器路径。
- 保留事件顺序、状态变化、指导 ID、路径 Fixture ID、决策与失效原因。
- 将规范化 JSON 按键排序、UTF-8 编码、LF 换行后计算 SHA-256。
- 100 次结果必须恰好只有一个唯一 SHA。
- 性能数据单独记录，不进入 canonical semantic hash。

### 7.4 性能测量规则

`PreToolUse` p95 从 Claude Code 启动 Hook 子进程开始，到 Hook
输出决策并退出结束，包含 Node 进程启动、JSON 解析、SQLite
读取、路径匹配和决策输出。不得只测纯状态机函数。

使用固定 VM 环境和预热/冷启动分层报告；正式 S0 门使用完整端到端样本。若
p95 ≥10ms，S0 FAIL。可以优化，但不能更改指标口径。

### 7.5 独立 Oracle 规则

- Python Oracle 不导入生产 TypeScript，也不调用生产 CLI。
- 48 个 Golden Expected 不得由生产程序生成。
- Oracle 必须独立实现状态转移、边界失效、编辑预算和决策优先级。
- 第二个独立会话复核 Oracle 的算法和 Golden Expected。
- 生产结果与 Oracle 任一字段不一致即失败；不得配置 ignore 字段。

------------------------------------------------------------------------

## 8. 模型工种分配建议

Muse
根据自己已测试可用的免费模型清单分配，不在本计划中虚构模型名称或额度。

| 工种                | 任务      | 必要能力                            | 独立性要求                     |
|---------------------|-----------|-------------------------------------|--------------------------------|
| 技术探测            | T001      | 终端执行、版本探测、日志归档        | Muse 复核真实命令输出          |
| TypeScript 核心实现 | T002–T006 | Node/TS、Hooks、状态机、路径匹配    | 每个 TASK 新会话               |
| 存储与隐私          | T007      | SQLite、事务、HMAC、隐私测试        | 与核心实现尽可能不同模型       |
| UI                  | T008      | React、Vite、时间轴可视化           | 独立文件归属                   |
| 测试与 Oracle       | T009–T010 | Python、确定性测试、性能测量        | Oracle 作者不写生产状态机      |
| CLI / 集成          | T011–T012 | Node CLI、Claude settings 合并、E2E | 使用已 PASS 分支和接口契约     |
| 独立审查            | T013      | 安全、并发、测试和证据审查          | 不同模型或独立新会话；只提问题 |
| 发布                | T014      | ZIP、Manifest、SHA、Git             | 集成者执行，Muse 独立核验      |

------------------------------------------------------------------------

## 9. 任务交接格式与 Git 规则

每张任务卡必须附：

``` text
TASK_ID:
PROJECT_ID: P025
SPEC_VERSION: 1.0.0
BASE_COMMIT:
GO_STATUS:
GOAL:
INPUTS:
OUTPUT_PATHS:
OWNED_FILES:
FORBIDDEN_FILES:
INTERFACE_CONTRACT:
ACCEPTANCE_COMMANDS:
EXPECTED_EVIDENCE:
DONE_DEFINITION:
FAILURE_ROLLBACK:
```

任务完成后提交：

``` text
HANDOFF_<TASK_ID>.md
  task_id
  base_commit
  result_commit
  changed_files
  commands
  exit_codes
  test_summary
  log_paths
  sha256
  known_limits
  next_task
```

Git 规则：

- 每个任务在独立 worktree 或分支中完成。
- 不允许两个 Agent 同时修改同一文件。
- 先运行验收命令，再合并。
- 失败保留日志和分支；修复任务新建 `FIX-<TASK_ID>-NN`。
- 任何 S0 代码变化都必须重新运行完整 S0 Gate。
- T014 冻结后任何变更都必须生成新 commit、新 ZIP、新 Manifest、新
  SHA，并重新审查。

------------------------------------------------------------------------

## 10. 风险分级

| 风险                            | 级别                  | 门禁动作                               |
|---------------------------------|-----------------------|----------------------------------------|
| PreToolUse 未能阻止 stale write | P0/P1                 | S0 FAIL，禁止进入 S1                   |
| PreCompact 失效状态未持久化     | P1                    | 严格模式必须阻止压缩或明确 fail closed |
| Node Hook p95 ≥10ms             | P1                    | S0 FAIL，不允许换统计口径              |
| Oracle 与生产共享代码/期望答案  | P1                    | Oracle 独立性不成立，S0 FAIL           |
| Prompt/源代码写入日志或 SQLite  | P1                    | 隐私门 FAIL，修复后重跑全套            |
| `AGENTS.md` / Skill 不可观测    | P2（产品边界）        | 严格模式保持 UNSEEN；文档明确限制      |
| Bash/外部进程写入绕过           | P2（产品边界）        | README 明确不覆盖，不宣传全路径保证    |
| Windows 路径问题                | P2，若导致误放行则 P1 | 规范化测试；实际支持平台如实声明       |
| UI 小幅布局问题                 | P2                    | 不影响核心验收可登记非阻断             |

------------------------------------------------------------------------

## 11. 工作区运行与验收命令

以下命令是计划目标；只有在源码真实创建后才可执行，不代表当前已运行。

``` bash
# 安装锁定依赖
npm ci

# 类型和单元测试
npm run typecheck
npm test

# S0 核心门
npm run test:golden
npm run test:oracle
npm run s0:gate
npm run repeat:s0 -- --runs 100

# UI 与端到端
npm run build
npm run test:e2e
npm run test:offline
npm run test:privacy

# 本地产品体验
guidancepulse init
guidancepulse validate
guidancepulse install --project .
guidancepulse status
guidancepulse phase set implementation
guidancepulse report --format html --open

# 发布冻结
npm run release:build
npm run release:verify
sha256sum -c release/SHA256SUMS.txt
git status --short
git rev-parse HEAD
```

Windows PowerShell 对应命令必须在 T001 记录，不允许只凭 Linux 命令推断
Windows 已通过。

------------------------------------------------------------------------

## 12. 文件交付与 REVIEW_PACK

### 12.1 Drive 目录建议

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
    source/
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

### 12.2 REVIEW_INDEX.md 最少字段

``` text
file_path
file_sha256
file_size_bytes
source_commit
review_pack
review_status
```

### 12.3 REVIEW_PACK 原则

- 每个 Pack 只包含有限数量的源码/配置文本。
- 每个文件带相对路径、SHA-256、字节数和冻结 commit。
- 不只提供 ZIP；必须有可读的源码文本审查包。
- 终审需要逐文件核对覆盖范围，并检查审查包内容与 source.zip 一致。
- 测试日志必须记录实际命令、退出码、环境、commit 和 Gate hash。

------------------------------------------------------------------------

## 13. 发布清单

T014 只有在以下项目全部满足时才能标记 PASS：

- [ ] S0 Gate 全部硬指标通过。
- [ ] 48/48 Golden parity，32/32 检出，16/16 无误报。
- [ ] Hook p95 \<10ms，完整 100 次 hash 重放为 1 个 SHA。
- [ ] 外部请求 0；Prompt/源代码持久化 0。
- [ ] npm test、typecheck、build、E2E、offline、privacy 均真实运行通过。
- [ ] 安装器备份并保留用户现有 Hook；卸载只删除自有 Hook。
- [ ] UI 截图/演示可复现。
- [ ] MIT LICENSE 与第三方许可证清单完整。
- [ ] `source.zip`、`dist.zip`、Manifest、SHA256SUMS 与冻结 commit
  一致。
- [ ] `REVIEW_INDEX.md` / `REVIEW_PACK_XX.md` 覆盖全部第一方核心文件。
- [ ] T013 独立审查 P0/P1=0。
- [ ] Muse 将所有规格、源码、测试日志、审查包、发布包和演示证据上传
  Drive 并回读核对。

------------------------------------------------------------------------

## 14. 当前状态与授权边界

| 项目              | 当前值                            |
|-------------------|-----------------------------------|
| 方向              | P025 GuidancePulse，已由用户锁定  |
| 规格版本          | v1.0.0                            |
| 规格状态          | SPECIFICATION_PENDING_USER_REVIEW |
| GO                | NOT_DECLARED                      |
| T001–T014         | 全部 NOT_STARTED                  |
| S0                | NOT_RUN                           |
| 测试              | NOT_RUN                           |
| UI                | NOT_BUILT                         |
| Drive 源码/发布包 | NOT_CREATED                       |
| 真人参与          | 0                                 |

**本轮结束条件：** 两份 Markdown 与对应 Word 文件上传到 P025 Drive
文件夹，返回真实链接、文件大小和 SHA-256，然后等待用户核对。不得启动
T001、不得运行开发任务、不得更新项目为
GO/IN_PROGRESS。用户确认规格后，才可由 Muse 按本计划启动施工。
