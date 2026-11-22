/**
 * 100-run determinism check — P025 GuidancePulse, T010.
 *
 * Replays the full 48-fixture S0 set N times (default 100) through
 * the production lease machine and computes the canonical semantic
 * hash (IMPLEMENTATION_PLAN §8.4, v1.1.0) of each run. The hash covers fixture ids, write
 * decisions, final leases, and the per-step lease snapshots — no
 * wall-clock durations, no temporary directories, no machine paths,
 * no performance data.
 *
 * Usage:
 *   npm run repeat:s0 -- --runs 100 [--out artifacts/s0/repeat-hashes.json]
 *
 * Exit code 0 iff exactly one unique hash was observed across all
 * runs; otherwise 1. Writes `artifacts/s0/repeat-hashes.json`
 * (runs, unique hash count, the hash(es), and the per-run hash
 * list) so the result is independently re-computable.
 *
 * No network is used. All data is synthetic. The replay is pure
 * in-process work: no subprocess, no SQLite, no clock.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalReplayHash,
  loadFixtures,
  replayAll,
} from "./s0-replay.js";

export interface RepeatResult {
  runs: number;
  unique_hash_count: number;
  unique_hashes: string[];
  canonical_hash: string | null;
  verdict: "PASS" | "FAIL";
  per_run_hashes: string[];
}

export function repeatReplay(runs: number): RepeatResult {
  const fixtures = loadFixtures();
  const perRunHashes: string[] = [];
  for (let i = 0; i < runs; i++) {
    perRunHashes.push(canonicalReplayHash(replayAll(fixtures)));
  }
  const unique = [...new Set(perRunHashes)].sort();
  return {
    runs,
    unique_hash_count: unique.length,
    unique_hashes: unique,
    canonical_hash: unique.length === 1 ? (unique[0] as string) : null,
    verdict: unique.length === 1 ? "PASS" : "FAIL",
    per_run_hashes: perRunHashes,
  };
}

export function parseRepeatArgs(argv: readonly string[]): { runs: number; out: string | null } {
  let runs = 100;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs" && argv[i + 1] !== undefined) {
      runs = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--out" && argv[i + 1] !== undefined) {
      out = argv[i + 1] as string;
      i += 1;
    }
  }
  return { runs, out };
}

/** Default output path for the repeat report (under artifacts/s0). */
export function defaultRepeatOutPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "s0", "repeat-hashes.json");
}

