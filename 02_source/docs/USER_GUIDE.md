# GuidancePulse 用户指南

> 适用版本：P025 GuidancePulse，规格 v1.1.0。
> 本指南只讲用户操作；实现细节见 `README.md` 与
> `00_control/v1.1.0/PROJECT_BOOK.md`。

## GuidancePulse 是什么

GuidancePulse 帮你守住一条规则：**Agent 只有在最近读过指导文件
之后，才能按指导写受保护的文件**。读过指导 → 发一张有时效的
“凭证”（租约）；压缩、换目录、换阶段、开子 Agent 后凭证失效，
下次写之前必须重新读指导。

它不联网、不保存你的 Prompt、对话或源码，只在本地 SQLite 里记
指导 ID、路径的 HMAC 标识、时间戳和凭证状态。

## 1. 安装

```bash
cd <你的项目>
guidancepulse init                    # 生成 .guidancepulse/（配置、状态库、路径密钥）
guidancepulse install --project .     # 把 Hook 接入 Claude Code
guidancepulse status                  # 确认 installed: yes，own hooks: 6/6
```

安装做了三件事：

1. **先备份。** 现有的 `.claude/settings.local.json` 会先复制到
   `.claude/settings.local.json.guidancepulse-backup.json`。备份只写
   一次——重复安装不会用已装好的配置覆盖最初的备份。
2. **只合并自己的 Hook。** 安装只往配置里加 6 条 GuidancePulse
   的 Hook（见 §5），你原有的所有配置、Hook 和 matcher 分组原样
   保留。
3. **生成 Hook 脚本。** 在 `.guidancepulse/hooks/` 下生成 6 个启动
   脚本和编译好的 Hook 入口（`.build/`），并把 Hook 入口运行
   时需要的依赖（`yaml`、`better-sqlite3` 含原生模块）以本地
   文件复制的方式随装进 `.build/node_modules/`——安装不联
   网，也不在目标项目里跑 `npm install`。启动脚本找不到编译
   入口时会直接失败（exit 2），不会悄悄放行写入。

重复运行 `install` 是安全的：第二次不会改任何东西。

> 格式说明：安装/卸载会把配置文件重写为规范的 2 空格 JSON
> （JSON 往返）。用户内容在语义上完全保留，只规范化空白格式；
> 备份文件保留原始字节，需要时可从备份精确恢复。

### 安装前需要什么

- Node.js ≥ 24（`node --version`）。
- **Windows：不需要 C++ 工具链。** `better-sqlite3@13.2.0` 自带
  N-API 预编译包（含 `win32-x64.node`），且没有安装脚本，`npm ci`
  不会触发 `node-gyp`，不需要 MSVC / Visual Studio Build Tools。
  （更正：本指南旧版曾错误地要求先装 Build Tools 2022 +
  “Desktop development with C++” 工作负载，并称 Node 24 没有预
  编译包——这两点都不成立。）
- **Windows 安装前置条件正在调查中。** T015 S1 的 `npm ci` 失败
  真实原因未知——E01 日志从未归档，只在 Sam 的电脑
  `C:\t015-evidence\` 里。如果 `npm ci` 失败，请保留完整日志交
  给 Muse 重新诊断，不要自行安装 C++ 工作负载。
- Claude Code ≥ v2.1.295 才能用严格模式 `onFailure: "block"`；
  低于该版本时，Hook 出错不会阻断写入——请先升级 Claude Code。
  （本开发 VM 未安装 Claude Code，真实触发行为尚未实测，见 §6。）

## 2. 查看状态

```bash
guidancepulse status
```

输出示例：

```text
project: /path/to/your-project
initialised: yes (config: yes, db: yes, path-key: yes)
installed: yes (own hooks: 6/6)
events: 12
scope default/main: phase=implementation leases=2 (FRESH=1, EXPIRED=1)
```

`status` 是只读的，不会改任何文件。

## 3. 阶段切换

```bash
guidancepulse phase set implementation
guidancepulse phase set review
```

切换阶段会让当前作用域的旧凭证失效（原因 `PHASE_MISMATCH`），
下次写受保护文件前需要重新读指导。同一阶段重复 `phase set`
也会使旧凭证失效——这是显式标记，与被动观测不同。

## 4. 卸载

```bash
guidancepulse uninstall --project .
```

卸载**只移除 GuidancePulse 自己的 6 条 Hook**，你原有的配置和
Hook 全部保留。卸载前同样会备份（没有旧备份时才写）。

注意两点：

- 卸载**不删除** `.guidancepulse/` 的配置、状态库、路径密钥
  和 Hook 启动脚本，你的凭证历史仍可审计，重装时也会复用。
  但卸载会移除 `.guidancepulse/hooks/.build/`（编译好的 Hook
  入口及其随装的运行时依赖）；如需彻底清除，请手动删除
  `.guidancepulse/`。
- 如果 `.claude/settings.local.json` 是安装时新建的、卸载后变
  空，卸载会直接删除这个空文件。

## 5. 安装后你的配置里多了什么

`.claude/settings.local.json` 的 `hooks` 一节新增（其余内容不动）：

| 事件 | 匹配 | 脚本 | 备注 |
|---|---|---|---|
| `PreToolUse` | `Write\|Edit` | `pre-tool-use.js` | `onFailure: block`，`timeout: 10` |
| `PostToolUse` | `Read` | `post-tool-use.js` | `timeout: 10` |
| `PreCompact` | — | `pre-compact.js` | `onFailure: block`，`timeout: 10` |
| `InstructionsLoaded` | — | `instructions-loaded.js` | `async: true`（只观测，不拦截） |
| `CwdChanged` | — | `cwd-changed.js` | `async: true`（只观测，不拦截） |
| `SubagentStart` | — | `subagent-start.js` | 新 Agent 独立作用域 |

`PreToolUse` 只匹配原生 `Write`/`Edit`；Bash、外部进程和 IDE
写入不在拦截范围内（规格 §5.5）。

## 6. 常见问题

**安装失败，配置会不会坏？**
不会。安装/卸载在写文件前先记下本次运行开始时读到的配置
内容，失败时会恢复到那份本次运行前的内容（不是最早的那份
备份——备份只留作你手动恢复用），失败原因记在
`.guidancepulse/install-failure.log` 里。恢复后请把日志发给
维护者，不要手动改备份文件。

**怎么手动恢复到安装前的配置？**
把 `.claude/settings.local.json.guidancepulse-backup.json` 复制回
`.claude/settings.local.json` 即可（先确认备份时间是你安装前那次）。

**`status` 显示 `installed: no`，但我装过？**
可能你手动改过配置、删过 Hook，或者在别的目录运行了命令。
`status` 只数配置里 GuidancePulse 自己的 6 条 Hook；重新运行
`guidancepulse install --project .` 可以补齐（幂等，不会动你
的配置）。

**Hook 没反应 / 写入没被拦？**
先查三点：(1) Claude Code 版本 ≥ v2.1.295（`onFailure: block`
的门槛）；(2) `guidancepulse status` 显示 `installed: yes`；
(3) `.guidancepulse/hooks/.build/scripts/hook-entry.js` 存在。
若启动脚本报 `HOOK_ENTRY_MISSING`，说明编译入口缺失——重新
运行 `install`；若仍缺失，可能是安装环境的源码树不可用
（此时安装会明确报告 build skipped），请检查安装输出。

**路径密钥丢了会怎样？**
`.guidancepulse/path-key.bin` 是路径 HMAC 的密钥，重新生成会
让已存凭证的路径标识全部失效（旧凭证无法再匹配）。不要删除
或覆盖它；备份项目时请一并备份。

## 7. 隐私

- 不读取、不保存、不传输 Prompt、Transcript、模型回复、源码、
  绝对路径、用户名、主机名、密钥。
- 状态库只含：事件类型、指导 ID、HMAC 路径标识、时间戳、作用
  域标识、凭证状态、阶段 ID、剩余编辑数、失效原因代码。
- 所有操作都在本机完成，没有网络请求。
