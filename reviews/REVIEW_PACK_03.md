# REVIEW_PACK_03 — Oracle + Fixtures + Golden + Gate/Perf 脚本 + S0 证据复算（T013 S0 审查）

- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`
- **规格：** PROJECT_BOOK v1.1.0 §9（S0 门禁）；IMPLEMENTATION_PLAN v1.1.0 §8（检出算法/计时/报告格式）、§9.2–§9.4（Fixture 目录、Oracle 独立性、反向测试）
- **文件：** `tests/oracle/reference_oracle.py`、`tests/fixtures/s0/author-fixtures.py`、`tests/golden/expected-v1.json`、`scripts/s0-replay.ts`、`scripts/s0-gate.ts`、`scripts/perf-hook.ts`、`scripts/repeat-s0.ts`、`scripts/hook-entry.ts`
- **结论：** PASS，无 P0/P1 问题。F-02/F-03/F-04/F-06/F-07（均为 P2）另见 PACK_05/06/07/09/10。

## 1. Oracle 独立性（`tests/oracle/reference_oracle.py`，24,917 B）

- **零共享代码**：纯 Python 3.12 标准库实现，不导入 TypeScript、不运行生产 CLI、不调用生产代码；状态转移、Glob（`*`/`?`/`[...]`/`**`）、路径规范化、HMAC（`hmac:<sha256>`，固定测试 key `guidancepulse-s0-test-key-v1`）均为自写。
- **自测与验证**：`--self-test`（HMAC 向量、规范化、Glob、聚合 block>ask>warn、状态机、compact/cwd/phase、预算 0、懒失效、子作用域、预算耗尽）与 `--verify-golden`（48/48）在审查员复跑中均 PASS。
- **与生产逐 fixture 对照**：`oracle-results.json` 显示 oracle==production 48/48、oracle==golden 48/48，审查员复核 0 差异。
- **保留项**：Oracle 头注释自述三处边缘语义（未知 cwd/phase fail-closed、预算 0、懒失效）“reading the production sources only as a semantic reference”——独立性有保留，登记为 F-02（PACK_05）。另：无 cwd 租约会使 Oracle 抛 ValueError 而非 fail-closed，登记为 F-06（PACK_09）。两项均无 S0 影响（48 条 fixture 全带 cwd）。

## 2. Fixtures 与 Golden（`author-fixtures.py` + 48 JSON + `expected-v1.json`）

- **手工期望**：`author-fixtures.py` 头注释声明每条 `expected` 均由人工按 PROJECT_BOOK §5（v1.0.0 编号，即 v1.1.0 §6）手工算出，不运行生产代码、不运行 Oracle、不复制程序输出；脚本只做序列化（固定逻辑时间戳 `T(step_index)`）。
- **独立复核**：GOLDEN-REVIEW-T009 独立审查 PASS（commit `95bf699`），48 Golden Expected 经第二会话复核。
- **审查员复核**：48 条 fixture 内联 `expected` 与 `tests/golden/expected-v1.json` 逐项比对，0 差异；分组 16 control / 8 compact / 8 cwd / 8 unread / 8 scope，ID 唯一；`verify-golden` 另校验 golden 无多余 fixture。
- **特殊 fixture 实测值**（来自 `fixture-results.json`，审查员逐条核对）：
  - W05：快照 step 1 `EXPIRED / CWD_MISMATCH`，step 2 重读后 FRESH（last_read 10:00:00Z → 10:02:00Z），终态 ALLOW + FRESH，remaining 4。
  - S06：快照 step 1 `EXPIRED / PHASE_MISMATCH`，step 2 重读后 FRESH，终态 ALLOW + FRESH。
  - S07：终态 `EXPIRED / PHASE_MISMATCH`，remaining 5；写步骤 per_rule 为空（规则在 explore 阶段失活，无门控写），符合 §9.3 定义。
  - W07：三步快照全 FRESH，last_read 全程 `2026-11-15T10:00:00Z` 不变；cwd 步骤 old==new==`/proj`。

## 3. `summarizeReplay` 与四依据（`scripts/s0-replay.ts`）

- 四条件与 PROJECT_BOOK §9.3 / IMPLEMENTATION_PLAN §8.1 **逐字一致**（字段名 `detection_basis`、字符串 `non_allow_decision` / `expired_final_lease` / `expired_intermediate_lease` / `same_cwd_no_expiry`、优先级 non_allow → expired_final → expired_intermediate → same_cwd）。
- 实测计数：28 / 1 / 2 / 1，fixture 映射：non_allow={K01–K08, S01–S05, S08, U01–U08, W01–W04, W06, W08}；expired_final={S07}；expired_intermediate={W05, S06}；same_cwd={W07}；16 control 全为 null、`controlClean=true`。
- 逐 fixture 的 `errorDetected` 只由 basis 决定（与 matchesGolden 无关）；篡改测试存在（`tests/unit/s0-gate.test.ts`：忽略 compact 边界 → 31/32；另有 matchesGolden=true 但无 basis 时不计检出的用例），在 359/359 中通过。只看终态最多 29/32 的上限成立（W05/S06/W07 终态均为 ALLOW + FRESH）。
- **保留项**：汇总计数 `errorDetected` 另要求 matchesGolden（AND），登记为 F-04（PACK_07）。

## 4. S0 Gate 与计时口径（`scripts/s0-gate.ts`、`perf-hook.ts`、`repeat-s0.ts`、`hook-entry.ts`）

- **Gate**：七门判定阈值与规格一致，无后门；任一门 FAIL 即总体 FAIL、exit 1，报告照写；支撑证据（typecheck + 全量测试）失败也计入总体 FAIL。
- **计时**：`perf-hook.ts` 先以 PostToolUse Read 做冷启动种子（首个 spawn，在 5 次预热之前），再 5 次预热（不计入），再 99 次计时 Write；每次 `spawn(process.execPath, [entryJs])` 全新 Node 子进程；计时含 spawn、Node 启动、better-sqlite3 加载、JSON 解析、净化、SQLite 读写、路径匹配、决策、输出、退出；p95 取排序后 `ceil(0.95·n)-1` 位；`verdict` 要求 `p95 < 500 && failures.length === 0`（等于 500 即 FAIL）；失败的计时样本不静默删除（计入 failures 并使 verdict FAIL）。
- **冷启动口径核实**：`perf-hook.json`（审查员复跑）：`warmup_runs=5`，`n=100`，`cold_start_sample_index=0`，`durations[0]==cold_start_ms`（259.97ms），`failures=[]`。种子确为测量内首次 spawn，故为真实冷启动。
- **保留项**：冷启动样本为 Read 而非 Write（100 样本不同构），登记为 F-03（PACK_06）。
- **确定性**：`repeat-s0.ts` 对 48 轨迹完整 replay 取 canonical hash（`canonicalJson` 键排序 + LF + SHA-256），覆盖 fixture id、决策、终态租约与逐步快照，排除墙钟耗时、临时目录与机器路径；100 次恰好 1 hash。
- **Hook 入口**：`hook-entry.ts` 只做接线（读 stdin → 适配 → 分发到生产 handlers → stdout JSON + exit 码），不自带语义；内部错误只向 stderr 写 `{"hook_entry_error": "<CODE>"}`，不回显原始输入。

## 5. 审查员独立复算（`npm run s0:gate`，2026-11-15 15:24 GMT，退出 0）

| 门 | HEAD 提交值 | 审查员复跑值 |
|---|---|---|
| 三向 parity | 48/48 | 48/48 |
| 检出 | 32/32 | 32/32 |
| 控制无误报 | 16/16 | 16/16 |
| p95 | 214.19ms | **182.37ms**（n=100，p50=159.62，p99=205.61，min=146.04，max=259.97，cold_start=259.97，index=0） |
| 唯一 hash | `ef06d30f…af50` | `ef06d30f…af50`（同值） |
| 网络 | 0 | 0（34 文件） |
| 隐私 canary | 0（11 文件） | 0（11 文件） |
| 支撑 | typecheck 0；golden 53/53；全量 359/359 | 同值复现 |

另核实：复跑 `S0_GATE.json` 的 `artifacts_sha256` 与磁盘上 6 个产物文件的实测 SHA-256 全部一致；复跑产物保持未提交状态（见 T013_REVIEW §1 说明）。
