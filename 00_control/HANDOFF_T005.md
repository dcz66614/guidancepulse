# HANDOFF_T005 — PreToolUse 写前提醒/询问/阻止

- task_id: T005
- base_commit: 7a081b4
- result_commit: 5fb5669919752a7b498300cd0b633b8b2e0d1a10
- project_id: P025
- spec_version: 1.0.0
- go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布，施工不等于 GO）
- date: 2026-11-15

## goal

对 Claude Code 原生 Write/Edit 工具实施同步凭证检查（项目书 §5.4，
计划书 §5 T005 卡）：warn 附加上下文不改变权限流，ask 返回
`permissionDecision: "ask"`，block 返回 `"deny"` + 退出码 2，
Hook 自身失败时严格模式 fail closed。

## changed_files

| 文件 | 说明 |
|---|---|
| `02_source/src/hooks/decision.ts` | 纯函数：`WriteDecision` → Claude Code PreToolUse Hook JSON 输出（`hookSpecificOutput.permissionDecision` / `additionalContext`）；`hookExitCode`（DENY→2，其余→0）；无规则门时输出 `{}`（不表态）；失败关闭输出（仅错误码）；理由串只含 guidance id / 状态 / mode / 失效原因码，不含原始路径、Prompt 或源码 |
| `02_source/src/hooks/pre-tool-use.ts` | `handlePreToolUse`：T003 `adaptHookEvent` → T004 `matchRules(config, target, livePhase)`（live phase 精炼）→ T004 `checkWrite` 经 T007 `checkWriteAndPersist`（懒失效原子持久化）→ 每条受门规则一条 `recordEvent(WRITE_CHECKED)` → `buildHookOutput`；任何内部错误（畸形 Hook、缺 file_path、store 失败、审计写失败）一律 fail closed DENY + exit 2 + 仅错误码；结果附 `canonicalLeaseSnapshot`（T009/T010 确定性辅助，取不到时为 `""`，不影响裁决）；`recordSuccessfulWrite`（T004 `recordWriteOutcome` 经 T007 持久化，PostToolUse 成功路径调用，PreToolUse 门本身不扣预算）；`checkWrite` 原样 re-export 供 T009/T010 复用 |
| `02_source/src/hooks/index.ts` | hooks 模块公开入口增加 decision / pre-tool-use 的 re-export（T003 代码未改语义；`adapter.ts`、`lease-machine.ts` 只读复用，未修改） |
| `02_source/tests/unit/pre-tool-use.test.ts` | 29 个测试：decision 纯映射 6 个；无门（Bash、未匹配路径、项目外绝对路径、live phase 下规则未激活）4 个；受门裁决（UNSEEN block DENY + WRITE_CHECKED 审计、Edit 同门、FRESH ALLOW、项目内绝对路径相对化、PreCompact 后 EXPIRED DENY、warn/ask、block > ask > warn 聚合、block FRESH + warn UNSEEN → WARN）9 个；live cwd/phase fail closed（CWD_MISMATCH / PHASE_MISMATCH 懒失效持久化 + 快照含原因码、未知 phase null 不放行）3 个；错误 fail closed（缺 file_path、非对象输入、store 关闭）3 个；adapter ruleIds 与 `matchRules(phase=null)` 一致 1 个；`recordSuccessfulWrite`（成功扣 1、失败不扣、扣尽 EXPIRED 后下次写 DENY、无 FRESH 租约返回 undefined）3 个 |
| `02_source/artifacts/test-logs/T005_*.log` | 验收日志（见 log_paths） |

未改动：`src/hooks/adapter.ts`、`src/core/lease-machine.ts`、SQLite
Schema、UI、Oracle、`package.json` / `package-lock.json`（按任务卡，
本次不改，脚本由协调员事后统一加）、Drive 总索引、用户现有
`.claude/settings*.json`、其他任何项目。

## commands

在 `02_source/` 内运行（本次不改 `package.json`，按任务卡用 npx
直接跑测试文件）：

```bash
npx vitest run tests/unit/pre-tool-use.test.ts
npm test
npm run typecheck
```

## exit_codes

| 命令 | 退出码 |
|---|---|
| `npx vitest run tests/unit/pre-tool-use.test.ts` | 0（29/29） |
| `npm test` | 0（275/275，全量无回归；基线 218 + T005 29 + 并行 T006 的 28） |
| `npm run typecheck` | 0（0 错误） |

## test_summary

- 未读/过期租约在 block 模式下不能通过：UNSEEN block → DENY +
  exit 2；PreCompact 后 EXPIRED → DENY；cwd/phase 不一致懒失效
  （CWD_MISMATCH / PHASE_MISMATCH）→ DENY，且失效原因持久化进
  租约行与 `canonicalLeaseSnapshot`。
- 有效租约正常通过：同 scope / phase / cwd、预算未耗尽的 FRESH
  租约 → ALLOW + exit 0，WRITE_CHECKED 审计事件 state FRESH。
- 无匹配规则不产生误报：Bash、未匹配路径、项目外绝对路径、live
  phase 下未激活的规则 → 无门 ALLOW，hook 输出 `{}`，0 审计事件。
- 聚合 block > ask > warn：同目标 block + warn → DENY；block
  FRESH + warn UNSEEN → WARN（allow + additionalContext）。
- 失败关闭：缺 file_path（`MISSING_TOOL_FILE_PATH`）、非对象输入
  （`NOT_AN_OBJECT`）、store 关闭（`STORE_CLOSED`）→ 一律 DENY +
  exit 2，仅报错误码。
- 预算：成功写扣 1、失败写不扣、扣尽转 EXPIRED 后下次写 DENY。

## log_paths

- `02_source/artifacts/test-logs/T005_pre-tool-use.log`
- `02_source/artifacts/test-logs/T005_npm-test.log`
- `02_source/artifacts/test-logs/T005_typecheck.log`

## sha256

| 文件 | SHA-256 |
|---|---|
| `02_source/src/hooks/decision.ts` | `ad1b9ba1fa28c367df014cce57e269cc2eb7b6a0111d20bc9e4ab4cc853437e6` |
| `02_source/src/hooks/pre-tool-use.ts` | `8810948cef46e8fa506c786a5e9f8375d325b0ee2b581a00c5fd580a2daf0ce9` |
| `02_source/src/hooks/index.ts` | `6bef6f0b935559963f34eb6ec84c19440df4fc02e5a1f71a149ae2e78bf1a80d` |
| `02_source/tests/unit/pre-tool-use.test.ts` | `2f217cb5ed4beeb3c1c0ff82c0b9ae32ddb125a7ae2ea9fd9b41f8c75a1e473a` |

## known_limits

- 规格引用错位（与 T002–T004、T007 同类，已记录未改规格）：任务卡
  称契约以项目书 §7.2 为准，但 §7.2 实际是 UI 颜色/文案节；本任务
  按实际章节执行——门语义为项目书 §5.4，事件契约为 §6.3，持久化
  字段为 §6.4。
- `livePhaseId` 由调用方（CLI 管理的 phase 状态，T006/T011）提供，
  不在 Hook 输入里；`null`/缺省表示 phase 未知，一律 fail closed
 （FRESH 租约也会因无法验证 §5.2 条件 3 而过期为 PHASE_MISMATCH，
  不放行）。
- 只拦截原生 Write / Edit；Bash、外部进程、IDE 直接写盘不在首版
  写前强制保证内（项目书 §5.5 / §2.2），本任务不声称覆盖它们。
- Hook JSON 输出形状与退出码 2 语义以 T001 对官方 Hooks reference
  的核对为准；本机无 Claude Code（T001 已确认未安装），真实 Hook
  触发行为（`onFailure: "block"` 是否确实阻止写入、Claude Code
  ≥ v2.1.295 的版本门）仍为 NOT_VERIFIED，须在装有 Claude Code 的
  机器上由 T012 验证。
- `WriteDecision` 类型定义在 `src/contracts/events.ts`，未由
  `src/core/index.ts` re-export；`decision.ts` /
  `pre-tool-use.ts` 直接从 contracts 导入（实现中途曾误从 core
  导入导致 typecheck 报错，已修正，`tsc --noEmit` 0 错误）。
- 并行说明：T006 在同时施工；本次 commit 只加了 T005 自有文件
  （`git add` 按路径显式指定），未动 T006 的文件（`cwd-changed.ts`、
  `instructions-loaded.ts`、`pre-compact.ts`、`subagent-start.ts`、
  `src/cli/`、`invalidation-boundaries.test.ts`、`phase-cli.test.ts` 仍
  为 untracked）；全量 `npm test` 275 通过已包含 T006 当时已落盘的
  测试（28 个），无回归。T006 commit 时 `src/hooks/index.ts` 可能
  需要再合一次 export（T006 若也改它，以合并时为准，本文件本次只
  加了 T005 的 export）。
- 本任务执行期间 `npx tsc --noEmit` 曾短暂报出 T006 在写文件中的
  错误（`cwd-changed.ts`、`instructions-loaded.ts`），属并行施工
  中间态，非 T005 代码问题；最终验收时 typecheck 0 错误。

## next_task

T006（压缩、目录、阶段、子 Agent 失效边界；并行施工中）→ T008
（时间轴 UI）→ T009（48 Golden + 独立 Oracle；复用本任务的
`checkWrite` re-export 与 `leaseSnapshot`）；T012 集成时把
`recordSuccessfulWrite` 接到 PostToolUse 成功路径，并把
`livePhaseId` 从 CLI 的 phase 状态注入 `handlePreToolUse`。
