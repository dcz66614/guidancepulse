# HANDOFF — T006 压缩、目录、阶段、子 Agent 失效边界

- task_id: T006
- base_commit: 7a081b4
- result_commit: ed781695dcd78488a9f700b654cad1927913da07
- handoff_commit: （本文件单独 commit 后由协调员在 git log 中核对；本文件不在 result_commit 内）
- project_id: P025
- spec_version: 1.0.0
- go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布，施工不等于 GO）

## 完成内容

实现四类边界事件处理（全部只读复用 T003 adapter / T004 lease-machine / T007 store，未改其中任何文件）：

- `02_source/src/hooks/pre-compact.ts` — `handlePreCompact(store, PRE_COMPACT, {strictMode})`：经 `store.recordEvent` 单事务原子失效当前作用域全部 FRESH 租约（reason `CONTEXT_COMPACTION`，他作用域不动）；持久化失败时严格模式（默认开）返回 `blocked: true`，`exitCodeForPreCompact` 为 2（与 T005 deny 同一约定），非严格模式只报告不阻止。持久化失败以结果返回，不抛错。
- `02_source/src/hooks/instructions-loaded.ts` — `handleInstructionsLoaded`：批量原子持久化适配器给出的 `READ_SUCCEEDED` 事件（签发/刷新 FRESH 租约）；`INSTRUCTIONS_LOADED_CAN_BLOCK = false`，返回值无可为真的 blocked 字段，持久化失败也永不阻止。
- `02_source/src/hooks/cwd-changed.ts` — `handleCwdChanged`：持久化 `CWD_CHANGED`，旧 cwd 签发租约失效（`CWD_MISMATCH`）、新 cwd 签发租约保留；`CWD_CHANGED_CAN_BLOCK = false`，`CWD_REQUIRES_SYNCHRONOUS_RECHECK = true`。竞态由 T005 同步 PreToolUse（`checkWrite` 活 cwd 对比）兜底，本模块不等待任何异步事件。
- `02_source/src/hooks/subagent-start.ts` — `handleSubagentStart`：持久化 `SUBAGENT_STARTED` 事件；新作用域无任何租约行（缺席即 UNSEEN，零继承），同会话其他作用域租约逐项比对确认 untouched（含嵌套子 Agent，不假设父一定是 main）。
- `02_source/src/cli/phase.ts` — `setPhase` / `parsePhaseArgs` / `getCurrentPhase` / `validatePhaseId`：`guidancepulse phase set <phase>`；先记 `PHASE_CHANGED` 事件（T004 处理异 phase 失效），再对仍 FRESH 的租约强制失效（reason `PHASE_MISMATCH`），**同 phase 也不例外**（见 known_limits）。phase id 为 slug，`allowedPhases` 给出时拒绝未声明 phase；校验失败在持久化前抛 `PhaseError`，租约不动。

## changed_files（result_commit 内 11 个文件，全部新增）

- 02_source/src/hooks/pre-compact.ts
- 02_source/src/hooks/instructions-loaded.ts
- 02_source/src/hooks/cwd-changed.ts
- 02_source/src/hooks/subagent-start.ts
- 02_source/src/cli/phase.ts
- 02_source/tests/unit/invalidation-boundaries.test.ts
- 02_source/tests/unit/phase-cli.test.ts
- 02_source/artifacts/test-logs/T006_invalidation-boundaries.log
- 02_source/artifacts/test-logs/T006_phase-cli.log
- 02_source/artifacts/test-logs/T006_npm-test.log
- 02_source/artifacts/test-logs/T006_typecheck.log

未碰：`src/hooks/adapter.ts`、`src/core/lease-machine.ts`（只读）、`src/hooks/pre-tool-use.ts` / `decision.ts`（T005 并行施工）、Store Schema、`package.json` / `package-lock.json`（未改，未加 npm 脚本，由协调员事后统一加）、`src/hooks/index.ts`（未改，避免与 T005 冲突——新模块由测试直接 import，T011/T012 集成时再统一挂 barrel）。

## commands / exit_codes

在 `02_source/` 内运行（本次不改 package.json，按任务卡用 npx 直接跑测试文件）：

| 命令 | 退出码 |
|---|---|
| `npx vitest run tests/unit/invalidation-boundaries.test.ts` | 0（15/15） |
| `npx vitest run tests/unit/phase-cli.test.ts` | 0（13/13） |
| `npm test`（全量回归） | 0（275/275，11 文件；基线 218 全部保持通过） |
| `npx tsc --noEmit` | 0 |

## test_summary

- 验收两命令共 28 个新测试通过：PreCompact 原子失效+跨重启持久化+空作用域 no-op+严格模式阻止（exit 2）/非严格不阻止+拒非 PRE_COMPACT 事件；CwdChanged 旧失效新保留+重读恢复 FRESH+**无 CwdChanged 观察时同步 checkWrite 仍 DENY（CWD_MISMATCH）**+失败不阻止；SubagentStart 新作用域 UNSEEN 零继承、父租约 untouched、子作用域自读只建自有租约；InstructionsLoaded 授信 FRESH+失败仍不阻止+拒非 READ_SUCCEEDED 批次。
- phase-cli 13 测试：异 phase 失效+重读恢复；**同 phase set 也失效（PHASE_MISMATCH），持久化事件仍记真实 phase**；同 phase 跨重启持久化；空/畸形/未声明 phase 拒绝且租约不动；空作用域 no-op；`parsePhaseArgs` 正常/异常；`getCurrentPhase` null→最新。
- 全量 `npm test` 275 通过（218 基线 + 28 本任务 + 29 个 T005 并行新增测试），无回归。
- 过程插曲（已修复，未虚构）：初版处理器在 try 外先读 store，关闭的 store 会抛错而非返回失败结果——已把预读移入 try；`instructions-loaded.ts` 有一处 TS 窄化错误——已修复。另：中途一次 `tsc` 曾报 T005 文件（`decision.ts`/`pre-tool-use.ts`）的错误，T005 随后自行修复，最终全仓 `tsc --noEmit` 退出 0，本任务文件无 typecheck 错误。

## log_paths

- 02_source/artifacts/test-logs/T006_invalidation-boundaries.log
- 02_source/artifacts/test-logs/T006_phase-cli.log
- 02_source/artifacts/test-logs/T006_npm-test.log
- 02_source/artifacts/test-logs/T006_typecheck.log

## sha256（result_commit 时文件内容）

- 02_source/src/hooks/pre-compact.ts: d6dfcf57ba51b0b06a7a95cf0338749f4f755f7f5d02f47792e831308635e1c0
- 02_source/src/hooks/instructions-loaded.ts: e752aa0727114173d049da0826d4a71b9bfd1bda617ec70bc7e0c8bd1a3866e1
- 02_source/src/hooks/cwd-changed.ts: 4b451d22b12357c630b4847d1a94687b454379f02123ae704795aad7ee67e77a
- 02_source/src/hooks/subagent-start.ts: d990da52dab236aa2ed049d33f0610543883a99f3d4885cd7329d1f295e3a457
- 02_source/src/cli/phase.ts: c5590ada784d2dffba286fe2e8e86866a29fd16da090a02ce2862cec74857ebf
- 02_source/tests/unit/invalidation-boundaries.test.ts: b2a9eb1eb02673bc100b8503aea935825ce558fb25c3282cc459848807cc4c0e
- 02_source/tests/unit/phase-cli.test.ts: 4f2082208df0ab6b60a59c9f83d623bc979952c24b974ccc02275d4898b42544

## known_limits

1. **同 phase 语义与 T004 的交互（供 T013 裁决）：** T004 的 `PHASE_CHANGED` 被动事件在同 phase 时是 no-op（租约保持 FRESH）；本任务的 `phase set` 命令在同 phase 时强制失效。区别在意图（事件说“phase 仍是 X”，命令说“用户重新标记了 phase，请重读指导”），两者都保留：状态机未动，命令层在事件持久化后追加强制失效。强制失效复用 `checkWriteAndPersist` 的 fail-closed phase 对比：以该租约自身 cwd + 一个保证不同于其签发 phase 的比较用哨兵 phase id 调用，`checkWrite` 的懒失效把租约记为 `PHASE_MISMATCH` 并持久化；**哨兵只用于比较，永不写入任何租约或事件行**（持久化事件只记真实新 phase，测试已断言）。未加 `store.expireScope` 专用方法是因为 `src/store/store.ts` 是 T007 所有、`src/core` 只读——若 T013 认为哨兵复用不可接受，可改为 store 层专用方法，语义不变。
2. **reason 码口径：** 任务卡写“记 reason PHASE_CHANGED”，实际契约（`InvalidationReason`，T003/T004 冻结）中 phase 失效的 reason 码是 `PHASE_MISMATCH`，`PHASE_CHANGED` 是事件名而非 reason 码；本任务按冻结契约记 `PHASE_MISMATCH`，与 T004 的异 phase 失效一致。
3. **PreCompact 阻止的落地约定：** `exitCodeForPreCompact` 返回 2 表示阻止压缩，沿用计划书 T005 卡“block：deny 或 exit code 2”的约定；PreCompact 的 exit-2 语义尚未由 T001/T011 在真实 Claude Code 上实测，属待集成验证项。
4. **规格引用错位（沿用 T002–T004 做法）：** 计划书 T006 卡称契约以项目书 §7.2 为准，§7.2 实际是 UI 颜色/文案节；本任务按实际章节（项目书 §5.5 失效边界、§5.2/§5.4）执行，未改规格。
5. **`src/hooks/index.ts` 未挂新模块：** 为避免与并行施工的 T005 冲突，未改 barrel；T011/T012 集成时统一挂接。
6. **T005 并行说明：** 施工期间 T005 落了 `decision.ts` / `pre-tool-use.ts` / `pre-tool-use.test.ts` 及 `index.ts` 修改与日志（均未入暂存区/未提交）；本次 commit 只加了 T006 自有文件，未动对方任何文件。`npm test` 275 含 T005 的 29 个测试，系其并行成果计入同一全量运行。

## next_task

T008（时间轴 UI，可在核心接口冻结后开发）或按协调员安排的 T009 Golden Fixtures；T006 的四类边界事件处理器与 `phase set` 已可供 T009 的 compact/cwd/scope/phase 分组 Fixture 直接复用。待协调员统一加 npm 脚本（`test:invalidation-boundaries`、`test:phase-cli`）后，验收命令可改回 `npm run` 形式。
