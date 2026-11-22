# P025 规格修订 v1.1.0 — Muse 独立核对记录

核对时间：2026-11-15 ~15:13 GMT。核对人：Muse（主聊天），逐项实测，非 GPT 自述。

## 结论

**v1.1.0 规格文件已核对通过，可作为施工依据。** GPT 在同一 P025 对话（GPT-6 + Extra High，Pro 显示 Locked）交付，方向 (c)：保持 Node.js/TypeScript 与每次 Hook 独立子进程架构，p95 硬门由 <10ms 改为 <500ms。

## SHA-256 与大小（Muse 亲自计算，与 GPT 给出的值逐字节一致）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| PROJECT_BOOK.md v1.1.0 | 41,457 B | 68544cc03b0de47df59e0e61e8d9c53cb079864bc51448a297e3a5c6ddfebdef |
| IMPLEMENTATION_PLAN.md v1.1.0 | 53,601 B | 4be290d3b52ea1402dff65ff832c1a8c04243634695ec5d000866e2c7f88723f |

本地保存位置：`00_control/v1.1.0/`（另有副本 `~/workspace/p025-specs/v1.1.0/`）。v1.0.0 文件原地不动。

## 内容 grep 核对（全部通过）

- 版本号 v1.1.0：PROJECT_BOOK 13 处，IMPLEMENTATION_PLAN 20 处；变更日志（PB:22 / IP:27）写明相对 v1.0.0 的全部改动与理由。
- p95 硬门：两文件多处 `<500ms`；PB:655“阈值严格 p95 < 500ms，等于 500ms 为 FAIL”；500ms 依据写明：冷启动最高 462ms、v1.0.0 本轮 p95 194.00ms、单独 cold_start 285.04ms。
- 冷启动计入样本：PB:652“不得把冷启动从 100 样本剔除”；IP:893“不得从 100 个样本中删除”；仅 5 次预热不计入。
- 四种检出依据：non_allow_decision / expired_final_lease / expired_intermediate_lease / same_cwd_no_expiry 在 PB 各 2 处、IP 各 3 处；29/32 终态上限与防作弊规则（Golden 全等不等于检出）在两文件均有（PB:624 / IP:881）。
- S0 状态：v1.0.0 S0 FAIL 作为历史结果保留（PB:904 / IP:1202）；v1.1.0 S0 为 NOT_RUN，必须重跑（PB:905 / IP:62）。
- 约束不变：MIT、零真人、88h 预算（IP:27“保持 Node 子进程架构和 88h 预算”）；`python3` 措辞统一（IP:51-52）；“1417”出现 0 次。
- 其余 6 项硬门不变；测量仍诚实（p95 含全新子进程启动全成本）。

## 过程备注

- GPT 首轮回复（14:43）未产出文件，要求补 S0_GATE.json 与四种检出依据的精确定义；Muse 补交两份证据文件（S0_GATE.json 7,035 B、fixture-results.json 187,747 B）及依据定义后，GPT 核对附件（48/48、28+1+2+1=32、16/16）再产出文件。
- 生成中途 GPT 请求覆盖 Drive 上的 v1.0.0 PROJECT_BOOK.md（fileId 1aQ05FKqYcRuqoKz-NYhmfcb9OmhwHn0r），浏览器任务已拒绝该覆盖；Drive 的 v1.0.0 文件未被替换。v1.1.0 以版本化文件名另存上传。
- 对话全文 PDF（621 KB）已保存为 `00_control/P025_SPEC_REVISION_v1.1.0_CONVERSATION.pdf`。

## 下一步

按 v1.1.0 规格重跑 S0（`npm run s0:gate`）；S0 PASS 后 T011/T012/T014 解封，S0 FAIL 则继续 STOP。
