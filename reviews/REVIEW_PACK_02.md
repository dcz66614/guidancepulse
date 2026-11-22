# REVIEW_PACK_02 — hooks + store + 隐私模块 + phase CLI（T013 S0 审查）

- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`
- **规格：** PROJECT_BOOK v1.1.0 §5（流程与边界）、§6（状态机/写前算法）、§7（架构/数据/隐私）
- **文件：** `src/hooks/adapter.ts`、`src/hooks/pre-tool-use.ts`、`src/hooks/decision.ts`、`src/hooks/pre-compact.ts`、`src/hooks/cwd-changed.ts`、`src/hooks/subagent-start.ts`、`src/hooks/instructions-loaded.ts`、`src/hooks/index.ts`、`src/store/store.ts`、`src/store/schema.ts`、`src/store/index.ts`、`src/store/errors.ts`、`src/privacy/sanitize.ts`、`src/privacy/path-id.ts`、`src/privacy/retention.ts`、`src/privacy/index.ts`、`src/cli/phase.ts`
- **结论：** PASS，无 P0/P1 问题。`onFailure:block` 的端到端验证缺口登记为 F-05（REVIEW_PACK_08），不属于本包代码缺陷。

## 1. `src/hooks/adapter.ts`（12,495 B）

- 九个官方事件名齐全；`BLOCKING_HOOK_EVENTS = ["PreToolUse", "PreCompact"]`，`InstructionsLoaded`/`CwdChanged` 明确为观察-only。
- PreToolUse 仅 Write/Edit 进入写前检查，其余工具（Bash 等）返回 `ignored / tool-not-gated`——符合规格边界（首版只保证原生 Write/Edit），不宣称覆盖 Bash。
- PostToolUse 仅**确认成功**的 Read 签发凭证（`tool_response.success===true` 或 `is_error===false`）；失败/不可判定 → ignored，不签发。`read_failed` 不产生租约。
- 目标在项目 cwd 之外 → ignored（无相对 glob 可匹配），不报错、不放行到门内；无 `file_path` 的门控/读取工具 → 抛 `AdapterError`（fail-closed 上游）。
- 未知事件名 → ignored 且不持久化（前向兼容）。
- `SubagentStart` 无 `agent_id` → 抛错，不虚构作用域。

## 2. `src/hooks/pre-tool-use.ts` + `decision.ts`

- 流程与 §6.4 一致：适配 → live phase 精炼 `matchRules` → `checkWriteAndPersist`（懒失效原子持久化）→ 每条门控规则一条 `WRITE_CHECKED` 审计事件 → `buildHookOutput`。
- 决策映射：warn → allow + additionalContext；ask → `permissionDecision:"ask"`；block → deny + exit 2（`hookExitCode` 唯一映射点，DENY 不可能 exit 0）；无匹配规则 → 输出 `{}`（无意见）exit 0。
- **Fail-closed**：`handlePreToolUse` 永不抛错；任意内部错误（信封畸形、缺 file_path、store 失败、审计写失败）→ DENY + exit 2，reason 只含错误码。预算只在写成功后扣减（`recordSuccessfulWrite`，PostToolUse 路径），门本身不扣减。
- `toRelativeTarget` 与适配器的解析逻辑一致（绝对路径须在 cwd 下，否则 null）。

## 3. 失效边界 handlers

- **`pre-compact.ts`**：`PRE_COMPACT` 经 `recordEvent` 在同一 `BEGIN IMMEDIATE` 事务内提交事件行 + 租约转移；持久化失败时严格模式（默认 true）`blocked=true`，`exitCodeForPreCompact`=2，阻止压缩；非严格模式只报告不阻止，永不静默报成功。
- **`cwd-changed.ts`**：异步观测 only（`CWD_CHANGED_CAN_BLOCK=false`，`CWD_REQUIRES_SYNCHRONOUS_RECHECK=true`）；竞态由 PreToolUse 同步复核关闭——写到达时即使 CwdChanged 未到，`checkWrite` 也会按 live cwd 懒失效。无任何等待异步事件的前置条件。
- **`subagent-start.ts`**：持久化 `SUBAGENT_STARTED` 审计事件；重读验证父作用域租约 untouched、新作用域零租约（无继承）；`inheritedGuidanceIds` 恒为空。
- **`instructions-loaded.ts`**：批量 `recordEvents` 原子提交（全凭证或全不凭证）；`blocking` 恒 false；持久化失败只报告，租约保持 UNSEEN/EXPIRED 直至下次确认读取。

## 4. `src/cli/phase.ts`（`phase set`）

- 显式 `phase set` 使旧租约失效，**同阶段也失效**（与 T004 被动 `PHASE_CHANGED` 的 same-phase no-op 有意区分，文件头有完整说明）。
- 实现方式：先 `recordEvent(PHASE_CHANGED)`，再对仍 FRESH 的租约调用 `checkWriteAndPersist`，传入比较用 sentinel phase（`__force_expire__<phase>`，保证与签发 phase 不同）。审查员核实：sentinel 只进入比较，`checkWriteAndPersist` 只持久化懒失效的租约状态，不把 sentinel 写入任何租约或事件行；`cwdPathId` 取租约自身的签发值传入，若为 null 也不会误判为 CWD 失效（null==null 相等，走到 phase 比较仍为 `PHASE_MISMATCH`）。无 `store.expireScope` 专用方法的取舍已在 HANDOFF_T006 记录。
- phase id 校验：slug 正则 + 可选白名单；非法输入在任何持久化前抛错。

## 5. `src/store/store.ts` + `schema.ts`（26,336 B + 2,904 B）

- WAL + `busy_timeout=5000` + 全部 mutation 用 better-sqlite3 `.immediate`（`BEGIN IMMEDIATE`）事务：事件行与租约转移同提交同回滚；`synchronous=NORMAL` 的取舍（进程崩溃可耐、OS 崩溃不保证）已在 HANDOFF_T007 记录。
- `recordEvent`/`recordEvents`/`checkWriteAndPersist`/`recordWriteOutcomeAndPersist` 均“加载租约 → 用 T004 纯函数转移 → 同事务 upsert”，不复制状态机逻辑；`loadLeaseStore`/`persistLeases` 字段与 `GuidanceLease` 一一对应。
- 隐私：写入前 `isGuidancePulseEvent` + `assertNoBannedKeys` 双重校验，全部 SQL 绑定参数；错误只含错误码；`deleteSession` + `vacuum()` 语义正确（DELETE 后需 VACUUM 才真正清字节，注释已说明）。
- 并发测试：`tests/unit/concurrency.test.ts`（8 进程 × 25 事件无丢失无重复；4 进程并发 compact）包含在审查员复跑的 359/359 中。

## 6. 隐私模块（`src/privacy/sanitize.ts`、`path-id.ts`、`retention.ts`）

- `sanitizeHookInput` 为 allowlist 抽取：只取 hook_event_name、session_id、cwd、tool_name、file_path（相对规范化）、toolSuccess（布尔）、trigger/reason/source、agent_id/type、loadedPaths（仅相对路径）、old/new cwd；`tool_response` 正文、`transcript_path`、Prompt、content、环境变量与一切未知字段在内存中丢弃。
- `computePathId`：SHA-256 HMAC（`hmac:<64 hex>`），空 key 抛错；`normalizePathForId` 处理反斜杠、`.`/`..` 段、绝对/相对路径。
- `findBannedKeys`/`assertNoBannedKeys` 按键名（大小写不敏感）扫描；`redactForLog` 只对已知敏感键脱敏并明确标注“不得用它把任意未知输入变安全”——保证 rests 在 allowlist 上，表述诚实。
- 实测：S0 三 canary 在 11 个落盘文件上 0 命中（审查员复跑复现）。

## 7. 复核方法

逐文件通读 + 对照 v1.1.0 §5–§7；`npm test` 全量 359/359 在审查员复跑中通过，其中 hooks-adapter 30、pre-tool-use 29、invalidation-boundaries 15、phase-cli 13、store 21、privacy 15、privacy-sanitizer 25、concurrency 2。
