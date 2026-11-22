# REVIEW_PACK_10 — 问题 F-07（P2）：证据扫描范围缺口（隐私扫描与网络扫描）

- **严重度：** P2（证据完整性；无已发现的泄露或网络调用）
- **状态：** OPEN
- **审查对象 commit：** `042e5c8177863e0da175079dcca5b971d9ce34d4`

## 问题

两处“0”结论的扫描范围各有一个缺口，结论本身正确，但覆盖声明略大于实际扫描范围。

## 证据

### (a) 隐私扫描不含事后写入的 S0_GATE.json / S0_GATE.md

`02_source/scripts/s0-gate.ts` 执行顺序：隐私扫描（`scanPrivacy`，目标为 `.perf-fixture` 目录 + 当时已写的 5 个产物 + 当时状态的 `logs/s0-gate.log`）→ 删除临时目录 → 写 `S0_GATE.json` 与 `S0_GATE.md`。最终两个文件从未被 canary 扫描过。`privacy-scan.json` 的 scope 字符串称“gate artifacts + gate log as of scan time”，如实标注了“as of scan time”，但 `S0_GATE.json` 中“0 canary hit(s) across 11 persisted file(s)”的表述未点明最终文件不在其中。

审查员核实：两文件内容仅为门结论、统计值、命令尾部与 SHA-256，无 Hook 输入进入的路径（`S0_GATE.json` 的 `commands[].stdout_tail` 来自 typecheck/测试/Oracle 输出，均为非敏感的测试日志尾部）。无泄露证据，缺口为覆盖性而非实质性。

### (b) 网络扫描不含实际运行入口 `scripts/hook-entry.ts`

`02_source/scripts/s0-gate.ts` `scanNetwork` 只遍历 `src/**/*.ts(x)`（34 个文件）。性能门实际测量的进程入口是 `scripts/hook-entry.ts`（经 tsc 编译后由 plain node 运行），不在扫描范围内。`network-scan.json` 的 scope 字符串写明“src/**/*.ts(x) product code + package.json dependencies (dev scripts excluded…)”，如实排除了 scripts，但“运行时网络请求 0”的结论依赖于未被扫描的入口文件同样干净。

审查员已手动核实 `hook-entry.ts`：仅 import `node:fs` 与生产模块（adapter、pre-tool-use、pre-compact、cwd-changed、subagent-start、instructions-loaded、config、sanitize、store），无 `fetch`/`http`/`https`/`net`/`WebSocket` 调用；其 import 的生产模块均在 34 个已扫描文件内。无网络调用证据，缺口为覆盖性而非实质性。

## 影响

无 S0 影响：两处缺口经审查员手动核实均为干净；七门结论不变。

## 建议修复

在 `s0-gate.ts` 中：隐私扫描改为在 `S0_GATE.json`/`S0_GATE.md` 写完后再扫一次（或把两文件加入扫描目标并注明）；网络扫描把 `scripts/hook-entry.ts`（实际运行入口）纳入范围，或在 `network-scan.json` scope 中明确列出该文件已人工核实。改动后重跑 `npm run s0:gate` 确认两门仍 PASS。
