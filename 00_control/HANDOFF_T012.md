# HANDOFF — T012 集成、E2E、离线与隐私回归

- **task_id:** T012
- **base_commit:** d8eca78
- **project_id:** P025
- **spec_version:** 1.1.0
- **result:** PASS — 验收命令全部退出 0；S0 复核 PASS；全链路真实通过

## goal

验证完整用户路径和本地运行：安装→Read→FRESH→Write allow→
PreCompact→EXPIRED→Write deny→Read→FRESH 全链路；无外部请求；
隐私扫描无敏感字段。

## changed_files（工作 commit）

新增测试（全部真实跑，无 mock 的门禁/存储/适配器）：

- `02_source/tests/integration/t012-helpers.ts`（新增）— 共享
  驱动：真实 `installProject`（真实 tsc Hook 构建）建临时项目、
  以纯 `node` 子进程跑已安装的 `.guidancepulse/hooks/*.js`
  启动器（与 Claude Code 的调用形状一致）、只读打开真实
  SQLite 读租约、canary 持久化扫描、canary 输入构造。
- `02_source/tests/integration/full-chain.test.ts`（新增，2 测试）
  — 验收全链路：安装→Read（InstructionsLoaded）→FRESH→Write
  allow→PreCompact→EXPIRED/CONTEXT_COMPACTION→Write deny→
  再读（PostToolUse Read 成功）→FRESH→Write allow；另含
  Read 前 Write（UNSEEN/block）DENY 与项目外路径 Write 被忽略
  的对照。租约状态每次都在真实 SQLite 里复核，不只看 Hook
  stdout；审计轨迹断言 WRITE_CHECKED 决策序列
  `[DENY, ALLOW, DENY, ALLOW]`。
- `02_source/tests/integration/offline.test.ts`（新增，2 测试）
  — 静态扫描：S0 门的同一批网络调用点模式（`fetch(`、
  `node:http`、`WebSocket(`、`http.request`、代码内 URL 字面量
  等）扫 `src/` + 已发布的 `scripts/hook-entry.ts`，0 命中；
  运行时：在 `unshare -rn` 新建的无任何网口的网络命名空间里跑
  Read→FRESH→Write allow→PreCompact→EXPIRED，决策与退出码与
  有网时完全一致（先用 TCP 连接探测确认该命名空间确实无网，
  否则证明是空洞的）。
- `02_source/tests/e2e/cli-chain.test.ts`（新增，1 测试）— 真实
  `bin/guidancepulse` 启动器全程：init→install `--project .`→
  status→phase set→已安装启动器 Hook 往返→uninstall→status。
  该测试发现并覆盖了一个真实缺陷（见下“fix”）。
- `02_source/tests/e2e/privacy-scan.test.ts`（新增，1 测试）—
  隐私回归：canary（Prompt、源码体、API key、transcript 路径、
  canary cwd，含 Write 工具体内的 canary）经 Hook 输入进入系统
  后，SQLite/WAL/config/settings 字节扫描 0 命中；隐私导出
  `exportEventsJson` 无禁用字段名、无 canary 值，同时仍含真实
  审计轨迹；`deleteSessionData` + VACUUM 后行数归零、字节仍干净。
- `02_source/package.json` — 新增 `test:e2e`、`test:integration`、
  `test:offline`；`test:privacy` 扩展为单元隐私套件 +
  E2E 隐私回归。
- `02_source/.gitignore` — 新增 `.tmp-t012-*/`（与 T011 同款
  树内临时目录，better-sqlite3 解析所需）。
- `02_source/artifacts/test-logs/T012_*.log`（新增 7 个）— 各
  验收命令完整输出。

修复（T012 E2E 发现的真实缺陷，1 行，附回归测试）：

- `02_source/src/cli/main.ts` — `guidancepulse phase set <id>`
  此前恒以 `INVALID_ARGUMENTS` 失败（退出 1）。根因：`main.ts`
  把 `phase` 之后的参数 `rest`（`["set", <id>]`）直接传给
  `parsePhaseArgs(["guidancepulse", ...rest])`，而该函数要求
  `["guidancepulse", "phase", "set", <id>]`。T006 单元测试直接
  调 `parsePhaseArgs` 传完整参数，所以从未覆盖这条分发路径；
  T011 交接只记录了“无作用域选择参数”的限制，未发现此问题。
  修复为 `parsePhaseArgs(["guidancepulse", "phase", ...rest])`，
  手动复现验证前后行为，CLI E2E 测试将其作为回归覆盖。
  另观察（未改，T006 原有行为）：`phase set bogus` 可成功，
  `validatePhaseId` 不传 `allowedPhases` 时只校验 slug 格式，
  不校验是否为 config 声明的 phase；是否收紧属 T013/后续事项。

未修改 `00_control/` 下任何规格/历史文件；未动 S0 源码与
Golden；无对外发布、无 GitHub 上传。

## 验收（全部真实运行，2026-11-15 ~15:56–15:59 GMT）

| 命令 | 退出码 | 证据 |
|---|---|---|
| `npm test` | 0 | **381/381 通过**（20 文件；T011/FIX-T011 时 375，新增 6 个 T012 测试） |
| `npm run test:e2e` | 0 | 2/2 通过（CLI 全程 + 隐私回归） |
| `npm run test:offline` | 0 | 2/2 通过（静态扫描 0 命中；无网命名空间内链路一致） |
| `npm run test:privacy` | 0 | 16/16 通过（单元隐私 15 + E2E 隐私回归 1） |
| `npm run typecheck` | 0 | 0 错误 |
| `npm run build` | 0 | vite 构建成功（dist/index.html 0.41 kB，JS 234.60 kB） |
| `npm run s0:gate` | 0 | **S0 overall verdict: PASS**（见下） |

## 全链路验证情况

- 安装：真实 `installProject`，6 条自有 Hook，`tsc` 构建成功；
  E2E 里 `--project .` 落在调用者目录（FIX-T011 行为保持）。
- Read→FRESH：InstructionsLoaded 加载 `CLAUDE.md` 后租约
  `FRESH`（`phaseId=implementation`，`remaining=5`，
  `lastConfirmedReadUtc=T1`）；第二轮重读走 PostToolUse Read
  成功路径，同样恢复 `FRESH`（`lastConfirmedReadUtc=T5`）。
- Write allow：FRESH 租约下 PreToolUse Write
  `src/auth/login.ts` 返回 `permissionDecision: allow`、exit 0。
- PreCompact→EXPIRED：返回 `persisted: true, blocked: false`，
  `invalidatedGuidanceIds` 含 `auth-change-safety`；租约
  `EXPIRED / CONTEXT_COMPACTION`，`lastConfirmedReadUtc` 仍为 T1。
- Write deny：EXPIRED 租约下同一 Write 返回 `deny`、exit 2；
  Read 前（UNSEEN）同一 Write 同样 `deny`、exit 2。
- 审计轨迹：`WRITE_CHECKED` 决策序列 `[DENY, ALLOW, DENY,
  ALLOW]`；`READ_SUCCEEDED` ×2、`PRE_COMPACT` ×1、
  `WRITE_CHECKED` ×4。
- 离线：静态扫描 0 命中；`unshare -rn`（无任何网口，含
  loopback）内链路决策与退出码与有网时完全一致。
- 隐私：5 类 canary 在 SQLite/WAL/config/settings 字节中
  0 命中；Hook stdout/stderr 0 命中；绝对项目路径 0 持久化；
  隐私导出无禁用字段名、无 canary；删除会话后字节仍干净。

## S0 复核（T012 不得破坏 S0）

- 命令：`npm run s0:gate`，退出码 **0**，**S0 overall verdict:
  PASS**（2026-11-15 15:59:24 UTC）。
- 七项全过：parity 48/48；detection 32/32；control 16/16；perf
  p95 **241.51ms** < 500ms（p50 162.91ms，p99 285.67ms，
  cold start 516.76ms——冷启动计入 n=100，门只看 p95，符合
  §9.6）；100 次 replay 恰好 1 个 canonical SHA
  `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`
 （与此前一致，未变）；网络请求 0；隐私 canary 0。
- `artifacts/s0/S0_GATE.json` sha256
  `bcc7fd5bffe6198c453d791a46685b89019f35ca52e2bec19470f6ee9b76343a`。
- 与 T011/FIX-T011 的做法一致：本次两个 commit **不含**
  `artifacts/s0/` 的刷新文件，S0 产物归属仍由 T010/T013 的证据
  管理决定。

## blocked_external（确实需要 live Claude Code 才能验证的部分）

- **真实 Hook 触发**：本机未安装 Claude Code（`claude
  --version` 退出 127，与 T001 事实一致），无法验证 Claude
  Code 实际加载 `.claude/settings.local.json` 并在真实会话中
  触发 Hook。缺失条件：装有 Claude Code ≥v2.1.295 且已登录的
  机器。
- **`onFailure: "block"` 的端到端 fail-closed**：配置中
  PreToolUse/PreCompact 的 `onFailure: block` 只有在 Claude
  Code 内部失败时才生效；本机只能验证 Hook 子进程自身的
  exit 2（DENY/内部错误），不能验证 Claude Code 收到失败后
  是否阻止操作。缺失条件：同上。
- **真实会话中的 Read 观测**：本机的 Read 均由合成
  InstructionsLoaded / PostToolUse JSON 驱动；真实会话里
  Claude Code 何时发出 InstructionsLoaded、PostToolUse Read
  的 `tool_response` 形态是否与合成输入一致，需在 live 会话
  中对照验证。缺失条件：同上。
- 上述三项均未假装通过：本交接与测试注释中明确标注；T012
  的通过范围是“Claude Code 会驱动的完整 Hook 入口链路（含
  相同输入、相同子进程形状、相同退出码）+ CLI 全程 + 离线/
  隐私回归”。
- 不需要登录/订阅的操作均未尝试登录、未输入任何凭证、未安装
  需登录的组件。

## 失败回退

- 本轮无 FIX-T012 事项：唯一失败（CLI E2E 初跑 `phase set`
  退出 1）是真实缺陷，已在当轮修复并回归覆盖（见上），日志
  与 Fixture 均保留在测试与 `T012_*.log` 中；S0 原始证据未被
  覆盖（`artifacts/s0/` 未随提交入库）。

## sha256

```text
b75be92a673409c0ad657854bf03672ea0813dd144c6b77c7718e15c5bf7e49e  tests/integration/t012-helpers.ts
93c9b5f19c83881322a996a56557ad3408fcc5932ebb21628d77f23ad7c24f93  tests/integration/full-chain.test.ts
c3986b5cfb8875edab27b450c085c8a6cba49ea14e4dd245277dd621b79a8bea  tests/integration/offline.test.ts
3d9d42540ecce15759b895e61d1b87ea3664ceac025c970591e3c4dcc486c52a  tests/e2e/cli-chain.test.ts
b28602f49547dd88df9076b8f0184525bfcca32989c5ee5d1441cd542cd5ed8a  tests/e2e/privacy-scan.test.ts
867adea47b147bc4a6b5dd15958b95c6b800023a23c921ac6e8ac133d1730073  src/cli/main.ts
233db9f262bd9d06789b584b5f49e6f1924650ab21c29f8c65b9c4af7ff8dbe8  package.json
51e6329e2631540fc7aadb3b84b7bf6554735840abbcf44b5289cac81702c193  .gitignore
f30632ff85a1ff6c13a815857519e2ad73b531d2857e4faf5f50500a0ec4b9b4  artifacts/test-logs/T012_build.log
4577c5c41f42981f13558043637c72ee632d44e31766f0722f9e8edf3ea42bfc  artifacts/test-logs/T012_npm-test.log
9399b09680a70daab78f24506fc719b75e35da647d82255cbbbee2089f6ea383  artifacts/test-logs/T012_s0-gate.log
238c1a9d4e935b8928e9cb7c22cd8470f236e8772e31b20b32e7dd1561004683  artifacts/test-logs/T012_test-e2e.log
05889550fd58db89c4593a2b0d250b3f942e4b9c5646b48cff8b356a8f49c0e5  artifacts/test-logs/T012_test-offline.log
78fd05c43be95d9cc5849cb0aa5cee810fa76a8720d677398f3efcf861b6f4ec  artifacts/test-logs/T012_test-privacy.log
15f54652b887d21940eba66224fcdfaaf3043100668283c0b9865f2ffc6443d7  artifacts/test-logs/T012_typecheck.log
bcc7fd5bffe6198c453d791a46685b89019f35ca52e2bec19470f6ee9b76343a  artifacts/s0/S0_GATE.json (S0 复核，未入库)
```

## next_task

- **T013 最终审查**（前置：T012 PASS——已满足）。复核点：
  `phase set` 分发修复、E2E 覆盖范围、blocked_external 三项
  的 live 机器验证计划、离线静态扫描的范围说明（S0 门 harness
  因自含模式串而排除在扫描外，见 offline.test.ts 注释）。
- T014 发布冻结时：`phase set bogus` 可成功的问题（CLI 不校验
  config 声明 phase）是否收紧，由审查决定。
