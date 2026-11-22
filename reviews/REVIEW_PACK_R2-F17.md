# REVIEW_PACK_R2-F17 — F-17 修复独立复现：树外项目全链路真实可用（CLOSED）

- **审查对象 commit：** `eaeca88`（FIX-T013 交接）
- **规格版本：** v1.1.0
- **严重度：** 原 P1（第一轮最终审查 FAIL 的直接原因）
- **状态：** **CLOSED**（本轮重审独立复现验证）
- **来源：** T013 最终重审（R2）；复现脚本 `/tmp/r2-t013-repro.sh`（审查员自写），日志 `/tmp/r2-t013-repro.log`

## 1. 复现条件（与第一轮 FAIL 复现同构）

- 全新临时项目 `/tmp/r2-t013/proj`，其上层 `/tmp`、`/tmp/r2-t013`
  均无 `node_modules`；全程 `env -u NODE_PATH`；
- 不调用实现方的任何测试 helper，直接用 `bin/guidancepulse` CLI
  与 `node .guidancepulse/hooks/*.js` 启动器（即 Claude Code 的调用形态）。

## 2. 实测结果（2026-11-15 ~16:41 GMT）

| 步骤 | 退出码 | 结果 |
|---|---|---|
| `guidancepulse init` | 0 | 输出含 `reports/`（F-21 亦可见） |
| `guidancepulse install --project .` | 0 | 6 条 Hook；`.build/node_modules/{yaml,better-sqlite3}` 就位，8 个 `.node` 预编译齐全，合计 18 MB |
| `guidancepulse status` | 0 | `installed: yes (own hooks: 6/6)` |
| 合成 PostToolUse Read `CLAUDE.md` → `post-tool-use.js` | 0 | `{"persisted":true,…,"credentialedGuidanceIds":["auth-change-safety"]}` |
| 合成 PreToolUse Write `src/auth/login.ts` → `pre-tool-use.js` | 0 | `permissionDecision":"allow"`（租约 FRESH） |
| 合成 PreCompact → `pre-compact.js` | 0 | `{"persisted":true,"blocked":false,"invalidatedGuidanceIds":["auth-change-safety"]}` |
| `guidancepulse uninstall --project .` | 0 | `.build/` 已移除；启动器与配置/DB/路径密钥保留 |
| 卸载后调用启动器 | 2 | `{"guidancepulse_hook_error":"HOOK_ENTRY_MISSING"}`（fail-closed） |

三路调用均返回真实决策，无 `HOOK_ENTRY_FAILED`、无
`Cannot find package 'yaml'`。第一轮 FAIL 的根因已消除。

## 3. 实现复核（代码层）

- `02_source/src/cli/vendor-deps.ts`（新文件，105 行）：`yaml` 全量复制；
  `better-sqlite3` 只取 `package.json` + `LICENSE` + `lib/` +
  `prebuilds/`。审查员核实：`lib/` 内无任何 `require('node-addon-api')`
  （该包仅在 `better-sqlite3/package.json` 的 `dependencies` 中出现，
  为头文件构建依赖，`lib/*.js` 从不加载它）；`prebuilds/` 8 平台齐全
  （linux/darwin/win32 × arm64/x64，含 musl 变体）；缺失包时抛错转
  `HOOK_BUILD_FAILED`，不装“能装不能用”的钩子。
- 安装全程离线：`install.ts` / `vendor-deps.ts` 只有本地 `cpSync`，
  无 `npm install`、无任何网络调用；`scripts/perf-hook.ts` 计时入口
  同步随装（`perf-hook.json: build.dependencies_vendored =
  ["yaml","better-sqlite3"]`），p95 口径与真实安装形态一致。
- 约 18 MB/项目中约 17 MB 是 8 平台 `.node` 预编译；当前平台实际只需
  1 个。FIX-T013 称全量复制为“跨平台同步后无需重装”的稳妥选择——
  该权衡合理但未在规格中写死，记为观察（见主报告 §4，不单独立项）：
  若未来对安装体积敏感，可只随装当前平台 + 按需重装。
