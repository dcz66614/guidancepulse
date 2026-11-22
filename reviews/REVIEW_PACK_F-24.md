# REVIEW_PACK_F-24 — README 引用 §6.4 为 allowlist（应为 §7.4）；install.ts 头注释指向不存在的“module footer”（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（文档小错）
- **状态：** OPEN
- **来源：** 审查员通读 README 与 install.ts

## 证据

1. `02_source/README.md` 第 24 行：

   > …only guidance ids, HMAC path ids, timestamps and lease state in a
   > local SQLite file (PROJECT_BOOK §6.4 allowlist).

   v1.1.0 中 §6.4 是写前算法，允许持久化字段清单在 **§7.4**。
   （同文件其他引用无误；`src/hooks/pre-tool-use.ts` 等已在 FIX-T013-PRE
   中改对，README 漏网。）

2. `02_source/src/cli/install.ts` 第 13 行：

   > …this VM has no Claude Code installed, so live Hook triggering is NOT
   > verified here — see the module footer).

   该文件没有 module footer（文件以 `installProject` 结尾），
   “live 未验证”的说明实际在 `00_control/HANDOFF_T001.md` 与
   `docs/environment/T001_ENVIRONMENT.md`。悬空引用。

## 处置建议

- README 改为 `§7.4 allowlist`；install.ts 把“see the module footer”
  改为指向 `HANDOFF_T001.md` / T001 环境记录。
- 不阻断 T014；可与 F-11 的文档勘误一并处理。
