# REVIEW_PACK_F-18 — `phase set <未声明阶段>` 被接受；拼错阶段会静默解除全部规则门控（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（用户误操作可致门控失效；属 CLI 未收紧，非状态机错误）
- **状态：** OPEN
- **来源：** T012 交接遗留观察的复核 + 审查员亲自复现

## 证据

`src/cli/phase.ts` 第 109–127 行 `validatePhaseId` 本身支持
`allowedPhases`：传入时，未声明阶段抛 `INVALID_PHASE`。但 CLI 分发
`src/cli/main.ts` 第 174–179 行调用 `setPhase` 时未传 `allowedPhases`：

```ts
const result = setPhase(store, {
  sessionScopeId: "default",
  agentScopeId: "main",
  phaseId,           // 只有 slug 格式校验，无“是否 config 声明”校验
});
```

审查员复现（2026-11-15 ~16:20 GMT，`/tmp/t013-final/foreign-proj`）：

```bash
$ guidancepulse phase set implementation
guidancepulse: phase set to implementation (invalidated 0 lease(s))
$ guidancepulse phase set bogus
guidancepulse: phase set to bogus (invalidated 0 lease(s))   # exit 0
```

后果链：`matchRules`（`src/core/match-rules.ts`）按 live phase 过滤规则；
阶段变为 `bogus` 后，全部规则的 `phases` 均不含它 → `rules.length === 0`
→ `handlePreToolUse` 返回无门控 ALLOW（`src/hooks/pre-tool-use.ts`）。
即一次拼写错误（`implemenation`）就会让后续全部受保护写在无凭证下放行，
且没有任何警告。T012 交接已记录该观察，留待 T013 决定。

## 处置建议

- CLI 的 `phase` 分支在项目存在 `config.yaml` 时读取其 `phases` 并传入
  `allowedPhases`；无配置时保持现状（仅 slug 校验）并提示。
  修复后补回归测试（`phase set bogus` 在有配置项目中应 exit 1）。
- 另可考虑：规则在 live phase 下全部失活时，PreToolUse 输出一句
  提醒（非阻断），避免静默无门控。
- 不阻断 T014 冻结（属 CLI 收紧）；但用户文档应在修复前注明
  “阶段名拼错会导致规则不生效”。
