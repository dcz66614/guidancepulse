# HANDOFF — T014 发布冻结与哈希归档：PASS，可交付

- **规格版本：** v1.1.0
- **冻结 commit：** `a7b7333a09c7dc6a078c1650c50652ea07d2f703`
  （2026-11-15T17:39:50+00:00；含 F-27 修复、release 脚本、S0 证据、
  T013 R2 审查）
- **release commit（工作 commit）：** `6ce93d81fccba9af951fde6e5d13bc75a9753ad6`
  （仅含 `02_source/release/` 六个文件）
- **日期：** 2026-11-15（验收实测 ~17:26–17:44 GMT）
- **结论：PASS**。源码、分发包、Manifest、哈希与冻结 commit 一一对应；
  S0 七门 PASS 且与冻结版本对应（冻结 commit 本身的工作树复核亦 PASS）。

## 1. 冻结产物

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `02_source/release/source.zip` | 2,973,081 | `94a205b9082634b51d636839212cad05012e28ec0a2e43114f4c408b3f61350d` |
| `02_source/release/dist.zip` | 669,142 | `64a4a939e3acdf2b6dd9200ff65f0837aebdc750171d33b54d56f1eb3262f9ca` |
| `02_source/release/RELEASE_MANIFEST.json` | 3,153 | `42852293fcf2798fcd5d59bbf4891bfe17d4f171f32636ce65cdf6c398d8dd6b` |
| `02_source/release/SOURCE_MANIFEST.csv` | 32,549 | `5c26c6ccdedd636d9c71fa006918ad4d1cf3709ea3e3a5f1347901e16b90e072` |
| `02_source/release/SHA256SUMS.txt` | 358 | `9db27cb1768ec9d5672bc3e0dc670de1af501b11e5c92a9e3e6955fdab33de6c` |
| `02_source/release/T014_FREEZE_REPORT.md` | — | 见冻结报告全文 |

- `source.zip`：冻结 commit 的 `02_source/` 树（209 文件 + 37 目录条目，
  前缀 `guidancepulse/`，确定性 STORE zip）；`SOURCE_MANIFEST.csv`
  逐文件列出路径、字节、内容 SHA-256、git blob SHA。
- `dist.zip`：57 条目（可运行分发：package.json、LICENSE、README、
  `dist/`、`bin/`、`src/`、`scripts/hook-entry.ts`、`schemas/`、`docs/` 等）。
- 对应关系：manifest 的 `frozen_commit` = `a7b7333`；`release:verify`
  对照该 commit 的树核对 source.zip，从不信任 HEAD；重跑
  `release:build` 产物字节一致（已实测）。

## 2. 验收结果（全部真实跑出）

| 命令 | 退出码 | 关键输出 |
|---|---:|---|
| `npm run release:build` | 0 | 37/37 通过；重跑一次亦 37/37，产物字节一致 |
| `npm run release:verify` | 0 | 43/43 通过（提交 release commit 后又跑一次，仍 43/43） |
| `sha256sum -c release/SHA256SUMS.txt` | 0 | 4 行全部 OK |
| `git status --short` | 0 | 空（提交后树干净） |
| `git rev-parse HEAD` | — | `6ce93d8`（release commit；冻结 commit 为 `a7b7333`，见下节） |
| `npm run s0:gate`（冻结树） | 0 | **PASS**，p95=189.85ms |
| `npm run s0:gate`（冻结 commit 工作树复核） | 0 | **PASS**，p95=190.30ms，`git_commit=a7b7333…` |
| `npm test`（全量） | 0 | **393/393**，22 文件 |

S0 七门：48/48 三向一致、32/32 检出、16/16 无误报、p95 189.85ms
（<500ms）、100 次重放 1 个 canonical SHA
`ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`、
网络 0、隐私 0；typecheck 0 错误；golden 53/53；oracle 48/48。

## 3. 冻结 commit 与 release commit 的关系

一个 commit 无法包含自身的哈希，因此 manifest 钉住源码冻结
commit `a7b7333`，release 产物与冻结报告提交在其上层
（`6ce93d8`，P023 T014 惯例）。`git rev-parse HEAD` 在提交后返回
release commit——这是自指不可能的直接后果，不是冻结失效。
核对冻结请用 manifest 的 `frozen_commit`。

冻结经过四轮尝试（`07c0778` → `83afd6d` → `5f1e6fd` →
`a7b7333`），前三轮的 `release:build` 各因一处脚本/文档问题失败，
均未提交任何 release 产物，`release/` 每次重建前删除，不存在旧
冻结包被覆盖的情况。详见冻结报告“冻结过程”一节。

## 4. F-27 处置（二选一，已选：补清理路径）

- `uninstall` 两条提前返回路径（设置文件不存在、设置中无自有
  Hook）现均调用 `removeHookBuild()` 并如实报告
  `hookBuildRemoved`；CLI 不再谎报 "nothing removed"。
- 回归测试 `tests/integration/fix-t014-f27.test.ts`（2 测试 + 1
  premise guard），树外真实 install 实测，均通过。
- 只动了 uninstall 相关逻辑（`uninstall.ts`、`main.ts` 的
  `printUninstall`）与测试；未动生产逻辑其他部分、未动阈值与
  测量口径。

## 5. 已知 P2 清单

- 旧项：F-11/F-12/F-13/F-14/F-25（登记，不阻断；详见冻结报告）。
- 新项：F-26（S0 自哈希过期，已在冻结 S0 文件上复现：实际
  `da0b8048…` vs 记录值 `3af93656…`）、F-28（F-19 卸载侧回滚无直接
  回归测试）、F-29（S0 支撑门对 vitest worker 抖动过脆；本任务内
  复现 9 次连续 FAIL 后，通过把 F-27 测试拆到独立文件使单 worker
  负载下降，拆分后全量 7 次连续 exit 0、S0 连续 5 次 PASS；根因仍 OPEN）。
- F-27：**CLOSED**（本轮修复）。F-23：**CLOSED**（协调员
  `57101fe` 已入库规格文件）。

## 6. 给协调员的注意事项

- P025 施工至此全部完成：T011/T012/T013（R2 PASS）/T014 均 PASS。
  后续由协调员汇总上报；Drive 上传与回读核对不在本任务范围内
  （未对外发布、未上传 GitHub）。
- T014 卡 §14 发布清单已逐项核对，见冻结报告；唯一依赖协调员的
  是 Drive 归档（§14 末项、§13 结构）。
- 若未来重冻：删 `02_source/release/` 后 `npm run release:build`
  即以 HEAD 为新冻结 commit；manifest 已钉住 `a7b7333` 时重跑会
  原样再生同一批产物（已实测字节一致）。

## 7. 交付文件（本次两提交）

- 工作 commit `6ce93d8`：`02_source/release/` 六个文件
  （source.zip、dist.zip、RELEASE_MANIFEST.json、
  SOURCE_MANIFEST.csv、SHA256SUMS.txt、T014_FREEZE_REPORT.md）。
- 交接 commit（本次）：`00_control/HANDOFF_T014.md`（本文件）。
- 冻结 commit `a7b7333` 及其三个被取代的前驱（`07c0778`、
  `83afd6d`、`5f1e6fd`）均保留在 git 历史中。
