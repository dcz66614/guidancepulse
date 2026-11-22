/**
 * perf:hook CLI — P025 GuidancePulse, T010.
 *
 * Thin entry over `scripts/perf-hook.ts` (the measurement library).
 * Split out because vite-node does not put the entry file in
 * `process.argv`, so a library that imports cleanly under vitest
 * cannot also detect "I am the entry" — the CLI file is only ever
 * run as the entry, so it calls main() unconditionally (the repo's
 * established script pattern, cf. scripts/demo-report.ts).
 *
 * Usage: `npm run perf:hook -- --runs 100 [--out PATH] [--keep-temp]`
 * Under vite-node the user args start at process.argv[2].
 */

import { measureHookPerf, parsePerfArgs } from "./perf-hook.js";

const { runs, out, keepTemp } = parsePerfArgs(process.argv.slice(2));
measureHookPerf({ runs, outPath: out, keepTemp })
  .then((result) => {
    console.log(
      `perf:hook runs=${result.runs} p50=${result.stats.p50_ms.toFixed(2)}ms ` +
        `p95=${result.stats.p95_ms.toFixed(2)}ms p99=${result.stats.p99_ms.toFixed(2)}ms ` +
        `min=${result.stats.min_ms.toFixed(2)}ms max=${result.stats.max_ms.toFixed(2)}ms ` +
        `cold_start=${result.cold_start_ms.toFixed(2)}ms threshold=<${result.threshold_ms}ms ` +
        `verdict=${result.verdict} failures=${result.failures.length}`,
    );
    if (result.failures.length > 0) {
      for (const f of result.failures) console.error(`perf failure: ${f}`);
    }
  })
  .catch((error: unknown) => {
    console.error(`perf:hook measurement failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
