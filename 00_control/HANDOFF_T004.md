# HANDOFF — T004 Guidance Lease 确定性状态机

- task_id: T004
- base_commit: a1c46fe
- result_commit: 7d6c6bf32d92917c3b759d22865143c5d1bedc38
- project_id: P025
- spec_version: 1.0.0
- go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布，施工不等于 GO）
- goal: 实现 UNSEEN → FRESH → EXPIRED 确定性状态机与子 Agent 作用域隔离。
- date_utc: 2026-11-15

## inputs

- `00_control/PROJECT_BOOK.md`（重点 §5 状态机、§5.2 租约身份与 FRESH 条件、§5.3 编辑预算、§5.4 写前算法、§5.5 失效边界、§6.3/§6.4 事件契约与持久化字段；见 known_limits 第 1 条的引用错位记录）
- `00_control/IMPLEMENTATION_PLAN.md`（重点 §5 T004 卡、§4.1 `src/core` 纯函数目录规则）
- T002 成果：`02_source/src/config/`（复用 `matchGlob`、`normalizeTargetPath`、`aggregateModes`；默认值 warn / 5 / deny；冲突聚合 block > ask > warn）
- T003 成果：`02_source/src/contracts/events.ts`（`GuidancePulseEvent`、`WriteCheckRequest`、`isGuidancePulseEvent`、`InvalidationReason`）、`02_source/src/hooks/adapter.ts`（`adaptHookEvent`，只读复用，未修改）、`02_source/src/privacy/sanitize.ts`（`computePathId`，测试用固定合成密钥）
- base commit a1c46fe（含 T001 + T002 + T003 全部成果）

## changed_files

- `02_source/src/core/lease-machine.ts`（新增；纯状态机：`applyGuidanceEvent`、`recordWriteOutcome`、`checkWrite`（§5.4 写前算法）、不可变 `LeaseStore`、`canonicalLeaseSnapshot`、`LeaseError`）
- `02_source/src/core/match-rules.ts`（新增；路径规则匹配器：`matchRules`、`matchRuleIds`、`matchRulesAnyPhase`、`isRuleActiveInPhase`、`ruleMatchesTarget`，复用 T002 glob/规范化）
- `02_source/src/core/index.ts`（新增；模块公开入口，与 `src/config/index.ts` / `src/contracts/index.ts` / `src/hooks/index.ts` 同模式）
- `02_source/tests/unit/lease-machine.test.ts`（新增；33 个单测）
- `02_source/tests/unit/path-matcher.test.ts`（新增；16 个单测）
- `02_source/package.json`（新增 `test:lease-machine`、`test:path-matcher` 脚本；无新依赖，lockfile 未变）
- `02_source/artifacts/test-logs/T004_test-lease-machine.log`（新增；验收日志）
- `02_source/artifacts/test-logs/T004_test-path-matcher.log`（新增；验收日志）
- `02_source/artifacts/test-logs/T004_typecheck.log`（新增；验收日志）
- `02_source/artifacts/test-logs/T004_test-all.log`（新增；全量回归日志）

未触碰禁区：Hook adapter（`src/hooks/adapter.ts` 只读复用，未修改）、SQLite（`src/store/**` 未创建）、UI、Oracle（`tests/oracle/**`）、其他项目、Drive 总索引、用户 `.claude/settings*.json`。未改动任何规格文件。未上传 GitHub、未调付费 API；全部测试数据均为合成数据。

## interface_contract（实现与冻结决策）

契约以项目书 §5（状态机）为准（见 known_limits 第 1 条）。

- 租约身份 `(sessionScopeId, agentScopeId, guidanceId)`（§5.2）；store 中缺席 = UNSEEN，不建 UNSEEN 记录。新 session / 新子 Agent 作用域天然 UNSEEN；`SUBAGENT_STARTED` 对 store 是 no-op（返回同一实例），父租约不受影响——不继承是结构保证，不是标志位。
- `applyGuidanceEvent(store, event, { phaseId, cwdPathId, maxSuccessfulEdits })`：纯函数，返回新 store，永不修改输入。
  - `READ_SUCCEEDED`：签发 FRESH（满预算、记录签发 phase/cwd 与读取时间戳、reason 清空）；重读 EXPIRED 恢复 FRESH；重读 FRESH 刷新（预算重置）；`maxSuccessfulEdits = 0` 时立即签发 EXPIRED（`EDIT_BUDGET_EXHAUSTED`，按 T002“0 = 永不 FRESH”）。
  - `PRE_COMPACT`：失效事件作用域内全部 FRESH 租约（`CONTEXT_COMPACTION`），其他 session/agent 不动。
  - `CWD_CHANGED`：仅失效签发 cwd ≠ `newPathId` 的 FRESH 租约（`CWD_MISMATCH`）；新 cwd 下签发的租约保持 FRESH。
  - `PHASE_CHANGED`：仅失效签发 phase ≠ `phaseId` 的 FRESH 租约（`PHASE_MISMATCH`）；同 phase 下签发的租约保持 FRESH。
  - `WRITE_CHECKED`：输出记录而非状态输入，忽略（预算走 `recordWriteOutcome`）。
  - 畸形事件（非 §6.3 事件）或非法 `maxSuccessfulEdits`（负数/非整数）抛 `LeaseError`，fail closed。
- `recordWriteOutcome(store, scope, guidanceId, "success" | "failure")`（§5.3）：成功仅扣减 FRESH 租约，扣到 0 转 EXPIRED（`EDIT_BUDGET_EXHAUSTED`）；失败永不扣减；缺失/UNSEEN/EXPIRED 租约无变化。
- `checkWrite(store, { sessionScopeId, agentScopeId, cwdPathId, phaseId, rules })`（§5.4）：逐规则判定——缺失 → UNSEEN；已 EXPIRED/UNSEEN → 保持（保留原 reason）；FRESH 且签发 cwd ≠ 当前 cwd → 懒失效 `CWD_MISMATCH`；签发 phase ≠ 当前 phase → `PHASE_MISMATCH`；剩余 ≤ 0 → `EDIT_BUDGET_EXHAUSTED`；否则 FRESH。懒失效写入返回的 `updatedStore`（输入 store 不变，T007 持久化该 store）。决策：无匹配规则 → ALLOW；全 FRESH → ALLOW；否则取非 FRESH 规则的最严 mode（复用 T002 `aggregateModes`，block > ask > warn），映射 block → DENY、ask → ASK、warn → WARN。
- `matchRules(config, targetPath, phaseId)`（§5.4 `match_rules(target, current_phase)` + §5.2 条件 3）：T002 规范化后按 `applies_to` glob 与 phase 过滤，返回配置顺序的规则；`matchRuleIds` 只取 id；`matchRulesAnyPhase` 为 T003 适配器视角（不限 phase，供 T005 用 live phase 细化）。
- 持久化字段只含 §6.4 允许项：状态、phase id、剩余编辑数、失效原因码，另加 §6.3 事件字段（作用域 id、指导 id、HMAC cwd id、时间戳）。无 Prompt、源码、原始路径、内容。
- 确定性：`canonicalLeaseSnapshot(store)` 为按 (session, agent, guidance) 排序、固定键序的 JSON，供 S0 100 次重放单 SHA 使用；同一事件序列两次应用输出同一快照字符串，插入顺序不影响快照。时间戳只取事件自带的 `timestampUtc`，模块内无时钟。

Fail-closed 冻结决策（规格未定未知值情形，已在源码注释中标注、请总协调员/终审确认）：
1. 签发时未知 cwd（`cwdPathId === null`）或未知 phase（`phaseId === null`）的租约无法满足 §5.2 条件 3/4，首个需比较的边界事件或写前检查即将其失效，不猜测。
2. `checkWrite` 时当前 cwd/phase 未知（`null`）同样失效 FRESH 租约，不放行。
3. `matchRules` 的 `phaseId === null` 表示“phase 未知”：不限 phase 匹配（宁可多查一条规则也不静默跳过）；租约侧仍按第 2 条失效，所以未知 phase 永不放行写前门。
4. 不可规范化的目标（绝对路径、`..` 逃逸、空串）匹配 0 条规则；项目外绝对目标的放行判定属 T005 适配器路径（T003 已有 `target-outside-project` 分支），本模块只回答“哪些规则保护该目标”。
5. `checkWrite` 中剩余 ≤ 0 的 FRESH 租约分支是防御性代码：公开 API 下 `recordWriteOutcome` 扣到 0 即转 EXPIRED，正常路径到不了该分支；测试用手工构造的 store 锁定了该分支。

## commands

在 `02_source/` 内运行（Node v24.22.1、npm 10.9.4；无新依赖，未运行 `npm ci`，lockfile 未变）：

```bash
npm run test:lease-machine
npm run test:path-matcher
npm run typecheck
npm test
```

## exit_codes

- `npm run test:lease-machine`: 0（33 passed / 33）
- `npm run test:path-matcher`: 0（16 passed / 16）
- `npm run typecheck`: 0（0 错误）
- `npm test`（全量回归）: 0（180 passed / 180，5 个测试文件：T002 config 76 + T003 hooks-adapter 30 + privacy-sanitizer 25 + T004 lease-machine 33 + path-matcher 16）

## test_summary

- 状态机 33 个：签发 7 个（FRESH 全字段、未读 UNSEEN 三 mode 决策、预算 0 立即过期、过期后重读恢复、FRESH 重读刷新、他指导互不干扰、跨 session 隔离、畸形事件/非法预算抛错）；失效边界 9 个（PreCompact 全作用域失效与跨作用域隔离、空作用域无变化、CwdChanged 新旧 cwd、未知签发 cwd fail closed、PhaseChanged 同/异 phase、未知签发 phase fail closed、SubagentStart no-op 且新作用域 UNSEEN、WRITE_CHECKED 忽略）；编辑预算 3 个（5 次成功扣尽过期、7 次失败不扣减、缺失/已过期租约无变化）；checkWrite 8 个（全 FRESH 与无规则 ALLOW、三 mode 聚合 block > ask > warn、规则顺序保持、cwd/phase 懒失效及输入 store 不变、未知 live cwd/phase fail closed、剩余 0 防御分支、已过期租约保留原 reason、子 Agent 不继承）；不可变性与确定性 5 个（apply 不修改输入、同一序列同一快照、不同序列不同快照、插入顺序不影响快照、快照不含原始路径只含 HMAC）。
- 路径匹配器 16 个：glob+phase 8 个（`**` 匹配、零段匹配、无匹配、phase 过滤、无 phase 规则全 phase、多规则配置顺序、null phase 全匹配、返回完整规则对象、`matchRulesAnyPhase`）；规范化 4 个（反斜杠/`./`/重复分隔符/`..` 消解、不可规范化目标 0 匹配、`*` 不跨段、`?` 单字符与 `[...]` 类）；辅助与错误 4 个（`isRuleActiveInPhase`、`ruleMatchesTarget`、非法 glob 抛 ConfigError、空规则 0 匹配）。
- 中途两次失败已修复并如实记录，均为测试侧错误、实现语义正确：
  1. 首轮 `test:path-matcher` 套件加载失败：GLOB_YAML 流式序列中未加引号的 `[a-c]` 被 YAML 解析器误解，`parseConfigYaml` 抛 `YAML_SYNTAX`。修复：glob 加双引号。实现未动。
  2. 次轮 1 个失败：`src/cache/v12.ts` 预期不匹配，实际被第二条模式 `src/[a-c]ache/*.ts` 兜住（`c` ∈ `[a-c]`）——测试数据设计错误。修复：`?` 模式移至独立目录 `src/ver/v?.ts`。随后又发现 `[a-c]ache` 应匹配 `cache`/`aache` 而非 `acache`（类占 1 字符后接字面 `ache`，共 5 字符；`acache` 为 6 字符），测试期望一并修正。实现未动。
  3. 同轮 `typecheck` 1 个错误：测试从 `lease-machine.js` 导入 `GuidancePulseEvent`，该类型只在 `contracts/events.ts` 导出。修复测试导入来源。实现未动。
- 纯度核查：`grep -E 'Date\.|Math\.random|process\.|fetch\(|readFile|writeFile|require\(|setTimeout|node:' 02_source/src/core/` 0 匹配；无 I/O、无时间、无随机数、无网络依赖。

## log_paths

- `02_source/artifacts/test-logs/T004_test-lease-machine.log`
- `02_source/artifacts/test-logs/T004_test-path-matcher.log`
- `02_source/artifacts/test-logs/T004_typecheck.log`
- `02_source/artifacts/test-logs/T004_test-all.log`

## sha256

- `02_source/src/core/lease-machine.ts`: 1409671febc6cb002d82a66059220e79a61f4607554b400f5e7b7d620c9f9e35
- `02_source/src/core/match-rules.ts`: db21e15a61d9d81d77e22f5b431b2fe0882de5ab01e25b1df973aad1fc0e80ed
- `02_source/src/core/index.ts`: 6f1e8b5beccad4e5470c1c2ffcd21a809ee60a3bea9ada0b2f845e2fb538b6fe
- `02_source/tests/unit/lease-machine.test.ts`: da801614dbf4d01ae9d42c7aab801434e12a979873360ce0ea4f0ccf0cf3a098
- `02_source/tests/unit/path-matcher.test.ts`: 06b30f22eb987f55fb9510cff59d7268e77aa64ba5ca7334413fb63132b377d3
- `02_source/package.json`: a0e3ace03f55d3ba00b6530f579527c091f56a542890aa6e8482c49fc8237b4a

## known_limits

1. **规格引用错位（已记录，未擅自改规格）：** 任务卡称契约以项目书 §7.2 为准，但 §7.2 是 UI 颜色/文案节，无状态机字段；与 T002/T003 的同类错位一致。本任务实际以 §5（§5.1–§5.5）为准，已在 `src/core/lease-machine.ts` 头部注释注明，请总协调员确认是否需规格勘误。
2. **Fail-closed 冻结决策：** 见 interface_contract 第 1–5 条（未知签发 cwd/phase、未知 live cwd/phase、null phase 的匹配语义、不可规范化目标、剩余 0 防御分支）。规格未定这些未知值情形，本任务按“宁可失效/多查也不放行”冻结；如终审要求其他语义，需改实现 + 测试，不可只改期望。
3. **无真实 Claude Code 验证：** 本机未安装 Claude Code（T001 结论）；状态机只验证合成事件序列。真实 Hook 端到端（PreToolUse 延迟、PreCompact 持久化）属 T005/T006/T012，需在装有 Claude Code ≥ v2.1.295 的机器上进行。
4. **无持久化层：** 本任务只产出内存内不可变 store；SQLite 事务/WAL/并发与 HMAC 密钥生成属 T007。`checkWrite` 返回的 `updatedStore` 由调用方（T007）持久化；`canonicalLeaseSnapshot` 是内存快照，不保证与 T007 的磁盘格式一致（T009/T010 的 Golden/Oracle 对照以此快照语义为准，需 T009 确认）。
5. **`PHASE_CHANGED` 同 phase 不失效：** `phase set` 到与签发时相同的 phase 时租约保持 FRESH（按 §5.4 `lease.phase != current_phase` 比较）。如产品语义要求“任何一次 phase set 都失效旧租约”（§5.5 字面），需 T006 在调用前显式处理，本模块不改。
6. **无新依赖：** 仅复用 T002/T003 已锁定模块；lockfile 未变。

## next_task

- T005 — PreToolUse 写前提醒/询问/阻止（输入：本任务 `src/core/lease-machine.ts` 的 `checkWrite`/`recordWriteOutcome`、`src/core/match-rules.ts` 的 `matchRules`、T003 `adaptHookEvent` 的 `WriteCheckRequest`；`src/core/index.ts` 为公开入口）。T005 可直接复用：`checkWrite`（§5.4 算法，含懒失效 `updatedStore`）、`recordWriteOutcome`（成功写后扣预算）、`matchRules(config, target, livePhase)`（live phase 下的规则筛选）、`canonicalLeaseSnapshot`（确定性快照）。
- T006 — 压缩、目录、阶段、子 Agent 失效边界（输入：本任务 `applyGuidanceEvent` 对 `PRE_COMPACT` / `CWD_CHANGED` / `SUBAGENT_STARTED` / `PHASE_CHANGED` 的处理；注意 known_limits 第 5 条同 phase 的语义选择）。
