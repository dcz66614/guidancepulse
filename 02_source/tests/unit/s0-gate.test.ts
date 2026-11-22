/**
 * S0 gate unit tests — P025 GuidancePulse, T010.
 *
 * Tests only the gate's own pure helpers (canonical JSON, p95
 * percentile, detection/control counting, repeat hashing). The
 * full gate is exercised by `npm run s0:gate` and
 * `npm run repeat:s0 -- --runs 100`; those are the acceptance
 * commands, not this file. All data here is synthetic.
 */

import { describe, expect, it } from "vitest";
import {
  canonicalEqual,
  canonicalJson,
  canonicalReplayHash,
  replayAll,
  summarizeReplay,
  loadFixtures,
  loadGolden,
  type ReplayResult,
} from "../../scripts/s0-replay.js";
import { computeStats, percentile, PERF_THRESHOLD_MS } from "../../scripts/perf-hook.js";
import { repeatReplay } from "../../scripts/repeat-s0.js";

describe("canonical JSON (s0-replay)", () => {
  it("sorts object keys recursively and is stable under key order", () => {
    const a = { b: 1, a: { d: [3, 2], c: "x" } };
    const b = { a: { c: "x", d: [3, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[3,2]},"b":1}');
  });

  it("keeps array order (event order is semantic)", () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it("canonicalEqual ignores key order but not values", () => {
    expect(canonicalEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(canonicalEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("percentile / stats (perf-hook)", () => {
  it("p95 uses ceil(0.95*n)-1 indexing", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 95)).toBe(95);
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 99)).toBe(99);
    expect(percentile(sorted, 100)).toBe(100);
  });

  it("p95 of 20 samples is the 19th value", () => {
    const sorted = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(percentile(sorted, 95)).toBe(190);
  });

  it("computeStats reports min/mean/p50/p95/p99/max", () => {
    const stats = computeStats([10, 20, 30, 40]);
    expect(stats.n).toBe(4);
    expect(stats.min_ms).toBe(10);
    expect(stats.max_ms).toBe(40);
    expect(stats.mean_ms).toBe(25);
    expect(stats.p50_ms).toBe(20);
    expect(stats.p95_ms).toBe(40);
  });

  it("the S0 perf threshold is 500ms (v1.1.0, strict p95 < 500ms)", () => {
    expect(PERF_THRESHOLD_MS).toBe(500);
  });
});

describe("replay summary counting (s0-replay)", () => {
  it("a perfect replay counts 48/48 parity, 32/32 detection, 16/16 control", () => {
    const fixtures = loadFixtures();
    const golden = loadGolden();
    const summary = summarizeReplay(fixtures, replayAll(fixtures), golden);
    expect(summary.total).toBe(48);
    expect(summary.parityMatched).toBe(48);
    expect(summary.parity).toBe("48/48");
    expect(summary.controlTotal).toBe(16);
    expect(summary.controlClean).toBe(16);
    expect(summary.errorTotal).toBe(32);
    expect(summary.errorDetected).toBe(32);
  });

  it("a corrupted replay loses parity and the affected count", () => {
    const fixtures = loadFixtures();
    const golden = loadGolden();
    const results = replayAll(fixtures);
    const tampered: ReplayResult[] = results.map((r) =>
      r.id === "C01"
        ? { ...r, decisions: [{ step: 1, decision: "DENY", per_rule: [] }] }
        : r,
    );
    const summary = summarizeReplay(fixtures, tampered, golden);
    expect(summary.parityMatched).toBe(47);
    expect(summary.controlClean).toBe(15);
    expect(summary.errorDetected).toBe(32);
  });

  it("a tampered error fixture loses detection for that fixture", () => {
    const fixtures = loadFixtures();
    const golden = loadGolden();
    const results = replayAll(fixtures);
    // Simulate an implementation that ignores the compact boundary:
    // decisions all ALLOW, leases all FRESH — including the
    // intermediate snapshots, where the expiry would otherwise show.
    const tampered: ReplayResult[] = results.map((r) =>
      r.id === "K01"
        ? {
            ...r,
            decisions: r.decisions.map((d) => ({ ...d, decision: "ALLOW" })),
            leases: r.leases.map((l) => ({ ...l, state: "FRESH", reason: null })),
            snapshots: r.snapshots.map((s) => ({
              step: s.step,
              leases: s.leases.map((l) => ({ ...l, state: "FRESH", reason: null })),
            })),
          }
        : r,
    );
    const summary = summarizeReplay(fixtures, tampered, golden);
    expect(summary.parityMatched).toBe(47);
    expect(summary.errorDetected).toBe(31);
  });
});

describe("repeat determinism (repeat-s0)", () => {
  it("two runs of the full replay hash identically", () => {
    const fixtures = loadFixtures();
    expect(canonicalReplayHash(replayAll(fixtures))).toBe(canonicalReplayHash(replayAll(fixtures)));
  });

  it("repeatReplay(3) reports exactly one unique hash", () => {
    const result = repeatReplay(3);
    expect(result.runs).toBe(3);
    expect(result.unique_hash_count).toBe(1);
    expect(result.verdict).toBe("PASS");
    expect(result.canonical_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
