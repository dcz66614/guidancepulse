# REVIEW_PACK_F-15 — F-06 仍成立：Oracle 对无 cwd 租约抛 ValueError 而非 fail-closed（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（Fixture 外边缘；不影响 48/48）
- **状态：** OPEN（自 T013 S0 审查起未变）
- **来源：** T013 S0 审查 F-06 的复核

## 证据

`02_source/tests/oracle/reference_oracle.py`：

- `check_write`（约第 323 行）：`cwd_id = compute_path_id(cwd) if cwd is not None else None`，
  对 `cwd=None` 已 fail-closed（比较失败 → 租约过期），与生产一致。
- `apply_cwd`（约第 312–316 行）：`new_id = compute_path_id(new_cwd)`，
  对 `new_cwd=None` 无守卫；`compute_path_id`（第 86 行）对非法路径
  `raise ValueError("INVALID_PATH")`。
- 生产侧：`src/hooks/adapter.ts` 的 `adaptCwdChanged` 在
  `oldCwd/newCwd` 缺失时返回 `ignored`（不构造事件、不调用 HMAC），
  因此生产不会走到这条抛错路径。

即：一次缺少 `new` 的 cwd 步骤，生产会忽略，Oracle 会抛 ValueError
而非同步忽略。48 条 Fixture 的 cwd 步骤均带 `new`，故三向 48/48
不受影响；该分歧只在 Fixture 格式之外出现。

## 处置建议

- 在 Oracle 的 `apply_cwd` 增加与生产对称的守卫（`new_cwd is None`
  时忽略），或在 Fixture 格式中声明 `new` 必填；任一方式均需
  Oracle 作者另立任务处理并重跑 `--verify-golden`。
- 不阻断 T014。
