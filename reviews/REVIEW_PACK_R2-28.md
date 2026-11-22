# REVIEW_PACK_R2-28 — F-19 卸载侧失败回滚无直接回归测试（P2）

- **审查对象 commit：** `eaeca88`（FIX-T013 交接）
- **规格版本：** v1.1.0
- **严重度：** P2（测试覆盖缺口；行为本身经代码复核与 install 侧测试佐证）
- **状态：** OPEN（本轮重审新发现；FIX-T013 交接 §7 已自行披露）
- **来源：** T013 最终重审（R2）

## 1. 问题

F-19 的修复（失败回滚恢复“本次运行开始时读到的精确字节”，而非最早
备份）在 `installProject` 与 `uninstallProject` 两处都落地了同一模式，
但回归测试只覆盖 install 侧：

- `tests/integration/fix-t013.test.ts` “FIX-T013 F-19” 仅测 install：
  预置最早备份 → 用户改设置 → 注入 `tsc` 失败 → 断言恢复为改后内容。
- uninstall 侧无对应测试。FIX-T013 交接 §7 已承认：“uninstall 失败
  回滚的直接回归测试未写——失败注入需写时权限，而本机以 root 运行
  会绕过权限位；install 侧的同款语义已有回归测试覆盖，uninstall 共用
  同一实现模式。”

审查员复核 `src/cli/uninstall.ts` 约 178–200 行：catch 分支确与
install 侧对称（`settingsRaw !== null` 时写回本次字节；读失败时不碰
文件）。行为可信，但“uninstall 回滚正确”这一宣称目前只有代码复核，
没有一次真实执行的测试证据。

## 2. 处置建议

- 用与 install 侧相同的注入法补 uninstall 回滚测试：不必依赖文件
  权限位——可在写 settings 的临时文件环节注入失败（例如把
  `.claude/` 目录临时替换为同名文件使 `renameSync` 失败，或直接以
  损坏的 settings JSON 触发 `INVALID_SETTINGS` 后的回滚断言）。
- 不阻断 T014：install 侧同款语义已有测试；uninstall 失败回滚是
  低频路径。
