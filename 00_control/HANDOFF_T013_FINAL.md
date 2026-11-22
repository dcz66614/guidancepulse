# HANDOFF — T013 最终审查

- **task_id:** T013（最终审查）
- **project_id:** P025
- **spec_version:** 1.1.0
- **base_commit:** `143f4e53d632ebe23db4404618914a1acb847c18`
- **result_commit:** 见下（本次提交，仅 `reviews/`）
- **result:** **FAIL** — P0 = 0，**P1 = 1**（F-17），P2 = 14
- **日期：** 2026-11-15（UTC）

## 结论（一句话）

S0 七门与全部验收命令复跑均 PASS，但安装器交付的 Hook 在源码树外的
任意真实项目中无法运行（F-17，P1），T012 的全链路证据只在树内成立，
故最终审查 FAIL，T014 不得冻结。

## 审查员独立复跑（全部退出 0）

| 命令 | 结果 |
|---|---|
| `npm test` | 381/381（20 文件） |
| `npm run test:e2e` | 2/2 |
| `npm run test:offline` | 2/2 |
| `npm run test:privacy` | 16/16 |
| `npm run test:installer` | 16/16 |
| `npm run typecheck` | 0 错误 |
| `npm run build` | 成功 |
| `npm run s0:gate` | S0 PASS，p95=422.92ms（n=100，cold_start=780.23ms，failures=0），canonical SHA `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`，parity 48/48，detection 32/32（28/1/2/1），control 16/16，网络 0，隐私 0 |

另有审查员独立实验（均在 `/tmp/t013-final/`，不污染工作区）：

- F-04 反事实：vite-node 直调 `summarizeReplay`，matchesGolden=false 时
  汇总计数仍为 basis-only（`errorDetected=1/1`，`controlClean=1/1`）→ F-04 闭环真实。
- F-17 复现：树外临时项目 `init` → `install --project .` →
  `status`（6/6）均成功，但已安装的 post-tool-use / pre-tool-use
  launcher 均以 `HOOK_ENTRY_FAILED` / `Cannot find package 'yaml'`
  退出 2；`NODE_PATH` 下仍失败（ESM 忽略 NODE_PATH）。
  同链路在树内（T012 的 `.tmp-t012-*`）通过——根因是未打包的 tsc
  产物对 `yaml` / `better-sqlite3` 的裸导入依赖向上查找 `node_modules`。
- `phase set bogus` 实测 exit 0 → F-18。

## 交付文件（本次提交，仅 reviews/）

- `reviews/T013_FINAL_REVIEW.md` — 主报告（FAIL、逐项检查、问题清单）
- `reviews/REVIEW_INDEX.md` — 已更新（S0 + 最终审查总表，F-04 CLOSED、F-01 部分闭环）
- `reviews/REVIEW_PACK_F-11.md` … `reviews/REVIEW_PACK_F-25.md` — 新问题各一份（F-17 为 P1，其余 P2）
- `reviews/HANDOFF_T013_FINAL.md` — 本文件

## 下一步（给协调员）

1. 立 FIX 任务修复 F-17（打包 hook 入口或随装依赖），并补一条
   **树外**临时项目的全链路回归测试；修复后重跑全部验收命令，
   再由新的独立会话重审 T013。
2. 建议同批修复 F-18/F-19/F-20/F-21（均小）；T014 冻结前补 F-22
   （LICENSE + 第三方清单）与 F-23（`00_control/v1.1.0/` 入库、工作树干净）。
3. F-11/F-12/F-13/F-15/F-16/F-24/F-25 登记为已知项，随冻结报告注明；
   F-14 的 live 三项待有 Claude Code ≥v2.1.295 的机器后验证。
4. 工作区现状提醒：磁盘上的 `artifacts/s0/` 为审查员复跑值
   （`S0_GATE.json` sha256 `3356442e…`，p95 422.92ms），与 HEAD 提交值
   （`7bd58eb6…`，p95 199.79ms）不同；本次提交不含它们，由协调员决定
   提交或丢弃。`fixture-results.json` 内容未变（sha `79daa09b…`）。

## 审查员未做的事

- 未修改任何生产源码、测试、Golden、Fixture 或 `00_control/` 文件；
  未对外发布、未上传 GitHub。
- 未因本机无 Claude Code 而把 blocked_external 三项判通过或判失败；
  三项标记诚实，复核通过。
