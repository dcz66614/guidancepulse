# HANDOFF — T002 Guidance Rule Schema 与配置校验

- task_id: T002
- base_commit: 627ba79
- result_commit: 036d718fa9088d2c8430bed04b3763a0e74ec84a
- project_id: P025
- spec_version: 1.0.0
- go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布，施工不等于 GO）
- goal: 冻结规则字段、默认值、Glob 语义和冲突决策；建立可校验的规则 Schema 与配置解析器。
- date_utc: 2026-11-15

## inputs

- `00_control/PROJECT_BOOK.md`（重点 §4、§5、§7）
- `00_control/IMPLEMENTATION_PLAN.md`（重点 §5 T002 卡）
- `02_source/docs/environment/T001_ENVIRONMENT.md`（Node v24.22.1、npm 10.9.4；Claude Code 未安装）
- base commit 627ba79（含 T001 全部成果）

## changed_files

- `02_source/package.json`（新增；guidancepulse 1.0.0，scripts：test / test:config / typecheck）
- `02_source/package-lock.json`（新增；锁定依赖，`npm ci` 已验证通过）
- `02_source/tsconfig.json`（新增；strict: true，NodeNext，ES2022）
- `02_source/vitest.config.ts`（新增）
- `02_source/src/config/types.ts`（新增；规则模型、默认值、类型）
- `02_source/src/config/errors.ts`（新增；带 code + dotted path 的 ConfigError）
- `02_source/src/config/glob.ts`（新增；Glob 校验、规范化、段式匹配）
- `02_source/src/config/parse.ts`（新增；YAML 解析 + 全量校验 + 默认值解析 + aggregateModes）
- `02_source/src/config/index.ts`（新增；模块公开入口）
- `02_source/schemas/guidance-rule-v1.schema.json`（新增；JSON Schema draft 2020-12）
- `02_source/guidancepulse.example.yaml`（新增；与项目书 §4.1 示例一致，另加一条默认规则）
- `02_source/tests/unit/config.test.ts`（新增；76 个边界单测）
- `02_source/artifacts/test-logs/T002_test-config.log`（新增；验收日志）
- `02_source/artifacts/test-logs/T002_typecheck.log`（新增；验收日志）
- `.gitignore`（新增；node_modules/、dist/；node_modules 未入版本库）

未触碰禁区：`src/hooks/**`、`src/core/lease-machine.ts`、Oracle（`tests/oracle/**`）、其他项目、Drive 总索引、用户 `.claude/settings*.json`。未改动任何规格文件。

## frozen_semantics（与项目书一致的部分 + T002 冻结决策）

与项目书一致（PROJECT_BOOK §4.1 / §5.3 / §5.4）：

- 默认值：`mode: warn`、`max_successful_edits: 5`、`unobservable_read: deny`。
- 冲突决策：多规则命中同一写入目标时 `block > ask > warn`（§5.4），由 `aggregateModes()` 导出，供 T005 复用。
- 示例配置与 §4.1 示例一致（auth-change-safety，`src/auth/**`、`src/session/**`，implementation/review，block/5）。

T002 冻结、规格未明文写出的决策（已写入 `src/config/types.ts` 头部注释，待 T013 审查确认）：

- `version` 必须恰好为 1；`rules` 必须为非空数组（不设防的空配置被拒绝）。
- `phases` 与规则 `id` 为 slug：`^[a-z0-9][a-z0-9_-]*$`（phase ≤64 字符，id ≤128 字符）。
- 规则省略 `phases` 时解析为全部已声明 phases（解析输出中显式展开）。
- `max_successful_edits` 为整数 0..10000（0 = 该租约永不放行写入；规格只定默认值 5，上限 10000 为 T002  sanity bound）。
- Glob 语义：相对 POSIX 路径；`**` 仅作整段出现、匹配 0..n 段；`*`/`?` 不跨 `/`；`[...]` 支持范围与 `!`/`^` 否定；非法 Glob（空串、绝对路径、`..` 段、空段、尾部 `/`、反斜杠、内嵌 `**`、`***`、未闭合 `[`）一律拒绝。
- `source` 为字面相对文件路径，不接受 Glob 字符、绝对路径、`..` 段。
- 未知字段在任何层级都被拒绝；不静默修剪、丢弃、去重或强制转换——前后空白、数组内重复项均为错误。
- JSON Schema 仅为交换契约；TS 解析器是权威校验器（跨字段规则：phase 归属、重复 id、完整 Glob 语法、数组重复项，JSON Schema 无法表达）。

## commands

在 `02_source/` 内运行（Node v24.22.1、npm 10.9.4；`npm ping` PONG 503ms，registry 可达）：

```bash
npm ci
npm run test:config
npm run typecheck
```

## exit_codes

- `npm ci`: 0
- `npm run test:config`: 0（76 passed / 76，1 个测试文件）
- `npm run typecheck`: 0（0 错误）

## test_summary

- 76 个配置边界单测全部通过（任务卡要求 48 个，实际 76 个）：
  - 有效解析/默认值解析：7 个（含示例文件解析、最小配置、部分 defaults、规则覆盖、0 与 10000 边界）
  - Glob 语义与路径规范化：11 个
  - 冲突聚合（block > ask > warn）：4 个
  - 拒绝情形（表驱动 `it.each`）：51 个——空/标量/数组顶层、YAML 语法错、version 缺失/2/字符串/1.5、phases 缺失/空/重复/大写/空格、rules 缺失/空/非映射、id 缺失/重复/大写/空白、source 缺失/空/空项/绝对/`..`/Glob 字符/重复、applies_to 缺失/空/空串/未闭合 `[`/`***`/内嵌 `**`/绝对/`..`/反斜杠/空段/尾部 `/`/重复、未知 mode、未知 unobservable_read、未声明 phase、空/重复 rule phases、三级未知 key、max edits 负数/非整数/超上限
  - JSON Schema 交叉核对（ajv 2020）：3 个——示例通过、未知 mode 失败、缺 rules 失败
- 重复 ID、非法 Glob、未知 mode、空 guidance source 均明确拒绝（带 code 与 dotted path 的 ConfigError）。
- 示例配置可通过校验（TS 解析器 + JSON Schema 双重通过）。

## log_paths

- `02_source/artifacts/test-logs/T002_test-config.log`
- `02_source/artifacts/test-logs/T002_typecheck.log`

## sha256

- `02_source/schemas/guidance-rule-v1.schema.json`: bbd768538987d1f5e70d2b5bfdc00ffd50ee839e71a12509b287c82b1b91c8db
- `02_source/guidancepulse.example.yaml`: ddf087effbc116759e0cbd5a3ebffa6a179ec977bdb7c070e96f140d2bd1a6a6
- `02_source/src/config/errors.ts`: b9366e9e976ba35cf996a5ba8d4bce5d05c453980dee5b55146e95c3ea11ac41
- `02_source/src/config/glob.ts`: 339b3d16fccca790792e1c06a4982e38bdf4dbf2778952a25c592044580789e1
- `02_source/src/config/index.ts`: bfc85cf7efcbe3e20b8043869751a19523cd240b3e876f14bfead5881f8bcb02
- `02_source/src/config/parse.ts`: 1f8098349f31e8b0113f9f3a367a75c03812da37e2f183a1b39828df6a23c421
- `02_source/src/config/types.ts`: 7d638972df6282795a1c59da81201fe8c5b28747eac39098e65b7e2307326d02
- `02_source/tests/unit/config.test.ts`: 13cfacc22cfe71835bc17b634465e30b35be907e9958023c6aa919b7f71d0d02
- `02_source/package.json`: 0456dc241b2dcfcd0085770d3d59080a0c72ba48c929931a9a0ff77f8f0d63f1
- `02_source/package-lock.json`: f2f7fa940346f5a2fdcb319c82dfd92edafec012b7afa5ba04514697d9f50f03

## known_limits

1. **规格引用错位（已记录，未擅自改规格）：** 任务卡称接口契约以项目书 §7.2 为准，但项目书 §7.2 是 UI 颜色/文案节，无 Schema 字段；本任务实际以 §4.1（示例配置）、§5.3（编辑预算）、§5.4（决策聚合）为准。已在 `src/config/types.ts` 头部注释注明，请总协调员确认是否需规格勘误。
2. **Glob 语法为 T002 冻结、规格未明文规定**（见上 frozen_semantics），待 T013 审查；若终审改动语法，T002 测试与 JSON Schema 需同步更新。
3. **`max_successful_edits` 上限 10000 为 T002 自定 sanity bound**，规格只定默认值 5；终审可调整。
4. **依赖：** 运行时依赖仅 `yaml@2.8.1`；开发依赖 `typescript@5.9.3`、`vitest@3.2.4`、`ajv@8.17.1`、`@types/node@24.10.1`，均为免费开源 MIT/Apache 许可，已锁定于 package-lock.json；`npm ci` 验证通过。
5. **本任务不涉及真实 Hook 触发验证**（Claude Code 本机未安装，见 T001）；配置解析为纯函数，无 I/O、无网络、无随机性。
6. 测试中 `ajv` 的 2020-12 编译需用 `ajv/dist/2020.js` 具名导入 `Ajv2020`（默认 `ajv` 入口为 draft-07 且默认导入在 `moduleResolution: NodeNext` 下不可构造）；已在测试中处理，无产品代码影响。

## next_task

- T003 — Claude Code Hook 事件适配器与隐私净化（输入：本任务 `src/config/**` Schema 与 `matchGlob`/`aggregateModes` 接口；`src/config/index.ts` 为公开入口）。
- T003 可直接复用：`parseConfigYaml`、`parseConfig`、`matchGlob`、`normalizeTargetPath`、`aggregateModes`、`ConfigError`。
