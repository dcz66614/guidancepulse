/**
 * repeat:s0 CLI — P025 GuidancePulse, T010.
 *
 * Thin entry over `scripts/repeat-s0.ts` (the determinism library).
 * Split out for the same reason as scripts/perf-hook-cli.ts:
 * vite-node does not put the entry file in `process.argv`, so the
 * library must stay import-safe under vitest while this file — only
 * ever run as the entry — calls main() unconditionally.
 *
 * Usage: `npm run repeat:s0 -- --runs 100 [--out PATH]`
 * Exit code 0 iff exactly one unique hash was observed.
 * Under vite-node the user args start at process.argv[2].
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultRepeatOutPath, parseRepeatArgs, repeatReplay } from "./repeat-s0.js";

const { runs, out } = parseRepeatArgs(process.argv.slice(2));
if (!Number.isInteger(runs) || runs < 1) {
  console.error(`repeat:s0: --runs must be a positive integer (got ${runs})`);
  process.exit(1);
}
const result = repeatReplay(runs);
const outPath = out ?? defaultRepeatOutPath();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
console.log(
  `repeat:s0 runs=${result.runs} unique_hashes=${result.unique_hash_count} ` +
    `hash=${result.canonical_hash ?? result.unique_hashes.join(",")} verdict=${result.verdict}`,
);
process.exit(result.verdict === "PASS" ? 0 : 1);
