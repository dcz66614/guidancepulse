# REVIEW_PACK_F-22 — LICENSE 与 THIRD_PARTY_NOTICES.md 缺失（P2，T014 前置）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（发布就绪缺口；不影响代码与 S0）
- **状态：** OPEN（须在 T014 冻结前补齐）
- **来源：** 审查员核查发布就绪状态

## 证据

```bash
$ find . -name "LICENSE*" -not -path "*/node_modules/*"   # 无结果
$ find . -iname "*third*party*" -not -path "*/node_modules/*"  # 无结果
$ git ls-files | grep -E "LICENSE|THIRD_PARTY"  # 无结果
```

- 仓库任何位置均无 `LICENSE` 文件；`02_source/package.json` 只有
  `"license": "MIT"` 声明，无随附文本。
- 无 `THIRD_PARTY_NOTICES.md`；直接依赖含 `better-sqlite3`、`react`、
  `react-dom`、`yaml`，开发依赖含 `typescript`、`vite`、`vitest` 等，
  许可证清单未整理。
- 但 IMPLEMENTATION_PLAN §5 布局图要求根目录有 `LICENSE` 与
  `THIRD_PARTY_NOTICES.md`；PROJECT_BOOK §14 发布清单要求
  “MIT LICENSE 与第三方许可证清单完整”；T014 验收也以此为项。

## 处置建议

- 在仓库根（或 `02_source/`，与 §5 布局一致的位置）补 MIT LICENSE
  文本与第三方许可证清单，纳入 T014 冻结 commit。
- 不阻断代码结论；阻断 T014 冻结完成。
