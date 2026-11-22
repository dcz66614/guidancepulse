# REVIEW_PACK_F-16 — F-07 仍成立（部分缓解）：S0 门扫描范围缺口（P2）

- **审查对象 commit：** `143f4e5`
- **严重度：** P2（证据范围缺口；无实际泄露证据）
- **状态：** OPEN（T012 离线测试部分缓解了网络侧；S0 门本身未改）
- **来源：** T013 S0 审查 F-07 的复核

## 证据

### 网络扫描（gate 6）仍只扫 `src/`

`02_source/scripts/s0-gate.ts` 第 189 行：

```ts
const files = walkTsFiles(join(ROOT, "src"));
```

实际运行入口 `scripts/hook-entry.ts`（Claude Code 真正启动的进程）
不在扫描范围内；`network-scan.json` 的 scope 自述为
`"src/**/*.ts(x) product code + package.json dependencies (dev scripts excluded…)"`，
把 hook-entry.ts 划为 "dev scripts" 是不准确的——它是生产运行时入口。
审查员已通读 hook-entry.ts 全文：无任何网络调用（只有 stdin/stdout、
`readFileSync`、SQLite、子进程内函数调用），故缺口未造成实际漏报。

缓解：T012 的 `tests/integration/offline.test.ts` 第 78 行起把
`scripts/hook-entry.ts` 明确纳入静态扫描（与 S0 门同一批模式），
且 `npm run test:offline` 本次终审 2/2 通过。缺口在测试套件层已补，
在 S0 门层仍在。

### 隐私扫描（gate 7）仍不含事后写入的文件

`02_source/scripts/s0-gate.ts` 第 527–536 行 `privacyTargets`：

```ts
[ARTIFACTS/.perf-fixture, fixture-results.json, oracle-results.json,
 perf-hook.json, repeat-hashes.json, network-scan.json, LOG_PATH]
```

`S0_GATE.json` 与 `S0_GATE.md` 在扫描之后才写入（第 612/645 行），
`privacy-scan.json` 自身也在扫描之后写入；三者从未被 canary 扫描。
门内注释称“事后追加到日志的只是 verdict/count 行”，该说法对日志成立，
但对 S0_GATE.json/.md 无覆盖——这两个文件汇总了全部测量值。
审查员复核：S0_GATE.json 只含测量值与门结论，不含 Hook 输入，
无实际泄露；缺口是范围性的，不是已发生的泄露。

## 处置建议

- S0 门层：网络扫描范围扩到 `src/` + `scripts/hook-entry.ts`；
  隐私扫描在写完 S0_GATE.json/.md 与 privacy-scan.json 后追加第二轮
  扫描（或把三者纳入下一轮复核）。改动属门禁脚本，需另立任务并重跑
  完整 S0 Gate。
- 不阻断 T014；T014 冻结报告应注明该范围缺口及 T012 的缓解。
