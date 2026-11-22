# REVIEW_PACK_08 — 问题 F-05（P2）：onFailure:block 端到端保证在 S0 阶段无法验证

- **严重度：** P2（deferred 验证；S0 阶段的已知限制，非代码缺陷）
- **状态：** OPEN（待 T012）
- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`

## 问题

`onFailure:block` 的端到端保证——“Hook 进程崩溃/超时/无法启动时，Claude Code 阻止触发动作”——在本机无法验证，且没有任何代码生成含 `onFailure:block` 的 Hook 配置。该保证是严格模式 fail-closed 的最后一环，目前只验证了其中“进程内”的一半。

## 证据

1. **Claude Code 未安装**：`02_source/docs/environment/T001_ENVIRONMENT.md` §2：`claude --version` 退出码 127（command not found）；§4 结论：“本机结论：无法确认。因 `claude` 未安装，无版本号可比对 v2.1.295；严格模式的 fail-closed 保证在本机无法实测，只能以合成 JSON 演练决策输出形状。”
2. **无代码生成该配置**：全仓库 grep `onFailure` 仅 4 处命中——`src/hooks/adapter.ts:38` 与 `src/hooks/pre-tool-use.ts:9` 为注释提及；`docs/environment/T001_ENVIRONMENT.md` 为环境记录；其余为 IMPLEMENTATION_PLAN §7.1 的**目标结构示例**（明确标注“这是目标结构，不是已验证配置”）。T011（安装器，负责生成该配置）尚未开始。
3. **已验证的一半（进程内 fail-closed）**：审查员通读确认并测试通过——`handlePreToolUse` 任意内部错误 → DENY + exit 2（`src/hooks/pre-tool-use.ts` `failClosedResult`）；`handlePreCompact` 持久化失败严格模式 → blocked + exit 2（`src/hooks/pre-compact.ts`）；`hook-entry.ts` 内部错误向 stderr 只写错误码并 exit 2。

## 影响

S0 结论不受影响：S0 七门均不含“真实 Claude Code 上的 fail-closed”这一项；规格 §2.2 与 T001 已明确该验证需 Claude Code ≥v2.1.295 的机器。但在 T012 完成前，任何“严格模式已保证 Hook 失败即阻止写入”的对外表述均无实测依据，不得宣称。

## 建议修复

随 T012 在装有 Claude Code ≥v2.1.295 的机器上验证：Hook 进程崩溃、超时、非 0 退出时 Write/Edit 是否确实被阻止；低于该版本时按计划书 §1.1 不得宣称严格模式可用。验证结果记入 T012 证据与 T013 最终审查。
