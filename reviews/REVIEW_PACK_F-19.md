# REVIEW_PACK_F-19 — 安装/卸载失败回滚从“最早备份”恢复，而非本次运行前状态（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（只在失败回滚路径触发；正常路径正确）
- **状态：** OPEN
- **来源：** 审查员通读 `install.ts` / `uninstall.ts`

## 证据

### install（`02_source/src/cli/install.ts`）

- 备份只在“本次合并会改动且尚无备份”时写（第 ~545–552 行逻辑）：
  第一次安装把用户原始配置存为
  `.claude/settings.local.json.guidancepulse-backup.json`，之后永不覆盖。
- 但 `catch` 回滚（约第 575–590 行）：

```ts
if (settingsExisted && existsSync(backupPath)) {
  copyFileSync(backupPath, settingsPath);   // 恢复的是“最早备份”
}
```

场景：用户安装后自行改了 settings（如加了自己的 Hook），之后某次
重装在备份之后失败（例如 `buildHookEntries` 的 `tsc` 编译失败
`HOOK_BUILD_FAILED`）→ 回滚把 settings 恢复成第一次安装前的原始文件，
用户在两次安装之间做的修改全部丢失。

### uninstall（`02_source/src/cli/uninstall.ts`）

同样模式：备份只在无备份时写；`catch` 回滚时只要备份存在就从备份恢复。
若备份是安装时留下的原始文件，一次失败的卸载会把 settings 恢复成
安装前状态，丢掉安装后用户的所有修改。

## 处置建议

- 回滚应恢复“本次运行开始时读到的 settings 内容”（内存中的原始字节），
  而不是备份文件；备份文件只用于“用户事后手动恢复”，不作为回滚源。
  修复后补失败路径回归测试（预置备份 + 安装后修改 + 注入构建失败 →
  settings 应等于失败前内容）。
- 不阻断 T014（触发窗口窄：需备份已存在且本次运行在备份后失败）；
  但用户文档“失败回退：恢复安装前备份”的表述应修正为“恢复本次运行前状态”。
