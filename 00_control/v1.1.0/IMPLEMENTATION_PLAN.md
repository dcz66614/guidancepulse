# P025 GuidancePulse（指令续用闸）｜实施计划书

**PROJECT_ID:** P025  
**PROJECT_SLUG:** guidancepulse  
**SPEC_VERSION:** 1.1.0  
**SUPERSEDES:** 1.0.0  
**PLAN_STATUS:** S0_REVALIDATION_REQUIRED  
**LICENSE:** MIT  
**HUMAN_PARTICIPANTS:** 0  
**TASKS:** T001–T014  
**BASELINE_EFFORT:** 72h  
**BUFFER:** 16h  
**TOTAL_BUDGET:** 88h  
**DATE:** 2026-11-15

> 本计划是 v1.1.0 的施工任务合同。v1.0.0 S0 已
> FAIL，不能直接把旧报告改判 PASS。当前仅按 v1.1.0 修订并重新执行 S0；S0
> 新版全部硬门 PASS 之前，T011、T012、T014 继续 BLOCKED。

------------------------------------------------------------------------

## 0. 版本修订记录

| 版本       | 变更                                                                                                                                                                                                                                                 | 原因                                                         |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------|
| v1.0.0     | 14 项任务、72h 基准 + 16h 缓冲、S0 七项硬门、Node/TypeScript Hook 架构                                                                                                                                                                               | 初始实施基线                                                 |
| **v1.1.0** | 保持 Node 子进程架构和 88h 预算；p95 阈值调整为 `<500ms`；计时 100 个全新 Node 子进程样本并包含冷启动，只有 5 次预热不计入；T004/T009/T010 强制逐步租约快照与四种检出依据；更新 T003/T005/T013 性能与审查合同；统一 `python3` 命令；修正内部章节引用 | v1.0.0 实测证明 `<10ms` 不可达；只看终态无法验证 W05/S06/W07 |

## 1. 执行总则与当前状态

1.  首版只支持 Claude Code Hooks；其他 Agent
    只预留统一事件接口，不宣称可用。
2.  Muse 是 Owner
    代理、调度员、进度追踪员和质量门禁，不编写业务代码、不代替 Coding
    Agent 写测试或实现算法。
3.  所有编码、修复、审查、集成任务都在对应模型平台开启全新会话。每张任务卡必须带项目书、计划书、当前
    commit、接口契约和上一步 HANDOFF。
4.  构建者与独立审查者尽可能使用不同模型平台或独立会话。模型名称、额度和能力由
    Muse 现有实测清单决定，本计划不指定未经验证的模型。
5.  每个任务先验收后合并。不得并发修改相同文件；必要时用 Git worktree
    隔离。
6.  S0 是硬门。S0 未 PASS，T011、T012、T014 不得开始；不得用降低阈值、删
    Fixture 或改生产语义的方式通过。
7.  0
    名真人参与者。所有轨迹、指导文件、仓库、路径和事件均为合成数据；不用真实用户
    Prompt、Transcript、源码或 API 密钥。
8.  运行时网络请求必须为 0。开发期依赖安装只能使用锁定的免费开源依赖。
9.  不得把“读取过指导”表述成“理解或遵守了指导”。不得宣称完整 Agent
    忠实度检测。
10. 不新增 daemon，不切换 Rust/Go/Bun，不把 Node 启动从 p95 样本中剔除。
11. Oracle 命令统一使用 `python3`；不得在任务卡、脚本、README
    和验收命令中混用 `python` 与 `python3` 命令名。
12. v1.0.0 S0 的历史结论保持 FAIL；v1.1.0 必须生成新 S0 报告、新日志和新
    Gate hash。

### 1.1 当前门禁状态

| 项目                     | 状态                                           |
|--------------------------|------------------------------------------------|
| v1.0.0 S0                | **FAIL**，唯一失败为旧 p95 `<10ms`             |
| v1.0.0 其他六项          | PASS                                           |
| v1.1.0 S0                | NOT_RUN，必须重跑                              |
| T001–T010 既有实现       | 已有代码与测试证据；按 v1.1.0 重新验证相关任务 |
| T003/T004/T005/T009/T010 | 需按 v1.1.0 核对/更新并重新验收                |
| T013 S0 审查             | 新版 S0 完成后执行                             |
| T011                     | BLOCKED，等待 v1.1.0 S0 PASS                   |
| T012                     | BLOCKED，等待 T011 PASS                        |
| T014                     | BLOCKED，等待 T012 与 T013 最终 PASS           |
| 当前授权范围             | 仅按 v1.1.0 修订并重跑 S0；不代表下游阶段获准  |

### 1.2 v1.0.0 失败证据摘要

附件 `S0_GATE.json` 记录：

- 生成时间：`2026-11-15T14:31:26.790Z`。
- commit：`3bdc46a143b038fe52413e4f52024cd3fe817330`。
- Node `v24.22.1`、npm `10.9.4`、Python `3.12.3`、Linux x64。
- 生产/Golden、Oracle/生产、Oracle/Golden 三向均 48/48。
- 植入错误 32/32；控制无误报 16/16。
- 旧 Hook p95 194.00ms（n=100），旧阈值 `<10ms`，FAIL。
- 100 次重放唯一 SHA；网络调用点 0；11 个落盘文件 canary 命中 0。
- typecheck 通过；Golden 53/53；全量测试 359/359。
- `fixture-results.json` 的 detection basis 计数为 28 + 1 + 2 + 1 = 32。

------------------------------------------------------------------------

## 2. 固定技术与架构决策

| 项目          | 冻结值                                                                            |
|---------------|-----------------------------------------------------------------------------------|
| 运行时        | Node.js 24 LTS                                                                    |
| 语言          | TypeScript 5.x，`strict: true`                                                    |
| 首版宿主      | Claude Code Hooks                                                                 |
| Hook 进程模型 | 每次 Hook 调用启动全新 Node.js 子进程                                             |
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
| p95 门槛      | `<500ms`，包含每次全新 Node 子进程的全部成本                                      |

### 2.1 为什么选阈值修订，不换架构

选择方案 (c)：Node.js/TypeScript 不变，将完整 Hook 端到端 p95 从 `<10ms`
调整为 `<500ms`。

- 裸 Node 启动在当前 VM 实测约 79–98ms；进程内逻辑小于 0.4ms/事件。
- 完整 Hook p95 三轮实测约 220.22ms / 191.13ms /
  194.00ms；另有冷启动最高 462ms 的实测记录。
- 250ms 无法覆盖已报告的 462ms 冷启动。
- daemon
  会新增生命周期、健康检查、崩溃恢复、IPC、并发、跨平台清理等关键路径。
- Rust/Go 会引入运行时和构建架构迁移，超过当前 MVP 的必要范围。
- 500ms 是覆盖已观测最高冷启动值并保留余量的写前检查预算；只在受保护文件
  Write/Edit 前执行，通常 Agent 工具操作以秒级计，但必须披露真实
  p50/p95/p99，不宣称无感。

**明确禁止：** 不得新增 daemon；不得换
Rust/Go/Bun；不得只测函数耗时；不得把冷启动从 100 个计时样本中排除。

### 2.2 Claude Code 版本门槛

- `onFailure: "block"` 官方 reference 标注需要 Claude Code v2.1.295
  或更高版本。
- T001 必须运行 `claude --version` 并记录实际版本。
- 低于 v2.1.295
  时，严格模式故障关闭保证不可宣称；先确认环境可升级，否则标记
  `BLOCKED_ENVIRONMENT`。
- `InstructionsLoaded`、`CwdChanged` 是官方 reference
  中存在的异步观察事件，不具备决策控制。
- `PreToolUse` 同步写前检查、`PreCompact` 压缩前失效是核心强制门；成功
  Read 凭证由 `PostToolUse` 或适用的 `InstructionsLoaded` 观测确认。

------------------------------------------------------------------------

## 3. 阶段门槛与任务总表

| 阶段                    | 任务                     | 目标                                                                     | 退出门槛                                                                                                           |  基准工时 |
|-------------------------|--------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|----------:|
| S0 核心正确性与性能硬门 | T001–T010 + T013 S0 审查 | 环境、Schema、Hook、状态机、存储、UI、48 Fixtures、Oracle、完整 Hook p95 | 48/48 三向一致；32/32 按四依据检出；16/16 控制无误报；p95 \<500ms；100 次 1 hash；离线与隐私通过；独立审查无 P0/P1 |       61h |
| S1 安装与卸载           | T011                     | CLI 安装、备份、幂等合并、卸载                                           | 不覆盖其他 Hook；重复安装稳定；卸载只移除自有配置                                                                  |        4h |
| S2 集成与端到端         | T012                     | Hook 生命周期、CLI、UI、数据库、离线 E2E                                 | 所有 E2E 与回归通过；0 外部请求；无 Prompt/源码落盘                                                                |        4h |
| S3 独立最终复核         | T013 最终审查            | 独立审查最终源码与 S0/S2 证据                                            | P0/P1=0；发现项闭环；review pack 覆盖完整                                                                          | 已计入 4h |
| S4 冻结与发布包         | T014                     | 冻结 commit、源码/分发包、清单和哈希                                     | 产物与 Git commit 一致；哈希可独立重算                                                                             |        3h |
| **基准工时**            | **T001–T014**            |                                                                          |                                                                                                                    |   **72h** |
| **缓冲**                |                          | 修复、环境兼容、S0 v1.1 重跑                                             | 不得用于降低门槛                                                                                                   |   **16h** |
| **总预算**              |                          |                                                                          |                                                                                                                    |   **88h** |

架构未改变，因此总工时仍为 88h。v1.1.0 的 T010 计时/检出门修订和 T013
复核使用现有 16h 缓冲，不新增架构迁移工时。

### 3.1 第一周日程

| 日期  | 任务         | 目标交付                                                    |
|-------|--------------|-------------------------------------------------------------|
| Day 1 | T001 → T002  | 环境事实、Hook 能力矩阵、规则 Schema                        |
| Day 2 | T003         | Hook JSON 事件采集与隐私净化                                |
| Day 3 | T004 + T007  | Guidance Lease 状态机、逐步快照、SQLite 事务存储            |
| Day 4 | T005 + T006  | 写前提醒/阻止、压缩/目录/子 Agent/阶段失效                  |
| Day 5 | T008         | 本地时间轴可视化                                            |
| Day 6 | T009 + T010  | 48 条轨迹、独立 Oracle、四依据检测、性能与 100 次 hash Gate |
| Day 7 | T013 S0 审查 | 独立复核 S0 代码、Fixtures、Oracle、检测依据与性能证据      |

### 3.2 第二周日程（S0 PASS 后）

| 日期   | 任务                 | 目标交付                          |
|--------|----------------------|-----------------------------------|
| Day 8  | T011                 | 安装/卸载 CLI、配置备份和用户文档 |
| Day 9  | T012                 | 完整端到端、离线和隐私回归        |
| Day 10 | T013 最终审查 + T014 | 独立最终审查、冻结和发布包        |

------------------------------------------------------------------------

## 4. 依赖图与集成顺序

``` mermaid
flowchart TD
  T001[T001 环境与 Hook 探测] --> T002[T002 规则 Schema]
  T002 --> T003[T003 Hook 事件适配器]
  T003 --> T004[T004 Lease 状态机与逐步快照]
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
  T009 --> T010[T010 S0 Gate + 四依据 + p95]
  T010 --> T013A[T013 S0 独立审查]
  T013A -->|PASS| T011[T011 CLI 安装/卸载]
  T011 --> T012[T012 集成与 E2E]
  T012 --> T013B[T013 最终独立审查]
  T013B -->|PASS| T014[T014 发布冻结]
```

- T008 可在核心接口冻结后开发；不得改变 S0 状态机契约。
- T009 的 Oracle
  与生产代码独立；不得共享状态转移函数或由生产代码自动生成期望答案。
- T010 的 `summarizeReplay` 必须执行 §8 的四种检测依据及优先级。
- T013A 和 T013B 使用独立新会话；审查者不直接修改代码。
- T014 只冻结已经通过审查的版本。

------------------------------------------------------------------------

## 5. 工作区布局与文件归属

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
    s0-replay.ts
    s0-gate.ts
    verify-release.ts
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

### 5.1 目录规则

- `src/core` 只包含纯确定性算法，不直接访问
  `process.stdin`、文件系统或网络。
- `src/hooks` 负责 Claude Code Hook JSON 的适配和决策输出。
- `src/privacy` 负责 HMAC 路径标识与敏感字段剔除。
- `src/store` 负责 SQLite 事务和并发。
- `src/ui` 只读取脱敏报告数据。
- `tests/oracle` 是独立 Python Oracle，不导入 TypeScript 生产代码。
- `tests/golden` 中的 Expected 由独立审查者手工核对。
- `artifacts` 中保存真实日志和测试输出，不保存 Prompt 或源代码正文。
- S0 replay 的每步快照必须进入结果结构与 canonical replay hash。

------------------------------------------------------------------------

## 6. T001–T014 原子任务卡

每张任务卡都必须在对应模型平台开启全新会话，并携带项目书、计划书、当前
commit、接口契约和 HANDOFF。

### T001 — 环境与 Claude Code Hook 能力探测

**工时：** 4h  
**目标：** 确认实际 VM、Node/npm、Claude Code 和官方 Hook 功能支持情况。

- **输入：** `PROJECT_BOOK.md`、本计划 §2、Muse 当前 VM。
- **输出：**
  `docs/environment/T001_ENVIRONMENT.md`、`artifacts/test-logs/T001_probe.log`。
- **允许修改：** 环境探测脚本与环境记录。
- **禁止修改：** `src/core/**`、`src/hooks/**`、用户现有
  `.claude/settings*.json`。
- **操作：**
  1.  记录 OS、架构、CPU、内存、磁盘、Node、npm、浏览器。
  2.  运行
      `node --version`、`npm --version`、`claude --version`、`python3 --version`。
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
  python3 --version
  node scripts/probe-hooks.mjs --synthetic
  ```
- **预期证据：** 环境记录、Hook 事件能力矩阵、PoC 日志、退出码。
- **完成定义：** 环境事实全部有命令输出；未支持事件标记为
  `UNAVAILABLE`，不得假设可用。
- **失败回退：** 若 `PreToolUse` 或 `PreCompact` 不可用，停止
  S0，提交环境阻断报告；不得换成未验证事件名。

### T002 — Guidance Rule Schema 与配置校验

**工时：** 5h  
**目标：** 冻结规则字段、默认值、Glob 语义和冲突决策。

- **输入：** T001 环境记录、项目书 §5/§8。
- **输出：**
  `src/config/**`、`schemas/guidance-rule-v1.schema.json`、`guidancepulse.example.yaml`。
- **允许修改：** 配置 Schema、配置解析器、配置单元测试。
- **禁止修改：** `src/hooks/**`、`src/core/lease-machine.ts`、Oracle。
- **验收命令：**
  ``` bash
  npm run test:config
  npm run typecheck
  ```
- **验收标准：** 重复 ID、非法 Glob、未知 mode、空 guidance source
  均明确拒绝；不静默修剪用户配置。
- **预期证据：** Schema、正反例、测试日志。
- **完成定义：** Schema 与项目书 §5.2 一致，示例配置可通过校验。
- **失败回退：** 保留失败输入和错误日志，建立独立
  FIX-T002，不自行改变产品语义。

### T003 — Claude Code Hook 事件适配器与隐私净化

**工时：** 6h  
**目标：** 把官方 Hook JSON 转成内部事件，不落盘原始敏感字段；保持每次
Hook 调用独立 Node 子进程。

- **输入：** T001 Hook 事件样本、T002 Schema。
- **输出：**
  `src/hooks/adapter.ts`、`src/contracts/events.ts`、`src/privacy/sanitize.ts`。
- **允许修改：** Hook 输入解析、事件契约、净化器。
- **禁止修改：** Lease 状态转移语义、SQLite Schema、UI、性能计时口径。
- **关键规则：**
  - 每次 Hook 都由 Claude Code 启动新的 Node 子进程；不得引入 daemon
    或复用常驻进程。
  - Read 事件只保留成功标志、指导 ID、路径 HMAC、作用域和时间。
  - Write/Edit 事件只保留目标路径 HMAC，不保留 `content`。
  - 丢弃 `tool_response`、`transcript_path`、Prompt 和环境变量。
  - 对未知事件字段不做持久化。
- **验收命令：**
  ``` bash
  npm run test:hooks-adapter
  npm run test:privacy-sanitizer
  ```
- **验收标准：** 合成输入中的 canary Prompt 和源码字符串在
  SQLite、日志、报告中均为 0 次出现；Hook 进程模型与 v1.0.0 相同。
- **预期证据：** 事件契约、敏感字段扫描日志、Hook 进程模型说明。
- **完成定义：** 内部事件契约与项目书 §8.1 一致。
- **失败回退：** 任何敏感字段泄露均为 P1 阻断；不允许通过“隐藏 UI
  字段”代替不落盘。

### T004 — Guidance Lease 状态机与逐步快照

**工时：** 6h  
**目标：** 实现 `UNSEEN → FRESH → EXPIRED`，并确保 replay
在每一步保留完整租约快照。

- **输入：** T002 规则模型、T003 规范化事件。
- **输出：**
  `src/core/lease-machine.ts`、`src/core/match-rules.ts`、逐步 snapshot
  类型。
- **允许修改：** 纯状态机、路径规则匹配器、快照生成器、单元测试。
- **禁止修改：** Hook adapter、SQLite Schema、UI、Oracle、Golden
  Expected。
- **验收标准：**
  - 读成功签发 FRESH；未读保持 UNSEEN。
  - compact/cwd/phase/edit-budget 失效转 EXPIRED。
  - 子 Agent 作用域不继承父租约。
  - 成功 Write/Edit 扣减预算，失败不扣减。
  - 每个 replay step 后保存该步所有租约的
    `state`、`reason`、`last_read`、cwd、phase 和编辑预算。
  - 后续重新读取将当前租约恢复为 FRESH，但不得改写或删除之前步骤的
    EXPIRED snapshot。
  - 相同输入序列输出相同规范化状态与快照。
- **验收命令：**
  ``` bash
  npm run test:lease-machine
  npm run test:path-matcher
  npm run test:replay-snapshots
  ```
- **预期证据：** W05/S06 的中间 EXPIRED 快照、W07 全程 FRESH
  快照、状态机单测。
- **完成定义：** 纯函数可由生产 Adapter 调用；没有
  I/O、时间随机数或网络依赖。
- **失败回退：** 不允许在状态机中加入 LLM
  判定或“模型似乎理解了”之类启发式。

### T005 — PreToolUse 写前提醒/询问/阻止与完整 Hook 性能

**工时：** 6h  
**目标：** 对 Claude Code 原生 Write/Edit
工具实施同步凭证检查；验证真实子进程端到端成本。

- **输入：** T003 Adapter、T004 Lease Engine、T007 Store 接口。
- **输出：**
  `src/hooks/pre-tool-use.ts`、`src/hooks/decision.ts`、性能调用入口。
- **允许修改：** PreToolUse 决策与测试、性能调用入口。
- **禁止修改：** p95 测量口径、S0 阈值、SQLite Schema、UI、Oracle。
- **决策：**
  - warn：不改变正常权限流，附加上下文；
  - ask：`permissionDecision: "ask"`；
  - block：`permissionDecision: "deny"` 或 exit code 2；
  - Hook 失败：严格模式 `onFailure: "block"`。
- **验收命令：**
  ``` bash
  npm run test:pre-tool-use
  npm run perf:hook
  ```
- **验收标准：** 未读/过期租约不能在 block
  模式下通过；有效租约正常通过；无匹配规则无误报；性能命令启动完整的新
  Node 子进程。
- **性能禁止事项：** 不得只测状态机函数；不得从计时中剔除 Node
  spawn、模块加载、SQLite、输出和退出。
- **预期证据：** Hook 输入/输出日志、完整端到端性能样本。
- **完成定义：** 只拦截 `Write` / `Edit`；不声称覆盖 Bash 或外部进程。
- **失败回退：** PreToolUse 误放行属于 P1；性能超阈值按 S0 FAIL
  处理，不改口径。

### T006 — 压缩、目录、阶段、子 Agent 失效边界

**工时：** 5h  
**目标：** 实现 PreCompact
失效和其他边界事件处理，防止错误失效与漏失效。

- **输入：** T003 事件适配器、T004 状态机。
- **输出：**
  `src/hooks/pre-compact.ts`、`src/hooks/instructions-loaded.ts`、`src/hooks/cwd-changed.ts`、`src/hooks/subagent-start.ts`、`src/cli/phase.ts`。
- **允许修改：** 失效事件处理与阶段命令。
- **禁止修改：** PreToolUse 决策语义、Store Schema。
- **验收标准：**
  - PreCompact 原子使当前作用域租约 EXPIRED；
  - 若失效状态无法持久化，严格模式阻止压缩；
  - CwdChanged 只作为异步观察，PreToolUse 同步比较当前 cwd；
  - old cwd 与 new cwd 相同时不应使租约失效，W07 反向 guard 必须保持
    FRESH 且 `last_read` 不变；
  - SubagentStart 建立新的 UNSEEN 作用域；
  - `guidancepulse phase set <phase>` 使当前作用域旧租约失效；
  - InstructionsLoaded 不承担阻断。
- **验收命令：**
  ``` bash
  npm run test:invalidation-boundaries
  npm run test:phase-cli
  ```
- **预期证据：** compact/cwd/phase/subagent 边界测试；same-cwd
  反向测试。
- **完成定义：** 四类边界事件在独立 Fixture 中有可复现状态变化。
- **失败回退：** 若异步事件存在竞态，强制检查必须回到同步
  PreToolUse，不允许等待异步事件完成作为前置条件。

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
- **预期证据：** SQLite 并发日志、隐私 Canary 扫描。
- **完成定义：** 多进程并发测试通过，数据字段符合项目书 §7.4。
- **失败回退：** SQLite 锁冲突若无法在预算内解决，禁止退回无锁 JSON
  覆盖写；建立独立 FIX-T007。

### T008 — 本地事件时间轴 UI

**工时：** 7h  
**目标：** 展示指导读取、租约状态、失效边界和写前决策。

- **输入：** Store 查询接口、项目书 §9。
- **输出：** `src/ui/**`、`src/report/**`。
- **允许修改：** React 页面、CSS、静态 HTML/JSON 报告。
- **禁止修改：** Lease Engine、Hook adapter、SQLite Schema。
- **验收标准：**
  - 显示 session/agent/phase；
  - 显示指导 ID、UNSEEN/FRESH/EXPIRED、剩余编辑数；
  - 时间轴显示 Read、Compact、Cwd、Phase、Subagent、Write decision；
  - 不展示 Prompt、源代码、绝对路径；
  - UI 无 CDN、远程字体或外部网络。
- **验收命令：**
  ``` bash
  npm run test:ui
  npm run build
  npm run test:ui-offline
  ```
- **预期证据：** UI 测试日志、真实运行截图与可复现演示步骤。
- **完成定义：** 提供本地浏览器演示截图和演示记录。
- **失败回退：** 只允许删减非核心动画，不得删掉事件原因和状态文字。

### T009 — 48 条 Golden Fixtures 与独立 Python Oracle

**工时：** 7h  
**目标：** 构建/核对 S0 的 48 条合成轨迹、手工 Golden Expected 和独立
Oracle；确保 Oracle 比较包含逐步快照。

- **输入：** 项目书 §10、T004–T007 接口契约。
- **输出：**
  `tests/fixtures/s0/**`、`tests/golden/**`、`tests/oracle/reference_oracle.py`。
- **允许修改：** Fixture、Golden
  Expected（仅在发现真实规格错误并经独立批准后）、独立 Oracle。
- **禁止修改：** 生产 `src/core/**`、`src/hooks/**`。
- **Fixture 分组：** 16 control、8 compact、8 cwd、8 unread、8 scope。
- **验收标准：**
  - Golden Expected 手工独立编写；
  - Oracle 使用 Python 3.12 标准库，独立实现状态转移；
  - Oracle 不导入 TypeScript 代码、不运行生产 CLI；
  - 48 条均有唯一 fixture ID、输入事件序列、逐步快照和期望输出；
  - W05/S06 中间 EXPIRED、S07 终态 EXPIRED、W07 same-cwd 全程 FRESH
    均有明确 Expected。
- **验收命令：**
  ``` bash
  python3 tests/oracle/reference_oracle.py --self-test
  python3 tests/oracle/reference_oracle.py --verify-golden
  npm run test:golden
  ```
- **预期证据：** 48 条 Fixture 清单、Golden、Oracle 自测与验证日志。
- **完成定义：** Oracle 自身测试通过，48 个 Golden Expected
  经第二个独立会话复核。
- **失败回退：** Golden
  与生产结果不一致时先判失败，不得自动用生产结果覆盖 Golden。

### T010 — S0 Gate、四依据检出、完整 Hook p95 与 100 次确定性重放

**工时：** 6h  
**目标：** 按项目书 §10 实现唯一 S0 判定口径，生成可独立复核报告。

- **输入：** T009 Fixtures/Oracle、T005/T006/T007 生产代码、v1.1.0
  规格。
- **输出：**
  `scripts/s0-replay.ts`、`scripts/s0-gate.ts`、`artifacts/s0/**`。
- **允许修改：** Gate
  编排、`summarizeReplay`、性能计时器、报告生成器、相关测试。
- **禁止修改：** 生产状态机语义、Golden
  Expected、四依据定义和优先级、p95 阈值。
- **必须实现：**
  1.  `summary.perFixture[].detection_basis` 使用四个固定字符串之一。
  2.  判定条件和优先级与项目书 §10.3 完全一致。
  3.  `matchesGolden === true` 不得单独计为错误检出。
  4.  16 条 control 的 `detection_basis` 为 null、`controlClean=true`。
  5.  W05/S06 通过逐步 snapshots 中的 EXPIRED + 非空 reason 检出。
  6.  S07 通过 final lease EXPIRED + 非空 reason 检出。
  7.  W07 通过 same-cwd + 全部 snapshot FRESH 的反向 guard 检出。
  8.  先 5 次预热不计入，再做 100 次计时；冷启动样本必须包含在 100
      次内。
  9.  100 次性能计时全部为新 Node 子进程，包含 spawn、Node
      启动、模块加载、SQLite、解析、匹配、决策、输出和退出。
  10. 100 次完整 48 Fixture replay 必须得到一个 canonical SHA。
- **验收命令：**
  ``` bash
  npm run test:s0
  npm run perf:hook
  npm run repeat:s0 -- --runs 100
  npm run s0:gate
  ```
- **硬门槛：** 三向 parity 48/48；四依据检出 32/32；控制无误报
  16/16；完整 Hook p95 \<500ms；100 次 replay 恰好 1 个 canonical
  SHA；网络请求 0；Prompt/源码持久化泄露 0。
- **预期证据：**
  S0_GATE.json/.md、fixture-results.json、oracle-results.json、perf-hook.json、repeat-hashes.json、privacy-scan.json、network-scan.json、日志、退出码、commit、lockfile
  SHA。
- **完成定义：** S0 七项全部 PASS；报告可由独立命令复算。
- **失败回退：** 任一硬门失败，S0=FAIL，T011/T012/T014
  BLOCKED；不得降低阈值、剔除冷启动、删除 Fixture 或回写 Golden。

### T011 — CLI 安装、卸载和用户操作

**工时：** 4h  
**前置：** v1.1.0 S0 PASS + T013 S0 审查 PASS  
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
- **预期证据：** 安装前后配置 diff、备份文件、安装器测试日志。
- **完成定义：** 所有用户现有 Hook 保留。
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
- **预期证据：** 全量测试日志、E2E 录像/截图、离线与隐私报告。
- **完成定义：** 所有命令真实运行且退出码符合要求。
- **失败回退：** 保留日志与 Fixture，建立 FIX-T012；不覆盖 S0 原始证据。

### T013 — 独立代码与证据审查

**工时：** 4h  
**前置：** S0 核心代码完成；S0 审查在 T010 后，最终审查还需 T012 PASS  
**目标：** 独立审查核心实现、Golden、Oracle、四依据、隐私、Hook
语义和发布材料。

- **输入：** 当前 commit、项目书 v1.1.0、计划书 v1.1.0、接口契约、S0
  Gate、测试日志。
- **输出：**
  `reviews/T013_REVIEW.md`、`reviews/REVIEW_INDEX.md`、`reviews/REVIEW_PACK_XX.md`。
- **审查者：** 与实现作者不同模型或独立新会话；Muse 不代写审查结论。
- **禁止修改：** 所有生产源码与 Golden；审查者只提交问题和证据。
- **必须检查：**
  1.  通读 `src/core`、`src/hooks`、`src/store`、隐私模块。
  2.  独立复核 48 Fixtures 和 Oracle 独立性。
  3.  检查 `detection_basis` 四个条件、字段名、优先级和 28/1/2/1 计数。
  4.  确认 W05/S06 中间 EXPIRED 快照在后续重读后仍可审计。
  5.  确认 S07 final EXPIRED + PHASE_MISMATCH。
  6.  确认 W07 same-cwd 不失效、所有 snapshots FRESH、`last_read` 不变。
  7.  确认 `matchesGolden` 不参与独立检出计数。
  8.  复算 S0 hash 与 p95 口径；确认 5 次预热排除、100
      次计时含冷启动且每次 spawn 新 Node 子进程。
  9.  核对 `onFailure:block`、PreCompact、异步事件竞态、Bash 绕过边界。
  10. 检查项目书/计划书内部章节引用和 `python3` 命令统一。
- **验收标准：** P0/P1=0；所有问题有证据和复核状态。
- **预期证据：** Review Index、分批源码审查包、审查日志、问题清单。
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
  解压后文件清单一致；SHA256 可独立重算；S0 Gate 与最终冻结版本对应。
- **预期证据：** ZIP、Manifest、SHA、Git commit、验证日志。
- **完成定义：** 源码、分发包、Manifest 和哈希一一对应。
- **失败回退：** 不覆盖旧冻结包；新建 freeze revision 并保留历史版本。

------------------------------------------------------------------------

## 7. 接口契约与 Hook 配置

### 7.1 Hook 配置目标形态

以下是目标结构示例，最终由 `guidancepulse install` 根据 T001 验证的
Claude Code 版本生成。不得直接覆盖用户现有配置。

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

注意：这是目标结构，不是已验证配置。`InstructionsLoaded` / `CwdChanged`
是异步观察事件，不能作写前拦截。`PreToolUse` 仅匹配
Write/Edit。每次调用启动新的 Node 子进程；不得连接
daemon。`onFailure: "block"` 需要符合官方版本门槛。

### 7.2 CLI 命令契约

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

## 8. S0 检出算法、性能计时与报告格式

### 8.1 检出依据（必须逐字实现）

T010 的 `summarizeReplay` 按以下优先级依次判断：

**1. `non_allow_decision`**

``` ts
result.decisions.some((d) => d.decision !== "ALLOW")
```

**2. `expired_final_lease`**

``` ts
result.leases.some((l) => l.state === "EXPIRED" && l.reason !== null)
```

**3. `expired_intermediate_lease`**

``` ts
result.snapshots.some((s) =>
  s.leases.some((l) => l.state === "EXPIRED" && l.reason !== null)
)
```

**4. `same_cwd_no_expiry`**

``` ts
fixture.steps.some(
  (s) => s.kind === "cwd" && s.old !== undefined && s.old === s.new
) &&
result.snapshots.every(
  (s) => s.leases.every((l) => l.state === "FRESH")
)
```

优先级必须为：

``` text
non_allow_decision
→ expired_final_lease
→ expired_intermediate_lease
→ same_cwd_no_expiry
```

检测计数不能从 `matchesGolden` 推导。Fixture
只有在四种依据之一命中时才能标记
`errorDetected=true`。若四种依据都不满足，即使与 Golden 完全相等，也必须
`errorDetected=false`。

### 8.2 预期计数与特殊 Fixture

| 依据                         |   数量 | Fixture   |
|------------------------------|-------:|-----------|
| `non_allow_decision`         |     28 | 28 条     |
| `expired_final_lease`        |      1 | S07       |
| `expired_intermediate_lease` |      2 | W05、S06  |
| `same_cwd_no_expiry`         |      1 | W07       |
| **错误检测合计**             | **32** | **32/32** |

- W05：中间快照 EXPIRED，`reason=CWD_MISMATCH`；重读后 FRESH；Golden
  终态 `ALLOW + FRESH`。
- S06：中间快照 EXPIRED，`reason=PHASE_MISMATCH`；重读后 FRESH；Golden
  终态 `ALLOW + FRESH`。
- S07：规则因 phase 变化失活，没有被门控的写；终态租约
  EXPIRED，`reason=PHASE_MISMATCH`。
- W07：cwd 事件 `old == new`，所有快照租约均 FRESH，`last_read`
  不变；Golden 终态 `ALLOW + FRESH`。
- 16 条 control：`detection_basis=null`、`controlClean=true`，不计入 32
  条错误检测。

只看终态最多 29/32。T004 必须输出逐步 snapshots；重新读取不得覆盖之前
EXPIRED 快照。忽略 compact 边界的篡改反向测试必须让检出降为
31/32。不得以 Golden 相等替代边界检测。

### 8.3 性能计时规范

- 先做 5 次预热，5 次全部排除。
- 随后执行 100 次计时；每次启动全新的 Node 子进程。
- 这 100 次计时中必须包含冷启动样本；冷启动同时计入 `n=100` 的
  p50/p95/p99/min/max。
- 每个样本包含 spawn、Node 启动、better-sqlite3 加载、JSON
  解析、净化、SQLite 读取、路径匹配、决策、输出和退出。
- 另行报告 `cold_start_ms`，但不得从 100 个样本中删除。
- `run_failures=0`；失败调用不能静默排除。
- 阈值严格为 `p95 < 500ms`；等于 500ms 为 FAIL。
- 不得以 daemon、进程内函数耗时、复用进程或平均值替代。
- 100 个原始样本、5 次预热日志、计算方式和环境必须归档。

### 8.4 100 次确定性重放

- 每次运行完整 48 条轨迹。
- 排除真实墙钟耗时、随机临时目录和运行机器路径。
- 保留事件顺序、状态变化、指导 ID、路径 Fixture
  ID、决策、失效原因和逐步快照。
- 将规范化 JSON 按键排序、UTF-8 编码、LF 换行后计算 SHA-256。
- 100 次结果必须恰好只有一个唯一 SHA。
- `generated_at_utc` 与性能数据不进入 canonical semantic hash。

### 8.5 S0 Gate 输出结构

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

`fixture-results.json` 必须包含 48 个 fixture 的
`matchesGolden`、`controlClean`、`errorDetected`、`detection_basis`、decisions、final
leases、snapshots 和 Golden。`perf-hook.json` 必须包含 5 次预热、100
个样本、cold-start 样本标记、p50/p95/p99/min/max、run_failures
和环境信息。

### 8.6 S0 七项硬门

1.  生产/Golden、Oracle/生产、Oracle/Golden 三向 parity：全部 48/48。
2.  植入错误检测：32/32，按四种依据与优先级。
3.  控制无误报：16/16。
4.  Hook 完整端到端 p95：严格 `<500ms`，100 次计时含冷启动。
5.  100 次完整 replay：唯一 canonical SHA。
6.  网络请求：0。
7.  Prompt/源码持久化泄露：0。

七项必须全部 PASS。S0 任一项失败，T011/T012/T014 继续 BLOCKED。

------------------------------------------------------------------------

## 9. 测试与独立审查策略

### 9.1 测试层次

1.  Unit：状态机、Glob、路径规范化、编辑预算、决策聚合。
2.  Contract：Claude Code Hook JSON 输入/输出、官方事件字段样本。
3.  Golden：48 条手工 Fixture 对照。
4.  Independent Oracle：Python 参考实现与生产 TypeScript 对照。
5.  Mutation：注入 stale lease、错 scope、忽略 compact、忽略
    cwd、编辑预算不扣减等错误，确认检测。
6.  Performance：完整 Hook 子进程端到端 p95，包含 Node
    启动与冷启动样本。
7.  Determinism：完整 S0 100 次重放、一个 canonical SHA。
8.  Privacy/Offline：网络请求 0；敏感 Canary 不落盘。
9.  E2E：安装、读取、写前检查、压缩、失效、重新读取、恢复写入。
10. Release：ZIP、Manifest、SHA、Git commit 一致。

### 9.2 Fixture 目录

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

### 9.3 Oracle 独立性

- Python Oracle 不导入生产 TypeScript，也不调用生产 CLI。
- 48 个 Golden Expected 不得由生产程序生成。
- Oracle 必须独立实现状态转移、边界失效、编辑预算和决策优先级。
- 第二个独立会话复核 Oracle 算法和 Golden Expected。
- 生产结果与 Oracle 任一字段不一致即失败；不得配置 ignore 字段。
- snapshots 的顺序、state、reason、last_read、cwd、phase
  和预算必须纳入比较。

### 9.4 反向与篡改测试

必须保留：

- 忽略 compact 边界时检出下降到 31/32 的篡改测试。
- 忽略 cwd 边界时 W05 中间 EXPIRED 消失的反向测试。
- 忽略 phase 边界时 S06 中间 EXPIRED 消失的反向测试。
- 把同 cwd 事件错误处理为失效时 W07 失败的反向测试。
- 即使 `matchesGolden=true`，没有四种 detection basis 时 `errorDetected`
  仍为 false。

------------------------------------------------------------------------

## 10. 模型工种分配建议

Muse
根据自己已测试可用的免费模型清单分配，不在本计划中虚构模型名称或额度。

| 工种                | 任务      | 必要能力                                   | 独立性要求                     |
|---------------------|-----------|--------------------------------------------|--------------------------------|
| 技术探测            | T001      | 终端执行、版本探测、日志归档               | Muse 复核真实命令输出          |
| TypeScript 核心实现 | T002–T006 | Node/TS、Hooks、状态机、路径匹配           | 每个 TASK 新会话               |
| 存储与隐私          | T007      | SQLite、事务、HMAC、隐私测试               | 与核心实现尽可能不同模型       |
| UI                  | T008      | React、Vite、时间轴可视化                  | 独立文件归属                   |
| 测试与 Oracle       | T009–T010 | Python 3、TypeScript、确定性测试、性能测量 | Oracle 作者不写生产状态机      |
| CLI / 集成          | T011–T012 | Node CLI、Claude settings 合并、E2E        | 只在 S0 PASS 后派发            |
| 独立审查            | T013      | 安全、并发、测试和证据审查                 | 不同模型或独立新会话；只提问题 |
| 发布                | T014      | ZIP、Manifest、SHA、Git                    | Muse 独立核验                  |

------------------------------------------------------------------------

## 11. 任务交接格式与 Git 规则

每张任务卡必须附：

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

Git 规则：

- 每个任务在独立 worktree 或分支中完成。
- 不允许两个 Agent 同时修改同一文件。
- 先运行验收命令，再合并。
- 失败保留日志和分支；修复任务新建 `FIX-<TASK_ID>-NN`。
- 任何 S0 代码变化都必须重新运行完整 S0 Gate。
- T014 冻结后任何变更都必须生成新 commit、新 ZIP、新 Manifest、新
  SHA，并重新审查。

------------------------------------------------------------------------

## 12. 工作区运行与验收命令

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
