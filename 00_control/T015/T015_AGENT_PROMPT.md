# T015 执行提示词 — 给 Sam 电脑上的任意 Agent

## 你是谁，你要干什么

你是正在 Sam 的 Windows PC 上执行 **P025 GuidancePulse 项目终审验证任务 T015** 的 agent。

P025 GuidancePulse 是一个 Claude Code Hook：agent 读过指导文档后获得一个有时限的"租约"（FRESH），写文件前 Hook 检查租约，放行或拒绝。你的任务是在**真实 Claude Code** 里验证冻结版的三个端到端行为，收集证据，**不改产品代码，不编造结果**。预计 30–45 分钟。**本机约 2026-11-17 05:55 GMT 关机，请在此之前完成。**

冻结 release 身份（执行前核对，见 `T015_TASK.md` §0）：commit `f4d2b2e`，`dist.zip` SHA-256 必须是 `304a7c2e60b8796d5ba1a758ff4bd416349e53cfc4c9da5777ef83ec5ed5eb1f`（669,625 B）。对不上就停。

**模型不限**：Haiku、Sonnet、Opus 均可。Hook 的放行/拒绝由代码里的租约状态机决定，与模型无关；关键是严格按步骤执行、不改写指令。

## 本包里有什么（先读 `T015_TASK.md`，它是权威步骤）

| 文件 | 用途 |
|---|---|
| `T015_AGENT_PROMPT.md`（本文件） | 执行摘要：你先读这个，再按 `T015_TASK.md` 做 |
| `T015_TASK.md` | **权威程序**：搭建 S1–S6、三项测试、卸载、判定表、附录 A/B/C。**与本提示词冲突时以它为准** |
| `EVIDENCE_INDEX.md` | 证据索引：执行中逐项填写实际结果和判定，完成后交回 |
| `CONSISTENCY_CHECK.md` | 一致性核对参考（已知问题与核查点） |
| `synthetic-project/` | 合成测试项目：原样复制到 `C:\t015-test\`（GUIDANCE.md、guidancepulse-config.yaml、protected/notes.txt、unprotected/scratch.txt） |
| `dist.zip` | 冻结发行包（唯一安装来源；不要用 source.zip 安装） |
| `SHA256SUMS.txt` | 发行包校验值 |

## 前置检查（缺一项就停，先报给 Sam）

- Claude Code 已安装**并已登录**，`claude --version` ≥ v2.1.295（低于此版本 Hook 出错不会阻断写入，本任务无法执行）。
- Node.js ≥ 24（`node --version`）。
- 所有路径用**无空格短路径**：发行包解到 `C:\guidancepulse-dist\`，测试项目放在 `C:\t015-test\`。

## 执行步骤（按 `T015_TASK.md`，逐节做）

1. **§1 前置 + §2 搭建 S1–S6**：核对 `dist.zip` SHA → 解压 → `npm ci` → `init` 测试项目 → 覆盖配置为 `t015-guard`（不是默认的 `auth-change-safety`）→ `install` Hook → `status` 确认 `installed: yes (own hooks: 6/6)`，settings 里 6 条 Hook 与附录 B 逐字一致。**有一条对不上就停，先记录。**
   - S6 两个手动探针必须跑：绝对路径 `C:\t015-test\protected\notes.txt` 期望 `{"ignored":true,"reason":"no-matching-rule"}`、exit 0；相对路径 `protected/notes.txt` 期望 deny、exit 2。**如实记录，不要"修"它。**
2. **§3 测试 1（Read → FRESH → Write）**：1a 未读先写必须拒（UNSEEN）；1b 先读后写必须放（FRESH=1）；1c 写无规则文件必须放。
3. **§4 测试 2（PreCompact → EXPIRED → 重读）**：必须与测试 1**同一会话**继续；`/compact` 后 FRESH=0；不重读就写必须拒（原因应含 `CONTEXT_COMPACTION`）；重读后写必须放。
4. **§5 测试 3（Hook 崩溃/超时 → onFailure:"block"）**：3a 把 `.build` 改名 → 写必须被拦，**然后恢复**；3b 把 `pre-tool-use.js` 换成睡 30 秒 → 约 10 秒后必须被拦，**然后恢复并核对 SHA 与替换前一致**。
5. **§6 卸载**：只移除 6 条自有 Hook；**不要删除测试项目与证据**，留着供独立验证者复核。

## 你怎么跑 live 测试（关键：必须用真实 Claude Code 会话）

- 三项测试必须在**真实 Claude Code 会话里由真实工具调用触发**，不许用合成 Hook JSON 代替真实触发（S6 探针除外，它只是安装自检）。
- 测试指令按 `T015_TASK.md` 附录 A **原样粘贴，不要改写、不要加条件**。
- 如果你**本身就是 Claude Code**：自己完成搭建，然后开启一个**全新会话**（不要 `--resume`/`--continue` 旧会话）执行 §3–§5；测试 2 必须在测试 1 的同一会话内继续。
- 如果你是**其他 agent**（Copilot、Codex 等）：搭建步骤自己在 PowerShell 里做；live 测试用 `claude` 命令行启动真实会话执行（保持测试 2 与测试 1 同一会话，用 CLI 的会话继续机制），并从 Claude Code 的 transcript（`.jsonl`）收集证据。
- **如果某一步因工具限制无法按规范忠实执行**（例如命令行模式下无法完成 `/compact` 或无法保持同一会话）：把该步记为**未执行**并写明原因，继续其余步骤。**绝不模拟、绝不编造输出。**

## 纪律（违反就等于证据作废）

- 写操作只用 Write/Edit 工具；Bash、外部进程、IDE 写盘不在拦截范围内，Agent 一旦改用它们，该次尝试作废，记录后重做。
- 每步前后都跑 `Get-FileHash` 记录文件 SHA、都跑 `status` 记录租约状态（`FRESH=`/`EXPIRED=` 计数是 ground truth）。
- **禁止变通**：不改产品代码、不改冻结配置语义、不改 `applies_to`、不让 Agent 用相对路径或 Bash 绕过、不重装旧版、不降级 Claude Code。
- **禁止重做掩盖**：失败的步骤最多按"无效尝试"规则重做一次（仅当 Agent 违规操作导致尝试无效时）；同一失败重做两次以上仍失败，就是失败，不要刷到通过为止。
- **禁止编造**：没跑的写"未执行"，没看到的写"未观察到"，不确定的写"不确定"。空着比填错强。

## 已知问题（执行前必读，见 `T015_TASK.md` 前言）

冻结版 Hook 对 **Windows 绝对路径不设门**：`file_path = "C:\t015-test\protected\notes.txt"` 会返回 `{"ignored":true,"reason":"no-matching-rule"}`、exit 0，**写入直接放行**；相对路径则正常设门。

这意味着：**测试 1a（未读先写）在真机上很可能失败**。这是预期内的产品发现（P1 级），不是你的错：**如实记录为失败 + 产品发现**，把 transcript 里的实际 `file_path` 格式与拒绝/放行原文抄下来（证据 E11，它决定该预测是否成立），然后继续做 1b/1c，不要停、不要改配置。测试 3 不受此影响（onFailure 由 Claude Code 本身强制执行）。

## 交付（完成后交给 Sam）

1. **填好的 `EVIDENCE_INDEX.md`**：每项测试的实际结果、判定（通过 / 失败 / 部分通过）、证据编号与 SHA。判定汇总表（`T015_TASK.md` §8）也要填。
2. **证据文件夹 `C:\t015-evidence\`**：Claude Code 版本证明、三项测试各自的原始执行日志、Hook 配置与触发结果、测试前后文件状态（`Get-FileHash` 输出）、transcript `.jsonl`（含实际 `file_path` 格式）、`status` 输出全文。**原件不改、不删。**
3. **一份简短结果汇总**（发给 Sam）：每项测试 通过/失败/部分通过 + 实际 `file_path` 格式 + 任何失败的原文 + 证据文件夹路径。
4. 保留 `C:\t015-test\` 原样，不要删除。

## 完成标准

三项测试全部执行（或如实标注未执行及原因）+ `EVIDENCE_INDEX.md` 填好 + 卸载完成 + 证据文件夹完整。总体结论由独立验证者与终审裁决，不由你下。
