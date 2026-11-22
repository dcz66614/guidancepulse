# HANDOFF — T003 Hook 事件适配器与隐私净化

- task_id: T003
- base_commit: 98d1554
- result_commit: 0a40982de8ae2a3e3d9c5747917d4f0a073013f7
- project_id: P025
- spec_version: 1.0.0
- go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布，施工不等于 GO）
- goal: 把官方 Hook JSON 转成内部事件，不落盘原始敏感字段。
- date_utc: 2026-11-15

## inputs

- `00_control/PROJECT_BOOK.md`（重点 §4、§6.3/§6.4、§7；见 known_limits 第 1 条的引用错位记录）
- `00_control/IMPLEMENTATION_PLAN.md`（重点 §5 T003 卡、§6.1）
- `02_source/docs/environment/T001_ENVIRONMENT.md`（9 个官方事件名；Claude Code 本机未安装）
- T002 成果：`02_source/src/config/`（复用 `parseConfigYaml`、`matchGlob`、`normalizeTargetPath`、`aggregateModes`）、`schemas/guidance-rule-v1.schema.json`
- base commit 98d1554（含 T001 + T002 全部成果）

## changed_files

- `02_source/src/contracts/events.ts`（新增；§6.3 六种内部事件 + `WriteCheckRequest` + `isGuidancePulseEvent`/`isPathId` 守卫）
- `02_source/src/contracts/index.ts`（新增；模块公开入口）
- `02_source/src/hooks/adapter.ts`（新增；`adaptHookEvent`，9 个官方事件分发）
- `02_source/src/hooks/index.ts`（新增；模块公开入口，导出 `BLOCKING_HOOK_EVENTS` / `OBSERVATION_ONLY_HOOK_EVENTS`）
- `02_source/src/privacy/sanitize.ts`（新增；allowlist 净化 `sanitizeHookInput`、HMAC `computePathId`、`findBannedKeys`/`assertNoBannedKeys`、`redactForLog`）
- `02_source/src/privacy/index.ts`（新增；模块公开入口）
- `02_source/tests/unit/hooks-adapter.test.ts`（新增；30 个单测）
- `02_source/tests/unit/privacy-sanitizer.test.ts`（新增；25 个单测）
- `02_source/package.json`（新增 `test:hooks-adapter`、`test:privacy-sanitizer` 脚本；无新依赖）
- `02_source/artifacts/test-logs/T003_test-hooks-adapter.log`（新增；验收日志）
- `02_source/artifacts/test-logs/T003_test-privacy-sanitizer.log`（新增；验收日志）
- `02_source/artifacts/test-logs/T003_typecheck.log`（新增；验收日志）

未触碰禁区：Lease 状态机（`src/core/lease-machine.ts` 未创建）、SQLite Schema、UI、Oracle（`tests/oracle/**`）、其他项目、Drive 总索引、用户 `.claude/settings*.json`。未改动任何规格文件。未上传 GitHub、未调付费 API；全部测试数据均为合成数据。

## interface_contract（实现与冻结决策）

契约以项目书 §6.3（内部事件契约）+ §6.4（允许/禁止持久化字段）为准（见 known_limits 第 1 条）。

- 六种持久化事件与 §6.3 逐字段一致：`READ_SUCCEEDED`、`PRE_COMPACT`、`CWD_CHANGED`、`SUBAGENT_STARTED`、`PHASE_CHANGED`、`WRITE_CHECKED`；另有 `isGuidancePulseEvent` 做精确字段集合校验（多一字段即非法）。
- `WRITE_CHECKED` 由 T005 写前门在租约查询后签发，适配器签发不了（无租约状态）；适配器对 PreToolUse Write/Edit 产出 `WriteCheckRequest`（工具名、作用域、目标 `pathId`、匹配规则 ID、时间戳），供 T005 解析为每规则一条 `WRITE_CHECKED`。`WRITE_CHECKED` 形状已在 `events.ts` 冻结，T005/T007 共用同一定义。
- 净化 allowlist：只保留 `hook_event_name`、`session_id`、`cwd`（仅内存内解析相对路径用）、`tool_name`、`tool_input.file_path`、`tool_response` 的成功布尔值、`trigger`、`reason`/`source`、`agent_id`、`agent_type`、`loaded_paths`（仅相对路径）、`old_cwd`/`new_cwd`（仅内存内 HMAC 用）。`tool_response`、`transcript_path`、Prompt、`content`、环境变量及一切未知字段均在内存内丢弃。
- 路径标识：`hmac:<64 位小写 hex>`，SHA-256 HMAC，密钥由调用方注入（T007 拥有/生成；T003 不读盘、不生成密钥）；等价拼写（`./`、`//`、`.` 段、反斜杠、`..` 消解）收敛为同一 ID；绝对 cwd 同样只以 HMAC 出现。
- 事件分发（9 个官方事件，T001 已核对）：
  - `PreToolUse`：仅 Write/Edit 进入写前门（匹配规则时产出 `WriteCheckRequest`，无匹配规则/目标在项目外时 ignored）；Read/Bash 等 ignored。无 `file_path` 时抛 `AdapterError`（fail closed）。
  - `PostToolUse`：仅成功 Read（`tool_response.success === true`，或 `is_error === false`）且目标匹配某规则 `source` 时签发 `READ_SUCCEEDED`（每规则一条）；失败/无法确认/非指导文件均 ignored，不签发凭证（严格模式，§4.4）。
  - `PreCompact` → `PRE_COMPACT`；`PostCompact` ignored（仅观察）。
  - `InstructionsLoaded`：每条 `loaded_paths` 匹配规则 `source` 即签发 `READ_SUCCEEDED`（按指导 ID 去重）；异步观察事件，绝不承担写前阻断。
  - `CwdChanged`：产出 `CWD_CHANGED`（新旧 cwd 均为 HMAC）；异步观察事件，绝不承担写前阻断；缺 old/new cwd 时 ignored 而非捏造。
  - `SubagentStart` → `SUBAGENT_STARTED`（`agentScopeId` 取 `agent_id`；缺失时抛错）；其余事件 `agentScopeId` 缺省为冻结值 `"main"`。
  - `SessionStart`/`SessionEnd`：§6.3 无对应契约事件，ignored（会话生命周期属 T007 存储层）。
  - 未知事件名：ignored（前向兼容，不持久化任何内容）；畸形已知事件（缺 `session_id`/`cwd`/事件名等）抛错，不静默造事件。
- 阻断表（§4.3）：可阻断 = `PreToolUse`、`PreCompact`；观察类 = 其余 7 个事件；`InstructionsLoaded`/`CwdChanged` 明确不在可阻断集合中（测试锁定）。
- 确定性：纯函数，无 I/O、无网络、无随机性；时间戳可注入（`ctx.now`），固定时钟下同输入输出字节一致。

## commands

在 `02_source/` 内运行（Node v24.22.1、npm 10.9.4；无新依赖，未运行 `npm ci`，lockfile 未变）：

```bash
npm run test:hooks-adapter
npm run test:privacy-sanitizer
npm run typecheck
npm test
npm run test:config
```

## exit_codes

- `npm run test:hooks-adapter`: 0（30 passed / 30）
- `npm run test:privacy-sanitizer`: 0（25 passed / 25）
- `npm run typecheck`: 0（0 错误）
- `npm test`（全量回归）: 0（131 passed / 131，3 个测试文件）
- `npm run test:config`（T002 回归）: 0（76 passed / 76）

## test_summary

- 适配器 30 个：写前门 9 个（双规则匹配、单规则、相对路径、无匹配规则、项目外目标、非门控工具、缺 `file_path` 抛错、缺 `tool_name` 抛错、固定时钟确定性）；成功 Read 5 个（双规则签发、相对路径、失败 Read 不签发、非指导文件、非 Read 工具）；失效/观察事件 9 个（PreCompact、PostCompact、CwdChanged HMAC 与确定性、缺 old/new、SubagentStart 作用域、缺 agent_id 抛错、SessionStart/End、InstructionsLoaded 去重、无匹配）；信封校验与前向兼容 4 个；canary 泄漏 3 个。
- 净化器 25 个：HMAC 8 个（格式、确定性、路径/密钥敏感性、不可恢复性、等价拼写收敛、Uint8Array 密钥、空路径/空密钥拒绝）；路径规范化 2 个；allowlist 提取 7 个（字段白名单、tool_response 归约为布尔值、路径处理、loaded_paths 过滤、SessionStart source、CwdChanged 内存字段、畸形信封抛错）；禁名扫描 4 个；`redactForLog` 3 个；canary 1 个。
- Canary 证据：合成 Prompt `CANARY-PROMPT-7f3a9d21-syn-001`、源码 `CANARY-SOURCE-9b4e77c2-syn-002`、令牌 `CANARY-TOKEN-4d1a08f6-syn-003` 植入 `tool_input.content`、`tool_response` 正文、`transcript_path`、环境变量及未知字段后，在全部适配器输出、序列化事件模拟持久化文件（临时 `events.jsonl`，已清理）及三份验收日志中出现次数均为 0（日志 grep 逐项核对为 0）。另有 1 个测试先断言原始输入确实含有 canary，证明该检查是活的。
- 中途一次失败已修复并如实记录：首轮 `test:privacy-sanitizer` 25 个中 2 个失败，均为测试期望错误、实现语义正确——（1）`redactForLog` 对禁名 `tool_input` 整棵替换而非递归进子字段，测试期望已按实现修正；（2）`redactForLog` 只处理已知禁名，未知字段下的 canary 会残留，测试改为：未知字段 canary 由 allowlist 净化器兜底（断言仍为 0），redact 视图只喂已知禁名下的 canary。该边界已写入 `sanitize.ts` 的 `redactForLog` 注释（见 known_limits 第 4 条）。修复后两验收命令均为 0。

## log_paths

- `02_source/artifacts/test-logs/T003_test-hooks-adapter.log`
- `02_source/artifacts/test-logs/T003_test-privacy-sanitizer.log`
- `02_source/artifacts/test-logs/T003_typecheck.log`

## sha256

- `02_source/src/contracts/events.ts`: ad76cf82957a72b33b25ec546a17193b0ba1f25ae03d89693ca5600fca30e853
- `02_source/src/contracts/index.ts`: aee9e3ce2ca31a689f2cbb8d3ea735418d79397cec331b3c7483deb0b3bd9dab
- `02_source/src/hooks/adapter.ts`: c280d4dca1917e24660869ddc28a7a5a6f51946b4ee276a8a25de4d1b75ea844
- `02_source/src/hooks/index.ts`: 238c96f0ca30ea43d99810cee8aab1677d849edc2f054c01b4e9c87e90e27f99
- `02_source/src/privacy/sanitize.ts`: 876a81d269dbb91827ebd00e666c59a0df57e467c41566ee93a9e4d5614fd2ad
- `02_source/src/privacy/index.ts`: 776e6de1c097081cda62946345b3120b8fcdc666fa3d5a899c2faf59f4abd8a4
- `02_source/tests/unit/hooks-adapter.test.ts`: 4b9d30d091eb2ac724c8655fc5bfe8964b09f2196c0a8911ab3eb0bfd886f98f
- `02_source/tests/unit/privacy-sanitizer.test.ts`: 0586205f7025297f47ddc221f4bae4372be5b8656990b9f9b339128b710ec2ed
- `02_source/package.json`: 5dc0193ea85ead8f4472d402807ac154c515ece374eadb79d538902e073d30f1

## known_limits

1. **规格引用错位（已记录，未擅自改规格）：** 任务卡称契约以项目书 §7.2 为准，但 §7.2 是 UI 颜色/文案节，无事件字段；与 T002 的 §7.2/Schema 错位同类。本任务实际以 §6.3（内部事件契约）+ §6.4（允许/禁止持久化字段）为准，已在 `src/contracts/events.ts` 头部注释注明，请总协调员确认是否需规格勘误。
2. **T002 冻结语义的沿用：** 复用 T002 的 `matchGlob`/`normalizeTargetPath`（含 `**` 整段语义）与 `aggregateModes`（未在本任务中使用，属 T005）；`max_successful_edits` 等配置语义未动。
3. **无真实 Claude Code 验证：** 本机未安装 Claude Code（T001 结论），9 个事件的真实触发行为仍为 NOT_VERIFIED；本任务只验证合成 Hook JSON 的解析、分发与净化。真实端到端验证属 T005/T006/T012，需在装有 Claude Code ≥ v2.1.295 的机器上进行。
4. **`redactForLog` 的已知边界：** 仅替换已知禁名下的值；敏感值若藏在未知字段名下会残留（测试已锁定该行为）。隐私保证依赖 allowlist `sanitizeHookInput`；原始 Hook JSON 即使经过 `redactForLog` 也不得作为“已脱敏”依据随意记录，诊断日志只应用于已知 Hook 形状。
5. **真实 SQLite 泄漏扫描不在本任务内：** 验收标准中的 “SQLite 中 0 次出现” 在本任务以序列化事件模拟持久化文件（临时 jsonl）+ 适配器输出 + 日志三处 0 次来验证；T007 建 store 后需对真实 SQLite 文件重做 canary 扫描（T012 回归）。
6. **路径密钥未生成：** 适配器只接受注入的 `pathKey`；密钥生成、轮换与落盘属 T007。测试使用固定合成密钥 `synthetic-test-path-key-001`。
7. **`session_id` 原样用作 `sessionScopeId`：** 项目书 §6.4 明确允许持久化会话/租约作用域标识；未做额外哈希。如终审要求会话 ID 也须 HMAC 化，事件契约需同步调整（T004/T007 会受影响）。
8. **无新依赖：** 仅用 Node 内置 `node:crypto` + T002 已锁定的 `yaml`（配置解析）；lockfile 未变。

## next_task

- T004 — Guidance Lease 确定性状态机（输入：本任务 `src/contracts/events.ts` 事件契约、`src/hooks/adapter.ts` 的 `WriteCheckRequest`、`src/privacy/sanitize.ts` 的 `computePathId`；`src/hooks/index.ts` 与 `src/contracts/index.ts` 为公开入口）。T004 可直接复用：`adaptHookEvent`（事件输入）、`WriteCheckRequest`（写前门输入）、`computePathId`（路径标识）、`isGuidancePulseEvent`（契约守卫）。
