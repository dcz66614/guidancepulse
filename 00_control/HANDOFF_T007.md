# HANDOFF_T007 — SQLite 本地存储、并发与隐私删除

- task_id: T007
- base_commit: da407e6
- result_commit: d1a5a1b
- project_id: P025
- spec_version: 1.0.0
- go_status: NOT_DECLARED（规格已核对通过，施工已授权；GO 仍未宣布）
- date: 2026-11-15

## goal

建立单文件嵌入式 SQLite，安全处理多个 Hook 子进程并发；路径 HMAC
与隐私删除（项目书 §6.3/§6.4/§6.5，计划书 §5 T007 卡）。

## changed_files

| 文件 | 说明 |
|---|---|
| `02_source/src/store/store.ts` | `GuidancePulseStore`：WAL、BEGIN IMMEDIATE 事务、事件+租约原子持久化、checkWrite/recordWriteOutcome 持久化、会话删除、VACUUM、checkpoint |
| `02_source/src/store/schema.ts` | Schema v1：`meta`/`events`/`leases` 三表，仅 §6.4 允许字段，无 raw-JSON 列；`user_version` 版本门 |
| `02_source/src/store/errors.ts` | `StoreError`：只报错误码，不含原始 Hook JSON、路径或 SQLite 原文；SQLITE_* → STORE_* 映射 |
| `02_source/src/store/index.ts` | store 模块公开入口 |
| `02_source/src/privacy/path-id.ts` | 路径密钥：32 字节随机密钥、`path-key.bin`（0600）、独占创建防竞态、零覆写删除；`computePathIdForKey` 包装 T003 `computePathId` |
| `02_source/src/privacy/retention.ts` | 隐私导出（仅允许字段）、`deleteSessionData`（DELETE+VACUUM）、`deleteAllData`（删库+删密钥）、真实文件 canary 扫描（按 label 报错，不报值） |
| `02_source/src/privacy/index.ts` | 增加 path-id / retention 的 re-export（T003 代码未改语义） |
| `02_source/tests/unit/store.test.ts` | 21 个测试：schema/WAL、原子持久化、快照一致性、预算、批量原子性、错误码、只读、会话删除 |
| `02_source/tests/unit/privacy.test.ts` | 15 个测试：密钥生命周期、HMAC、导出、删除、真实 SQLite 文件 canary 扫描 |
| `02_source/tests/unit/concurrency.test.ts` | 2 个测试：8 进程×25 事件、4 进程同会话 PreCompact |
| `02_source/tests/helpers/store-worker.mjs` | 并发 worker：独立进程打开自有连接写共享库，只打印错误码 |
| `02_source/package.json` | 运行时依赖 `better-sqlite3 ^13.2.0`；dev 依赖 `@types/better-sqlite3 ^9.6.0`；新增 `test:store` / `test:privacy` / `test:concurrency` |
| `02_source/package-lock.json` | 锁定 better-sqlite3 13.2.0（含 integrity） |
| `02_source/.gitignore` | 忽略并发测试的临时编译目录 `.tmp-t007-*/` |
| `02_source/artifacts/test-logs/T007_*.log` | 验收日志（见 log_paths） |

未改动：`src/hooks/adapter.ts`、`src/core/lease-machine.ts`（只读复用）、
Oracle、Drive 总索引、用户现有 `.claude/settings*.json`。

## commands

在 `02_source/` 内运行：

```bash
npm run test:store
npm run test:privacy
npm run test:concurrency
npm test
npm run typecheck
```

## exit_codes

| 命令 | 退出码 |
|---|---|
| `npm run test:store` | 0（21/21） |
| `npm run test:privacy` | 0（15/15） |
| `npm run test:concurrency` | 0（2/2） |
| `npm test` | 0（218/218，全量无回归） |
| `npm run typecheck` | 0（0 错误） |

## test_summary

- 全量 `npm test`：218 通过。T002–T004 的 180 个测试保持通过；新增
  38 个（store 21 + privacy 15 + concurrency 2）。
- 并发：8 个独立 node 进程各写 25 条 READ_SUCCEEDED，200 事件 /
  200 租约全部落盘、无丢失、无重复、全部 FRESH；4 个进程对同一会话
  各发 1 条 PRE_COMPACT，事件数恰好 +4，8 条租约全部 EXPIRED
  （CONTEXT_COMPACTION），无 SQLITE_BUSY 失败。
- 真实文件 canary 扫描：合成 Prompt / 源码 / 绝对路径 cwd /
  假 API key / transcript 路径经 T003 净化后写入真实 SQLite 文件，
  `.sqlite` 文件字节扫描各为 0 次（WAL 如残留亦扫描，0 次）；删除
  会话并 VACUUM 后，被删会话 ID 在文件中为 0 次，保留会话仍可查。
- 持久化租约与 T004 内存状态机快照一致：`canonicalLeaseSnapshot`
  （重载租约）== 内存机快照。
- 批量原子性：一批中含非法事件则整批 0 落盘；非法预算的 READ
  事件与租约均不落盘。
- better-sqlite3 13.2.0 已安装锁定，可导入，内嵌 SQLite 3.54.1，
  预编译二进制，无需本机构建工具。

## log_paths

- `02_source/artifacts/test-logs/T007_test-store.log`
- `02_source/artifacts/test-logs/T007_test-privacy.log`
- `02_source/artifacts/test-logs/T007_test-concurrency.log`
- `02_source/artifacts/test-logs/T007_test-all.log`
- `02_source/artifacts/test-logs/T007_typecheck.log`

## sha256

```text
d68eed895356a47ea3b41dc91032e6cc23961ce48cee1e9c68f4538cbb0d7bd1  02_source/src/store/store.ts
22c185489131bc34ba3a3aecc4b4c6781498dcb9253a9b50df326eba11af7f1f  02_source/src/store/schema.ts
59fa65c4119566c55a7b92f09b4e27e8da90427829d5888c7f6d91f44f4c57a9  02_source/src/store/errors.ts
3317792d237b88009f0a39698229f0e5ae50a3c8abf1c33c6946c8852b3aa92c  02_source/src/store/index.ts
bca0816119bf446bfd205e4556e34fcc447613ea1efff88fa5d62a7d14faa97d  02_source/src/privacy/path-id.ts
d8e812c99a248700818d510053993af3efd7ea81b4b3c4eb04d4642d7a8183a0  02_source/src/privacy/retention.ts
00fd8f9d2a68423697e9ff9e5466b2320c077a820f659112b3ba2b99e1b7e6e7  02_source/tests/unit/store.test.ts
3a2a040588aa0fac7e3ecd4a4ada314ae705dc5caa604509e30f41959557b8bb  02_source/tests/unit/privacy.test.ts
c9c63e4ae25442a9dbdbe6b935c2b89e951b08add1ee53665364ae32ada5d2db  02_source/tests/unit/concurrency.test.ts
17d4b66527cc48a35e92a2616678ac370077f0cb03676f264ae5c16192d8689d  02_source/tests/helpers/store-worker.mjs
020c0a9a736ff8667267b7b365aa36a0cb177f14fd612208768e5298134bf3ad  02_source/package.json
ea3839a70cc47b9a1831b1a80b20df613309ba0ae2c6922a3e701792ac2c647d  02_source/package-lock.json
```

## 接口说明（供 T005/T006/T008/T009/T011 使用）

```ts
import { GuidancePulseStore } from "../src/store/index.js";
import { loadOrCreatePathKey, computePathIdForKey } from "../src/privacy/index.js";
import { deleteSessionData, deleteAllData, exportEventsJson } from "../src/privacy/index.js";

const { key } = loadOrCreatePathKey(".guidancepulse"); // 首次创建 path-key.bin
const store = GuidancePulseStore.open(".guidancepulse/state.sqlite");

// 事件 + 租约原子落盘；READ_SUCCEEDED 必须传 options（签发 phase/cwd/预算）
store.recordEvent(event, { phaseId, cwdPathId, maxSuccessfulEdits });
// 只追加事件行（WRITE_CHECKED 是输出记录，不驱动状态机；也可用 recordEvent）
store.appendEvent(event);
// §5.4 写前检查并持久化懒失效 updatedStore
store.checkWriteAndPersist(input, timestampUtc?);
// §5.3 成功写扣预算
store.recordWriteOutcomeAndPersist(session, agent, guidance, "success" | "failure", timestampUtc?);
store.getLease(session, agent, guidance);          // undefined = UNSEEN
store.listLeasesForScope(session, agent);
store.listEvents({ sessionScopeId?, type?, limit? });
deleteSessionData(store, sessionScopeId);          // DELETE + VACUUM
deleteAllData(dbPath, keyDir);                     // 关库后删库 + 删密钥
```

## 施工中发现并修复的两个真实问题（均已验证，非规格改动）

1. **只读打开建表失败**：`GuidancePulseStore.open(..., {readonly:true})`
   在 `initSchema` 执行 DDL 而报 STORE_READONLY。修复：只读时只校验
   `user_version`，不建表；无 schema 的库只读打开报
   `STORE_NOT_INITIALIZED`。
2. **并发写 SQLITE_BUSY_SNAPSHOT**：默认 DEFERRED 事务先读租约表、后
   写事件行，另一进程其间提交即立即报 BUSY_SNAPSHOT，busy_timeout
   对此码不生效。修复：全部写事务改用 better-sqlite3 `.immediate`
   （BEGIN IMMEDIATE），写锁先取，竞争方按 busy_timeout（5000ms）
   等待。另 `loadOrCreatePathKey` 补建父目录（并发 worker 首次创建
   密钥时父目录不存在会报 PATH_KEY_UNWRITABLE）。

## known_limits

- `PRAGMA synchronous=NORMAL`：可扛进程崩溃（Hook 子进程的现实故障
  模式），不保证操作系统崩溃/断电不丢最后一次提交；若 T010 的 p95
  或耐久性要求变化，可改 FULL（会更慢）。
- `persistLeases` 每次全量 upsert 当前全部租约：租约数很小（每会话
  数条规则）时无影响；若将来会话/规则规模上千，需改增量持久化。
- `updated_at_utc` 是记账列：`recordEvent` 用事件时间戳（确定性），
  `checkWriteAndPersist` / `recordWriteOutcomeAndPersist` 未传时间戳
  时用墙钟；该列不进入 canonical 快照与事件，不影响 S0 哈希。
- 只读打开不做 WAL checkpoint；`close()` 会 checkpoint 并截断 WAL。
- 密钥文件为 32 字节裸二进制（0600），损坏（非 32 字节）时报
  `INVALID_PATH_KEY`，不自动修复——需人工删后重建（旧 HMAC 随之失效）。
- 规格引用错位（沿用 T002–T004 做法记录，不改规格）：计划书 T007 卡称
  数据字段以项目书 §7.4 为准，但 v1.0.0 项目书第 7 章只到 §7.3，
  字段允许清单实际在 §6.4，事件契约在 §6.3；本任务按 §6.3/§6.4 执行。
- T004 `leaseKey` 用 NUL（`\0`）作分隔符：本任务的 store 不再手写该
  模板，统一 import T004 的 `leaseKey`，故本任务新增文件不含 NUL 字节。

## next_task

- T005 PreToolUse 写前门：可用 `checkWriteAndPersist` +
  `recordEvent(WRITE_CHECKED)` 接线；T006 失效边界可用
  `recordEvent(PRE_COMPACT / CWD_CHANGED / PHASE_CHANGED)`。
- T008 时间轴 UI：可用 `listEvents` / `listLeasesForScope` /
  `exportEventsJson` 读脱敏数据。
- T009 Oracle 对照：持久化租约与内存机快照已验证一致
  （`canonicalLeaseSnapshot` 相等），可直接对照。
- T011 CLI：`guidancepulse privacy export/delete` 可直接包装
  `exportEventsJson` / `deleteSessionData` / `deleteAllData`；
  `init` 需先调 `loadOrCreatePathKey` 再 `GuidancePulseStore.open`。
