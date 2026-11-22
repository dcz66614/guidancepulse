# HANDOFF — T009: 48 条 Golden Fixtures 与独立 Python Oracle

task_id: T009
base_commit: 62ed70f
result_commit: fefec48
project_id: P025
spec_version: 1.0.0
go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布，施工不等于 GO）

## goal

构建 S0 的 48 条合成轨迹、手工 Golden Expected 和独立 Python Oracle。

## inputs

- `00_control/PROJECT_BOOK.md` v1.0.0（§5 状态机、§5.3 编辑预算、§5.4 写前算法、§5.5 失效边界、§6.3 事件契约、§8.1 48 轨迹分组）
- `00_control/IMPLEMENTATION_PLAN.md`（§5 T009 卡、§7.2 Fixture 目录、§7.5 Oracle 规则）
- T004 成果 `02_source/src/core/lease-machine.ts`（仅作语义参考，未复制代码）
- T003 事件契约 `02_source/src/contracts/events.ts`、T007 存储字段 `02_source/src/store/schema.ts`
- T005 写前门 `02_source/src/hooks/pre-tool-use.ts` / `decision.ts`（预算只在写成功后扣减；DENY 的写不运行）
- T002 glob 语义 `02_source/src/config/glob.ts`、T003 路径 HMAC `02_source/src/privacy/sanitize.ts`

## changed_files（57 个文件，+9412/−2，commit fefec48）

- `02_source/tests/fixtures/s0/author-fixtures.py`（48 条 fixture + Golden 的手工编写源；只做序列化，不执行生产代码、不读生产输出）
- `02_source/tests/fixtures/s0/{control,compact,cwd,unread,scope}/`：48 个 fixture JSON（C01–C16、K01–K08、W01–W08、U01–U08、S01–S08）
- `02_source/tests/golden/expected-v1.json`（48 条手工 Golden Expected）
- `02_source/tests/oracle/reference_oracle.py`（独立 Python 3.12 标准库 Oracle：状态机、边界失效、编辑预算、决策优先级、glob、HMAC 均独立实现）
- `02_source/tests/unit/golden.test.ts`（生产侧复演测试，53 个测试）
- `02_source/package.json`（新增 `test:golden`、`test:oracle` 两个脚本）
- `02_source/artifacts/test-logs/T009_test-golden.log`、`T009_test-oracle.log`、`T009_test-all.log`、`T009_typecheck.log`

未修改任何禁区文件：`src/core/**`、`src/hooks/**` 零改动；未碰其他项目、Drive 索引、用户 `.claude/settings*.json`。

## commands（均在 `02_source/` 内运行）

```bash
python3 tests/oracle/reference_oracle.py --self-test
python3 tests/oracle/reference_oracle.py --verify-golden
npm run test:golden
npm run test:oracle
npm run typecheck
npm test
```

## exit_codes

| 命令 | 退出码 | 结果 |
|---|---|---|
| `python3 tests/oracle/reference_oracle.py --self-test` | 0 | Oracle 自身测试 PASS |
| `python3 tests/oracle/reference_oracle.py --verify-golden` | 0 | 48/48 与 Golden 一致 |
| `npm run test:golden` | 0 | 53/53 通过（48 条生产复演 + 5 结构断言） |
| `npm run test:oracle` | 0 | 自测 + verify-golden 均 PASS |
| `npm run typecheck` | 0 | 通过 |
| `npm test`（全量） | 0 | 347/347 通过（基线 294 + 新增 53，无回归） |

## test_summary

- 分组：control 16（全部写决策 ALLOW，无误报）、compact 8、cwd 8、unread 8、scope 8（4 子 Agent + 4 phase）。
- 检测覆盖：32 条植入错误情形中，DENY/WARN/ASK 按规则 mode（block→DENY、ask→ASK、warn→WARN）正确检出；另有 W05/S06（边界后重读恢复 ALLOW）、W07（同 cwd 不失效）、S07（phase 切换致规则失活、无门 ALLOW 但租约 EXPIRED PHASE_MISMATCH）三条恢复/边界正向用例。
- 专项语义：预算耗尽（U06 五次成功写后第六次 DENY EDIT_BUDGET_EXHAUSTED）、预算为 0（U08 立即 EXPIRED）、失败写不扣预算（C07）、重读刷新预算（C06）、失败读不签发（U04/C08）、InstructionsLoaded 发证（C09）、双规则同目标（C13）、无 CWD_CHANGED 事件时写前同步懒失效（W04，expired_reason CWD_MISMATCH）、嵌套子 Agent 不继承（S04）、子 Agent 作用域 compact 不影响父租约（K08）、phase 切换仅失效当前作用域（S08）。
- 独立性：Oracle 只 import Python 标准库（argparse/hashlib/hmac/json/sys/pathlib），不导入 TS、不运行生产 CLI、不共享状态转移函数；Golden 由手工编写源序列化，未用生产结果覆盖（中途仅因租约列表排序做过一次序列化顺序归一化，数值未变；Oracle 首次跑 47/48 即因此排序差异失败一次，修正后 48/48）。
- 确定性：Oracle `--verify-golden` 两次运行输出 SHA-256 相同（`6694b2d374ba08e0b65db1d08c640d46c1cd20ceff927587d6fbae379a2ee3a6`）；fixture 时间戳全部为固定逻辑时间、无随机 UUID、无当前系统时间；路径 HMAC 用固定测试密钥 `guidancepulse-s0-test-key-v1`。

## log_paths

- `02_source/artifacts/test-logs/T009_test-golden.log`
- `02_source/artifacts/test-logs/T009_test-oracle.log`
- `02_source/artifacts/test-logs/T009_test-all.log`
- `02_source/artifacts/test-logs/T009_typecheck.log`

## sha256

```
f266da7005eeb990ee5b248aa94558b30ce887472076ce753f1ff4a8eceecb7b  02_source/tests/golden/expected-v1.json
aab127649fdfc526cf958dde8d4b091073bb4ca427bf862fece2558ac670d984  02_source/tests/oracle/reference_oracle.py
a5639d3917599807a3fbdb963badf6af59c5e235f0e8f175186fce967e04e9ad  02_source/tests/unit/golden.test.ts
af243fb410e8c3eeb3f9270f6f767478c983f3be40988011dfeed3cb522d2b09  02_source/tests/fixtures/s0/author-fixtures.py
7b976950b5aad4291bdfa7dc2db7366380946d85381e92ae6aebb0fcdad7c290  02_source/package.json
```

## known_limits

1. **验收命令字面形式 `python` 在本 VM 上不存在**（`python: command not found`；只有 `python3`，Python 3.12.3）。任务卡验收命令 `python tests/oracle/reference_oracle.py --verify-golden` 需改用 `python3` 才能运行；`package.json` 的 `test:oracle` 已用 `python3`。请协调员决定是否把任务卡/计划书中的命令统一改为 `python3`。
2. 48 条 Golden Expected 的第二独立会话复核尚未做（按任务卡由协调员另行安排）；本任务只保证 Golden 可独立复核：手工编写源 `author-fixtures.py` 集中可读，Oracle 与生产复演均以它为准。
3. 预算耗尽仅覆盖“成功写逐次扣减至 0”（U06）与“预算为 0 立即过期”（U08）两条路径；其余预算语义由 T004 单元测试覆盖。
4. Fixture 的 `agent` 切换步骤（`agent` kind）是测试线束专用的作用域切换，无对应契约事件；`subagent` 步骤则对应真实 `SUBAGENT_STARTED` 事件。两者在 Oracle 与 TS 复演中实现一致。

## next_task

T010（S0 Gate、性能、100 次确定性重放）：以前置 T009 的 fixtures/Oracle/Golden 为输入，跑 `npm run s0:gate` 与 100 次 hash 门；本任务的 48/48 parity 是其输入条件之一，现已满足生产侧与 Oracle 侧双 48/48。
