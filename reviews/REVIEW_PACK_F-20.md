# REVIEW_PACK_F-20 — hook-entry 对净化/适配抛错无兜底：畸形输入导致 exit 1、无 stdout JSON（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（与文档承诺的 fail-closed 退出码不一致；Claude Code 侧仍会阻断）
- **状态：** OPEN
- **来源：** 审查员通读 `scripts/hook-entry.ts`

## 证据

`scripts/hook-entry.ts` 的 `run()`（第 122–182 行）：

```ts
const sanitized = sanitizeHookInput(input);   // 第 129 行：畸形包络抛 SanitizeError
const adapted = adaptHookEvent(input, { config, pathKey, now });  // 第 130 行：畸形已知事件抛 AdapterError
```

两者均在 `main()` 的 `try { run(...) } finally { store.close(); }`
中调用，`finally` 无 `catch`。抛错时成为未捕获异常：进程以 exit 1
退出、stdout 无 JSON、stderr 为 Node 堆栈。

而该文件头注释承诺：

> Exit codes: 2 when the Hook decision denies/blocks the triggering
> action (PreToolUse DENY, PreCompact blocked in strict mode, or an
> internal error that must fail closed); 0 otherwise. An internal
> error also writes a one-line `{"hook_entry_error": "<CODE>"}` to stderr.

JSON 解析失败与初始化失败有 `fail()` 兜底（exit 2），但净化/适配抛错
没有。`handlePreToolUse` 自身永不抛错（内部 catch → DENY + exit 2），
所以只有“到达门之前就畸形”的输入会走这条路。

实际影响有限：配 `onFailure: "block"` 的 Claude Code 会把任何非零退出
视作 Hook 失败而阻止操作，fail-closed 的最终效果仍成立；但：

- 退出码 1 不是文档承诺的 2，依赖方无法区分“被拒”与“崩溃”；
- stderr 堆栈可能含输入回显风险（Node 堆栈本身不含输入，但未作保证）；
- PostToolUse（无 `onFailure`）畸形输入的 exit 1 与 exit 0 的语义无区别，
  观测不到。

## 处置建议

- 在 `run()` 外层（或 `main()` 的 `readStdin().then` 内）加 `try/catch`，
  净化/适配抛错走 `fail("<CODE>")`（exit 2 + 一行 code-only stderr），
  与 JSON/初始化失败一致；补回归测试（畸形 envelope → exit 2 + stdout
  无 JSON + stderr 只有 code）。
- 不阻断 T014。
