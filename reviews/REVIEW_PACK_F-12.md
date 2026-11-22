# REVIEW_PACK_F-12 — F-02 仍成立：Oracle 文档自述三处边缘语义取自生产源码（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（独立性保留，不改变 S0 数值）
- **状态：** OPEN（自 T013 S0 审查起未变）
- **来源：** T013 S0 审查 F-02 的复核

## 证据

`02_source/tests/oracle/reference_oracle.py` 头注释（第 4–14 行）原文：

> Re-implements the Guidance Lease semantics of PROJECT_BOOK.md v1.0.0 §5
> from scratch, using Python 3.12 standard library only.
> …reading the production sources only as a semantic reference for frozen
> edge choices that the spec leaves open (fail-closed on unknown
> cwd/phase, budget-0 leases, lazy expiry).

审查员复核：

- Oracle 仍为独立 Python 标准库重实现：不导入 TypeScript、不调用生产 CLI、
  状态转移/Glob/HMAC 均自写；`--self-test` 与 `--verify-golden` 均 PASS，
  本次终审 `npm run s0:gate` 内 Oracle 三向 48/48 复现。
- 但上述三处边缘语义（未知 cwd/phase fail-closed、budget-0 租约、懒失效）
  的取舍在 v1.1.0 规格中未写死，Oracle 作者自述系参照生产源码定稿。
  因此“Oracle 与生产完全独立推导”的主张有保留：若生产在该三处取舍上
  出错，Oracle 会复现同一错误而不报错。
- 48 条 Golden Expected 仍为手工编写并经独立复核（commit `95bf699`
  GOLDEN-REVIEW-T009 PASS），Golden 层面的独立性不受此影响；三向
  48/48 中生产↔Golden、Oracle↔Golden 两路仍是独立校验。

## 处置建议

- 接受为已知保留（P2）：在规格下一次修订中把三处边缘语义写死
  （未知 cwd/phase fail-closed、budget-0 立即 EXPIRED、懒失效顺序），
  此后 Oracle 可宣称完全按规格独立实现。
- 不阻断 T014。
