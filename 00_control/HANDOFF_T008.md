# HANDOFF_T008 — 本地事件时间轴 UI

- task_id: T008
- base_commit: 39a9454
- result_commit: 7a99416
- project_id: P025
- spec_version: 1.0.0
- go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布）
- date: 2026-11-15

## goal

展示指导读取、租约状态、失效边界和写前决策的本地时间轴 UI
（项目书 §7.1 四区、§7.2 视觉与交互；计划书 §5 T008 卡）。

## changed_files

| 文件 | 说明 |
|---|---|
| `02_source/src/ui/timeline.ts` | 纯数据模型：`buildTimelineModel`（会话条/指导清单/时间轴/详情）、`shortPathId`（`hmac:<前 6 hex>…`）、§7.2 状态与决策配色（文字+图标）、非契约事件抛 `UI_INVALID_EVENT`（只报码，不回显原值） |
| `02_source/src/ui/demo-data.ts` | 固定合成演示数据：12 事件（六种时间轴类型全覆盖）、3 指导（UNSEEN/FRESH/EXPIRED 全覆盖）、剩余编辑数 4/5 |
| `02_source/src/ui/App.tsx` | React 19 四区组件：点击指导 ID 过滤时间轴，点击事件打开详情（含失效原因码）；DENY 只显示指导 ID、路径短码与重读建议 |
| `02_source/src/ui/main.tsx` | 入口：以演示模型渲染 `App` |
| `02_source/src/ui/styles.css` | 本地样式，系统字体栈；§7.2 配色 |
| `02_source/src/ui/index.ts` | UI 模块公开入口 |
| `02_source/src/report/report.ts` | 静态报告：`buildReportModel` / `buildReportJson` / `renderTimelineHtml`（内联 CSS、无 `<script>`、无外部 URL、全部插值 HTML 转义） |
| `02_source/src/report/index.ts` | 报告模块公开入口 |
| `02_source/index.html` | Vite 入口页 |
| `02_source/vite.config.ts` | Vite 7 + React 插件，`base: "./"`（可从磁盘直接打开） |
| `02_source/scripts/demo-report.ts` | 演示报告生成（`npm run demo:report`）：把 12 事件演示序列走真实 Store + 状态机 + 写前门 + `phase set`，写出 `artifacts/demo/` |
| `02_source/scripts/check-ui-offline.mjs` | 离线验收（`npm run test:ui-offline`）：扫描 `dist/` 与静态报告的外部引用，并在 127.0.0.1 实测服务全部本地资源 |
| `02_source/scripts/demo-screenshot.mjs` | 演示截图/录屏（`npm run demo:screenshot`）：playwright-core + 缓存 Chromium，交互断言 + 全请求 URL 记录，任一外部请求或页面错误即失败 |
| `02_source/tests/unit/ui.test.ts` | 16 个测试：模型、报告、隐私、真实 Store 回放与演示模型深度相等 |
| `02_source/tests/unit/ui-component.test.tsx` | 3 个测试（jsdom + Testing Library）：会话条、过滤、详情原因码 |
| `02_source/package.json` | 新增 `react`、`react-dom`；dev 新增 `vite`、`@vitejs/plugin-react`、`vite-node`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`@types/react`、`@types/react-dom`、`playwright-core`（均为免费开源）；新增 `test:ui` / `build` / `test:ui-offline` / `demo:report` / `demo:screenshot` |
| `02_source/package-lock.json` | 锁定上述依赖（含 integrity） |
| `02_source/tsconfig.json` | 增加 `DOM` lib、`jsx: react-jsx`，include 覆盖 `*.tsx` 与 `scripts/`、`vite.config.ts` |
| `02_source/vitest.config.ts` | include 增加 `tests/**/*.test.tsx` |
| `02_source/artifacts/demo/timeline.json` | 演示报告 JSON（真实 Store 导出） |
| `02_source/artifacts/demo/timeline.html` | 静态离线报告 HTML |
| `02_source/artifacts/demo/events.json` | T007 `exportEventsJson` 原始事件导出 |
| `02_source/artifacts/demo/T008_demo.webm` | 交互录屏（852 KB，WebM） |
| `02_source/artifacts/demo/T008_demo-requests.json` | 演示页全部请求 URL（4 条，全为 127.0.0.1） |
| `02_source/artifacts/screenshots/T008_dashboard.png` | 仪表盘截图（全 12 事件） |
| `02_source/artifacts/screenshots/T008_dashboard_filtered.png` | 交互后截图（过滤 + Compact 事件详情，原因码 CONTEXT_COMPACTION） |
| `02_source/artifacts/screenshots/T008_report.png` | 静态报告截图 |
| `02_source/artifacts/test-logs/T008_*.log` | 验收日志（见 log_paths） |

未改动：`src/core/**`、`src/hooks/**`、`src/store/**`、Oracle、
Drive 总索引、用户现有 `.claude/settings*.json`。
`dist/` 构建产物按既有忽略规则不入版本库（`git check-ignore dist`
已确认）。`artifacts/demo/state.sqlite` 与
`artifacts/demo/.guidancepulse/`（随机路径密钥）有意不提交：前者可由
`npm run demo:report` 再生成，后者是密钥材料不入版本库；已提交的
`timeline.json` / `timeline.html` / `events.json` 即本次运行的对应输出。

## commands

在 `02_source/` 内运行：

```bash
npm run test:ui
npm run build
npm run test:ui-offline
npm test
npm run typecheck
npm run demo:report
npm run demo:screenshot
```

## exit_codes

| 命令 | 退出码 |
|---|---|
| `npm run test:ui` | 0（19/19） |
| `npm run build` | 0（Vite 7.3.8，`dist/index.html` + 1 JS + 1 CSS） |
| `npm run test:ui-offline` | 0（1 条警告，见 known_limits） |
| `npm test` | 0（294/294，全量无回归） |
| `npm run typecheck` | 0（0 错误） |
| `npm run demo:report` | 0（12 事件 / 2 租约） |
| `npm run demo:screenshot` | 0（4 请求，全为 127.0.0.1） |

## test_summary

- 全量 `npm test`：294 通过。T002–T007 的 275 个测试保持通过；
  新增 19 个（模型/报告 16 + React 组件 3）。
- 真实 Store 回放：把演示序列经 `GuidancePulseStore` +
  `checkWriteAndPersist` + `setPhase` + `recordWriteOutcome` 重放后，
  由 `listEvents` / `listLeasesForScope` 建出的模型与 React 演示模型
  **深度相等**（事件、租约状态、剩余编辑数 4/5、原因码全一致）。
- 验收标准逐项：
  - 显示 session/agent/phase：会话条 `demo-session-01` / `main` /
    `review` / 最近压缩 `2026-11-15T10:31:55Z`；
  - 显示指导 ID、UNSEEN/FRESH/EXPIRED、剩余编辑数：
    `api-rate-limits` UNSEEN —、`auth-change-safety` EXPIRED 4/5
    （PHASE_MISMATCH）、`release-checklist` FRESH 4/5；
  - 时间轴六种类型：Read、Compact、Cwd、Phase、Subagent、
    Write decision（ALLOW/DENY 各有）；
  - 不展示 Prompt、源代码、绝对路径：路径只以 `hmac:<6 hex>…`
    短码出现；测试断言报告 JSON/HTML 不含 `/home/`、`.ts` 文件名与
    演示相对路径；静态 HTML 对指导 ID 做转义（恶意 `<img>` 测试通过）；
  - UI 无 CDN、远程字体或外部网络：`test:ui-offline` 静态扫描 +
    127.0.0.1 实测 + 浏览器运行时 4 请求全为 127.0.0.1。
- 演示证据：3 张截图（已目视核对：四区、状态文字+图标、原因码、
  DENY 重读建议均正确）+ 852 KB WebM 录屏 + 请求日志。

## log_paths

- `02_source/artifacts/test-logs/T008_test-ui.log`
- `02_source/artifacts/test-logs/T008_build.log`
- `02_source/artifacts/test-logs/T008_test-ui-offline.log`
- `02_source/artifacts/test-logs/T008_demo-report.log`
- `02_source/artifacts/test-logs/T008_demo-screenshot.log`
- `02_source/artifacts/test-logs/T008_test-all.log`
- `02_source/artifacts/test-logs/T008_typecheck.log`

## demo_reproduction

```bash
cd ~/workspace/p025-guidancepulse/02_source
npm run build
npm run demo:report          # 生成 artifacts/demo/timeline.{json,html}
npm run demo:screenshot      # 生成 artifacts/screenshots/*.png 与 artifacts/demo/T008_demo.webm
npx vite preview --port 4173 --host 127.0.0.1   # 或直接用浏览器打开 dist/index.html
# 打开 http://127.0.0.1:4173/ ；点 release-checklist 过滤，再点 Compact 事件看原因码
# 静态报告直接打开 artifacts/demo/timeline.html 即可，无需服务
```

## sha256

```text
8e1c021c6cbf7ce2078f98daaa743bde0da0cb43f177cfd8a2231971008e026d  02_source/src/ui/timeline.ts
9ef028e90c1b596a1f1283c78c3acae54144e46b397a973ec33e9767e3a49a02  02_source/src/ui/App.tsx
962469f735f11275bdc08988d6ed5c6ae6f86222a9a087dc637d7200e8674e72  02_source/src/ui/demo-data.ts
10d5752cdeb809c8f14223090c7de2bbc3286bd0bfb0e3dd815cf13feae520c9  02_source/src/ui/index.ts
871babe8c2316e3786da944b5f1cb4cd1cb34af95a039191c7d49ddf1dd2b7ed  02_source/src/ui/main.tsx
481059adf1c957fd378a8c423abea2be6b583a837842d4b094ec8dc09af29860  02_source/src/ui/styles.css
1d628060e542808d451f8998a43f5d8ef2c3dc6eb1e1953453ea7d0bbff6d097  02_source/src/report/index.ts
e5122161850081d7555e36bac8f8a8f21f08be8a42d94811f2d71bd1c38c9cd0  02_source/src/report/report.ts
93a25ccd586f78b922cbb9911fcbde646248258ea90c23efb2d2e8f979cbd8a6  02_source/index.html
ba5702af870c0c274bf0cc7d386c744f0d81ed551203081650c625a3fcdd87ca  02_source/vite.config.ts
aa7e75433202fc0f57b07b844af1a91ce3751dbdb436f1b70cd2113c8f9c4ab1  02_source/scripts/check-ui-offline.mjs
298f150eed40f3b5c07bf2330e4faa261e3bdcd58b9f3c11efffc9d439f9d789  02_source/scripts/demo-report.ts
73c0d6aee6be97c63ab8442c9947b5590daa57bff2bc4e9030a60b3b8cecb2fe  02_source/scripts/demo-screenshot.mjs
e2b47233b2ea6a29d0e9c7b75f1993875aba95f86566f1e1ffc43bdff6706fbc  02_source/tests/unit/ui.test.ts
1d23c6663ccb671dbb39dc745db3dc8a27b734a4db35f2295202964beaeaa44c  02_source/tests/unit/ui-component.test.tsx
ee73ddc44cd3e178dcf45060ced927f6a789feddbcb30bcac9551c9e4bcefaca  02_source/package.json
a9de3592a8594a9de41132f30b3aefe08c123780059980229d35f9c2c9d972ec  02_source/package-lock.json
14b0bcd0bf0fa4e4a9689d2cee4da75036623f9ca3b2847032d83d83065910c6  02_source/tsconfig.json
6b3ea26f4b8c30a6df4e07675c801ddd826522cf68e917ccec705083f208d878  02_source/vitest.config.ts
cc83ac42451bd3f2244c464c3951f5646dc1ddb95092d3a5b2ca798d039dde53  02_source/artifacts/demo/timeline.json
d95fcad9c46e303eb1db4c6acc6c2ce09865fe69e69a26203b1cb54dcec9f859  02_source/artifacts/demo/timeline.html
1b1d4ddc541776ceffbcfdd5179a19334c76d59c88b6b8b9adb676041ed699c9  02_source/artifacts/demo/events.json
6b80503f5d57b764091b4866a4da3b706fb98e787857ab964ca54ff184432a25  02_source/artifacts/demo/T008_demo.webm
1054558555869d80f643531c277a1f3361251195a7936f97a8e4eb5392ac9d5d  02_source/artifacts/demo/T008_demo-requests.json
2b0dfe3065edc6f0fa429f7cc3e6400ade5bbdb5c96eeda307cca3dad4b0d67f  02_source/artifacts/screenshots/T008_dashboard.png
90655f3fe969c5f68a832edcdb30cecd790f4de4ab3755c9763fc1b2686e813f  02_source/artifacts/screenshots/T008_dashboard_filtered.png
8c3847800f9bc44e7421e91febd37458539ee64551b44ff96fd58e9d658d0214  02_source/artifacts/screenshots/T008_report.png
```

## 施工中发现并修复的三个真实问题（均已验证，非规格改动）

1. **截图脚本先过滤、再找 Compact 事件导致超时**：Compact 事件
   `guidanceId` 为 null，过滤到某指导后它不在列表中。修复：先在
   过滤态打开 DENY 写事件断言，再回“All events”打开 Compact 事件
   断言原因码；首次失败表现为 `TimeoutError`（等待被过滤掉的
   `entry-e6` 超时），失败输出见当时终端，未单独存日志文件，本次
   提交的 `T008_demo-screenshot.log` 为修复后重跑的通过版。
2. **`toHaveTextContent` 匹配器缺失**：Vitest 默认不带 jest-dom。
   修复：新增 dev 依赖 `@testing-library/jest-dom`，在组件测试中
   `import "@testing-library/jest-dom/vitest"`。
3. **多测试渲染互相污染**：Vitest 未开 globals，RTL 自动 cleanup
   未注册，`getByTestId` 报“多个元素”。修复：组件测试显式
   `afterEach(() => cleanup())`。

## known_limits

- `test:ui-offline` 有 1 条警告（非失败）：构建产物 JS 内含惰性
  字符串 `https://react.dev/errors/`、`http://www.w3.org/2000/svg`、
  `http://www.w3.org/1998/Math/MathML`——前者是 React 错误信息文本，
  后两者是 SVG/MathML 命名空间标识，均不产生请求；运行时证明是
  `demo:screenshot` 的 4 条请求全为 127.0.0.1。
- React 仪表盘入口目前渲染固定合成演示模型；真实 Store 数据的
  展示路径是静态报告（`src/report` + `scripts/demo-report.ts`，
  已用真实 Store 验证与演示模型深度相等）。把仪表盘接上实时
  Store 数据源是 T011 CLI（`report --open`）/ T012 集成的工作，
  不属于 T008。
- `T008_dashboard_filtered.png` 的最终画面是“过滤往返后打开
  Compact 事件”的状态（脚本先在过滤态断言了 DENY，再回全部事件
  断言 CONTEXT_COMPACTION）；文件名指交互流程，不指最终过滤态。
- 演示报告的 HMAC 短码每次运行都不同（路径密钥随机生成）：
  `timeline.json` 与 `timeline.html` 只保证结构/状态/事件一致，
  不保证两次运行的 hex 短码相同；`ui.test.ts` 的回放测试用固定
  HMAC 断言深度相等，不受此影响。
- 规格引用错位（沿用 T002–T007 做法记录，不改规格）：计划书 T008
  卡称契约以项目书 §8 为准，但 §8 实际是 S0 门禁；UI 契约实际在
  §7.1（四区）与 §7.2（颜色/文案），本任务按 §7.1/§7.2 执行。
  同理计划书称 T008 输入为“项目书 §8”，实际 UI 细节在 §7.2。

## next_task

- T009 48 Golden + Python Oracle：UI 不参与 S0 状态机；本任务
  未改 `src/core/**`、`src/hooks/**`、`src/store/**`，S0 契约不受影响。
- T011 CLI：`guidancepulse report --format html --open` 可直接包装
  `src/report`（`buildReportModel` + `renderTimelineHtml`）与
  `vite preview`/`dist` 仪表盘；演示脚本 `scripts/demo-report.ts`
  是现成的接线参考。
- T012 集成：E2E 可复用 `scripts/demo-screenshot.mjs` 的浏览器
  交互模式与 `test:ui-offline` 的离线断言。
