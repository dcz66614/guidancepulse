# REVIEW_PACK_01 — core 状态机 + contracts（T013 S0 审查）

- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`
- **规格：** PROJECT_BOOK v1.1.0 §6（状态机）、§7.3（内部事件契约）、§7.4（允许持久化字段）
- **文件：** `src/core/lease-machine.ts`、`src/core/match-rules.ts`、`src/core/index.ts`、`src/contracts/events.ts`、`src/contracts/index.ts`
- **结论：** PASS，无 P0/P1 问题；1 处观察（见末尾）。

## 1. `src/core/lease-machine.ts`（17,358 B）

通读全部。实现与 PROJECT_BOOK v1.1.0 §6 逐项一致：

- **三态与转移**：`UNSEEN → FRESH → EXPIRED`；`READ_SUCCEEDED`（重）签发 FRESH（预算 0 时即时 `EXPIRED / EDIT_BUDGET_EXHAUSTED`）；`PRE_COMPACT` 全作用域失效 `CONTEXT_COMPACTION`；`CWD_CHANGED` 仅失效签发 cwd ≠ new 的租约；`PHASE_CHANGED` 仅失效签发 phase ≠ 新 phase 的租约；`SUBAGENT_STARTED` 无存储变化（新作用域以缺席表示 UNSEEN）；`WRITE_CHECKED` 不是状态输入。
- **FRESH 六条件**（§6.2）：成功读取、同一 session/agent、phase 一致、cwd 一致、剩余预算 >0、自签发以来无失效边界——`checkWrite` 按此顺序懒失效（cwd → phase → budget），未知 live cwd/phase（null）fail-closed 失效而非放行。
- **编辑预算**（§6.3）：仅成功写扣减，失败写不扣减，归 0 时 `EDIT_BUDGET_EXHAUSTED`；`recordWriteOutcome` 对缺失/UNSEEN/EXPIRED 租约无操作。
- **纯度**：全部纯函数，无 I/O、无时钟、无随机数；每次转移返回新 `Map`，不 mutate 输入；时间戳只取调用方传入的事件值。
- **`leaseKey`**：`${sessionScopeId}\x00${agentScopeId}\x00${guidanceId}`（以 NUL 字节分隔，审查员以 `od` 核实），拼接碰撞不可能（例如 `("a","b\x00c")` 与 `("a\x00b","c")` 不会混淆）。
- **`canonicalLeaseSnapshot`**：字段固定顺序、仅允许字段，可作确定性哈希输入。

**观察（非问题）：** `InvalidationReason` 联合类型含 `SUBAGENT_SCOPE` 与 `SESSION_END` 两个从未由状态机产生的 reason 码（全仓库 grep：仅类型定义处出现）。死变体无行为影响，但终审时宜确认是预留还是应删除，以免审计时误以为存在未覆盖的失效路径。

**注：** 文件头注释引用的是 `PROJECT_BOOK.md v1.0.0 §5` 等旧编号（内容与 v1.1.0 §6 一致）。该引用滞后问题登记为 F-01（REVIEW_PACK_04），此处不重复计为本包问题。

## 2. `src/core/match-rules.ts`（3,672 B）

- `matchRules(config, target, phase)`：先 `normalizeTargetPath`（不可规范化为相对路径时返回 []，无规则匹配），再按 phase 过滤 + glob 匹配，保持配置顺序；与 §6.4 写前算法 `rules = match_rules(target, current_phase)` 一致。
- `isRuleActiveInPhase`：phase 为 null 时匹配全部 phase（调用方随后由 `checkWrite` 对 null phase fail-closed，不会放行）；`matchRulesAnyPhase` 明确标注为 T003 适配器的 phase-agnostic 视图，T005 再以 live phase 精炼——两阶段分工在 `pre-tool-use.ts` 中正确落地。
- 未发现 glob 或规范化逻辑与 `src/config/glob.ts` 的重复实现（复用，未重写）。

## 3. `src/contracts/events.ts`（7,801 B）

- 六种事件类型与字段与 PROJECT_BOOK v1.1.0 §7.3 逐字一致（`READ_SUCCEEDED` / `PRE_COMPACT` / `CWD_CHANGED` / `SUBAGENT_STARTED` / `PHASE_CHANGED` / `WRITE_CHECKED`）；`WriteCheckRequest` 明确标注“非持久化事件”。
- `isGuidancePulseEvent`：逐类型精确键集合校验（`hasExactKeys`）+ `pathId` 必须为 `hmac:<64 小写 hex>` + 决策/状态枚举校验；时间戳须可解析。`store.ts` 的 `validateEventForStore` 依赖它把关，非法事件进不了库。
- `MAIN_AGENT_SCOPE_ID = "main"`：Hook 输入无 `agent_id` 时的默认值，与 §7.3 注释一致。

## 4. 复核方法

逐文件通读 + 对照 v1.1.0 §6/§7.3/§7.4 逐条核对；`npm run test:lease-machine`（33 测试）与 `test:path-matcher`（16 测试）在审查员复跑的全量测试中通过（359/359 的一部分）。
