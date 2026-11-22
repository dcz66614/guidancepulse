# REVIEW_PACK_R2-26 — S0 隐私第二轮改写后，S0_GATE.json 内记录的自哈希过期（P2）

- **审查对象 commit：** `eaeca88`（FIX-T013 交接）
- **规格版本：** v1.1.0
- **严重度：** P2（证据自洽性；不改变任何一门 S0 数值，不影响 verdict 的实质）
- **状态：** OPEN（本轮重审新发现；FIX-T013 引入）
- **来源：** T013 最终重审（R2）对 `scripts/s0-gate.ts` 第二轮扫描的独立复核

## 1. 问题

FIX-T013 为闭环 F-07（旧）在 `scripts/s0-gate.ts` 中追加了隐私第二轮：
写完 `S0_GATE.json` / `S0_GATE.md` 后再扫描这两个文件，命中则翻转
gate 7 与总 verdict；随后“刷新 artifact hashes 并重写两份报告文件，
使记录的 sha 与最终字节一致”（`00_control/HANDOFF_FIX_T013.md` §2，
F-07 行）。该宣称对 `S0_GATE.md` 成立，对 `S0_GATE.json` 自身不成立：

- `S0_GATE.json` 内 `artifacts_sha256["S0_GATE.json"]` 记录的是**第一版**
  （第二轮扫描前写入、8,766 字节）的哈希，**不是最终字节**的哈希；
- 文件内 `notes` 仍称 “S0_GATE.json itself is not in artifacts_sha256
  (self-hash)”——该陈述在本轮之前为真，现在为假：`S0_GATE.json`
  已出现在 `artifacts_sha256` 中，且值是过期的；
- 第二轮扫描的是第一版字节；改写后的最终字节（追加了
  `privacy_second_pass` 对象）从未被 canary 扫描过。按代码检查，
  追加内容确为纯数字元数据（扫描计数 / sha / verdict），无 Hook 输入，
  故实际泄漏风险极低；但“写完再扫”的宣称在字面上只覆盖了第一版。

## 2. 证据（审查员复跑，2026-11-15 16:46 GMT，`npm run s0:gate`）

```text
S0_GATE.json 内 artifacts_sha256["S0_GATE.json"] = c8f652589fd2055d8d1b07cae65d6db1cf5c056d2dd06bc6634f6770473dfc18
S0_GATE.json 最终字节实际 sha256                 = 89456fa98ef21cf7fd00b1cc0568f575bf84551ddb1b7db1dcb533aac0507627
S0_GATE.md 内 Artifacts 清单所列 S0_GATE.json    = 89456fa9…（与最终字节一致 ✓，因 md 最后写入）
privacy-scan.json 内记录值                        = e6553d0a…（与最终字节一致 ✓）
second_pass 扫描记录 S0_GATE.json                 = c8f652589fd2…，8,766 字节（即第一版）
S0_GATE.md 未出现在 artifacts_sha256 中（写前即有的旧缺口，非本轮引入）
```

根因（`scripts/s0-gate.ts` 约 710–718 行）：第二轮先写
`privacy-scan.json`（更新其哈希），再重写 `S0_GATE.json`（此时
`gateDoc.artifacts_sha256["S0_GATE.json"]` 仍是第一版哈希），
**之后**才执行 `artifactHashes["S0_GATE.json"] = sha256File(...)`——
更新发生在序列化之后，文件内的值永远滞后一版。`S0_GATE.md` 是最后
写入的，故其清单反而正确。

## 3. 处置建议

- 在 T014 冻结前修正其一即可：(a) 从 `artifacts_sha256` 中去掉
  `S0_GATE.json` 自哈希条目（恢复旧版 notes 的说法，自哈希只记在
  日志中）；或 (b) 第二轮改写后不再把自哈希写进文件内，改为只在
  `S0_GATE.md` 清单与日志中记录最终哈希；并同步修正 `notes` 文案。
- 另可注明：第二轮扫描对象是改写前版本，最终版追加内容为纯数字
  元数据（或补一次对最终版的只读扫描以闭合字面缺口）。
- 不阻断 T014：七门数值与 verdict 实质不受影响。
