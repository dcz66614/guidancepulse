# REVIEW_PACK_09 — 问题 F-06（P2）：Oracle 对无 cwd 租约抛 ValueError 而非 fail-closed

- **严重度：** P2（Oracle 健壮性缺口；fixture 覆盖范围外，无 S0 影响）
- **状态：** OPEN
- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`

## 问题

生产状态机对“签发时无 cwd”的租约是 fail-closed（写前检查时失效，不放行）；Oracle 在同一情形下会抛异常崩溃，而非返回 DENY。两者在规格未覆盖的边缘上行为不一致。

## 证据

`02_source/tests/oracle/reference_oracle.py`：

- `Oracle.check_write`：`elif compute_path_id(lease["cwd"]) != cwd_id:`——若 `lease["cwd"]` 为 None（`apply_read` 时 step 无 cwd），`compute_path_id(None)` → `normalize_path_for_id(None)` 返回 None → 抛 `ValueError("INVALID_PATH: None")`。
- `Oracle.apply_cwd` 同样：`lambda lease: compute_path_id(lease["cwd"]) == new_id`，对 cwd 为 None 的租约亦抛 ValueError。

生产侧对照（`02_source/src/core/lease-machine.ts` `checkWrite`）：`lease.cwdPathId !== input.cwdPathId`——null 与任何 live cwd 不等 → 失效 `CWD_MISMATCH`，不抛错；文件头明确把“签发时无 cwd/phase 的租约在首次使用时失效”列为冻结的 fail-closed 选择。

## 影响

无 S0 影响：48 条 fixture 的每条 read 步骤都带 cwd，该分支在 S0 replay 中从未触发；`--self-test` 与 `--verify-golden` 均 PASS。但若将来 fixture 加入无 cwd 读取，Oracle 会崩溃而非给出可比对的 DENY，使 parity 失败表现为异常而非判定差异。

## 建议修复

在 Oracle 的 `check_write` 与 `apply_cwd` 中对 `lease["cwd"] is None` 增加 fail-closed 分支（视为与任何 cwd 不等，即失效），与生产行为对齐；补充一条 self-test 用例（无 cwd 读取 → 写检查 DENY + `CWD_MISMATCH`）。改动后重跑 `npm run test:oracle` 与 `npm run s0:gate` 确认 48/48 不变。
