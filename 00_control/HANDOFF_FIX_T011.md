# HANDOFF — FIX-T011: 启动器改写工作目录，`--project .` 装错位置

task_id: FIX-T011
base_commit: fc58cbc
project_id: P025
spec_version: 1.1.0
go_status: FIX（修复 T011 留下的一个 P1 缺陷；T012 在 FIX-T011 通过前保持 BLOCKED）

## goal

修复 `02_source/bin/guidancepulse` 启动器改写工作目录的缺陷：用户在自己
的项目目录下运行规格验收命令 `guidancepulse install --project .` 时，安装
落到了 02_source 而不是用户项目。不得改动 install/uninstall 的合并、备份、
幂等逻辑（已验证正确），并新增回归测试覆盖 foreign-cwd 场景。

## verdict（先说结论）

**FIX-T011 = PASS。缺陷已修复并经真实复现/验证：修复前在 /tmp 外来目录
运行 `--project .` 确实装到了 02_source；修复后同一流程装到外来目录，
own hooks 6/6、onFailure:block ×2、timeout:10 ×3、用户原有 SessionStart
保留、卸载后与原始文件 JSON 完全相等，02_source/.claude 全程未被触碰。
`npm run test:installer` 16/16（含 2 个新增回归测试）、`npm test` 375/375、
`npm run typecheck` 0 错误、`npm run s0:gate` 仍为 PASS（p95=389.16ms < 500ms，
重放哈希 ef06d30f… 不变）。**

## 缺陷根因

`02_source/bin/guidancepulse` 在 exec 之前执行了 `cd "$SOURCE_DIR"`：

```sh
cd "$SOURCE_DIR"
exec npx vite-node src/cli/main.ts "$@"
```

于是 CLI 进程内的 `process.cwd()` 恒为 02_source。`src/cli/main.ts` 的
`--project` 默认值就是 `process.cwd()`（`resolve(value)` 对 `.` 的解析也
以它为准），所以 `--project .` 与不带 `--project` 两种方式都解析到
02_source。绝对路径 `--project /tmp/...` 不受影响——与协调员的验证一致：
绝对路径工作正常，相对路径/默认路径全部错位。

## 复现证据（修复前，2026-11-15 ~15:45 GMT）

在 `/tmp/gp-fix-repro`（空目录）运行旧启动器：

```
$ bin/guidancepulse install --project .
guidancepulse: installed at /home/hatch/workspace/p025-guidancepulse/02_source (added 6 hook entries, already present 0)
settings: /home/hatch/workspace/p025-guidancepulse/02_source/.claude/settings.local.json (backup already existed, kept)
hook scripts: built (6 launchers, entry /home/hatch/workspace/p025-guidancepulse/02_source/.guidancepulse/hooks/.build/scripts/hook-entry.js)
```

`/tmp/gp-fix-repro` 保持为空；02_source/.claude 被创建/写入。复现后已清理
02_source/.claude 与 /tmp/gp-fix-repro（02_source/.claude 不在 git 跟踪中，
属此前验证的污染；清理后 `git status` 无新增）。

## 修复方法

只改 `02_source/bin/guidancepulse`：去掉 `cd "$SOURCE_DIR"`，改用绝对路径
调用 vite-node 与绝对路径入口：

```sh
exec "$SOURCE_DIR/node_modules/.bin/vite-node" "$SOURCE_DIR/src/cli/main.ts" "$@"
```

- `02_source/node_modules/.bin/vite-node` 存在，不再经 `npx`（`npx` 的相对
  解析同样依赖 cwd）。
- vite-node 按入口文件相对路径解析 TS import，与调用者 cwd 无关——已由
  下面的 foreign-cwd 手动验证与回归测试证实（install 全流程含真实 tsc
  hook 构建均成功）。
- 未改动 `src/cli/install.ts` / `uninstall.ts` / `init.ts` / `main.ts` 的
  任何逻辑：合并、备份、幂等、卸载恢复均保持 T011 已验证的状态。
- 启动器文件内新增 FIX-T011 注释，说明不得恢复 `cd`。

## 回归测试

`02_source/tests/unit/installer.test.ts` 新增 describe
`launcher preserves caller cwd (FIX-T011 regression)`，2 个测试，真实调用
`bin/guidancepulse` 脚本本身（不是直接调 TS 函数），编入
`npm run test:installer`：

1. `install --project . from a foreign cwd installs into that directory, not 02_source`
   — 在 `mkdtempSync` 外来目录预置含用户 Hook 的 settings（PreToolUse Bash
   linter + SessionStart echo），从该目录运行启动器 `install --project .`：
   断言退出码 0、stdout 含 `installed at <foreign>`、foreign 目录 settings
   own hooks 6/6、`.guidancepulse/config.yaml` 存在、用户 SessionStart 与
   Bash 组原样保留；运行前后 02_source/.claude 快照（存在性 + 文件名 +
   内容）完全一致；再 `status --project .`（project 为 foreign、own hooks
   6/6）、`uninstall --project .`，断言恢复后的 settings 与原始 JSON
   deep-equal。
2. `install with no --project flag defaults to the caller's cwd, not 02_source`
   — 同一场景，不带 `--project`：断言安装落在 foreign 目录（own hooks
   6/6）、02_source/.claude 快照不变；uninstall 后 install 创建的 settings
   文件被删除。

两个测试均用 `spawnSync(LAUNCHER, args, { cwd: foreign })`，并在 finally 中
清理外来目录。旧的 14 个测试全部用绝对路径调用 `installProject()`，所以
此前未覆盖此路径——这正是缺陷漏网的原因。

## 手动验证（修复后，2026-11-15 ~15:45 GMT，/tmp/gp-fix-verify）

从外来目录运行启动器 install/status/uninstall 全流程：

```
$ bin/guidancepulse install --project .
guidancepulse: installed at /tmp/gp-fix-verify (added 6 hook entries, already present 0)
settings: /tmp/gp-fix-verify/.claude/settings.local.json (backup written: ...guidancepulse-backup.json)
hook scripts: built (6 launchers, entry /tmp/gp-fix-verify/.guidancepulse/hooks/.build/scripts/hook-entry.js)

$ bin/guidancepulse status --project .
project: /tmp/gp-fix-verify
initialised: yes (config: yes, db: yes, path-key: yes)
installed: yes (own hooks: 6/6)
events: 0 / scopes: none

$ bin/guidancepulse uninstall --project .
guidancepulse: uninstalled at /tmp/gp-fix-verify (removed 6 hook entries)
```

逐项核对（与协调员的绝对路径验证证据一致）：own hooks 6、
onFailure:block ×2、timeout:10 ×3、用户原有 SessionStart 保留、
uninstall 后 settings 与原始文件 JSON 完全相等；全程
02_source/.claude 不存在（未被创建）。

## 验收结果（全部真实跑）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `npm run test:installer` | **16/16 通过**（原 14 + 新增回归 2） | 0 |
| `npm test` | **375/375 通过**，16 个文件 | 0 |
| `npm run typecheck` | 0 错误 | 0 |
| `npm run s0:gate` | **S0 = PASS**：parity 48/48、detection 32/32、control 16/16、100 次重放唯一哈希 `ef06d30f45d2c8460bb22eb7e477c485960bee663a6f83d5859c06ceabe8af50`、网络 0、隐私 0；perf p50=282.43ms **p95=389.16ms** p99=590.33ms（阈值 <500ms，v1.1.0） | 0 |

S0 产物 `02_source/artifacts/s0/` 由本次 gate 运行刷新（与 T011 交接时
的做法一致，未随本次提交入库；本次提交前它们已是 modified 状态）。

## changed_files（工作 commit）

- `02_source/bin/guidancepulse` — 去掉 `cd "$SOURCE_DIR"`，绝对路径 exec vite-node + 入口；新增 FIX-T011 注释。
- `02_source/tests/unit/installer.test.ts` — 新增 FIX-T011 回归 describe（2 测试）+ 文件头注释。

未修改：`00_control/` 下任何规格/历史文件；`src/cli/` 下任何生产代码；
install/uninstall 合并、备份、幂等逻辑。

## commits

- 工作 commit：`40313e0`
- 交接 commit：（见本文件提交时的哈希）

## 后续

- T012 在 FIX-T011 通过前保持 BLOCKED；本修复通过后可由协调员解封。
- 复现/验证用的 /tmp/gp-fix-repro 与 /tmp/gp-fix-verify 均为临时目录，
  验证后可删除；02_source/.claude 已清理，不存在。
