# P025 GuidancePulse — T014 Handoff R5（重新冻结，FIX-R6 后）

- 冻结 commit：`4216d962328a15a432de534947d6a56483dccd7d`（2026-11-17T03:23:34+00:00）
- Release commit：`fb4d8087babd73f390a6a58a0904f8771412bb2e`
- 取代的旧冻结：`17cbd1e`（release `e9a8472`）；更早的 `8e04562` / `f4d2b2e` 均保留在 git 历史与 Drive 旧版中
- 冻结报告：`02_source/release/T014_FREEZE_REPORT_R5.md`（31,255 B，sha `8965b7d7…`；Drive id `1B25PCPav8J_YFaxyEF5-ifM3_0IQYTyR`）
- 状态：**冻结 PASS，T013 R7 待审**

## 本轮做了什么（FIX-R6）

T013 R6（PASS，0/0/10，审查对象 `17cbd1e`）发现的两个新 P2 绕过已修：

| ID | 修复 commit | 内容 |
|---|---|---|
| R6-P2-01 | `8077c3c` | 尾随点/空格目录段绕过：`normalizedSegments` 对 Windows-origin 路径逐段剥离尾随空格/句点；相对目标走 `normalizeWindowsRelativeTarget` |
| R6-P2-02 | `8077c3c` | drive-rooted / POSIX-absolute 拼写绕过：新增 `isDriveRootedPath`，Windows cwd 下先按 cwd 盘符补成 `C:/…` 再做前缀比较；POSIX cwd 不受影响；UNC cwd 下 fail-closed（新码 `DRIVE_ROOTED_PATH`） |

唯一生产代码改动：`02_source/src/privacy/sanitize.ts`（+141/−16）。
新增测试：`02_source/tests/unit/fix-r6-path-spellings.test.ts`（34 个）。

## 核实结果（协调员亲自跑出）

- 协调员独立探针 17/17 通过（临时测试，跑完即删）：R6 的 T1/T2/R1–R3 × Write/Edit 全部 DENY exit 2；对照组（规范拼写 DENY、`.`/`..` DENY、FRESH 下 ALLOW、项目外 ALLOW、POSIX cwd 下不折叠/不剥离 ALLOW）全部正确
- 新测试文件 34/34；全量测试 **489/489**（23 文件）；typecheck 0 错误；golden 53/53；oracle 48/48
- 树内门 S0 **PASS，p95=228.95ms**（`8077c3c`，03:23:20）；冻结证据重跑两轮均 PASS（p95=197.95ms / 199.75ms，`4216d96`）；canonical hash `ef06d30f…` 各轮不变
- `release:build` **44/44**（第二轮完整日志 `build-r5.log`；第一轮 exit 0 但只留 tail -30，未留存完整计数——如实记录；两轮产出的 zip SHA 逐字节相同，确定性重建得到证实）
- `release:verify` **64/64**（两轮均 PASS，完整日志 `verify-r5.log` / `verify-r5b.log`）；`sha256sum -c` **13/13**；两 zip `unzip -t` 均 clean
- 产物：source.zip 3,080,620 B sha `9aa4d786…`；dist.zip 688,475 B sha `c77c4224…`；manifest 9,291 B sha `6ef6c413…`；csv 32,717 B sha `e2946d9b…`；SHA256SUMS 1,284 B sha `eefa8c85…`
- Drive `04_release/T014_R5_2026-11-17_4216d96`（id `1luvYP-y8Py1iUPotg6TGyRu4O6dcKz26`）：**14/14 核对通过**（6 非 JSON 下载比 SHA，8 JSON 用 size+md5Checksum）；另冻结报告 .md 已一并归档（R6-P2-04 本轮已修复；文件夹内现共 15 个文件，R7 报告完成后补传为 16 个）
- 归档小插曲：`logs/` 子文件夹最初误建在 R5 文件夹顶层（空文件夹），当场删除后在 `s0-evidence/` 内重建；最终布局与 R4 一致

## T013 R7 待审（下一轮）

- 审查对象：冻结 commit `4216d96` / release commit `fb4d808`
- 审查范围：FIX-R6 全部内容（R6-P2-01、R6-P2-02 的修复）+ 主动寻找新绕过 + 冻结产物自洽性 + Drive 归档 + R6 结转的 P2（F-11/12/13/25/28、F-29 PARTIAL、R6-P2-03 流程项；R6-P2-04 已由本轮归档修复）
- Manifest 的 T013 引用现为 R6（PASS，0/0/10，审查对象 `17cbd1e`）——**R6 从未见过 FIX-R6 代码**，R7 是第一轮审查 FIX-R6 代码的 T013 审查；不得把本冻结表述为“已通过 T013 对 FIX-R6 的审查”
- P1-R1-03（真实 Claude Code E2E）仍为 blocked_external，单列，不计入计数；T015 S1 真实原因未知（E01 日志只在 Sam 电脑 `C:\t015-evidence\`），不要再让 Sam 装 C++ 工作负载

## 未做的事

- 未提交 GPT 终审 R5（R5 是本对话最后一轮，且 P1-R1-03 仍 OPEN，提交时机由主聊天决定）
- 未上传 GitHub，未对外发布
- 未动冻结 commit `f4d2b2e` / `8e04562` / `17cbd1e`；未改规格文件与阈值
