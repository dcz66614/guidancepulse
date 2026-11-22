# REVIEW_PACK_R2-27 — uninstall 在两种提前返回路径下遗留 `.build/`（P2）

- **审查对象 commit：** `eaeca88`（FIX-T013 交接）
- **规格版本：** v1.1.0
- **严重度：** P2（卸载契约残缺；正常路径不受影响）
- **状态：** OPEN（本轮重审新发现；FIX-T013 引入 `.build/` 移除义务后未覆盖全部返回路径）
- **来源：** T013 最终重审（R2）对 `src/cli/uninstall.ts` 的独立复核与实测

## 1. 问题

`uninstall` 的模块头契约（`src/cli/uninstall.ts`）与 README（§“Installed
hooks are self-contained”）均宣称“`uninstall` removes `.build/`”。
但 `uninstallProject` 有两条提前返回路径完全不调用
`removeHookBuild()`：

1. 设置文件不存在时（`settingsExisted === false`，约 96–108 行）——
   直接返回 `hookBuildRemoved: false`；
2. 设置中找不到自有 Hook 时（`!pruned.changed`，约 142–153 行）——
   同样直接返回 `hookBuildRemoved: false`。

于是：用户手动删改过 `.claude/settings.local.json`（删掉 6 条 Hook 或
整个文件）后再跑 `uninstall`，命令 exit 0 并报告 “nothing removed”，
但编译好的 Hook 入口 + 约 18–19 MB 随装依赖仍留在
`.guidancepulse/hooks/.build/`。这与“卸载移除 `.build/`”的宣称不符，
且残留的入口仍可被已安装的启动器直接调用（Claude Code 侧因设置中
已无 Hook 注册而不会触发，故无放行风险）。

## 2. 证据（审查员实测，2026-11-15 ~16:42 GMT，树外临时项目）

```text
/tmp/r2-t013b/proj：init → install --project .（.build/ 就位）
python：把 .claude/settings.local.json 的 hooks 改为空对象（模拟用户手动删 Hook）
$ guidancepulse uninstall --project .
guidancepulse: no GuidancePulse hooks found at /tmp/r2-t013b/proj (nothing removed)
exit=0
$ test -e .guidancepulse/hooks/.build → 仍存在，du 19M
```

对照：正常路径（设置中 6 条 Hook 齐全）下审查员复现
（`/tmp/r2-t013/proj`）卸载后 `.build/` 已移除，启动器调用返回
`HOOK_ENTRY_MISSING` exit 2——正常卸载是干净的。

代码位置：`02_source/src/cli/uninstall.ts`，`removeHookBuild` 定义
（约 104–114 行）只在两条“设置写成功”返回分支中被调用；两条提前
返回分支均未调用。FIX-T013 的回归测试
（`tests/integration/fix-t013.test.ts` “uninstall removes the vendored
.build/…”）只覆盖正常路径。

## 3. 处置建议

- `uninstall` 应在返回前始终尝试清理 `.build/`（至少在“无自有 Hook”
  与“设置文件缺失”两条路径上也调用 `removeHookBuild()` 并如实报告
  `hookBuildRemoved`）；或把文档契约收窄为“仅在卸载确实移除已注册
  Hook 时清理 `.build/`”。
- 补一条回归测试：手动清空设置中 Hook 后卸载，断言 `.build/` 已移除。
- 不阻断 T014：不影响任何门控语义；残留物无放行风险，下一轮
  `install` 会重建 `.build/`。
