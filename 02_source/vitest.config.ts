import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    // F-29: Vitest worker->main birpc `onTaskUpdate` has a hardcoded 60 s
    // timeout. Under parallel load the slow spawnSync-heavy files
    // (cli-chain, installer, fix-t013, full-chain) exceed 60 s wall time
    // and the unanswered RPC makes `npm test` exit 1 with 0 failed tests.
    // maxForks: 2 did NOT help (4 errors, files up to 107 s) — the files
    // stretch under any concurrent load on this CPU-capped VM. Running
    // files serially keeps each under 60 s (solo: 24-49 s).
    fileParallelism: false,
  },
});
