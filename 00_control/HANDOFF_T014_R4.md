# HANDOFF — T014 重新冻结 R4：PASS，可交付（T013 R6 待发）

- **规格版本：** v1.1.0
- **冻结 commit：** `17cbd1e26aa3877e8e48f3584ccc3d617b8c7008`
  （2026-11-17T02:41:28+00:00；含 FIX-R5 全部修复、release 脚本、T013 R5 审查）
- **release commit：** `e9a84725623808aa53d083e874cb9a0d90cf4d36`
  （仅含 `02_source/release/` 15 个文件：6 个顶层文件 + 9 个 s0-evidence/）
- **本交接 commit：** 另提交（含本文件；R6 报告 `reviews/T013_FINAL_REVIEW_R6.md`
  评审完成后另提交）
- **日期：** 2026-11-17（验收实测 ~02:40–02:56 GMT）
- **结论：PASS**。源码、分发包、Manifest、哈希与冻结 commit 一一对应；
  S0 七门 PASS 且与冻结版本对应（冻结 commit 证据重跑 + 树内门两处交叉
  验证）；终审 R5 的 P1-R5-01 与 R5-P2-01/02/03 均已修复（代码/文档已改，
  待 T013 R6 审查）；Drive 14/14 独立归档核对通过。

## 1. 冻结产物

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `02_source/release/source.zip` | 3,059,647 | `c5bcbc5fa55c6b8d04abeb9b3f0a18d95dd2bd3e757752b0a3f3072faa2f5055` |
| `02_source/release/dist.zip` | 682,849 | `d78d5ff8c8c8aae38232e47f5d3fdb5f08520f85d8641ebf290b2470611fb118` |
| `02_source/release/RELEASE_MANIFEST.json` | 9,290 | `bc6146be68bd3674034f8592db39cd155c0f6e5e645822e0ef553add1da9d3ce` |
| `02_source/release/SOURCE_MANIFEST.csv` | 32,550 | `3192ff54beedee804271b8681d20eda481a70325f4d8c17b733874eea1328c2e` |
| `02_source/release/SHA256SUMS.txt` | 1,284 | `4d93f48ebc54ea5e13588255d36b3d004fe804b047792d5588b025fb7afed564` |
| `02_source/release/s0-evidence/`（9 文件） | — | 见冻结报告 `T014_FREEZE_REPORT_R4.md` |
| `02_source/release/T014_FREEZE_REPORT_R4.md` | 28,403 | `5193c2d6ac92ca9fc247c5fb9cf232a6b202e9d5645b2b418377f2cfda532932` |

- `source.zip`：冻结 commit 的 `02_source/` 树（209 文件 + 37 目录条目，
  前缀 `guidancepulse/`，确定性 STORE zip）；`SOURCE_MANIFEST.csv`
  逐文件列出路径、字节、内容 SHA-256、git blob SHA。比 R3 冻结大 29,284 B
  （3,059,647 vs 3,030,363），差额来自 FIX-R5 的生产修复与新增测试。
- `dist.zip`：57 条目（可运行分发），与 R3 冻结的 dist.zip SHA 不同
  （`d78d5ff8…` vs R3 的 `d9160228…`，源于 FIX-R5 生产代码改动，预期内）。
  launcher `bin/guidancepulse` 为 0o755。
- 对应关系：manifest 的 `frozen_commit` = `17cbd1e`；`release:verify`
  对照该 commit 的树核对 source.zip，从不信任 HEAD。
- **manifest 审查引用已参数化（R5-P2-03 的修复）**：build 从冻结 commit
  树内解析最新审查，verify 从磁盘 `reviews/` 解析最新审查；本轮
  manifest `review` 块如实引用 R5（FAIL，P0=0，P1=1，P2=9，审查对象
  `8e04562`），不再硬编码 R3。FAIL 不阻断构建/核验。

## 2. 验收结果（全部真实跑出）

| 命令 | 退出码 | 关键输出 |
|---|---:|---:|
| `npm run typecheck` | 0 | 0 错误（FIX-R5 修复验证跑，协调员核实） |
| `npm test`（全量） | 0 | **455/455**，22 文件 |
| `npm run s0:gate`（树内门，02:40） | 0 | **PASS**，p95=358.93ms，`git_commit=04074d1…`，455/455 |
| `npm run s0:gate`（冻结证据重跑，02:44） | 0 | **PASS**，p95=360.22ms，`git_commit=17cbd1e…`，第 1/5 次通过 |
| `npm run release:build` | 0 | **44/44 通过** |
| `npm run release:verify` | 0 | **64/64 通过** |
| `npm run release:verify`（提交 release commit 后重跑） | 0 | **64/64 通过** |
| `sha256sum -c release/SHA256SUMS.txt` | 0 | 13 行全部 OK |
| `unzip -t release/source.zip` / `unzip -t release/dist.zip` | 0 | No errors detected |
| `git status --short`（提交后） | 0 | 仅未跟踪的 `00_control/` 旧文件（提交前已存在）；已跟踪树干净 |
| `git rev-parse HEAD` | — | release commit `e9a8472`（冻结 commit 为 `17cbd1e`，见上节） |

S0 七门：48/48 三向一致、32/32 检出（28/1/2/1）、16/16 无误报、
p95 360.22ms（<500ms）、100 次重放 1 个 canonical SHA
`ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`、
网络 0、隐私 0（三轮均为 0，读回 `read_back_match=true`）；
typecheck 0 错误；golden 53/53；oracle 48/48。

## 3. FIX-R5 修复内容（T013 R6 待审）

| ID | 修复 commit | 内容 |
|---|---|---|
| P1-R5-01 | `5f93c64` | Windows 大小写折叠门控：cwd 前缀比较与 glob 匹配均大小写不敏感；R5 探针 #3–#6 + 混合大小写均 DENY exit 2；FRESH 租约下大小写变体 Write 仍 ALLOW；POSIX 不变 |
| R5-P2-01 | `5f93c64` | Drive-relative 拼写 fail-closed：DENY exit 2，`error.code = DRIVE_RELATIVE_PATH` |
| R5-P2-02 | `e73df08` | MSVC 文档纠正：删除 C++ 工作负载要求；T015 提示词改写为诊断收集版；release 脚本内三处旧说法注释亦修正 |
| R5-P2-03 | `04074d1` | Manifest 审查引用参数化（build 树内解析、verify 磁盘解析）；本轮 manifest 已如实引用 R5 |

- **P1-R4-01：CLOSED（R5 已确认关闭）**——R5 审查员重跑 drive-letter
  测试与 hook-entry E2E 全部通过。
- **P1-R1-03：仍 OPEN（blocked_external）**——T015 未执行；S1 真实失败
  原因未知（E01 日志只在 Sam 电脑 `C:\t015-evidence\`）；**不要再让
  Sam 装 C++ 工作负载**（R3 报告的该说法已证实错误，见冻结报告
  “遗留阻断”一节）。单列，不计入 P0/P1/P2。
- F-29：仍 PARTIAL（60s 悬崖仍在；本轮冻结证据第 1/5 次通过，未命中
  抖动）。F-25：本轮两跑 358.93/360.22ms，余量 ~140ms。

## 4. Drive 归档（14/14 核对通过）

- 文件夹：`04_release/T014_R4_2026-11-17_17cbd1e`
  （id `1Px7lTxZf-B1XF80EYJS2cL78mL7AgUx2`）
- `s0-evidence/` 子文件夹 id `1vvtoanlnVdRKBD-8plIY1nVLhNunm22C`（8 文件）；
  `logs/` 子文件夹 id `1N4F3i3ROGD8Hhqg_wiEF5eIgzb0MZMQK`（`s0-gate.log`）
- 核对：6 个非 JSON 文件 SHA-256 直接比对通过；8 个 JSON 文件
  size + md5Checksum 元数据核对通过（Drive CLI 对 JSON 下载返回
  0 字节的已知问题）；9/9 证据文件与 manifest `s0_evidence.files`
  的 SHA-256 一致。

## 5. 审查覆盖范围缺口（必读）

- 本冻结 manifest 引用的 T013 R5 审查的是 `8e04562`（FIX-R4 代码），
  从未见过 FIX-R5 代码。FIX-R5 代码迄今未经过任何一轮 T013 审查。
- **不得把本冻结表述为“已通过 T013 对 FIX-R5 的审查”**；本报告的
  PASS 仅指 S0 七门 + build 44/44 + verify 64/64 + SHA256SUMS 13/13。
- 下一轮 **T013 R6 将是第一轮审查 FIX-R5 代码的 T013 审查**，审查
  对象即本次冻结产物（`17cbd1e`），届时再定 P1-R5-01 与
  R5-P2-01/02/03 的 CLOSED 与否。

## 6. 下一步

1. 派 T013 R6（独立会话，只读）：审查冻结 commit `17cbd1e` + release
   `e9a8472`（含 Drive 归档），按 R5 的审查格式出报告
   `reviews/T013_FINAL_REVIEW_R6.md`，结论 FAIL/PASS 如实写。
2. **不要提交 GPT 终审 R5**——R5 是本对话最后一轮，且 P1-R1-03
   仍需 Sam 电脑上的 T015 证据；R5 提交时机由主聊天决定。
3. 不要上传 GitHub、不要对外发布（未经批准）。
