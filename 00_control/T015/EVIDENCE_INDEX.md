# T015 证据索引（模板——执行后填写）

TASK_ID：`T015_CLAUDE_CODE_LIVE_E2E`｜规格 v1.1.0｜冻结
`f4d2b2e`｜release `536a7c3`｜dist.zip SHA-256
`304a7c2e60b8796d5ba1a758ff4bd416349e53cfc4c9da5777ef83ec5ed5eb1f`

## 填写规则

- 每项都有“实际结果 / 文件”栏：**执行后填写，执行前留空**。
  没有跑的写“未执行”，没有看到的写“未观察到”，不确定的写
  “不确定”。空着比填错强。
- 每个文件怎么产生、存在哪，见“产生方式 / 存放位置”栏；证据
  文件夹统一放在 `C:\t015-evidence\`（执行人自定路径时，在此
  注明实际路径：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_）。
- SHA-256 一律用 `Get-FileHash <文件> -Algorithm SHA256` 生成；
  文本输出（如 `claude --version`、status）要保存完整原文，不
  要只抄结论。
- 所有证据文件命名用英文、日期前缀 `2026-11-15-`，不要用中
  文文件名（跨机器传递时少出问题）。

## E00. 执行环境

| # | 证据项 | 产生方式 / 存放位置 | 实际结果 / 文件 | SHA-256 |
|---|---|---|---|---|
| E00-1 | 操作系统与版本 | `winver` 或 `Get-ComputerInfo` 输出截图/文本 | （待填） | — |
| E00-2 | Claude Code 版本证明 | `claude --version` 完整输出（必须 ≥ v2.1.295） | （待填） | — |
| E00-3 | Node.js 版本证明 | `node --version` + `npm --version` 完整输出（Node 须 ≥ 24） | （待填） | — |
| E00-4 | dist.zip 校验 | `Get-FileHash dist.zip -Algorithm SHA256` 输出；期望 `304a7c2e…eb1f` | （待填） | （待填） |
| E00-5 | `npm ci` 记录 | `C:\guidancepulse-dist` 下 `npm ci` 的完整输出（stdout+stderr，存文本） | （待填） | （待填） |
| E00-6 | 合成项目文件校验 | 复制后四文件的 SHA（见 T015_TASK.md §1 的表） | （待填） | （待填） |

## E01. 安装证据

| # | 证据项 | 产生方式 / 存放位置 | 实际结果 / 文件 | SHA-256 |
|---|---|---|---|---|
| E01-1 | `init` 输出 | 命令输出原文（期望 `initialised … (config.yaml, state.sqlite, path-key.bin, reports/)`） | （待填） | — |
| E01-2 | 覆盖后的 config.yaml | `Get-Content .guidancepulse\config.yaml` 全文（须是 t015-guard，不是默认配置） | （待填） | （待填） |
| E01-3 | `install` 输出 | 命令输出原文（期望 `added 6 hook entries` + `hook scripts: built (6 launchers, …)`） | （待填） | — |
| E01-4 | 安装后 settings | `.claude\settings.local.json` 全文（6 条 Hook 须与 T015_TASK.md 附录 B 逐字一致） | （待填） | （待填） |
| E01-5 | 安装前备份 | `.claude\settings.local.json.guidancepulse-backup.json`（如安装前无 settings 文件，写“不存在，无备份”） | （待填） | （待填） |
| E01-6 | `status`（安装后） | 命令输出原文（期望 `installed: yes (own hooks: 6/6)`） | （待填） | — |
| E01-7 | S6a 手动探针 | Windows 绝对路径探针的 stdout + `exit=0` 原文（期望 `{"ignored":true,"reason":"no-matching-rule"}`） | （待填） | — |
| E01-8 | S6b 手动探针 | 相对路径探针的 stdout + `exit=2` 原文（期望 deny JSON，原因含 `t015-guard (UNSEEN, block)`） | （待填） | — |

## E02. 测试 1 证据（Read → FRESH → Write allow/deny）

每步前后都有的两项：文件 SHA（`Get-FileHash`）与 `status`
输出原文。`protected/notes.txt` 的初始 SHA 是
`177ff890d2d42679abe110a695cc2f6eb5618e95d00d819ec1121d8a6faa437e`。

| # | 证据项 | 产生方式 / 存放位置 | 实际结果 / 文件 | SHA-256 |
|---|---|---|---|---|
| E02-1 | 1a 步前：文件 SHA + status | `Get-FileHash protected\notes.txt`；`status` 输出 | （待填） | （待填） |
| E02-2 | 1a 工具结果原文 | Claude Code 里被拒绝的 Write 工具结果全文（抄录或截图；须含 `permissionDecisionReason`） | （待填） | — |
| E02-3 | 1a 步后：文件 SHA + status + 文件内容 | SHA 须与步前一致；`Get-Content` 须无 `T015-STEP-1A` | （待填） | （待填） |
| E02-4 | 1b Read 结果 + 步后 status | Read 成功的结果；`status` 须有 `FRESH=1` | （待填） | — |
| E02-5 | 1b 步后：文件 SHA + 内容 | SHA 须变化；文件里须有 `T015-STEP-1B` | （待填） | （待填） |
| E02-6 | 1c 步后：文件 SHA + 内容 | `unprotected\scratch.txt` 须有 `T015-STEP-1C`，SHA 变化 | （待填） | （待填） |
| E02-7 | 测试 1 判定 | 按 T015_TASK.md §8：1a / 1b / 1c 各自 通过 / 失败 / 部分通过 | （待填） | — |

## E03. 测试 2 证据（PreCompact → EXPIRED → 重新读取）

| # | 证据项 | 产生方式 / 存放位置 | 实际结果 / 文件 | SHA-256 |
|---|---|---|---|---|
| E03-1 | 2a `/compact` 记录 | `/compact` 执行前后的会话记录（截图或 transcript 片段） | （待填） | — |
| E03-2 | 2a 步后 status | `status` 输出原文（期望 `FRESH=0`，`EXPIRED>=1` 或无 FRESH 租约） | （待填） | — |
| E03-3 | 2b 工具结果原文 | 被拒绝的 Write 结果全文（须含 `permissionDecisionReason`；期望含 `CONTEXT_COMPACTION`） | （待填） | — |
| E03-4 | 2b 步后：文件 SHA + 内容 | SHA 须与步前一致；无 `T015-STEP-2B` | （待填） | （待填） |
| E03-5 | 2c Read 结果 + 步后 status | Read 成功；`status` 再次 `FRESH=1` | （待填） | — |
| E03-6 | 2c 步后：文件 SHA + 内容 | SHA 须变化；文件里须有 `T015-STEP-2C` | （待填） | （待填） |
| E03-7 | 测试 2 判定 | 2a / 2b / 2c 各自 通过 / 失败 / 部分通过 | （待填） | — |

## E04. 测试 3 证据（崩溃/超时 → onFailure:"block"）

| # | 证据项 | 产生方式 / 存放位置 | 实际结果 / 文件 | SHA-256 |
|---|---|---|---|---|
| E04-1 | 3a 破坏前：文件 SHA + status | `Get-FileHash`；`status`（FRESH 须存在） | （待填） | （待填） |
| E04-2 | 3a 破坏证明 | `Rename-Item .build → .build.bak-t015` 前后的 `Get-ChildItem .guidancepulse\hooks\` 输出 | （待填） | — |
| E04-3 | 3a 工具结果原文 | 被阻止的 Write 结果全文（Claude Code 的阻止提示原文） | （待填） | — |
| E04-4 | 3a 步后：文件 SHA + 内容 | SHA 须与步前一致；无 `T015-STEP-3A` | （待填） | （待填） |
| E04-5 | 3a 恢复证明 | 改回后的 `Get-ChildItem .guidancepulse\hooks\.build\scripts\` + `status`（`installed: yes (own hooks: 6/6)`） | （待填） | — |
| E04-6 | 3b 替换前 launcher SHA | `Get-FileHash pre-tool-use.js`（替换前） | （待填） | （待填） |
| E04-7 | 3b 替换证明 | 替换后的 `Get-Content pre-tool-use.js`（30 秒睡眠脚本） | （待填） | — |
| E04-8 | 3b 工具结果原文 + 等待时长 | 被阻止的 Write 结果全文；观察到的等待时长（约数，如“约 10 秒”） | （待填） | — |
| E04-9 | 3b 步后：文件 SHA + 内容 | SHA 须与步前一致；无 `T015-STEP-3B` | （待填） | （待填） |
| E04-10 | 3b 恢复证明 | 恢复后 launcher 的 SHA（须与 E04-6 一致）+ `status`（`6/6`） | （待填） | （待填） |
| E04-11 | 测试 3 判定 | 3a / 3b 各自 通过 / 失败 | （待填） | — |

## E05. 卸载与收尾证据

| # | 证据项 | 产生方式 / 存放位置 | 实际结果 / 文件 | SHA-256 |
|---|---|---|---|---|
| E05-1 | `uninstall` 输出 | 命令输出原文 | （待填） | — |
| E05-2 | 卸载后 status + settings | `installed: no (own hooks: 0/6)`；settings 全文（自有 Hook 已移除，原有配置保留） | （待填） | （待填） |
| E05-3 | `.build/` 已移除证明 | `Get-ChildItem .guidancepulse\hooks\` 输出 | （待填） | — |

## E06. 会话记录（transcript）

| # | 证据项 | 产生方式 / 存放位置 | 实际结果 / 文件 | SHA-256 |
|---|---|---|---|---|
| E06-1 | Claude Code 会话 transcript | `%USERPROFILE%\.claude\projects\` 下本次会话的 `.jsonl` 文件，复制到证据文件夹（文件名含会话 id；记录会话 id：\_\_\_\_\_\_\_\_\_\_） | （待填） | （待填） |
| E06-2 | transcript 里的 `file_path` 格式 | 从 `.jsonl` 里抄出的 Write/Edit/Read 实际 `file_path` 值（绝对 Windows 路径 / 相对路径），至少各抄一条 | （待填） | — |
| E06-3 | 完成后的证据索引 | 本文件填写完毕的版本 | （待填） | （待填） |

## E07. 判定汇总（与 T015_TASK.md §8 一致，执行后填写）

| 测试 | 判定 | 备注 |
|---|---|---|
| 1a 未读先写 | （待填） | |
| 1b 先读后写 | （待填） | |
| 1c 对照 | （待填） | |
| 2a 压缩 | （待填） | |
| 2b 压缩后写 | （待填） | |
| 2c 重读后写 | （待填） | |
| 3a 崩溃 | （待填） | |
| 3b 超时 | （待填） | |
| 卸载 | （待填） | |

执行人签字（姓名 + 日期时间）：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
