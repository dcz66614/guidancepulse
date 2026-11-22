# REVIEW_PACK_F-17 — 已安装 Hook 入口在源码树外无法解析 `yaml` / `better-sqlite3`，任意真实项目中全部 Hook 失败（P1）

- **审查对象 commit：** `143f4e5`
- **严重度：** P1（核心用户路径在真实部署形态下不可用；fail-closed 故无放行风险，不列 P0）
- **状态：** OPEN（阻断：T013 最终审查 FAIL 的直接原因；须修复后重审）
- **来源：** 审查员独立复现（T012 全链路测试未覆盖：其临时项目在源码树内）

## 1. 问题陈述

`guidancepulse install` 向目标项目写入 6 个 launcher
（`.guidancepulse/hooks/*.js`），再以裸 `tsc` 把 `scripts/hook-entry.ts`
编译进 `.guidancepulse/hooks/.build/`。编译产物是未打包的 ESM，
对 `yaml` 与 `better-sqlite3` 保持裸导入：

- `02_source/src/config/parse.ts:24`：`import { parse as parseYaml } from "yaml";`
- `02_source/src/store/store.ts:48`：`import Database from "better-sqlite3";`

Node ESM 按导入文件位置向上查找 `node_modules`。目标项目在源码树外时，
`.build/` 之上没有任何含这两个包的 `node_modules`，每次 Hook 调用都以
`HOOK_ENTRY_FAILED` 退出 2：PostToolUse 永远签发不了租约，
PreToolUse 永远以失败关闭（全部写被拒）。产品在真实项目里不可用，
只会把所有受保护写挡掉。

## 2. 复现（审查员亲自操作，2026-11-15 ~16:20 GMT）

```bash
rm -rf /tmp/t013-final/foreign-proj && mkdir -p /tmp/t013-final/foreign-proj
cd /tmp/t013-final/foreign-proj
~/workspace/p025-guidancepulse/02_source/bin/guidancepulse init
# -> initialised /tmp/t013-final/foreign-proj (config.yaml, state.sqlite, path-key.bin)
~/workspace/p025-guidancepulse/02_source/bin/guidancepulse install --project .
# -> installed (added 6 hook entries); hook scripts: built (6 launchers, ...)
~/workspace/p025-guidancepulse/02_source/bin/guidancepulse status
# -> installed: yes (own hooks: 6/6)   # status 只数配置条目，看不出问题

export GP_CONFIG=$PWD/.guidancepulse/config.yaml GP_DB=$PWD/.guidancepulse/state.sqlite \
       GP_PATH_KEY=$PWD/.guidancepulse/path-key.bin GP_PHASE=implementation
echo '{"hook_event_name":"PostToolUse","session_id":"s1","cwd":"/tmp/t013-final/foreign-proj","tool_name":"Read","tool_input":{"file_path":"/tmp/t013-final/foreign-proj/CLAUDE.md"},"tool_response":{"success":true}}' \
  | node .guidancepulse/hooks/post-tool-use.js
# stderr: {"guidancepulse_hook_error":"HOOK_ENTRY_FAILED"}
#         Cannot find package 'yaml' imported from
#         /tmp/t013-final/foreign-proj/.guidancepulse/hooks/.build/src/config/parse.js
# exit 2
echo '{"hook_event_name":"PreToolUse","session_id":"s1","cwd":"/tmp/t013-final/foreign-proj","tool_name":"Write","tool_input":{"file_path":"/tmp/t013-final/foreign-proj/src/auth/login.ts"}}' \
  | node .guidancepulse/hooks/pre-tool-use.js
# 同样 HOOK_ENTRY_FAILED，exit 2
```

对照：`NODE_PATH=<02_source>/node_modules` 下重跑仍失败——ESM 导入忽略
`NODE_PATH`，进一步证实根因是模块解析，不是环境变量。

## 3. 为什么 T011/T012 的测试没发现

- `02_source/src/cli/install.ts` 第 421–466 行 `buildHookEntries`：
  只做 `tsc` 编译（`--skipLibCheck` 等），不打包、不复制 `node_modules`、
  不设解析路径。launcher（第 367 行 `launcherScript()`）也不设任何
  解析手段。
- T012 集成测试的临时项目刻意放在源码树内：
  `02_source/tests/integration/t012-helpers.ts` 第 10–12 行注释原文：
  > Temp project dirs live INSIDE the repo tree (`.tmp-t012-*`) so the
  > compiled hook entry can resolve `better-sqlite3` from `node_modules`
  > (same constraint as the T011 launcher test).
  实现者已知该约束，但只把它写进了测试选址，未带进安装器设计。
  因此 T012 “安装→Read→FRESH→Write allow 全链路 PASS”的证据只在
  树内成立；README “Inside the project you want to protect:
  `guidancepulse install --project .`”所承诺的任意项目安装并不成立。

## 4. 影响边界

- 安全方向是 fail-closed：Hook 失败 → exit 2 → Claude Code
  （配 `onFailure:block`）阻止写；未签发租约 → 无 FRESH 可放行。
  无 stale write 被误放行，故不列 P0。
- 功能方向是全损：真实项目中 Read 观测、租约签发、写前检查、压缩失效
  全部不工作；用户得到的是“所有受保护写都被拒”，且 status 仍显示
  `installed: yes`，故障不透明。
- S0 门不受影响：S0 perf harness 把编译产物放在 `artifacts/s0/.hook-build/`
  （树内），p95 测量有效；但 p95 测的是树内可解析的形态，不是用户
  项目中的真实形态。

## 5. 修复方向（供修复任务参考，审查员不代写实现）

任选其一（需另立 FIX 任务，修复后重跑全部验收 + 本审查复核）：

1. 打包 hook 入口（含 `yaml`、`better-sqlite3` 原生绑定）为自包含产物
   再安装；或
2. 安装时把解析所需的 `node_modules`（至少 `yaml` 与
   `better-sqlite3` 及其原生 `.node`）随 `.build/` 一起复制进项目，
   并保证 launcher 解析到它；或
3. 把 hook 入口改为零运行时依赖（去掉 `yaml`/`better-sqlite3` 的
   裸导入——改动面大，需评估）。

同时须补一条回归测试：临时项目建在源码树外（如 `os.tmpdir()`），
断言 Read→FRESH→Write allow 全链路通过；树内选址不得再作为
“解析得到满足”的前提。修复后 T013 须重审。
