# REVIEW_PACK_F-14 — F-05 收窄但仍 OPEN：onFailure:block 代码已生成，live 端到端仍未验证（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（deferred 验证；本机无 Claude Code，不可判通过也不可判失败）
- **状态：** OPEN（范围已收窄：S0 审查时“无任何代码生成该配置”已不成立）
- **来源：** T013 S0 审查 F-05 的复核 + T012 blocked_external 复核

## 1. 已进展：配置生成代码存在且有测试

S0 审查时 F-05 的证据之一是“无任何代码生成含 `onFailure:block` 的 Hook
配置”。T011 已补上：

- `02_source/src/cli/install.ts` 第 137 行（PreToolUse）与第 159 行
  （PreCompact）：`onFailure: "block"`，与 IMPLEMENTATION_PLAN §7.1
  目标形态逐字一致；`timeout: 10` 同在。
- `02_source/tests/unit/installer.test.ts` 第 95–112 行断言
  PreToolUse/PreCompact 的 `onFailure` 为 `"block"`，
  PostToolUse 的 `onFailure` 为 undefined。本次终审
  `npm run test:installer` 16/16 通过。
- `02_source/README.md` 第 9 行与 `docs/USER_GUIDE.md` 均已声明
  `onFailure: "block"` 需要 Claude Code ≥ v2.1.295。

## 2. 仍未验证：live 端到端

审查员本机复核（2026-11-15 16:15 GMT）：

```bash
$ claude --version
claude: command not found   # 退出 127，与 T001 环境记录一致
```

T012 交接 `blocked_external` 三项标记诚实，审查员逐项核对属实：

| # | 项目 | 状态 |
|---|---|---|
| 1 | 真实 Hook 触发（Claude Code 加载 settings 并触发 Hook） | 未验证，无 Claude Code |
| 2 | `onFailure:block` 端到端 fail-closed（Claude Code 收到 Hook 失败后是否阻止操作） | 未验证；本机只验证了 Hook 子进程自身的 exit 2 |
| 3 | 真实会话 Read 观测（InstructionsLoaded / PostToolUse Read 的真实形态与合成输入是否一致） | 未验证；本机 Read 均为合成 JSON 驱动 |

T012 的通过范围表述准确：“Claude Code 会驱动的完整 Hook 入口链路
（含相同输入、相同子进程形状、相同退出码）+ CLI 全程 + 离线/隐私回归”，
未假装通过上述三项。

## 3. 处置建议

- 三项随 T014 之后在装有 Claude Code ≥v2.1.295 且已登录的机器上验证；
  在此之前发布材料不得宣称“严格模式 fail-closed 已在真实 Claude Code
  上验证”，只能宣称“Hook 子进程侧 fail-closed（exit 2）+ 配置已生成”。
- 不阻断 T014 冻结（冻结的是代码与证据包，不是 live 验证结论）。
