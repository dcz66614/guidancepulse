# 任务：收集 GuidancePulse npm 安装诊断材料（T015 的 S1 步骤，诊断收集版）

> ⚠️ 本提示词是诊断收集版（FIX-R5，2026-11-17）：只收集诊断材料，不安装、不修复、不继续后续步骤。

## 背景

- 项目：P025 GuidancePulse 的终审验证任务 T015，第一步（S1）是在 `C:\guidancepulse-dist\` 里跑通 `npm ci`。
- 当前状态：`dist.zip` 已解压到 `C:\guidancepulse-dist\`（SHA-256 已核对，无误）；Node v24.18.0（npm 已自带，不用装 npm 本身）；Claude Code 2.1.303。
- 已知阻塞：S1 的 `npm ci` 失败过一次，但真实原因**未知**。
- ⚠️ 更正（2026-11-17，协调员已按锁定的包内容核实）：“缺 MSVC C++ 工具链导致失败”的说法是**错的，不要再按它行动**：
  - 已安装的 `better-sqlite3@13.2.0` 的 `package.json` 的 `scripts` 只有 build-release、build-debug、test、benchmark、download、clean——**没有 install / preinstall / postinstall**；
  - 它的 tarball 自带 N-API 预编译包，`prebuilds/` 里含 `win32-x64.node` 等 8 个平台文件；
  - `npm ci` 不会触发 `node-gyp`，所谓“Node 24 没有预编译包”不成立。
  - **不要装 C++ 工作负载。** 不要装 Visual Studio Build Tools、不要装“Desktop development with C++”工作负载、不要用 `vswhere` 去核对 C++ 组件。
- 证据目录：`C:\t015-evidence\`（E01 日志从未归档到 Drive/仓库，只在 Sam 的电脑上）。

## 要做的事（只收集，不修复）

1. 确认现状并记录：`node --version`、`npm --version`；确认 `C:\guidancepulse-dist\package.json` 在。
2. 收集已有证据：把 `C:\t015-evidence\E01_setup.md` 和 `C:\t015-evidence\E01_npm_ci_debug.log`（若在）复制一份出来；若某个文件不在，**如实记下“不在”**，不要编造、不要重建。
3. 收集包信息：
   - `C:\guidancepulse-dist\package.json` 的完整内容；
   - `C:\guidancepulse-dist\node_modules\better-sqlite3\package.json` 的 `scripts` 段（若该目录不在，记下“不在”）；
   - `C:\guidancepulse-dist\node_modules\better-sqlite3\prebuilds\` 的目录清单（若不在，记下“不在”）。
4. 跑一次完整 `npm ci`，只为取日志：在 `C:\guidancepulse-dist\` 里跑一次 `npm ci`，把**完整输出**（stdout + stderr，不截断、不筛选）保存到 `C:\t015-evidence\E02_npm_ci_full.log`。只跑一次，无论成功还是失败都不重试、不换办法。
5. 把收集到的材料清单写到 `C:\t015-evidence\E02_diagnosis_pack.md`：每份材料的路径、在不在、以及第 4 步的 `npm ci` 的 exit code（一行即可）。

## 不许做的事

- 不许装任何软件，尤其不许装 C++ 工作负载 / Visual Studio Build Tools / MSVC。
- 不许改系统、不许改 npm 配置、不许改系统环境变量。
- 不许动 `C:\guidancepulse-dist\` 里的文件（除了 `npm ci` 自己生成的东西和第 5 步的证据文件）。
- 不许用 WSL 或别的环境绕过，不许改项目代码。
- 不许继续 S2–S6 或 live 测试。收集完就停，等 Muse 诊断、等 Sam 下一步指示。
- 任何一步失败或需要你不确定的操作，停下来，如实记录并汇报，不要自己换办法硬闯。

## 完成标准

诊断材料已收集齐（在的都有文件，不在的都有“不在”的记录），`E02_npm_ci_full.log` 和 `E02_diagnosis_pack.md` 已写在 `C:\t015-evidence\`。完成后向 Sam 汇报：收集了哪些材料、缺了哪些、`npm ci` 的 exit code、证据文件路径。**不要汇报“修好了”或“原因是某某”——原因由 Muse 诊断。**
