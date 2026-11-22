# HANDOFF — T014 重新冻结 R1：PASS，可交付（终审 R2 待发）

- **规格版本：** v1.1.0
- **冻结 commit：** `adba7aff490eda6ef234d9bdebd5196237be332f`
  （2026-11-15T19:32:00+00:00；含 FIX-R1 全部修复、release 脚本、T013 R3 审查）
- **release commit：** `8172d3794bcb52786c398ca413070da714e73fce`
  （仅含 `02_source/release/` 15 个文件：6 个旧版文件 + 9 个 s0-evidence/）
- **本交接 commit：** 另提交（含本文件 + `reviews/REVIEW_INDEX.md` 的 R3 一节）
- **日期：** 2026-11-15（验收实测 ~19:32–19:40 GMT）
- **结论：PASS**。源码、分发包、Manifest、哈希与冻结 commit 一一对应；
  S0 七门 PASS 且与冻结版本对应（冻结 commit 证据重跑 + 树内门 +
  R3 审查员复跑三处交叉验证）。

## 1. 冻结产物

| 文件 | 字节 | SHA-256 |
|---|---:|---:|
| `02_source/release/source.zip` | 3,001,098 | `09c296141779b4056b1c9ec31cd3a1b3044a0c7ad404ec26959d3eefd7f58fb9` |
| `02_source/release/dist.zip` | 669,625 | `304a7c2e60b8796d5ba1a758ff4bd416349e53cfc4c9da5777ef83ec5ed5eb1f` |
| `02_source/release/RELEASE_MANIFEST.json` | 7,469 | `39e5d2f5fd5c2e7f94acdf69d475bd77ba5cc64536eeb3fcb6b0bfd0c4236c57` |
| `02_source/release/SOURCE_MANIFEST.csv` | 32,549 | `6efc9f61bced071468d04984bc408f4dd52c36fa014e0335d28b82a3d34680b0` |
| `02_source/release/SHA256SUMS.txt` | 1,284 | `4c8f9625a113efeb01508aea2c55fd65f67f814d4bf25b15d8a017da0afed81a` |
| `02_source/release/s0-evidence/`（9 文件） | — | 见冻结报告 `T014_FREEZE_REPORT_R1.md` |
| `02_source/release/T014_FREEZE_REPORT_R1.md` | 20,956 | 见冻结报告全文 |

- `source.zip`：冻结 commit 的 `02_source/` 树（209 文件 + 37 目录条目，
  前缀 `guidancepulse/`，确定性 STORE zip）；`SOURCE_MANIFEST.csv`
  逐文件列出路径、字节、内容 SHA-256、git blob SHA。
- `dist.zip`：57 条目（可运行分发）。launcher `bin/guidancepulse`
  为 0o755（R1-P2-02 修复后）。
- 对应关系：manifest 的 `frozen_commit` = `adba7af`；`release:verify`
  对照该 commit 的树核对 source.zip，从不信任 HEAD。
- `dist.zip` 在本轮两次 `release:build` 中 SHA 完全相同
  （`304a7c2e…`）；`source.zip` 跨轮差异只来自新鲜 S0 证据重跑
  （按设计，见冻结报告“确定性说明”）。

## 2. 验收结果（全部真实跑出）

| 命令 | 退出码 | 关键输出 |
|---|---:|---:|
| `npm run release:build`（19:32） | 0 | 44/44 通过；冻结 `adba7af` |
| `npm run release:verify`（19:34） | 0 | 62/62 通过 |
| `npm run release:verify`（提交 release commit 后重跑） | 0 | 62/62 通过（重跑前曾因未提交的 REVIEW_INDEX.md 改动报 61/62，见 §5；改动暂存后重跑即 62/62） |
| `sha256sum -c release/SHA256SUMS.txt` | 0 | 13 行全部 OK |
| `git status --short` | 0 | 空（提交后树干净） |
| `git rev-parse HEAD` | — | release commit `8172d37`（冻结 commit 为 `adba7af`，见下节） |
| `npm run s0:gate`（树内门，19:12） | 0 | **PASS**，p95=213.76ms |
| `npm run s0:gate`（冻结证据重跑，19:34） | 0 | **PASS**，p95=301.09ms，`git_commit=adba7af…`，第 1/5 次通过 |
| `npm run s0:gate`（R3 审查员复跑，19:18–19:20） | 0 | **PASS**，p95=239.88ms |
| `npm test`（全量） | 0 | **396/396**，22 文件（三处运行一致） |

S0 七门：48/48 三向一致、32/32 检出（28/1/2/1）、16/16 无误报、
p95 301.09ms（<500ms）、100 次重放 1 个 canonical SHA
`ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`、
网络 0、隐私 0（三轮均为 0，读回 `read_back_match=true`）；
typecheck 0 错误；golden 53/53；oracle 48/48。

## 3. 冻结 commit 与 release commit 的关系

一个 commit 无法包含自身的哈希，因此 manifest 钉住源码冻结
commit `adba7af`，release 产物与冻结报告提交在其上层
（`8172d37`，P023 T014 惯例）。`git rev-parse HEAD` 在提交后返回
release commit——这是自指不可能的直接后果，不是冻结失效。
核对冻结请用 manifest 的 `frozen_commit`。

冻结经过两轮尝试（`f2bc57b` → `adba7af`），首轮 `release:build`
42/44 FAIL（旧 `release/` 已跟踪导致的两项检查失败），已按原因
修复：把旧 `release/` 6 个文件从跟踪中移除（commit `adba7af`，
只含 6 处删除），冻结 commit 成为纯源码 + R3 审查。详见冻结报告
“冻结过程”一节。旧冻结 `a7b7333` 及其 release commit `6ce93d8`
均保留在 git 历史中。

## 4. FIX-R1 / T013 R3 结论（终审 R2 的输入）

- **T013 R3 = PASS**（P0=0，P1=0，P2=7），报告
  `reviews/T013_FINAL_REVIEW_R3.md`（审查对象 commit `6874984`，
  已提交；release 脚本正则已实测可解析出 P0=0/P1=0/P2=7）。
- **P1-R1-01 真正关闭**：冻结 commit S0 证据重跑（本轮 build 内，
  attempt 1/5，`git_commit === adba7af`，9 文件）+ R3 targeted 测试。
- **P1-R1-02 真正关闭**：三轮隐私扫描均为 0，无 canary 原文作键，
  无自哈希，读回 SHA 核对通过（冻结证据运行 + R3 复跑双重验证）。
- **R1-P2-01/02/03 全部关闭**（NUL 字节 / dist 0755 / 真实 npm ci）。
- **P1-R1-03 遗留阻断**：真实 Claude Code ≥v2.1.295 端到端仍未验证，
  本 VM 无 Claude Code，`blocked_external`，等 Sam 决定；单列，
  不计入 P0/P1/P2，不得因它未修就把本次冻结判 FAIL。
- **旧 P2**：F-11/F-12/F-13/F-25/F-28/F-29/R1-P2-04 仍 OPEN（不阻断）；
  F-26 已由 FIX-R1 关闭；F-27/F-23 仍关闭。F-29 根因仍 OPEN，
  只做缓解（证据重试 3→5；本轮第 1 次即通过，未命中抖动）。
- **R1-P2-04**：仓库内 `reviews/REVIEW_INDEX.md`（本轮已补 R3 一节）
  与 `REVIEW_PACK_*.md` 俱在；Drive 侧独立归档由协调员执行，
  不在本冻结产物内。

## 5. 给协调员的注意事项

- **下一步是终审 R2**：在同一 GPT 对话中发终审 R2（GPT-6 + Extra High，
  Drive 尾，≤5 轮总计；R1 已占 1 轮）。附件须含新冻结产物
  （source.zip / dist.zip / RELEASE_MANIFEST / SOURCE_MANIFEST /
  SHA256SUMS / T014_FREEZE_REPORT_R1.md / s0-evidence 关键文件 /
  T013 R3 报告），并如实说明 P1-R1-03 仍为 `blocked_external`。
- **Drive 归档**（R1-P2-04）：在 P025 文件夹 `04_release` 下新建
  R1 子文件夹归档新版全套（不覆盖旧版 a7b7333 文件），并上传
  更新后的 `REVIEW_INDEX.md` 与 REVIEW_PACK  bundle（或逐个 pack 文件）；
  上传后从 Drive 重新下载核对 SHA。
- **提交后 verify 的细节**：第一次提交后重跑 verify 报 61/62，
  唯一 FAIL 是 `working tree matches frozen commit (except release/)`，
  原因是当时 `reviews/REVIEW_INDEX.md` 的 R3 一节尚未提交——该检查
  用 `git diff --quiet <frozen> -- . :!02_source/release`，
  冻结 commit 之外的任何未提交改动都会触发。把该改动暂存后重跑即
  62/62 PASS；随后恢复改动并与本交接一同提交。最终树干净。
  以后凡在冻结 commit 之后改控制文件，verify 前须先提交或暂存。
- P025 施工至此全部完成：T011/T012/T013（R3 PASS）/T014 R1 均 PASS。
  后续由协调员汇总上报；Drive 上传与回读核对、终审 R2、GitHub 上传
  不在本任务范围内（未对外发布、未上传 GitHub）。
- 若未来重冻：先把 `release/` 从跟踪中移除并提交（本轮教训），
  再 `npm run release:build` 即以 HEAD 为新冻结 commit。

## 6. 交付文件（本次三提交）

- 冻结 commit `adba7af`：FIX-R1 修复 + R3 报告 + 旧 `release/` 移除。
- release commit `8172d37`：`02_source/release/` 15 个文件
  （source.zip、dist.zip、RELEASE_MANIFEST.json、
  SOURCE_MANIFEST.csv、SHA256SUMS.txt、s0-evidence/ 9 文件、
  T014_FREEZE_REPORT_R1.md）。
- 交接 commit（本次）：`00_control/HANDOFF_T014_R1.md`（本文件）+
  `reviews/REVIEW_INDEX.md`（R3 一节）。
