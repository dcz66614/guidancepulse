# HANDOFF — T011 CLI 安装、卸载与用户操作入口

- **task_id:** T011
- **base_commit:** 36d3660
- **result_commit:** 220507ffced5131277c26763107f8d2065294ce8
- **project_id:** P025
- **spec_version:** 1.1.0
- **result:** PASS — 验收命令全部退出 0；S0 复核 PASS

## goal

实现 `guidancepulse` 的用户操作入口：`init` / `install` /
`uninstall` / `status`（以及 `phase` 的 CLI 接线），安装须幂等、
先备份、只合并自有 Hook，卸载只移除自有条目，失败回退恢复备份。

## changed_files（工作 commit）

- `02_source/src/cli/install.ts`（新增）— §7.1 六条 Hook 定义
  （`GUIDANCEPULSE_HOOKS`）、`isGuidancePulseHookEntry` 自有条目标识、
  `mergeOwnHooks` / `removeOwnHooks` / `countOwnHooks` 纯函数、
  备份→合并→原子写流程、失败回退 + 失败日志、tsc 编译 Hook 入口
  与 6 个启动脚本生成。
- `02_source/src/cli/uninstall.ts`（新增）— 只移除自有条目；备
  份、失败回退与 install 对称；安装新建且卸载后变空的 settings
  文件直接删除；不删除 `.guidancepulse/` 状态。
- `02_source/src/cli/init.ts`（新增）— `initProject`（生成
  `config.yaml` / `state.sqlite` / `path-key.bin` / `reports/`，
  幂等，永不重生成路径密钥）与 `statusProject`（只读打开 store）。
- `02_source/src/cli/main.ts`（新增）— CLI 分发：`init` /
  `install` / `uninstall` / `status` / `phase set` / `--help`；
  退出码 0 成功、1 用法/操作错误；无网络。
- `02_source/bin/guidancepulse`（新增，可执行）— `vite-node`
  启动器（S0 脚本同款运行器），`02_source/bin` 加入 PATH 后可直
  接运行 `guidancepulse`；另有 `npm run guidancepulse -- <args>`。
- `02_source/tests/unit/installer.test.ts`（新增，14 测试）—
  纯函数合并/移除、真实文件安装/卸载往返、备份语义、失败日志、
  以及一次真实 tsc 编译 + 合成 PreToolUse 穿过生成的启动脚本。
- `02_source/package.json` — 新增 `test:installer`、
  `guidancepulse` 脚本。
- `02_source/.gitignore` — 安装生成的本地状态永不提交
  （`state.sqlite*`、`path-key.bin`、`hooks/.build/`、
  `install-failure.log`、`.claude/`）与测试暂存目录。
- `02_source/README.md`（新增）、`02_source/docs/USER_GUIDE.md`
  （新增）— 安装/卸载/状态/阶段操作、§7.1 Hook 表、安全契约、
  常见问题与隐私说明。
- `02_source/.guidancepulse/config.yaml`、`02_source/.guidancepulse/hooks/*.js`
  （新增，6 个启动脚本）— 本仓库自身的安装产物（`install
  --project .` 的实际输出）；`state.sqlite` / `path-key.bin` /
  `.build/` 为本地状态，已 gitignore。
- `02_source/artifacts/test-logs/T011_acceptance.log`（新增）—
  验收命令完整输出、补充场景 diff、失败日志说明。

未修改 `00_control/` 下任何规格/历史文件；未动 S0 源码与
Golden；无对外发布、无 GitHub 上传。

## 验收（全部真实运行）

| 命令 | 退出码 | 证据 |
|---|---|---|
| `guidancepulse init`（02_source 内） | 0 | 初始生成 `config.yaml, state.sqlite, path-key.bin`；日志 `T011_acceptance.log` §1 |
| `guidancepulse install --project .`（首次） | 0 | 增加 6 条 Hook；`onFailure: block` ×2、`timeout: 10` ×3（grep 计数见日志）；Hook 入口 tsc 编译成功 |
| `guidancepulse install --project .`（第二次，幂等） | 0 | `already installed … no changes`；未写备份；settings 文件不变 |
| `guidancepulse status` | 0 | `installed: yes (own hooks: 6/6)`，`events: 0` |
| `guidancepulse uninstall --project .` | 0 | 移除 6 条；安装新建的空 settings 文件已删除 |
| `guidancepulse status`（卸载后） | 0 | `installed: no (own hooks: 0/6, no settings file)` |
| `npm run test:installer` | 0 | 14/14 通过（含一次真实 tsc 编译与合成事件穿启动脚本） |

补充证据（同一日志后半段，`/tmp/gp-t011-user` 预置用户配置）：
- 安装前备份与原始文件字节相同（diff 为空，原始 sha256
  `b4141b42…`）；安装 diff 只新增 6 条自有 Hook，用户
  `permissions`、Bash Hook、`SessionStart` 全部保留；
- 卸载后与原始文件 JSON 语义完全相等（python `json.load`
  比较 `True`，用户 Hook 与 permissions 均相等）。
- 失败路径测试：非法 JSON 的 settings 使安装以
  `INVALID_SETTINGS` 失败，原始文件字节不变，失败行写入
  `.guidancepulse/install-failure.log`（见 installer 测试）。

## 安装前后 diff 摘要

- 无既有配置时：安装新建 `.claude/settings.local.json`，内容
  仅含 `hooks` 一节的 6 条自有 Hook（PreToolUse `Write|Edit` +
  `onFailure: block` + `timeout: 10`；PostToolUse `Read` +
  `timeout: 10`；PreCompact + `onFailure: block` + `timeout: 10`；
  InstructionsLoaded / CwdChanged `async: true`；SubagentStart）。
  安装后 settings sha256 为
  `3d93823eb0fe070bf40d847d62d4e291c9c1069e2481312722e91e330122539c`。
- 有既有配置时：只追加 6 条自有 Hook（PreToolUse 追加为同事件
  下的第二个 matcher 分组），其余内容语义不变。
- 卸载后：恢复到安装前状态（JSON 语义相等）；安装新建的文件
  被删除，`.guidancepulse/` 状态保留待审计/重装。

## S0 复核（T011 不得破坏 S0）

- 命令：`npm run s0:gate`，退出码 **0**，**S0 overall verdict:
  PASS**（2026-11-15 15:39:37 UTC）。
- 七项全过：parity 48/48；detection 32/32；control 16/16；perf
  p95 **192.76ms** < 500ms（p50 157.59ms，cold start 283.94ms）；
  100 次 replay 恰好 1 个 canonical SHA
  `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`；
  网络请求 0；隐私 canary 0。
- 支撑证据：typecheck PASS；全量测试 373/373（16 文件，含新增
  的 14 个 installer 测试）。
- `artifacts/s0/S0_GATE.json` sha256
  `2c13503f850ac368658ccb5acbaeaef7b275e8402be451877fb7fd8637497d89`。
- 复核中发现并修复一处 T011 自身缺陷：installer 测试初版含
  非法类型断言，致 typecheck exit 2、S0 首跑 FAIL（七项门本身
  全过）；修正断言为类型化访问后 typecheck PASS、S0 重跑 PASS。
  该 FAIL 是 T011 测试代码问题，不是 S0 回归。
- 注意：S0 复核重写了 `02_source/artifacts/s0/*`（该批文件在
  T011 开始前已是 T013 复跑留下的脏状态）；本次两个 commit
  **不含**这些文件，S0 产物归属仍由 T010/T013 的证据管理决定。

## 实现要点（供 T012/T013 复核）

- **自有条目标识**：`type=command` + `command=node` + 首参以
  `${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/` 开头且以 `.js`
  结尾。用户自己的 `node` Hook（指向别处）一律视为外部，合并
  与卸载都不碰。
- **备份语义**（复核中修正过一次）：仅当本次合并确实会改文件
  且尚无备份时写备份。初版对“无变化的重装”也写了备份，会把
  已装好的配置误记为“安装前备份”；现已修正并加测试断言
  （重装后备份文件不存在）。
- **启动脚本**：6 个 `.js` 启动器用动态 `import()`（CJS/ESM
  通吃），项目目录取自启动器自身被调用路径
  （`process.argv[1]` 的上三级），不依赖 cwd；找不到编译入口
  时 stderr 写 JSON、exit 2（fail-closed）。编译入口由安装时
  `tsc` 编译 `scripts/hook-entry.ts` 得到，与 S0 性能 harness
  同款调用。
- **合成事件实测**：生成的 `pre-tool-use.js` 对合成
  PreToolUse/Write（未受保护路径）返回
  `{"ignored":true,"reason":"no-matching-rule"}`、exit 0，
  证明启动器 + 编译入口真实可跑。不是真实 Claude Code 触发
  的证据（见 known_limits）。
- **`phase set` 的 CLI 接线**：沿用 T006 的 `setPhase`，但 CLI
  暂无作用域选择参数，操作默认作用域 `default`/`main`，已在
  `main.ts` 注明为后续事项；不在 T011 验收命令内。

## known_limits

- **Claude Code 未安装**（T001 事实未变）：真实 Hook 触发、
  真实 PreToolUse 拦截、`onFailure: "block"` 的 fail-closed
  行为在本机均无法验证；需在 Claude Code ≥ v2.1.295 的机器上
  由 T012 补测。
- **Hook 脚本分发限制**：编译入口 import `better-sqlite3`，
  Node 从入口文件向上找 `node_modules`，所以 Hook 脚本目前只
  在 guidancepulse 包（及其 `node_modules`）可达的项目里能跑；
  源码树不可用时安装跳过编译并如实报告，启动器届时 fail-closed。
  对外发布打包是 T014 的事。测试里用仓库内暂存目录验证此路径。
- **格式规范化**：安装/卸载把 settings 文件重写为规范 2 空格
  JSON（JSON 往返）。用户内容语义完全保留，只规范化空白格式；
  备份文件保留原始字节，可精确恢复。此行为已写入 README /
  USER_GUIDE / 验收日志。
- **备份文件残留**：卸载后备份文件保留在
  `.claude/settings.local.json.guidancepulse-backup.json`
  （gitignored），供手动恢复；不自动删除。
- **失败日志位置**：`.guidancepulse/install-failure.log`
  （gitignored）；安装失败的测试只覆盖非法 JSON 场景，写失败
  （如磁盘满）的回退路径靠代码审查，未做故障注入。

## sha256

```text
f17f720e73781315714a8327331e86d89563e8e75ecf45e0e47f20ea05710bf0  src/cli/install.ts
297f5ce8a9725c7c0cf2c797872a90130dc13ac5c23cb9d23863624ec6035b6b  src/cli/uninstall.ts
bde040da0c4ec57d62d8d479a6df3b69a57c360162ff6f9a8006bf009c440cbc  src/cli/init.ts
d8c13b7a726b3d3984690f2b640ab7f918c4b91999e8a08927b3d6db36441bb9  src/cli/main.ts
4aa89304eef55c0178e3fdaac4d130d23f0b4c918a02f7cf73ad9fbd660f688a  tests/unit/installer.test.ts
a25c503b49a07a2d7e8688a4ad23dfa201e1a6d0a02f1003ded04a7f87de730a  README.md
803d26e65e4f20cda9237ac8a1e849c2ab99cb4e927dbabf79252178b9152ffb  docs/USER_GUIDE.md
3b90a433db288f6236805e760b7e0c74eb50f1be83dbeaface953da10ae040e9  bin/guidancepulse
79b2bcc0c809fa6adfb49941b4817d1de49d91b00cdb10136d06352d91abb01c  .guidancepulse/hooks/pre-tool-use.js
ce2d085a08683989a00fc49534e497b0750451ff19c3653b3c12763f7f8e6877  .guidancepulse/config.yaml
d8d30e34d38662f89f8903e2f190d8297082fa2581528ce976496dbb813bb4bb  artifacts/test-logs/T011_acceptance.log
2c13503f850ac368658ccb5acbaeaef7b275e8402be451877fb7fd8637497d89  artifacts/s0/S0_GATE.json (S0 复核)
```

## next_task

- **T012 集成、E2E、离线与隐私回归**（前置：S0 PASS、T011 PASS
  —— 均已满足）。需一台 Claude Code ≥ v2.1.295 的机器做真实
  端到端；本机只能做合成路径。
- T013 最终审查时复核：备份语义、启动脚本的项目目录推导、
  `phase set` 默认作用域、格式规范化是否可接受。
