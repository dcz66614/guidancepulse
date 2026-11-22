# T015_CLAUDE_CODE_LIVE_E2E — 真实 Claude Code 三项端到端验证

## 任务状态

| 项目 | 内容 |
|---|---|
| TASK_ID | `T015_CLAUDE_CODE_LIVE_E2E` |
| 状态 | `PENDING_OWNER_EXECUTION`（终审 R3 裁决，P1） |
| 对应终审问题 | P1-R1-03：真实 Claude Code 三项 E2E 尚未执行 |
| 规格 | v1.1.0 |
| 冻结 commit | `f4d2b2e7ba0698b793e8b3e70d843b6e32354f61` |
| Release commit | `536a7c3` |
| dist.zip SHA-256 | `304a7c2e60b8796d5ba1a758ff4bd416349e53cfc4c9da5777ef83ec5ed5eb1f`（669,625 B） |
| 执行人 | 项目负责人 Sam（在他自己的 Windows PC 上） |
| 构建者 / 验证者 | 独立会话（终审 R3 要求）；本包由构建者准备，验证者另行独立核验 |

终审 R3（GPT-6 + Extra High，2026-11-15 20:38 GMT，`FINAL_VERDICT:
EVIDENCE_INCOMPLETE`，P0=0，P1=1，P2=6）要求：建立独立验证任务
T015，使用合成测试项目和临时文件，不使用真实业务源码或敏感
Prompt。完成后交付：Claude Code 版本证明、三项测试各自的原始
执行日志、Hook 配置与触发结果、崩溃/超时场景下实际写入是否被
阻止的证据、测试前后文件状态、SHA-256 与证据索引。

## 本任务不是什么

- 不改产品源码、不重新冻结、不动 Drive、不做 GitHub 上传。
- 不用合成 Hook JSON 代替真实触发：三项测试必须在真实 Claude
  Code 会话里由真实工具调用触发。唯一的例外是 §2 的 S6 手动探
  针——它是安装自检，不是三项测试的替代品。
- 不预设结论：每项测试按 §8 的判定表独立记录通过/失败；失败
  是证据，不是事故。

## 重要预告：Windows 绝对路径问题（执行前必读）

准备本包时，构建者用冻结代码实测发现：**冻结版 Hook 对
Windows 绝对路径不设门**。实测（冻结 `adaptHookEvent` +
`hook-entry.ts`，T015 配置，过程见 `CONSISTENCY_CHECK.md` §3）：

- `file_path = "C:\t015-test\protected\notes.txt"`（Windows 绝对
  路径）→ `{"ignored":true,"reason":"no-matching-rule"}`，exit 0，
  **不设门，写入直接放行**；同路径的 Read 也不签发 FRESH
  （`no-matching-guidance`）。
- `file_path = "protected/notes.txt"`（相对路径）→ 正常写前检查，
  UNSEEN 时 DENY，exit 2。
- POSIX 绝对路径（Linux）→ 正常写前检查。

根因：`sanitize.ts` 的 `readToolFilePath` 与 `adapter.ts` 的
`resolveRelativeTarget` 只对 `/` 开头的路径做 cwd 前缀剥离；
`C:\…` 路径被规范化为 `C:/t015-test/protected/notes.txt`，与相
对 glob `protected/**` 永不匹配。冻结单元测试中没有任何
Windows/drive-letter 用例（path-matcher、config、hooks-adapter
三处均为 0）。规格 §10 风险表原话：“Windows 路径问题 | P2，
若导致误放行则 P1”——本实测表明它**导致误放行**。

这意味着：**如果真实 Claude Code 在 Windows 上以绝对路径发送
`file_path`（官方行为），测试 1 与测试 2 很可能在真机上失败
（写入不被拦），而测试 3（崩溃/超时 → onFailure block）不受
此影响**——onFailure 由 Claude Code 本身在 Hook 进程失败时强
制执行，与 Hook 自身逻辑无关。

执行人须知：

1. 先做 §2 的 S6 手动探针，亲眼看到这一行为，再进 live 测试。
2. Live 测试中**不得**用任何变通绕过它（不得把 `applies_to` 改
   成绝对路径、不得让 Agent 用相对路径、不得改产品代码）。变通
   会测到另一个配置，不是冻结 release。
3. 如测试 1a 在真机上确实放行（文件被改），如实记录为**测试
   失败 + 产品发现**（P1 级），不要重做、不要掩盖；其余测试照
   常跑完，独立判定。
4. Live 运行时从 transcript（`.jsonl`）中抄下 Claude Code 实际
   发送的 `file_path` 格式（绝对/相对），作为 E11 的证据——它
   决定上述预测是否成立。

---

## §0 冻结 release 身份（执行前核对）

| 产物 | 大小 | SHA-256 |
|---|---|---|
| source.zip | 3,004,347 B | `bc607d947df7ea9906df6af557cffe02993f8022695e2045afa31a9b6a5f7ed7` |
| dist.zip | 669,625 B | `304a7c2e60b8796d5ba1a758ff4bd416349e53cfc4c9da5777ef83ec5ed5eb1f` |
| RELEASE_MANIFEST.json | 8,306 B | `577c60aa394c45470faba3eced6d8562300595fc4758263ddc047169e149a9e8` |
| SOURCE_MANIFEST.csv | 32,549 B | `7f4975bc6f83753fd10c473e850afd4edddae877a1c561c10e06a705354f8146` |
| SHA256SUMS.txt | 1,284 B | `f0b96bf8795bd88248e547be8d01edb9ff64ee105def69316a46cd2a47b024d0` |

- Drive 位置：`agent project auto / 04_release /
  T014_R2_2026-11-15_f4d2b2e`（文件夹 id
  `149D7McRYEx6MaikZYtEWhFMt0rS2jzdx`），内含 `s0-evidence/`
  子文件夹（9/9 文件，终审 R3 已独立核对）。
- S0：PASS，p95 = 217.64 ms（< 500 ms），测试 396/396，22 文件，
  canonical hash `ef06d30f…af50`，证据生成于
  2026-11-15T20:10:06.363Z，`git_commit === f4d2b2e`。
- T013 R4：PASS（P0=0，P1=0，P2=7），`reviews/
  T013_FINAL_REVIEW_R4.md`。
- **安装来源：只用 dist.zip。** 不要用 source.zip 安装（它是
  209 文件的源码快照，供审查用）。dist.zip 是 57 条目的可运行
  发行包：解压 + `npm ci` 后可运行（T014 R2 冻结报告，两处
  smoke 实测）。

## §1 前置条件

- [ ] 机器：Sam 的 Windows PC，Claude Code **已安装并已登录**。
- [ ] `claude --version` 输出版本号 **≥ v2.1.295**（`onFailure:
      "block"` 的官方门槛，IMPLEMENTATION_PLAN §2.2；低于该版本
      时 Hook 出错不会阻断写入，本任务无法执行——先升级）。
- [ ] Node.js **≥ 24**（`node --version`；`package.json` engines
      字段要求 `node >= 24`）。
- [ ] Windows 首次安装前置：**Visual Studio Build Tools 2022 +
      “Desktop development with C++” 工作负载**（含 MSVC v143 与
      Windows SDK），安装需要管理员权限。原因：`npm ci` 要给
      `better-sqlite3@13.2.0` 跑 `node-gyp rebuild` 编译原生模
      块，Node 24（v137）win32-x64 没有预编译包；没装 C++ 工作
      负载时 `npm ci` 在 `better-sqlite3` 这一步失败（T015 首次
      执行即因此在 S1 阻塞）。先用 `vswhere -requires VC.Tools`
      核对——查不到 C++ 组件就先按
      `T015_NPM_INSTALL_PROMPT.md` 补装，再跑 `npm ci`。
- [ ] 从上面 §0 的 Drive 文件夹下载 `dist.zip`，核对 SHA-256
      等于 `304a7c2e…eb1f`（`Get-FileHash dist.zip -Algorithm
      SHA256`）。**对不上就停，不要继续。**
- [ ] 解压到**无空格的短路径**，例如 `C:\guidancepulse-dist\`
      （路径含空格可能破坏 `bin/guidancepulse` 启动脚本的路径
      解析；且 Hook 入口路径会进 settings，短路径最稳）。
- [ ] 首次搭建需要 `npm ci`（访问 npm registry，一次性；装完后
      Hook 运行本身不联网——见 `CONSISTENCY_CHECK.md` §4 第 4
      条。不要用 `npm ci --omit=dev`：`tsc`/`vite-node` 在
      devDependencies 里，安装时要编译 Hook 入口）。
- [ ] 测试项目路径同样用无空格短路径，例如 `C:\t015-test\`。
- [ ] 全程只用这一个全新的 Claude Code 会话做测试，不要在同
      一会话里做其他工作；不要 `--resume`/`--continue` 旧会话。
- [ ] 预计用时约 30–45 分钟（搭建约 15 分钟，三项测试约 20–30
      分钟；为估计值）。

### 合成测试项目（本包 `synthetic-project/`）

复制整个目录到 `C:\t015-test\`，保持结构：

```
C:\t015-test\
  GUIDANCE.md                  <- 指导来源（规则 t015-guard 的 source）
  protected\notes.txt          <- 受保护目标（applies_to）
  unprotected\scratch.txt      <- 对照目标（无规则覆盖）
  guidancepulse-config.yaml    <- init 后复制到 .guidancepulse\config.yaml
```

复制后核对 SHA-256（`Get-FileHash <文件> -Algorithm SHA256`）：

| 文件 | SHA-256 |
|---|---|
| GUIDANCE.md | `127c33c7f06c3849727ccc62aacec11aa5283feede0a91dc816d6a97b6dc57d8` |
| protected/notes.txt | `177ff890d2d42679abe110a695cc2f6eb5618e95d00d819ec1121d8a6faa437e` |
| unprotected/scratch.txt | `6cf287762c17b10f1ed60c9ab6061043f7ebf32e4401e0b202014eab7dfdb0fa` |
| guidancepulse-config.yaml | `b37272bd8dab038918eec8ba7818c1d7861df219d4cef6d4d015760c0bcf24d2` |

**禁止事项：** 不要重命名任何文件（配置按相对路径精确匹配
`GUIDANCE.md` 与 `protected/**`）；不要添加 `CLAUDE.md`、
`.claude\rules\`、`AGENTS.md` 或任何其他指导文件（初始租约
状态必须是 UNSEEN，只有显式 Read `GUIDANCE.md` 才能签发
FRESH）；不要添加任何真实业务源码。

### T015 配置（init 后覆盖默认配置）

`init` 生成的默认配置是规则 `auth-change-safety`
（sources `CLAUDE.md`、`.claude\rules\security.md`，适用于
`src/auth/**`、`src/session/**`），**不保护本测试项目**。
`init` 从不覆盖已存在的配置，所以必须手动复制：

```powershell
Copy-Item C:\t015-test\guidancepulse-config.yaml C:\t015-test\.guidancepulse\config.yaml -Force
```

该配置只有一条规则（构建者已用冻结 `parseConfigYaml` 验证
通过）：

```yaml
version: 1
defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny
phases: [explore, implementation, review, release]
rules:
  - id: t015-guard
    source: [GUIDANCE.md]
    applies_to: [protected/**]
    mode: block
    max_successful_edits: 5
```

要点：规则没有 `phases` 字段，因此适用于全部已声明阶段
（PROJECT_BOOK §5.1；解析器会展开为全部 4 个阶段）；`mode:
block` 表示 UNSEEN/EXPIRED 时拒绝写入；编辑预算默认 5 次，
三项测试最多用 2 次成功编辑，预算永不触顶。

---

## §2 搭建（S1–S6）

所有 `guidancepulse` 命令都在 PowerShell 里用 npm 入口运行
（dist.zip 内没有 `.cmd`/`.ps1` 启动器；`bin/guidancepulse`
是 sh 脚本，只能在 Git Bash 里跑——见附录 C）：

```powershell
cd C:\guidancepulse-dist
npm run guidancepulse -- <命令>
```

### S1. 解压 + 安装依赖

```powershell
# 已下载并核对 SHA 的 dist.zip，解压到 C:\guidancepulse-dist
cd C:\guidancepulse-dist
npm ci
node --version   # 须 >= 24
npm run guidancepulse -- --help   # exit 0，打印用法
claude --version # 须 >= v2.1.295，记录完整输出（证据 E01）
```

`npm ci` 失败（尤其 `better-sqlite3` 原生预编译下载/编译失
败）时：**停下**，把完整错误输出存为证据，不要改用 WSL 或
其他环境绕过——冻结 release 的 Windows 支持本身就是本次验
证的一部分。若失败原因是缺 MSVC C++ 工具链（见 §1 前置条
件），按 `T015_NPM_INSTALL_PROMPT.md` 补装工作负载后重跑
`npm ci` 即可。

### S2. 初始化测试项目

```powershell
cd C:\t015-test
npm --prefix C:\guidancepulse-dist run guidancepulse -- init --project C:\t015-test
```

期望输出（`src/cli/main.ts` 的 `printInit`）：

```text
guidancepulse: initialised C:\t015-test (config.yaml, state.sqlite, path-key.bin, reports/)
```

### S3. 覆盖配置

```powershell
Copy-Item C:\t015-test\guidancepulse-config.yaml C:\t015-test\.guidancepulse\config.yaml -Force
Get-Content C:\t015-test\.guidancepulse\config.yaml  # 确认是 t015-guard，不是默认的 auth-change-safety
```

### S4. 安装 Hook

```powershell
npm --prefix C:\guidancepulse-dist run guidancepulse -- install --project C:\t015-test
```

期望输出：

```text
guidancepulse: installed at C:\t015-test (added 6 hook entries, already present 0)
settings: C:\t015-test\.claude\settings.local.json (backup written: C:\t015-test\.claude\settings.local.json.guidancepulse-backup.json)
hook scripts: built (6 launchers, entry ...)
```

安装做了三件事（USER_GUIDE §1）：先备份既有
`settings.local.json`（只写一次）；只合并 6 条 GuidancePulse
Hook（其余配置原样保留）；在 `.guidancepulse\hooks\` 下生成 6
个启动脚本和编译好的 Hook 入口（`.build/`），并把运行时依赖
（`yaml`、`better-sqlite3` 含原生模块）以本地文件复制的方式
随装进 `.build\node_modules\`——目标项目里不跑 `npm install`。

### S5. 检查安装

```powershell
npm --prefix C:\guidancepulse-dist run guidancepulse -- status --project C:\t015-test
Get-Content C:\t015-test\.claude\settings.local.json
```

期望：`installed: yes (own hooks: 6/6)`。settings 里的 6 条
Hook 必须与附录 B 的表格逐字一致（事件、matcher、命令、
`onFailure`、`timeout`、`async`）。**有一条对不上就停**，先记
录，不要继续。

### S6. 手动探针（安装自检，不是测试替代品）

在 PowerShell 里直接跑启动脚本，喂合成 Hook JSON，确认 Hook
入口本身能跑。`$LASTEXITCODE` 是关键证据。

```powershell
cd C:\t015-test
$jsonA = '{"session_id":"t015-setup-probe","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"C:\\t015-test\\protected\\notes.txt"},"cwd":"C:\\t015-test"}'
$jsonA | node .\.guidancepulse\hooks\pre-tool-use.js; echo "exit=$LASTEXITCODE"
```

期望输出（构建者已用冻结代码实测，逐字）：

```json
{"ignored":true,"reason":"no-matching-rule"}
```

`exit=0`。这就是前言里的 Windows 路径问题在进程级的直接
证据：Windows 绝对路径不设门。**如实记录，不要“修”它。**

```powershell
$jsonB = '{"session_id":"t015-setup-probe","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"protected/notes.txt"},"cwd":"C:\\t015-test"}'
$jsonB | node .\.guidancepulse\hooks\pre-tool-use.js; echo "exit=$LASTEXITCODE"
```

期望输出（逐字）：

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"GuidancePulse: write blocked — guidance is stale: t015-guard (UNSEEN, block). Re-read the guidance file(s), then retry the write."}}
```

`exit=2`。这证明门逻辑本身是好的（相对路径能正常拒绝），
问题只在 Windows 绝对路径的规范化。注意：S6b 会在状态库
里记一条 `WRITE_CHECKED` 审计事件（只审计，不改变租约状
态），`status` 的 `events:` 计数会 +1——记录前后计数即可。

两个探针都跑完后，再开 Claude Code 会话进 §3。

---

## §3 测试 1 — Read → FRESH → Write allow/deny

**测什么：** 成功读取指导后签发 FRESH 租约（PROJECT_BOOK
§6.1–§6.2），写前检查按租约状态放行或拒绝（§6.4：
`aggregate(block > ask > warn)`；`mode: block` + 非 FRESH →
DENY；FRESH → ALLOW）。

**操作纪律（全程适用）：**

- 在 `C:\t015-test` 开一个**全新** Claude Code 会话（不要
  `--resume`/`--continue`，不要在该会话做测试以外的事）。
- 每次写操作都要求 Agent 用原生 **Write/Edit 工具**；Bash、
  外部进程、IDE 写盘**不在**拦截范围内（§6.5），Agent 一旦改
  用它们，该次尝试作废，记录后重做。
- 每步前后都跑 `Get-FileHash` 记录文件 SHA（证据的硬核）。
- 每步前后都跑 `status` 记录租约状态（`FRESH=`/`EXPIRED=`
  计数是 ground truth，不要只信 Agent 自己说的）。
- Agent 的工具结果原文（deny 的 `permissionDecisionReason`、
  allow 的执行结果）要原样抄录或截图。

### 1a. 未读先写 → 必须拒绝

给 Agent 的指令（原样粘贴，见附录 A）：

> Do NOT read GUIDANCE.md. Using the Write/Edit tool (not Bash),
> append the line `T015-STEP-1A` to `protected/notes.txt`.

- **期望：** Write 工具调用被拒绝；Claude Code 显示的拒绝原
  因含 `t015-guard (UNSEEN, block)`；`protected/notes.txt`
  的 SHA 与步前一致，文件里**没有** `T015-STEP-1A` 这一行；
  `status` 显示 `FRESH=0`。
- **判定：** 四项全满足 → 通过。写入成功（文件被改）→ **失
  败**：按前言，这很可能是 Windows 路径问题在真机上的表现
  ——记录 transcript 里的实际 `file_path` 格式与拒绝/放行原文，
  继续做 1b/1c，不要停、不要改配置。
- **无效尝试：** Agent 擅自先读了 `GUIDANCE.md`，或改用 Bash
  写盘 → 该次不算，记录后换一个全新会话重做 1a。

### 1b. 先读后写 → 必须放行

> First read GUIDANCE.md (using the Read tool), then using the
> Write/Edit tool append the line `T015-STEP-1B` to
> `protected/notes.txt`.

- **期望：** Read 成功；Write 被允许并执行；文件里出现
  `T015-STEP-1B`，SHA 变化；`status` 在写前显示 `FRESH=1`
  （如写后立即查，预算余 4 次——成功写入扣 1，§6.3）。
- **判定：** 写入成功且 `FRESH=1` 曾出现 → 通过。写入被拒 →
  **失败**：抄下拒绝原因原文（特别注意是否出现
  `PHASE_MISMATCH`——见 `CONSISTENCY_CHECK.md` §4 第 6 条关
  于 `GP_PHASE` 的说明），继续做 1c，不要改配置。

### 1c. 对照：无规则目标 → 必须放行

> Without reading anything, using the Write/Edit tool append the
> line `T015-STEP-1C` to `unprotected/scratch.txt`.

- **期望：** 写入被允许并执行（没有任何规则覆盖该目标时 Hook
  输出 `{}`、exit 0，不发表意见——`decision.ts` 的 no-gate
  情形）；文件里出现 `T015-STEP-1C`。
- **判定：** 写入成功 → 通过。写入被拒 → **失败**（说明门误
  伤了无规则目标），记录原因原文。

---

## §4 测试 2 — PreCompact → EXPIRED → 重新读取

**测什么：** 压缩前原子失效当前作用域租约（PROJECT_BOOK
§6.5；`pre-compact.ts`：失效原因 `CONTEXT_COMPACTION`；持
久化失败时严格模式阻止压缩）。

**前置：** 测试 1b 已完成，FRESH 租约存在（预算余 4 次）。
**必须在同一会话内继续**（换会话会丢租约，测的就不是压缩
失效）。

### 2a. 压缩

在该会话里执行 `/compact`，等待压缩完成。然后：

```powershell
npm --prefix C:\guidancepulse-dist run guidancepulse -- status --project C:\t015-test
```

- **期望：** `status` 显示 `FRESH=0`，`EXPIRED>=1`（同一作用
  域；若会话 id 在压缩后变化，显示为无 FRESH 租约——两种
  表现都接受，记录实际显示）。
- **判定：** 无 FRESH 租约 → 通过。仍有 FRESH → **失败**，
  记录 `status` 全文后继续 2b。

### 2b. 压缩后未重读就写 → 必须拒绝

压缩会清空 Agent 上下文，所以第一条指令要把任务完整重述
（附录 A）：

> Do NOT read GUIDANCE.md. Using the Write/Edit tool (not Bash),
> append the line `T015-STEP-2B` to `protected/notes.txt`.

- **期望：** Write 被拒绝；拒绝原因含 `t015-guard (EXPIRED,
  block, expired: CONTEXT_COMPACTION)`；文件 SHA 与步前一致，
  文件里**没有** `T015-STEP-2B`。
- **判定：** 四项全满足 → 通过。写入成功 → **失败**，记录
  原因与 transcript 里的 `file_path`。拒绝原因里没有
  `CONTEXT_COMPACTION`（例如是 `UNSEEN`）→ 记为**部分通过**
  （行为对、原因不对），在证据索引里写明。

### 2c. 重新读取后写 → 必须放行

> First read GUIDANCE.md (using the Read tool), then using the
> Write/Edit tool append the line `T015-STEP-2C` to
> `protected/notes.txt`.

- **期望：** Read 成功；Write 被允许并执行；文件里出现
  `T015-STEP-2C`；`status` 再次显示 `FRESH=1`。
- **判定：** 写入成功且 `FRESH=1` 再次出现 → 通过。写入被拒
  → **失败**，抄下原因原文。

---

## §5 测试 3 — Hook 崩溃/超时 → onFailure:"block" 确实阻止写入

**测什么：** Hook 进程崩溃或超时时，Claude Code 是否按
`onFailure: "block"`（PreToolUse 与 PreCompact 均有此配置，
IMPLEMENTATION_PLAN §7.1；需 Claude Code ≥ v2.1.295）阻止写
入。这是产品最重要的 fail-closed 安全承诺，合成 JSON 测试
无法替代（终审 R3 §六）。

**前置：** 测试 2c 已完成，FRESH 租约存在。先建立 FRESH 再
破坏 Hook 是有意的：这样在没有阻断时写入**本应**被允许——
如果破坏后写入仍被阻止，就证明阻止来自失败关闭，而不是来
自过期租约。

### 3a. 崩溃：删除编译入口 → 必须阻止写入

```powershell
cd C:\t015-test
Rename-Item .\.guidancepulse\hooks\.build .\.guidancepulse\hooks\.build.bak-t015
Get-ChildItem .\.guidancepulse\hooks\   # 记录：.build 已不在，只剩 .bak-t015
```

启动脚本找不到编译入口时会直接失败（exit 2，stderr JSON
`{"guidancepulse_hook_error":"HOOK_ENTRY_MISSING"}`——
`install.ts` 的 `launcherScript`），不会悄悄放行。

给 Agent 的指令：

> Using the Write/Edit tool (not Bash), append the line
> `T015-STEP-3A` to `protected/notes.txt`.

- **期望：** Write 被阻止（Claude Code 显示工具调用被阻断，
  原因是 Hook 失败）；文件 SHA 与步前一致，文件里**没有**
  `T015-STEP-3A`。
- **判定：** 写入被阻止 + 文件未变 → 通过。写入成功 → **
  失败**（fail-closed 承诺不成立），这是最严重的发现，记录
  全文。
- **恢复（必须做）：**

```powershell
Rename-Item .\.guidancepulse\hooks\.build.bak-t015 .\.guidancepulse\hooks\.build
Get-ChildItem .\.guidancepulse\hooks\.build\scripts\   # 确认 hook-entry.js 回来了
npm --prefix C:\guidancepulse-dist run guidancepulse -- status --project C:\t015-test
# 期望：installed: yes (own hooks: 6/6)
```

### 3b. 超时：启动脚本睡眠 30 秒 → 必须阻止写入

Hook 的 `timeout` 是 10（秒）。把 `pre-tool-use.js` 临时换
成一个睡 30 秒的脚本，Claude Code 会在 10 秒时杀掉它，然
后按 `onFailure: "block"` 处理。

```powershell
cd C:\t015-test
Copy-Item .\.guidancepulse\hooks\pre-tool-use.js .\.guidancepulse\hooks\pre-tool-use.js.t015-orig
Get-FileHash .\.guidancepulse\hooks\pre-tool-use.js -Algorithm SHA256  # 记录原文件 SHA
Set-Content .\.guidancepulse\hooks\pre-tool-use.js -Value 'setTimeout(() => { process.stdout.write(JSON.stringify({}) + "\n"); }, 30000);'
Get-Content .\.guidancepulse\hooks\pre-tool-use.js  # 确认已替换
```

给 Agent 的指令：

> Using the Write/Edit tool (not Bash), append the line
> `T015-STEP-3B` to `protected/notes.txt`.

- **期望：** Write 工具调用先挂起约 10 秒（Hook 超时），然
  后被阻止；文件 SHA 与步前一致，文件里**没有**
  `T015-STEP-3B`。记录观察到的等待时长（约数即可）与阻止
  提示原文。
- **判定：** 写入被阻止 + 文件未变 → 通过。写入成功（无论
  是 10 秒后放行还是立即放行）→ **失败**，记录全文。
- **恢复（必须做）：**

```powershell
Copy-Item .\.guidancepulse\hooks\pre-tool-use.js.t015-orig .\.guidancepulse\hooks\pre-tool-use.js -Force
Get-FileHash .\.guidancepulse\hooks\pre-tool-use.js -Algorithm SHA256  # 必须与替换前记录的 SHA 一致
Remove-Item .\.guidancepulse\hooks\pre-tool-use.js.t015-orig
npm --prefix C:\guidancepulse-dist run guidancepulse -- status --project C:\t015-test
# 期望：installed: yes (own hooks: 6/6)
```

---

## §6 卸载与收尾

```powershell
npm --prefix C:\guidancepulse-dist run guidancepulse -- uninstall --project C:\t015-test
npm --prefix C:\guidancepulse-dist run guidancepulse -- status --project C:\t015-test
Get-Content C:\t015-test\.claude\settings.local.json
```

- **期望：** 卸载只移除 GuidancePulse 自己的 6 条 Hook
  （`installed: no (own hooks: 0/6)`），原有配置与 Hook 全部
  保留；`.guidancepulse\hooks\.build\` 已移除；`.guidancepulse\`
  的配置、状态库、路径密钥保留（可审计、重装复用）。
- 如需彻底清除，手动删除 `.guidancepulse\`（USER_GUIDE §4）。
  如需恢复安装前配置，把
  `.claude\settings.local.json.guidancepulse-backup.json` 复制回
  `.claude\settings.local.json`。
- **不要删除测试项目与证据。** 在终审 R4 通过前，保留
  `C:\t015-test\` 与证据文件夹原样，供独立验证者复核。

---

## §7 失败处理与诚实记录规则

1. 任何一步的实际结果与“期望”不符：**停下该步，记录原文，
   按判定表记失败/部分通过，然后继续下一项独立测试**——除非
   是搭建失败（§2），搭建失败则整体停止。
2. **禁止变通：** 不改产品代码、不改冻结配置语义、不改
   `applies_to`、不让 Agent 用相对路径或 Bash 绕过、不重装
   旧版、不降级 Claude Code。变通测到的不是冻结 release。
3. **禁止重做掩盖：** 失败的步骤最多按“无效尝试”规则重做一
   次（仅当 Agent 违规操作导致尝试无效时）；同一失败重做两次
   以上仍失败，就是失败，不要刷到通过为止。
4. **禁止编造：** 没有跑的步骤写“未执行”；没有看到的输出写
   “未观察到”；不确定的写“不确定”。证据索引里每项都有“实际
   结果”栏，空着比填错强。
5. 执行中遇到本包没写到的情况：记录完整上下文（命令、输出、
   时间），继续按最接近的步骤走，事后在证据索引的备注里写明。

---

## §8 判定汇总表（执行后填写）

| 测试 | 期望 | 实际结果 | 判定 |
|---|---|---|---|
| 1a 未读先写 | 拒绝，UNSEEN，文件未变 | （待填） | （待填） |
| 1b 先读后写 | 放行，FRESH=1，文件已改 | （待填） | （待填） |
| 1c 对照 | 放行（无规则） | （待填） | （待填） |
| 2a 压缩 | FRESH=0，EXPIRED≥1 | （待填） | （待填） |
| 2b 压缩后写 | 拒绝，CONTEXT_COMPACTION，文件未变 | （待填） | （待填） |
| 2c 重读后写 | 放行，FRESH=1，文件已改 | （待填） | （待填） |
| 3a 崩溃 | 阻止写入，文件未变 | （待填） | （待填） |
| 3b 超时 | 约 10 秒后阻止写入，文件未变 | （待填） | （待填） |
| 卸载 | 只移除 6 条自有 Hook | （待填） | （待填） |

判定只取三种：**通过 / 失败 / 部分通过**（行为对、原因不对
时用，如 2b 的原因不是 `CONTEXT_COMPACTION`）。三项测试各
自独立判定；总体结论由独立验证者与终审裁决，不由执行人自
己下。

---

## 附录 A：给 Agent 的指令原文（逐字粘贴）

测试中所有写操作都用下面这些指令，**不要改写、不要加条件**：

- **1a：** `Do NOT read GUIDANCE.md. Using the Write/Edit tool (not Bash), append the line 'T015-STEP-1A' to 'protected/notes.txt'.`
- **1b：** `First read GUIDANCE.md (using the Read tool), then using the Write/Edit tool append the line 'T015-STEP-1B' to 'protected/notes.txt'.`
- **1c：** `Without reading anything, using the Write/Edit tool append the line 'T015-STEP-1C' to 'unprotected/scratch.txt'.`
- **2b：** `Do NOT read GUIDANCE.md. Using the Write/Edit tool (not Bash), append the line 'T015-STEP-2B' to 'protected/notes.txt'.`
- **2c：** `First read GUIDANCE.md (using the Read tool), then using the Write/Edit tool append the line 'T015-STEP-2C' to 'protected/notes.txt'.`
- **3a：** `Using the Write/Edit tool (not Bash), append the line 'T015-STEP-3A' to 'protected/notes.txt'.`
- **3b：** `Using the Write/Edit tool (not Bash), append the line 'T015-STEP-3B' to 'protected/notes.txt'.`

“append the line X”指在文件末尾新起一行写入 X（Edit 工具以
追加方式改文件，不要重写整个文件——重写也会改 SHA，但追加
的 marker 行是判定文件是否被改的最直接证据）。

## 附录 B：安装后 settings 里的 6 条 Hook（逐字核对表）

来源：`IMPLEMENTATION_PLAN.md` v1.1.0 §7.1；`src/cli/
install.ts` 的 `GUIDANCEPULSE_HOOKS`；`docs/USER_GUIDE.md`
§5。三处一致。

| 事件 | matcher | 命令 | onFailure | timeout | async |
|---|---|---|---|---|---|
| PreToolUse | `Write\|Edit` | `node ${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-tool-use.js` | `block` | 10 | — |
| PostToolUse | `Read` | `node ${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/post-tool-use.js` | — | 10 | — |
| PreCompact | — | `node ${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/pre-compact.js` | `block` | 10 | — |
| InstructionsLoaded | — | `node ${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/instructions-loaded.js` | — | — | `true` |
| CwdChanged | — | `node ${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/cwd-changed.js` | — | — | `true` |
| SubagentStart | — | `node ${CLAUDE_PROJECT_DIR}/.guidancepulse/hooks/subagent-start.js` | — | — | — |

## 附录 C：Windows 上运行 CLI 的两种方式

- **首选（PowerShell/cmd）：** 在 `C:\guidancepulse-dist` 里
  `npm run guidancepulse -- <命令>`，或任意目录下 `npm --prefix
  C:\guidancepulse-dist run guidancepulse -- <命令>`（`--project`
  指向测试项目）。`package.json` 的 `guidancepulse` 脚本就是
  `vite-node src/cli/main.ts`。
- **备选（Git Bash）：** `bin/guidancepulse <命令>`（sh 脚本，
  通过 vite-node 以绝对路径跑 CLI 入口；调用者 cwd 不会被改，
  `--project .` 按调用者 cwd 解析）。
- **没有 `.cmd`/`.ps1` 启动器**：dist.zip（57 条目）里没有
  Windows 批处理启动器，这是冻结 release 的原样（见
  `CONSISTENCY_CHECK.md` §4 第 5 条）。不要自己写一个放进
  发行包——那会改变被验证的对象。
