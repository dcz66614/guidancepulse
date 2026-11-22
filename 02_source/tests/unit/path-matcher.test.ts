/**
 * Path rule matcher tests — P025 GuidancePulse, T004.
 * PROJECT_BOOK §6.4 (`match_rules(target, current_phase)`) and §6.2
 * condition 3 (current phase in the rule's allowed range). Glob
 * semantics are T002's frozen `matchGlob`; this file locks the
 * phase-aware selection on top of it. All data synthetic.
 */

import { describe, expect, it } from "vitest";
import { ConfigError, parseConfigYaml, type GuidanceConfig } from "../../src/config/index.js";
import {
  isRuleActiveInPhase,
  matchRuleIds,
  matchRules,
  matchRulesAnyPhase,
  ruleMatchesTarget,
} from "../../src/core/match-rules.js";

const CONFIG_YAML = `version: 1
defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny
phases: [explore, implementation, review, release]
rules:
  - id: auth-change-safety
    source: [CLAUDE.md]
    applies_to: [src/auth/**, src/session/**]
    phases: [implementation, review]
    mode: block
  - id: docs-style
    source: [CLAUDE.md]
    applies_to: [docs/**]
    mode: warn
  - id: session-impl
    source: [.claude/rules/security.md]
    applies_to: [src/session/*.ts]
    phases: [implementation]
    mode: ask
`;

const CONFIG = parseConfigYaml(CONFIG_YAML);

const GLOB_YAML = `version: 1
phases: [implementation]
rules:
  - id: cache-one
    source: [CLAUDE.md]
    applies_to: ["src/ver/v?.ts", "src/[a-c]ache/*.ts"]
`;

const GLOB_CONFIG = parseConfigYaml(GLOB_YAML);

describe("matchRules: glob + phase selection", () => {
  it("matches a ** glob in an active phase", () => {
    expect(matchRuleIds(CONFIG, "src/auth/login.ts", "implementation")).toEqual([
      "auth-change-safety",
    ]);
    expect(matchRuleIds(CONFIG, "src/auth/deep/nested/x.ts", "review")).toEqual([
      "auth-change-safety",
    ]);
  });

  it("** matches zero segments: the directory itself is protected", () => {
    expect(matchRuleIds(CONFIG, "src/auth", "implementation")).toEqual([
      "auth-change-safety",
    ]);
    expect(matchRuleIds(CONFIG, "docs", "explore")).toEqual(["docs-style"]);
  });

  it("returns no rule for an unmatched target", () => {
    expect(matchRules(CONFIG, "src/other/x.ts", "implementation")).toEqual([]);
    expect(matchRules(CONFIG, "README.md", "implementation")).toEqual([]);
  });

  it("phase filter: a rule is silent outside its phases", () => {
    expect(matchRuleIds(CONFIG, "src/auth/login.ts", "explore")).toEqual([]);
    expect(matchRuleIds(CONFIG, "src/auth/login.ts", "release")).toEqual([]);
    // A rule with no phases applies to every declared phase.
    expect(matchRuleIds(CONFIG, "docs/guide.md", "explore")).toEqual(["docs-style"]);
    expect(matchRuleIds(CONFIG, "docs/guide.md", "release")).toEqual(["docs-style"]);
  });

  it("multiple matching rules come back in config order", () => {
    expect(matchRuleIds(CONFIG, "src/session/util.ts", "implementation")).toEqual([
      "auth-change-safety",
      "session-impl",
    ]);
    expect(matchRuleIds(CONFIG, "src/session/util.ts", "review")).toEqual([
      "auth-change-safety",
    ]);
  });

  it("null phase is phase-agnostic (fail closed: a rule that might apply is checked)", () => {
    expect(matchRuleIds(CONFIG, "src/auth/login.ts", null)).toEqual([
      "auth-change-safety",
    ]);
    expect(matchRuleIds(CONFIG, "src/session/util.ts", null)).toEqual([
      "auth-change-safety",
      "session-impl",
    ]);
  });

  it("matchRules returns the full rule objects, not just ids", () => {
    const rules = matchRules(CONFIG, "src/auth/login.ts", "implementation");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe("auth-change-safety");
    expect(rules[0]?.mode).toBe("block");
    expect(rules[0]?.max_successful_edits).toBe(5);
  });

  it("matchRulesAnyPhase ignores the phase (the T003 adapter view)", () => {
    expect(matchRuleIds(CONFIG, "src/auth/login.ts", "explore")).toEqual([]);
    expect(matchRulesAnyPhase(CONFIG, "src/auth/login.ts").map((r) => r.id)).toEqual([
      "auth-change-safety",
    ]);
  });
});

describe("matchRules: path normalisation", () => {
  it("backslashes, ./, and duplicate separators collapse before matching", () => {
    expect(matchRuleIds(CONFIG, "src\\auth\\login.ts", "implementation")).toEqual([
      "auth-change-safety",
    ]);
    expect(matchRuleIds(CONFIG, "./src/auth/login.ts", "implementation")).toEqual([
      "auth-change-safety",
    ]);
    expect(matchRuleIds(CONFIG, "src//auth///login.ts", "implementation")).toEqual([
      "auth-change-safety",
    ]);
    expect(matchRuleIds(CONFIG, "src/auth/../auth/login.ts", "implementation")).toEqual([
      "auth-change-safety",
    ]);
  });

  it("un-normalisable targets match nothing (absolute, escaping .., empty)", () => {
    expect(matchRules(CONFIG, "/proj/src/auth/login.ts", "implementation")).toEqual([]);
    expect(matchRules(CONFIG, "../escape.ts", "implementation")).toEqual([]);
    expect(matchRules(CONFIG, "", "implementation")).toEqual([]);
    expect(matchRules(CONFIG, "   ", "implementation")).toEqual([]);
  });

  it("* never crosses a segment boundary", () => {
    // src/session/*.ts matches a direct child only; the ** rule still covers deep files.
    expect(matchRuleIds(CONFIG, "src/session/deep/a.ts", "implementation")).toEqual([
      "auth-change-safety",
    ]);
    expect(matchRuleIds(CONFIG, "src/session/a.ts", "implementation")).toEqual([
      "auth-change-safety",
      "session-impl",
    ]);
  });

  it("? matches exactly one character; [...] classes match one segment character", () => {
    expect(matchRuleIds(GLOB_CONFIG, "src/ver/v1.ts", "implementation")).toEqual([
      "cache-one",
    ]);
    expect(matchRuleIds(GLOB_CONFIG, "src/ver/v12.ts", "implementation")).toEqual([]);
    expect(matchRuleIds(GLOB_CONFIG, "src/cache/x.ts", "implementation")).toEqual([
      "cache-one",
    ]);
    expect(matchRuleIds(GLOB_CONFIG, "src/aache/x.ts", "implementation")).toEqual([
      "cache-one",
    ]);
    expect(matchRuleIds(GLOB_CONFIG, "src/dache/x.ts", "implementation")).toEqual([]);
  });

  it("case: POSIX targets stay case-sensitive by default (FIX-R5)", () => {
    expect(matchRuleIds(CONFIG, "src/SESSION/util.ts", "implementation")).toEqual([]);
    expect(matchRuleIds(CONFIG, "SRC/session/util.ts", "implementation")).toEqual([]);
    expect(matchRuleIds(CONFIG, "src/session/util.ts", "implementation")).toEqual([
      "auth-change-safety",
      "session-impl",
    ]);
  });

  it("case: { caseInsensitive: true } matches Windows-origin targets (FIX-R5)", () => {
    expect(
      matchRuleIds(CONFIG, "src/SESSION/util.ts", "implementation", { caseInsensitive: true }),
    ).toEqual(["auth-change-safety", "session-impl"]);
    expect(
      matchRuleIds(CONFIG, "SRC/SESSION/DEEP/UTIL.TS", "implementation", { caseInsensitive: true }),
    ).toEqual(["auth-change-safety"]);
    expect(
      matchRuleIds(CONFIG, "src/other/x.ts", "implementation", { caseInsensitive: true }),
    ).toEqual([]);
  });
});

describe("helpers and error handling", () => {
  it("isRuleActiveInPhase: null phase is active for every rule", () => {
    const [auth, docs] = CONFIG.rules;
    expect(isRuleActiveInPhase(auth as GuidanceConfig["rules"][number], null)).toBe(true);
    expect(isRuleActiveInPhase(auth as GuidanceConfig["rules"][number], "implementation")).toBe(true);
    expect(isRuleActiveInPhase(auth as GuidanceConfig["rules"][number], "explore")).toBe(false);
    expect(isRuleActiveInPhase(docs as GuidanceConfig["rules"][number], "explore")).toBe(true);
  });

  it("ruleMatchesTarget checks globs only, ignoring phase", () => {
    const [auth] = CONFIG.rules;
    expect(ruleMatchesTarget(auth as GuidanceConfig["rules"][number], "src/auth/x.ts")).toBe(true);
    expect(ruleMatchesTarget(auth as GuidanceConfig["rules"][number], "src/other/x.ts")).toBe(false);
  });

  it("ruleMatchesTarget forwards the case option (FIX-R5)", () => {
    const [auth] = CONFIG.rules;
    expect(
      ruleMatchesTarget(auth as GuidanceConfig["rules"][number], "SRC/AUTH/x.ts"),
    ).toBe(false);
    expect(
      ruleMatchesTarget(auth as GuidanceConfig["rules"][number], "SRC/AUTH/x.ts", {
        caseInsensitive: true,
      }),
    ).toBe(true);
  });

  it("an invalid glob in a caller-built config throws ConfigError", () => {
    const bad = {
      ...CONFIG,
      rules: [{ ...CONFIG.rules[0], applies_to: ["src/**x"] }],
    } as unknown as GuidanceConfig;
    expect(() => matchRules(bad, "src/auth/x.ts", "implementation")).toThrow(ConfigError);
  });

  it("a config with no rules matches nothing", () => {
    const empty = { ...CONFIG, rules: [] };
    expect(matchRules(empty, "src/auth/login.ts", "implementation")).toEqual([]);
  });
});
