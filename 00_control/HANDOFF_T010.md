# HANDOFF — T010: S0 Gate、性能、100 次确定性重放

task_id: T010
base_commit: 740dfcf
result_commit: 405b1f9e17125f864185512b66361c4a8d6121b6
project_id: P025
spec_version: 1.0.0
go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布，施工不等于 GO）

## goal

生成可独立复核的 S0 Gate 报告，对全部硬门给出真实 verdict。

## verdict（先说结论）

**S0 = FAIL。7 项硬门 6 项 PASS，唯一失败项是 Hook 端到端 p95：实测 220.22ms（第 2 次 Gate 复跑；第 1 次 203.76ms），阈值 <10ms。按 FAILURE_ROLLBACK，T011/T012/T014 BLOCKED。未降低阈值、未改口径、未删 Fixture、未改生产语义/Golden/Oracle。**

## 七项硬门实测值（逐项）

| # | 硬门 | 实测值 | 阈值 | verdict |
|---|---|---|---|---|
| 1 | 生产/Oracle parity | 生产==Golden 48/48，Oracle==生产 48/48，Oracle==Golden 48/48（逐 fixture 字段比对，含 `--verify-golden` PASS） | 48/48 | **PASS** |
| 2 | 植入错误检出 | 32/32（依据可审计：28 条 stale 写被 DENY/WARN/ASK；S07 终态 EXPIRED PHASE_MISMATCH；W05/S06 中间快照 EXPIRED 后重读恢复；W07 同 cwd 正确不失效） | 32/32 | **PASS** |
| 3 | 控制不误报 | 16/16（全部写决策 ALLOW） | 16/16 | **PASS** |
| 4 | Hook 端到端 p95 | **p95=220.22ms**（n=100，p50=158.58ms，p99=230.67ms，min=142.82ms，max=287.95ms，冷启动 462.13ms，0 次运行失败；第 1 次 Gate 复跑 p95=203.76ms，p50=166.39ms；独立试跑 5 次 p95=163.82ms） | p95 <10ms | **FAIL** |
| 5 | 100 次重放唯一哈希 | 1 个唯一 SHA-256，`ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`（两次独立 Gate 运行 + 一次独立 `repeat:s0` 均相同） | 恰好 1 个 | **PASS** |
| 6 | 网络请求 0 | src/ 34 个文件静态扫描，网络调用点 0；URL 字面量 0；依赖无网络库 | 0 | **PASS** |
| 7 | Prompt/源码持久化泄露 0 | 3 条 S0 canary 在 11 个已落盘文件（含 SQLite + WAL + Gate 产物 + 日志）中命中 0 次 | 0 | **PASS** |

支撑证据：typecheck 0 错误；`npm test` 全量 359/359 通过（基线 347 + 本任务新增 12，无回归）；`test:golden` 53/53；`test:oracle` 自测 + verify-golden 均 PASS。

## inputs

- `00_control/PROJECT_BOOK.md` v1.0.0（§8 S0 门禁、§10）
- `00_control/IMPLEMENTATION_PLAN.md`（§5 T010 卡、§7.3 100 次哈希规则、§7.4 性能测量规则、§9 交接格式）
- T009 成果：`02_source/tests/fixtures/s0/` 48 条、`02_source/tests/golden/expected-v1.json`、`02_source/tests/oracle/reference_oracle.py`（Golden 已由第二独立会话复核 PASS，0 错误）
- T005/T006/T007 生产代码（`src/hooks/pre-tool-use.ts`、`src/hooks/adapter.ts`、`src/store/store.ts` 等；未修改）

## changed_files（18 个文件，commit 405b1f9）

- `02_source/scripts/hook-entry.ts`（新增，Hook 子进程入口：stdin Hook JSON → 已有生产 handler → stdout 决策 JSON + exit code；只接线，不新增语义；GP_CONFIG/GP_DB/GP_PATH_KEY/GP_PHASE/GP_NOW 环境变量）
- `02_source/scripts/s0-replay.ts`（新增，48 条生产重放 + 规范化哈希 + 检出/控制统计；每步租约快照）
- `02_source/scripts/perf-hook.ts`（新增，端到端性能测量库：tsc 编译 Hook 入口 → 全新 `node` 子进程逐次计时；阈值 10ms）
- `02_source/scripts/perf-hook-cli.ts`（新增，`perf:hook` 入口）
- `02_source/scripts/repeat-s0.ts`（新增，100 次重放哈希库）
- `02_source/scripts/repeat-s0-cli.ts`（新增，`repeat:s0` 入口）
- `02_source/scripts/s0-gate.ts`（新增，S0 Gate 编排：typecheck/测试/Oracle/重放/性能/确定性/网络/隐私 + 报告生成 + 退出码）
- `02_source/tests/unit/s0-gate.test.ts`（新增，12 个单测：规范化 JSON、p95 分位、检出计数、重放哈希）
- `02_source/package.json`（新增脚本 `s0:gate`、`repeat:s0`、`perf:hook`、`test:s0` 别名）
- `02_source/artifacts/s0/`（新增 9 个产物）：`S0_GATE.json`、`S0_GATE.md`、`fixture-results.json`、`oracle-results.json`、`perf-hook.json`、`repeat-hashes.json`、`privacy-scan.json`、`network-scan.json`、`logs/s0-gate.log`

未修改任何禁区文件：`src/core/**`、`src/hooks/**`、`tests/golden/**`、`tests/oracle/**` 零改动；未碰其他项目、Drive 索引、用户 `.claude/settings*.json`。未安装新依赖。

## commands（均在 `02_source/` 内运行）

```bash
npm run typecheck
npm run test:golden
npm run test:oracle
npm test
npm run repeat:s0 -- --runs 100
npm run s0:gate
npm run perf:hook -- --runs 100   # 独立复核用，Gate 内已含同等测量
```

## exit_codes

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | 通过（0 错误） |
| `npm run test:golden` | 0 | 53/53 通过 |
| `npm run test:oracle` | 0 | 自测 PASS + verify-golden 48/48 PASS |
| `npm test`（全量） | 0 | **359/359 通过**（基线 347 + 新增 12，无回归） |
| `npm run repeat:s0 -- --runs 100` | 0 | 100 次，1 个唯一哈希 PASS |
| `npm run s0:gate`（第 1 次） | **1** | S0=FAIL（仅 p95 门失败），报告完整写出 |
| `npm run s0:gate`（第 2 次，复算验证） | **1** | S0=FAIL（仅 p95 门失败），哈希与第 1 次相同 |
| `npm run perf:hook -- --runs 5`（试跑） | 0 | 测量完成，p95=163.82ms，verdict=FAIL（测量工具本身退出 0，verdict 在 JSON 内） |

注：`s0:gate` 在 S0=FAIL 时退出 1 是设计行为（DONE_DEFINITION：门全过时退出码为 0）；`perf:hook` 是测量工具，测量完成即退出 0，verdict 以 `perf-hook.json` 为准。

## test_summary

- **Parity**：生产重放 vs Golden 48/48；Oracle 逐 fixture `--fixture <id> --json` vs 生产重放 48/48、vs Golden 48/48；`--verify-golden` PASS (48/48)。三方交叉比对，无一字段不一致。
- **检出 32/32（定义已收紧，见 known_limits 第 1 条）**：28 条 stale 写被非 ALLOW 决策检出；S07（phase 切换致规则失活、无门 ALLOW）以终态 EXPIRED PHASE_MISMATCH 检出；W05/S06（边界后重读恢复 ALLOW）以**中间快照** EXPIRED（CWD_MISMATCH / PHASE_MISMATCH）检出；W07（同 cwd）以“cwd 事件后租约仍 FRESH、last_read 不变”检出（防过度失效）。逐 fixture 的 `detection_basis` 见 `fixture-results.json` 的 `summary.perFixture`。
- **控制 16/16**：全部写决策 ALLOW，无误报。
- **性能（FAIL）**：按 §7.4 全端到端口径——每次计时都是全新 `node` 子进程（tsc 编译的 `hook-entry.js`，非 vite-node），含 Node 启动、better-sqlite3 加载、JSON 解析、SQLite 读取、路径匹配、决策输出与退出；先种子一个 FRESH 租约（PostToolUse Read 子进程调用），5 次预热不计入，100 次计时顺序执行，每次输入均含 3 条 canary 且每次均返回 ALLOW、退出 0。p95 两次 Gate：203.76ms / 220.22ms；min 142–147ms。**裸 `node -e 1` 在本 VM 上已是 89–126ms**（另测：`node import better-sqlite3` 约 97–113ms），即 Node 进程启动本身就超过阈值 9–12 倍；完整 Hook 约 157–210ms。
- **确定性**：100 次完整重放 1 个规范化 SHA-256（`ef06d3…af50`）；两次 Gate + 一次独立 `repeat:s0` 三次结果相同。哈希内容：fixture id、决策、终态租约、**每步租约快照**（cwd 为 HMAC）；墙钟耗时、临时目录、机器路径、性能数据均不入哈希。
- **网络 0**：静态扫描 `src/**/*.ts(x)` 34 个文件，`fetch(`/`axios`/`node:http(s)`/`node:net`/`WebSocket`/URL 字面量等调用点 0 个；依赖只有 better-sqlite3、react、yaml 等，无网络库。dev 脚本 `check-ui-offline.mjs` 的 127.0.0.1 测试服务器不在产品扫描范围内，已在 `network-scan.json` 中注明。
- **隐私 0**：S0 canary（`CANARY-S0GATE-PROMPT-5c1e8a04-syn-101` / `CANARY-S0GATE-SOURCE-7d2b9f31-syn-102` / `CANARY-S0GATE-TOKEN-3a9e6c58-syn-103`）注入每次计时输入的 prompt / tool_input.content / tool_response / transcript_path / env；扫描性能夹具目录（state.sqlite 及其 WAL/SHM、config.yaml、path-key.bin）+ 全部 Gate 产物 + Gate 日志，共 11 个文件，命中 0 次。
- **新增单测 12/12**：规范化 JSON 键排序、p95 分位算法、检出计数（含“篡改 K01 使其忽略 compact 边界则检出降为 31/32”的反向测试）、重放哈希稳定性。
- **复算验证**：`s0:gate` 连续跑两次，第 2 次复现第 1 次的 verdict（FAIL）、哈希（相同）、各 PASS 门数值；p95 作为测量值在 204→220ms 间波动，verdict 不变。临时目录（`.hook-build/`、`.perf-fixture/`）在隐私扫描后删除，证据只留 JSON；重跑 Gate 可完整复现。

## log_paths

- `02_source/artifacts/s0/logs/s0-gate.log`（Gate 全程 transcript，第 2 次运行覆盖第 1 次）
- `02_source/artifacts/s0/S0_GATE.json`（机器可读 verdict + 全部实测值 + 命令与退出码 + 产物哈希）
- `02_source/artifacts/s0/S0_GATE.md`（人工可读摘要）
- `02_source/artifacts/s0/fixture-results.json`（逐 fixture 生产/Golden/检出依据/快照）
- `02_source/artifacts/s0/oracle-results.json`（Oracle verify + 逐 fixture 三方比对）
- `02_source/artifacts/s0/perf-hook.json`（100 次逐次耗时 + 统计 + 冷启动 + 构建信息）
- `02_source/artifacts/s0/repeat-hashes.json`（100 次哈希列表）
- `02_source/artifacts/s0/privacy-scan.json`（逐文件 canary 命中 + sha256）
- `02_source/artifacts/s0/network-scan.json`（扫描范围与命中）

## sha256

```text
72976bd188b9fa10eb1aca4947996a5cd282a6c46cc93dbf01c0ba0044f2cfed  02_source/artifacts/s0/S0_GATE.json
27059dc21c66baf4f5ae9f470653bc6f7519a968c4a559f1e1af6c6dd334de4c  02_source/artifacts/s0/S0_GATE.md
79daa09bbf4a624e5921f66e367fc0c73fe1384344e7beff01648d0561a25f74  02_source/artifacts/s0/fixture-results.json
712e024d5bf681d91522239a449c5678272e3a52e78965a9265500605957df5f  02_source/artifacts/s0/oracle-results.json
bbdeb9b4c63a9fe387bf397139c2c07874b7894bf3fe80ea82a468dde6cac61f  02_source/artifacts/s0/perf-hook.json
1fe3e5429e6ab72141bd2e4b150aecf791508d03d5b55447ef02cba5bba0ecc7  02_source/artifacts/s0/repeat-hashes.json
f7ae6c2bd459193f58d7867d2bdd0c252ae5fb8f31b6db17b16a1ac23265894a  02_source/artifacts/s0/privacy-scan.json
4ceb7c557508d8b9a8b00179982c76c24c2d1cf1f29d5b8e0bc79775c04319a1  02_source/artifacts/s0/network-scan.json
0ed7120f2e7a3f7c0634dc7d690b543c7a5ce782de800272d19973a3338f86a0  02_source/scripts/s0-gate.ts
bf46a296f385335aef85df155161e7361d9c74a76fff3a063dc396b9e2a2c466  02_source/scripts/s0-replay.ts
924c1bd68eb7be9ad3851244aedc9b9dc53d26cba4afbf7db2e6c6998d2c46f6  02_source/scripts/perf-hook.ts
cf4702215685f9ead553bf4bd314bf5dc6bfafa89c722ce2c042cac2f963e7bc  02_source/scripts/hook-entry.ts
686b36e2e7ee4c025237f07fa65a6486952ef98aefde6b572a0062931618732d  02_source/scripts/repeat-s0.ts
ea3d6f6b46a9d487381bee4186f2ef8ae0322348a58686fcd0d42343bd274b34  02_source/tests/unit/s0-gate.test.ts
7da624e9069979e6713019957277421bb0420c75a5ea74c3657f14a12879f4d4  02_source/package.json
```

（以上为第 2 次 Gate 运行产物的哈希；`S0_GATE.json` 自身哈希记于 `S0_GATE.md` 内。规范化重放哈希：`ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`。）

## known_limits

1. **“32/32 检出”的定义在本任务中被收紧并记录在案**：T009 交接原文称 32 条为“植入错误情形”，但 W05/S06/W07 三条的 Golden 期望本身就是 ALLOW + FRESH（边界后重读恢复 / 同 cwd 不失效），只看终态决策+终态租约只能算出 29/32。为此本任务在重放中加入**每步租约快照**，检出按四种可审计依据判定（见 test_summary；逐条 basis 在 `fixture-results.json`）。这不是改口径放水——恰恰相反：快照让 W05/S06 的“边界确实触发过”可被证伪（若实现忽略 cwd/phase 事件，中间快照将无 EXPIRED，检出会掉到 30/32；单测中有对应的篡改反向测试）。W07 的依据是“正确不失效”，防的是过度失效，与另 31 条方向不同，已在报告中单列。
2. **p95 FAIL 是架构级事实，不是测量噪声**：裸 Node 启动 89–126ms 已超阈值 9–12 倍；三次独立测量 p95 为 164ms（5 次试跑）、204ms、220ms（100 次），min 从未低于 142ms。按任务卡要求，未尝试任何“优化口径”或常驻进程绕过。任何架构变更（常驻进程、换运行时、放宽阈值、改测纯函数等）均未实施，只列入第 4 条供主聊天裁决。
3. **性能测量环境是本共享 VM**（linux-x64，Node v24.22.1，4 核共享 1.5 CPU）：p95 在 204→220ms 间波动源于机器负载；但即使取历次最优 min（142.82ms）也仍超阈值 14 倍，verdict 不受波动影响。更快的机器会缩小数值，但 Node 冷启动的数量级决定了 <10ms 在“每次全新子进程”口径下不可达——除非改变架构（见第 4 条）。
4. **供主聊天裁决的架构选项（仅记录，未实施）**：(a) 常驻 Hook 进程/守护进程 + IPC，摊薄启动成本，但与 Claude Code “每次启动 Hook 子进程”的调用模型冲突，需验证宿主是否支持，且引入进程生命周期与并发新风险；(b) 把 Hook 入口编译为单文件 JS 并剪裁启动路径（收益有限：启动本身占大头）；(c) 接受 p95 目标不可达，修订规格阈值（如改为 p95 <250ms 或分冷/热启动两档）——这是规格变更，需 Sam/终审决定；(d) 换更轻的运行时（如 Bun/原生二进制）——超出冻结技术栈，需立项级决策。**在裁决前，S0=FAIL，T011/T012/T014 保持 BLOCKED。**
5. **vite-node 下 `process.argv[1]` 是 vite-node 本身，入口文件不在 argv 中**：库文件（`s0-replay.ts`、`perf-hook.ts`、`repeat-s0.ts`）因此不含 CLI 自检块，CLI 各自由独立的 `*-cli.ts` 承担（无条件执行，本仓库既有模式）；`s0-gate.ts` 无人 import，顶层直接跑 `main()`。测试 import 库文件是安全的。
6. **种子 Read 会给两个规则同时发证**：C01 的 `auth-change-safety` 与 `api-contract` 的 source 都是 `CLAUDE.md`，种子 PostToolUse Read 输出为两个结果的数组；`perf-hook.ts` 的种子断言已按“数组每项均 persisted”处理（初版单对象断言曾误报一次失败，已修正并复测通过）。
7. **Gate 日志只保留最后一次运行**：`logs/s0-gate.log` 每次运行清空重写；第 1 次运行的 transcript 未单独留存，但其 verdict、哈希与 p95 已记入本交接（203.76ms）与 `S0_GATE.json` 的生成记录中。第 1 次运行的产物文件已被第 2 次运行覆盖（内容除 `generated_at_utc`/p95 测量值外相同）。
8. **网络门是静态扫描，不是运行时抓包**：产品 `src/` 无网络调用点是静态事实；运行时 0 请求的结论依赖于“代码无网络调用点 + 无网络依赖”这一静态证据链，未做 strace/代理抓包。如终审要求运行时抓包证据，可在 T012 补做。
9. **性能夹具与 Hook 构建目录在 Gate 结束后删除**：`artifacts/s0/.hook-build/` 与 `.perf-fixture/` 在隐私扫描后清理，证据只留 JSON（含入口源码 sha256 与完整 tsc 命令）；重跑 `npm run s0:gate` 可完整复现。

## next_task

**S0=FAIL，T011/T012/T014 BLOCKED。下一步不是施工，而是主聊天裁决 p95 门的出路（见 known_limits 第 4 条的四个选项）。** 在裁决前无后续施工任务可派发；如裁决为修订规格阈值或架构变更，需先立对应的规格修订/FIX 任务并重新跑 `npm run s0:gate`（Gate 已可独立复算，复跑约 50 秒）。如裁决为接受 FAIL 并终止项目，则以本 Gate 报告归档收尾。
