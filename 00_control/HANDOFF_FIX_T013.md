# HANDOFF — FIX-T013：修复 T013 最终审查 FAIL（F-17 P1 + 一批 P2）

- **任务：** FIX-T013（规格 v1.1.0）
- **基线：** `b402e64`（T013 最终审查：FAIL，P0=0 / P1=1 / P2=14）
- **工作目录：** `~/workspace/p025-guidancepulse/`（只改 `02_source/`；未动 `00_control/` 规格与历史文件；无对外发布、无 GitHub 上传）
- **日期：** 2026-11-15（验收命令实测 ~16:30–16:34 GMT，Node v24.22.1、npm 10.9.4、Python 3.12.3）
- **结论：F-17 已修复并经树外实测验证；所列 8 项 P2 全部修复；S0 仍为 PASS。** 随后由新会话做 T013 重审。

## 1. F-17（P1）—— 根因与修复方案选型

**根因（已亲自复现，与审查报告一致）：** `install` 只做裸 `tsc` 编译，编译产物对 `yaml` / `better-sqlite3` 是裸导入；Node ESM 按文件位置向上找 `node_modules`，树外项目 `.build/` 之上没有任何含这两个包的 `node_modules`。复现：`/tmp` 下全新项目 `init` → `install` → `status` 均成功，但 `post-tool-use.js` 以 `HOOK_ENTRY_FAILED` / `Cannot find package 'yaml'` 退出 2（`NODE_PATH` 也救不了，ESM 忽略它）。

**选型：随装依赖（审查包方向 b），未选打包（方向 a）。** 理由：

- `better-sqlite3` 含原生 `.node` 二进制，任何 JS 打包器都打不进去，最终仍须以文件形式随装；打包只能解决一半问题，却要引入 bundler 配置与 ESM/CJS 互操作风险。
- 随装保持编译产物与 S0 perf  harness 测量的形态完全一致（同为 `tsc` 输出），不改 p95 口径、不碰状态机。
- 零运行时依赖方案（方向 c）改动面过大，未采用。

**实现（新文件 `02_source/src/cli/vendor-deps.ts`，`vendorHookDependencies()`）：**

- `install` 在 `tsc` 成功后，把两个运行时包复制进 `<项目>/.guidancepulse/hooks/.build/node_modules/`：`yaml` 整体（1.3 MB，无运行时依赖）；`better-sqlite3` 只取运行时必需的 `package.json` + `LICENSE` + `lib/` + `prebuilds/`（`deps/`、`src/`、`binding.gyp` 是构建期文件，未复制；其唯一声明依赖 `node-addon-api` 是头文件构建依赖，`lib/` 从不 `require` 它，已核实）。
- 8 个平台的 `.node` 预编译全部复制（约 17 MB/项目），不做平台检测：musl/glibc 判定逻辑微妙（`binding.js` 自己要读 `/proc/self/maps` 嗅探），全量复制最稳妥；项目目录被同步到另一平台后无需重装仍可工作，重装时也会刷新。
- 安装全程离线：本地文件复制，绝不在安装时联网或跑 `npm install`。源码树 `node_modules` 缺失对应包时安装明确失败（`HOOK_BUILD_FAILED`），不装出“能装不能用”的钩子。
- `uninstall` 在设置写成功后移除 `.guidancepulse/hooks/.build/`（编译入口 + 随装依赖，仅自有内容；启动器、配置、DB、路径密钥保留；新增 `UninstallResult.hookBuildRemoved`）。
- `scripts/perf-hook.ts` 计时入口同步随装：`.hook-build/node_modules/` 与真实安装形态一致（随装发生在计时开始前，不计入单次调用耗时）；`perf-hook.json` 新增 `build.dependencies_vendored`。

**树外验证证据（CLI 级，`/tmp/fix-t013-final/proj`，其上层目录无任何 `node_modules`，且显式 `env -u NODE_PATH`）：**

| 步骤 | 退出码 | 结果 |
|---|---|---|
| `guidancepulse init` | 0 | 输出含 `reports/`（F-21 顺带可见） |
| `guidancepulse install --project .` | 0 | 6 条 Hook；`.build/node_modules/{yaml,better-sqlite3}` 就位，8 个 `.node` 预编译齐全 |
| `guidancepulse status` | 0 | `installed: yes (own hooks: 6/6)` |
| 合成 PostToolUse Read（`CLAUDE.md`）→ `post-tool-use.js` | 0 | `{"persisted":true,…,"credentialedGuidanceIds":["auth-change-safety"]}` |
| 合成 PreToolUse Write（`src/auth/login.ts`）→ `pre-tool-use.js` | 0 | `permissionDecision":"allow"`（租约 FRESH） |
| 合成 PreCompact → `pre-compact.js` | 0 | `{"persisted":true,"blocked":false,"invalidatedGuidanceIds":["auth-change-safety"]}` |
| `guidancepulse uninstall --project .` | 0 | `.build/` 已移除，启动器与配置/DB/路径密钥保留 |

另有自动化回归：`tests/integration/fix-t013.test.ts`（9 测试，全部在 `os.tmpdir()` 下树外项目、无 `NODE_PATH` 环境下跑真实 `tsc` + 随装 + 真实 `node` 子进程调用）。

## 2. 各 P2 处理结果

| ID | 处理 | 证据 |
|---|---|---|
| F-22 | 已修：补 `02_source/LICENSE`（MIT，Copyright (c) 2026 dcz66614，与 P024 惯例一致）与 `02_source/THIRD_PARTY_NOTICES.md`（18 个声明依赖，许可证逐一取自已安装的 `node_modules/*/package.json`：直接依赖 better-sqlite3 MIT / react MIT / react-dom MIT / yaml ISC；开发依赖 14 个，12 MIT + playwright-core 与 typescript 为 Apache-2.0；含 better-sqlite3 内含 SQLite（public domain）的说明） | 文件已入库 |
| F-18 | 已修：`src/cli/main.ts` 的 `phase` 分支在项目存在 `config.yaml` 时解析其 `phases` 并作 `allowedPhases` 校验；未声明阶段在持久化前拒绝，错误列出已声明阶段（`phase 'bogus' is not declared … (declared: explore, implementation, review, release); check the spelling — an undeclared phase matches no rule …`，exit 1）。规格依据：PROJECT_BOOK §5.1 的 `phases:` 即声明集合，§6.2 要求当前 phase 在规则允许范围——未声明 phase 本就应被拒绝，不是“允许临时 phase”的情形。无配置时保持仅 slug 校验，并在 stderr 明确告警。`setPhase` 本身仍收 `allowedPhases` 作双保险 | CLI 级回归测试（`phase set bogus` exit 1；`phase set implementation` exit 0；无配置告警） |
| F-19 | 已修：`installProject` / `uninstallProject` 在运行开始时记下设置文件的精确字节（`settingsRaw: Buffer`），失败回滚写回这份字节，不再从最早备份文件恢复；读文件本身失败时不碰文件。最早备份文件语义不变（仍只写一次，作用户手动恢复用）。`docs/USER_GUIDE.md` §6 回滚表述同步修正 | 回归测试：预置最早备份 → 用户改设置 → 注入 `tsc` 失败（`HOOK_BUILD_FAILED`）→ 设置等于改后内容、备份仍为最初内容、失败日志已写 |
| F-20 | 已修：`scripts/hook-entry.ts` 的 `main()` 在 `run()` 外加 `try/catch`：净化/适配抛错（`SanitizeError` / `AdapterError` → `HOOK_ENTRY_INVALID_INPUT`，其余 → `HOOK_ENTRY_FAILED`）走 `fail()`（exit 2 + 一行 code-only stderr），关闭 store 后再退出；与 JSON/初始化失败的既有兜底一致 | 回归测试：`{}`、`{"hook_event_name":123}`、`[]`、`{"hook_event_name":"PreToolUse"}`（缺 tool_name）各 exit 2、stdout 为空、stderr 恰一行 `{"hook_entry_error": …}` |
| F-21 | 已修：`src/cli/init.ts` 把 `reportsCreated` 的 `existsSync` 检查移到 `mkdirSync(reports)` 之前，与其余三项一致 | 回归测试：首次 `init` 返回 `reportsCreated: true` 且 CLI 输出列出 `reports/`；二次 `init` 全 false |
| F-24 | 已修：`README.md` §6.4 allowlist 引用改为 `§7.4`；`src/cli/install.ts` 头注释“see the module footer”（悬空）改为指向 `00_control/HANDOFF_T001.md` 与 `docs/environment/T001_ENVIRONMENT.md`。另：README 的 “Distribution limit” 一节已过时，改写为随装自包含说明；`USER_GUIDE.md` 的安装三件事、卸载保留范围、FAQ 回滚与 HOOK_ENTRY_MISSING 指引同步更新；`installer.test.ts` 与 `t012-helpers.ts` 中“树内选址是解析前提”的过时注释已修正 | 文本核对 |
| F-06（旧）→ F-15 | 已修：Oracle `apply_cwd` 对 `new_cwd is None` 直接返回（忽略），与生产 `adaptCwdChanged`（缺失 old/new cwd → `ignored`）对称；回放处由 `step["new"]` 改为 `step.get("new")`；`--self-test` 新增断言（无 `new` 的 cwd 步骤后租约仍 FRESH） | `test:oracle`：self-test PASS，`--verify-golden` 48/48 PASS |
| F-07（旧）→ F-16 | 已修两处：① 网络扫描（`scripts/s0-gate.ts` gate 6）范围扩到 `src/` + `scripts/hook-entry.ts`（真实运行入口；T012 离线测试早已纳入，S0 门此前未纳入），`network-scan.json` 的 scope 自述同步更新（本次扫描 40 文件，0 命中）。② 隐私扫描追加第二轮：写完 `S0_GATE.json/.md` 后再扫这两个文件，结果记入 `S0_GATE.json` 的 `privacy_second_pass` 与 `privacy-scan.json` 的 `second_pass`，并重写两份报告文件使记录的 sha 与最终字节一致；若第二轮命中则把 gate 7 与总 verdict 翻转为 FAIL（本次 0 命中）。`privacy-scan.json` 本身不在第二轮字节扫描之列——其 `canaries` 字段本就列出被搜字符串，字节扫描会自 flag；第二轮后仅向其追加数字元数据，已在文件中注明 | S0 本次运行：`privacy second pass files=2 total_canary_hits=0`；`network scan files=40 call_site_hits=0` |

## 3. 未修项（按任务裁决）

- **F-03（→ F-13，冷启动样本为 Read 而非 Write）：** 不修。§9.6 未要求冷启动样本全为 Write，已裁决合规。
- **F-11（计划书内引用滞后）：** 不修。涉及 `00_control/` 规格文件，本任务不得改。
- **F-25（p95 方差观察）：** 无动作，未动阈值（仍严格 `<500ms`）。
- **F-05（→ F-14，live Claude Code 端到端）：** 仍 `blocked_external`（本 VM 无 Claude Code）。
- **F-12（旧 F-02，Oracle 文档自述三处边缘语义取自生产源码）：** 仅阅读，未修——不在本次修复清单内，需另立任务重推导语义；F-06 的守卫修的是行为分歧，不改变该文档问题。
- **F-23（v1.1.0 规格目录未入库、工作树不干净）：** 本次未代为入库。`00_control/v1.1.0/`、`P025_SPEC_REVISION_v1.1.0_CONVERSATION.pdf`、`P025_SPEC_V110_VERIFICATION.md` 仍为 untracked，由协调员决定；S0 产物（`02_source/artifacts/s0/`）因本轮 `s0:gate` 重跑而改动，保持未提交（与 T013 审查轮次的先例一致，见下）。

## 4. 验收结果（全部真实跑）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run test:installer` | 0 | 16/16 |
| `npm test` | 0 | **390/390**（21 文件；基线 381，+9 为新增 `fix-t013.test.ts`） |
| `npm run test:e2e` | 0 | 2/2 |
| `npm run test:offline` | 0 | 2/2 |
| `npm run test:privacy` | 0 | 16/16 |
| `npm run typecheck` | 0 | 0 错误 |
| `npm run build` | 0 | vite 构建成功 |
| `npm run test:oracle` | 0 | self-test PASS；`--verify-golden` 48/48 |
| `npm run s0:gate` | 0 | **S0 overall verdict: PASS** |

**S0 七门（本次实测值）：** parity 48/48；检出 32/32（28/1/2/1）；控制 16/16；**p95 = 239.66ms**（n=100，p50=169.64，p99=280.78，min=147.59，max=281.36，cold_start=280.78，cold_start_sample_index=0，run_failures=0；阈值严格 <500ms）；100 次重放恰好 1 个 canonical SHA-256（`ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`，与既往值一致）；网络 0（40 文件）；隐私 0（首轮 11 文件 + 第二轮 2 文件）。p95 口径未变：5 次预热排除、100 次计时含冷启动、每次全新 Node 子进程；计时入口现为随装后形态（`perf-hook.json: build.dependencies_vendored = ["yaml","better-sqlite3"]`）。

## 5. 改动清单（工作 commit 内）

- 新增：`02_source/src/cli/vendor-deps.ts`、`02_source/LICENSE`、`02_source/THIRD_PARTY_NOTICES.md`、`02_source/tests/integration/fix-t013.test.ts`
- 修改：`src/cli/install.ts`（随装、回滚、F-24）、`src/cli/uninstall.ts`（回滚、移除 `.build/`）、`src/cli/init.ts`（F-21）、`src/cli/main.ts`（F-18）、`scripts/hook-entry.ts`（F-20）、`scripts/perf-hook.ts`（随装计时形态）、`scripts/s0-gate.ts`（F-07 两处）、`tests/oracle/reference_oracle.py`（F-06）、`README.md`、`docs/USER_GUIDE.md`、`tests/integration/t012-helpers.ts` 与 `tests/unit/installer.test.ts`（过时注释）

## 6. 提交

- 工作 commit：`98dd8768e7525f6dc5564147fa09a206da012384`（`02_source/` 全部改动；S0 产物改动未入内）
- 交接 commit：见本文件提交（仅本文件 `00_control/HANDOFF_FIX_T013.md`）

## 7. 给重审员的提示

- 复核重点：树外安装（按 §1 表格在干净临时目录重跑一次即可）；`vendor-deps.ts` 的复制子集是否完备（`better-sqlite3` 只取 `lib/` + `prebuilds/` + `package.json` + `LICENSE` 的取舍）；F-19 回滚在 install/uninstall 两处是否一致；S0 第二轮扫描的自洽性（`privacy-scan.json` 不参与第二轮字节扫描的理由在文件中已注明）。
- 已知未覆盖：uninstall 失败回滚的直接回归测试未写——失败注入需写时权限，而本机以 root 运行会绕过权限位；install 侧的同款语义已有回归测试覆盖，uninstall 共用同一“记下本次运行前字节并写回”的实现模式。
- S0 产物（`artifacts/s0/S0_GATE.json` 等）本次重跑后未提交，其中记录的 git commit 仍为旧 HEAD；重审员重跑 `npm run s0:gate` 后会刷新。
