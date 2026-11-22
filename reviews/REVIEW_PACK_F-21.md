# REVIEW_PACK_F-21 — `init` 的 `reportsCreated` 恒为 false（P2，纯 cosmetic）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（仅报告字段错误；目录本身正确创建）
- **状态：** OPEN
- **来源：** 审查员通读 `src/cli/init.ts`

## 证据

`02_source/src/cli/init.ts` 第 73 行先创建目录，第 81 行再检查：

```ts
mkdirSync(join(gpDir, "reports"), { recursive: true });   // 第 73 行
...
const reportsCreated = !existsSync(reportsPath);           // 第 81 行：恒为 false
```

`reportsCreated` 因此永远是 `false`，`created`（第 95 行）永远不含
reports 因素；`printInit` 也永远不会把 `reports/` 列进“已创建”清单。
`config.yaml` / `state.sqlite` / `path-key.bin` 三者的 Created 标志
都在写入前计算，逻辑正确，只有 reports 顺序颠倒。

审查员实测佐证：`/tmp/t013-final/foreign-proj` 上 `guidancepulse init`
输出为 `initialised ... (config.yaml, state.sqlite, path-key.bin)`，
未列 `reports/`，但目录实际已创建。

## 处置建议

- 把 `reportsCreated` 的 `existsSync` 检查移到 `mkdirSync` 之前
  （与其他三项一致）；补单元测试断言首次 init 的返回值含
  `reportsCreated: true`。
- 不阻断 T014。
