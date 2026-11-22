# P025 GuidancePulse — 规格核对记录（Muse 亲自核对）

- 核对时间：2026-11-15 ~13:17 GMT
- 规格版本：v1.0.0，MIT，零真人（ZERO_HUMAN_PARTICIPANTS）
- 立项对话：https://chatgpt.com/g/g-p-6ade5013e8ec8191b55dca46c27772e1-agent-project-automatic/c/6af99cff-f6a8-83ed-af00-23ed49a5215e（GPT-6 + Extra High；Pro 显示 Locked）
- Drive 文件夹：P025-guidancepulse，id 1kZhxs-cCaz7BbAeXMKGByVb0oaGRZEZS

## 文件哈希核对（本地下载 vs GPT 给出值 vs Drive 回下载）

| 文件 | 字节 | SHA-256 | 结论 |
|---|---|---|---|
| PROJECT_BOOK.md | 31,753 | 8616310307925c7696aff34d680ffc3389db0dcf75fac535339f8b24494ac55e | 三方一致 |
| IMPLEMENTATION_PLAN.md | 41,679 | 022844ef5f29c18c25d1cb7c7bd5de6b6dc10cab19389949692d05d0429dd228 | 三方一致 |

- Drive 归档：PROJECT_BOOK.md id 1aQ05FKqYcRuqoKz-NYhmfcb9OmhwHn0r；IMPLEMENTATION_PLAN.md id 1sZXEJuG4WwDpzKXScUal9vJNHPmORMV5。回下载 SHA 与本地一致。
- 重复件处理：归档时发现文件夹中已有 GPT 上传的一份 PROJECT_BOOK.md（id 1zltOeL9n4dXhmXyEli66_h81-S5dAiq-，同 SHA），尽管 GPT 自报上传失败；已删除重复件，文件夹现仅 2 个文件。
- DOCX：GPT 另生成 2 份 .docx，按 P024 先例 MD-only，未采纳、未下载、未归档。

## 内容 grep 核对（均通过）

1. **#1417 引用已删除**：两文件全文 grep "1417" 零命中；规格明确写出证据原则“不使用未经核实的事件名或 Issue 编号”。
2. **Hook 事件表以官方 reference 为准**：PreToolUse（可拦截，写前门）、PreCompact（可拦截，压缩前失效）为核心强制路径；PostToolUse（成功 Read 确认）、PostCompact、InstructionsLoaded、CwdChanged、SessionStart、SessionEnd 为非阻断观测。规格含明确技术纠正段落：官方 reference 确实列出 InstructionsLoaded 与 CwdChanged（Muse 亲自打开官方文档核实，2026-11-15 13:14 UTC 抓取），两者是异步、无决策控制事件，不能承担写入拦截；InstructionsLoaded 只覆盖 CLAUDE.md 与 .claude/rules/*.md，不覆盖通过 Project instructions 直接加载的 AGENTS.md；不能观测的读取保持 UNSEEN，不猜测。
3. **S0 门**：48 条合成轨迹（16 正常控制 + 8 压缩后未重读 + 8 目录切换 + 8 未读取就写 + 8 子 Agent/阶段切换）；48/48 Oracle parity；32/32 植入错误检出；16/16 正常控制不误报；Hook 端到端 p95 <10ms（从子进程启动计至决策输出和退出，含 Node 启动与本地状态读取）；完整 48 轨迹 100 次重放只有一个规范化 SHA-256；外部网络请求 0；Prompt/源码持久化泄露 0；Golden Expected 手工编写；Oracle 不复用生产算法。性能风险诚实注明：Node 子进程启动可能使 10ms 目标难以达到，必须测完整端到端，若不达标 S0 FAIL，不得改口径。S0 是硬门：S0 FAIL 禁止继续，T011–T014 不得启动。
4. **与历史项目机制差异明确**：§3.1 P023 SkillScope（静态技能文件审计 vs 运行时重读约束）、§3.2 P019 ResumeMatrix（checkpoint 恢复兼容）、§3.3 P011 Context Capsule（跨会话交接记忆）；非目标清单含“不做技能文件来源/权限审计（P023 的问题）”“不做跨会话记忆或 Checkpoint 恢复兼容（P011 / P019 的问题）”。
5. **边界明确**：“不判断 Agent 是否真正理解或遵守指导”；禁止宣称清单含“证明 Agent 理解规则”“保证 Agent 遵守所有项目规范”“完整的 Agent 忠实度检测器”“支持所有 Coding Agent”；首版仅支持 Claude Code Hook 适配器。
6. **工时**：T001–T014 任务卡合计 72h（4+5+6+6+6+5+5+7+7+6+4+4+4+3 = 72），缓冲 16h，总计 88h；S0 阶段（T001–T010 + T013 首次审查）61h。
7. **证据**：引用 Thoughtworks Technology Radar Vol.35（2026-11）blip 36 Agent instruction bloat 与 blip 37 Agent skill cognitive surrender（Muse 独立检索核实，两条目真实存在，bloat 条目原话建议“convert any instructions you can into deterministic hooks or checks”）；引用 GoogleChrome/modern-web-guidance 真实仓库链接（16,608 stars，Muse 经 GitHub API 核实），无 Issue 编号引用。所有规划数字标注为规划假设。

## 方向锁定记录

- 我方初评第一名：C02 DepVersionWitness（21/25，RICE ~818）。
- GPT 独立发散：20 种子 → 5 类 → 8 候选；C01 GuidancePulse 第一（20.8/25，RICE 640），C02 第二（19.7/25，RICE 634）。
- GPT 对 C02 的纠正经 Muse 核实成立：版本不存在 ≠ 包名不存在 ≠ 恶意真实包；27.76% 是 GPT-5 时期数据；版本存在性检查已有 npm/Dependabot/Sonatype Guide 覆盖。
- 按工厂规则“立项用 Pro 选题”，方向锁定 C01 GuidancePulse。

## 结论

**ESTABLISHMENT COMPLETE 2026-11-15 ~13:18 GMT。** 规格 v1.0.0 VERIFIED，FACTORY_INDEX.md 已同步（Drive sha 4d43d45d…，P025 行已加），施工可启动。S0 先行，S0 失败即 STOP。
