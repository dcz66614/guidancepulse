/**
 * Config boundary tests — P025 GuidancePulse, T002.
 * 60+ cases: valid resolution, glob semantics, mode aggregation,
 * every rejection class from src/config/parse.ts, and a JSON Schema
 * cross-check (ajv) of the example config. All data is synthetic.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import {
  aggregateModes,
  ConfigError,
  matchGlob,
  normalizeTargetPath,
  parseConfigYaml,
} from "../../src/config/index.js";

const BASE_YAML = `version: 1
defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny
phases: [explore, implementation, review, release]
rules:
  - id: auth-change-safety
    source: [CLAUDE.md, .claude/rules/security.md]
    applies_to: [src/auth/**, src/session/**]
    phases: [implementation, review]
    mode: block
    max_successful_edits: 5
`;

function expectReject(yaml: string, code: string): void {
  let caught: unknown;
  try {
    parseConfigYaml(yaml);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ConfigError);
  expect((caught as ConfigError).code).toBe(code);
}

describe("valid configs resolve fully", () => {
  it("parses the base config exactly", () => {
    const config = parseConfigYaml(BASE_YAML);
    expect(config).toEqual({
      version: 1,
      defaults: { mode: "warn", max_successful_edits: 5, unobservable_read: "deny" },
      phases: ["explore", "implementation", "review", "release"],
      rules: [
        {
          id: "auth-change-safety",
          source: ["CLAUDE.md", ".claude/rules/security.md"],
          applies_to: ["src/auth/**", "src/session/**"],
          phases: ["implementation", "review"],
          mode: "block",
          max_successful_edits: 5,
          unobservable_read: "deny",
        },
      ],
    });
  });

  it("parses the shipped example file", () => {
    const text = readFileSync(
      new URL("../../guidancepulse.example.yaml", import.meta.url),
      "utf8",
    );
    const config = parseConfigYaml(text);
    expect(config.rules).toHaveLength(2);
    expect(config.rules[0]?.id).toBe("auth-change-safety");
    // Second rule omits phases/mode/max: all resolve from defaults/declared.
    expect(config.rules[1]).toEqual({
      id: "docs-consistency",
      source: ["AGENTS.md"],
      applies_to: ["docs/**"],
      phases: ["explore", "implementation", "review", "release"],
      mode: "warn",
      max_successful_edits: 5,
      unobservable_read: "deny",
    });
  });

  it("minimal config resolves defaults and all phases", () => {
    const config = parseConfigYaml(`version: 1
phases: [explore, review]
rules:
  - id: r1
    source: [CLAUDE.md]
    applies_to: [src/**]
`);
    expect(config.defaults).toEqual({
      mode: "warn",
      max_successful_edits: 5,
      unobservable_read: "deny",
    });
    expect(config.rules[0]?.phases).toEqual(["explore", "review"]);
    expect(config.rules[0]?.mode).toBe("warn");
  });

  it("partial defaults fill only the missing fields", () => {
    const config = parseConfigYaml(`version: 1
defaults:
  mode: block
phases: [explore]
rules:
  - id: r1
    source: [CLAUDE.md]
    applies_to: [src/**]
`);
    expect(config.defaults).toEqual({
      mode: "block",
      max_successful_edits: 5,
      unobservable_read: "deny",
    });
    expect(config.rules[0]?.mode).toBe("block");
  });

  it("rule-level overrides beat defaults", () => {
    const config = parseConfigYaml(`version: 1
defaults:
  mode: warn
  max_successful_edits: 5
  unobservable_read: deny
phases: [explore, review]
rules:
  - id: r1
    source: [CLAUDE.md]
    applies_to: [src/**]
    mode: ask
    max_successful_edits: 2
    unobservable_read: allow
`);
    expect(config.rules[0]?.mode).toBe("ask");
    expect(config.rules[0]?.max_successful_edits).toBe(2);
    expect(config.rules[0]?.unobservable_read).toBe("allow");
  });

  it("max_successful_edits 0 is accepted (lease never authorises a write)", () => {
    const config = parseConfigYaml(`version: 1
phases: [explore]
rules:
  - id: r1
    source: [CLAUDE.md]
    applies_to: [src/**]
    max_successful_edits: 0
`);
    expect(config.rules[0]?.max_successful_edits).toBe(0);
  });

  it("max_successful_edits at the 10000 limit is accepted", () => {
    const config = parseConfigYaml(`version: 1
phases: [explore]
rules:
  - id: r1
    source: [CLAUDE.md]
    applies_to: [src/**]
    max_successful_edits: 10000
`);
    expect(config.rules[0]?.max_successful_edits).toBe(10000);
  });
});

describe("glob semantics", () => {
  it("** matches zero segments (src/** matches src)", () => {
    expect(matchGlob("src/**", "src")).toBe(true);
  });
  it("** matches deep nesting", () => {
    expect(matchGlob("src/auth/**", "src/auth/a/b/c.ts")).toBe(true);
  });
  it("** alone matches everything", () => {
    expect(matchGlob("**", "a/b/c.ts")).toBe(true);
  });
  it("* does not cross a path separator", () => {
    expect(matchGlob("src/*.ts", "src/a/b.ts")).toBe(false);
    expect(matchGlob("src/*.ts", "src/a.ts")).toBe(true);
  });
  it("* matches within one segment", () => {
    expect(matchGlob("src/auth-*.ts", "src/auth-jwt.ts")).toBe(true);
    expect(matchGlob("src/auth-*.ts", "src/other.ts")).toBe(false);
  });
  it("? matches exactly one character", () => {
    expect(matchGlob("src/a?c.ts", "src/abc.ts")).toBe(true);
    expect(matchGlob("src/a?c.ts", "src/ac.ts")).toBe(false);
    expect(matchGlob("src/a?c.ts", "src/abbc.ts")).toBe(false);
  });
  it("character class ranges match", () => {
    expect(matchGlob("src/file[0-9].ts", "src/file3.ts")).toBe(true);
    expect(matchGlob("src/file[0-9].ts", "src/filex.ts")).toBe(false);
  });
  it("negated character class matches", () => {
    expect(matchGlob("src/file[!0-9].ts", "src/filex.ts")).toBe(true);
    expect(matchGlob("src/file[!0-9].ts", "src/file3.ts")).toBe(false);
  });
  it("non-matching paths return false", () => {
    expect(matchGlob("src/auth/**", "src/other/x.ts")).toBe(false);
    expect(matchGlob("src/auth/**", "lib/auth/x.ts")).toBe(false);
  });
  it("normalizeTargetPath collapses ./ and backslashes", () => {
    expect(normalizeTargetPath("./src//auth/x.ts")).toBe("src/auth/x.ts");
    expect(normalizeTargetPath("src\\auth\\x.ts")).toBe("src/auth/x.ts");
    expect(normalizeTargetPath("/abs/path.ts")).toBeNull();
    expect(normalizeTargetPath("../escape.ts")).toBeNull();
    expect(normalizeTargetPath("")).toBeNull();
  });
  it("matchGlob returns false for an absolute target instead of matching", () => {
    expect(matchGlob("**", "/etc/passwd")).toBe(false);
  });
  it("glob matching is case-sensitive by default (POSIX, FIX-R5)", () => {
    expect(matchGlob("src/session/**", "src/SESSION/token.ts")).toBe(false);
    expect(matchGlob("src/auth/**", "SRC/auth/x.ts")).toBe(false);
    expect(matchGlob("src/file[A-Z].ts", "src/filea.ts")).toBe(false);
    expect(matchGlob("src/auth/**", "src/auth/x.ts")).toBe(true);
  });
  it("glob matching folds case with { caseInsensitive: true } (Windows, FIX-R5)", () => {
    expect(matchGlob("src/session/**", "src/SESSION/token.ts", { caseInsensitive: true })).toBe(
      true,
    );
    expect(matchGlob("src/auth/**", "SRC/auth/x.ts", { caseInsensitive: true })).toBe(true);
    expect(
      matchGlob("src/session/*.ts", "SRC/SESSION/TOKEN.TS", { caseInsensitive: true }),
    ).toBe(true);
    // Character classes fold with the rest.
    expect(matchGlob("src/file[A-Z].ts", "src/filea.ts", { caseInsensitive: true })).toBe(true);
    expect(matchGlob("src/file[a-z].ts", "src/fileA.ts", { caseInsensitive: true })).toBe(true);
    expect(matchGlob("src/file[0-9].ts", "src/filex.ts", { caseInsensitive: true })).toBe(false);
    expect(matchGlob("src/session/**", "src/other/x.ts", { caseInsensitive: true })).toBe(false);
  });
});

describe("conflict decision (PROJECT_BOOK §6.4)", () => {
  it("block beats ask and warn", () => {
    expect(aggregateModes(["warn", "ask", "block"])).toBe("block");
  });
  it("ask beats warn", () => {
    expect(aggregateModes(["warn", "ask"])).toBe("ask");
  });
  it("a single warn aggregates to warn", () => {
    expect(aggregateModes(["warn"])).toBe("warn");
  });
  it("empty mode list is rejected", () => {
    expect(() => aggregateModes([])).toThrow(ConfigError);
  });
});

describe("rejections", () => {
  const cases: Array<[string, string, string]> = [
    ["empty text", "", "EMPTY_CONFIG"],
    ["whitespace-only text", "  \n ", "EMPTY_CONFIG"],
    [
      "scalar top level",
      "just a string\n",
      "NOT_AN_OBJECT",
    ],
    ["array top level", "- a\n- b\n", "NOT_AN_OBJECT"],
    ["bad YAML syntax", "version: [unclosed\n", "YAML_SYNTAX"],
    [
      "missing version",
      "phases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_VERSION",
    ],
    [
      "version 2",
      "version: 2\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_VERSION",
    ],
    [
      'version "1" as string',
      'version: "1"\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n',
      "INVALID_VERSION",
    ],
    [
      "version 1.5",
      "version: 1.5\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_VERSION",
    ],
    [
      "missing phases",
      "version: 1\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_PHASES",
    ],
    [
      "empty phases",
      "version: 1\nphases: []\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_PHASES",
    ],
    [
      "duplicate phase",
      "version: 1\nphases: [explore, explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "DUPLICATE_PHASE",
    ],
    [
      "uppercase phase",
      "version: 1\nphases: [Explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_SLUG",
    ],
    [
      "phase with a space",
      "version: 1\nphases: ['my phase']\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_SLUG",
    ],
    ["missing rules", "version: 1\nphases: [explore]\n", "INVALID_RULES"],
    [
      "empty rules",
      "version: 1\nphases: [explore]\nrules: []\n",
      "INVALID_RULES",
    ],
    [
      "rule is not a mapping",
      "version: 1\nphases: [explore]\nrules:\n  - just-a-string\n",
      "INVALID_RULE",
    ],
    [
      "rule missing id",
      "version: 1\nphases: [explore]\nrules:\n  - source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_SLUG",
    ],
    [
      "duplicate rule id",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n  - id: r1\n    source: [AGENTS.md]\n    applies_to: [docs/**]\n",
      "DUPLICATE_RULE_ID",
    ],
    [
      "uppercase rule id",
      "version: 1\nphases: [explore]\nrules:\n  - id: Rule-One\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_SLUG",
    ],
    [
      "whitespace-padded rule id is not trimmed",
      "version: 1\nphases: [explore]\nrules:\n  - id: ' r1 '\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_SLUG",
    ],
    [
      "missing source",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    applies_to: [src/**]\n",
      "INVALID_SOURCE",
    ],
    [
      "empty source",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: []\n    applies_to: [src/**]\n",
      "INVALID_SOURCE",
    ],
    [
      "source with empty entry",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: ['']\n    applies_to: [src/**]\n",
      "INVALID_SOURCE",
    ],
    [
      "absolute source path",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [/etc/CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_SOURCE",
    ],
    [
      "source with .. segment",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [../CLAUDE.md]\n    applies_to: [src/**]\n",
      "INVALID_SOURCE",
    ],
    [
      "source with glob character",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [.claude/rules/*.md]\n    applies_to: [src/**]\n",
      "INVALID_SOURCE",
    ],
    [
      "duplicate source entry",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md, CLAUDE.md]\n    applies_to: [src/**]\n",
      "DUPLICATE_SOURCE",
    ],
    [
      "missing applies_to",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n",
      "INVALID_APPLIES_TO",
    ],
    [
      "empty applies_to",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: []\n",
      "INVALID_APPLIES_TO",
    ],
    [
      "empty glob string",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['']\n",
      "INVALID_GLOB",
    ],
    [
      "unbalanced [ glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['src/file[.ts']\n",
      "INVALID_GLOB",
    ],
    [
      "*** glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['src/***']\n",
      "INVALID_GLOB",
    ],
    [
      "embedded ** glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['src/**x']\n",
      "INVALID_GLOB",
    ],
    [
      "absolute glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['/src/**']\n",
      "INVALID_GLOB",
    ],
    [
      ".. glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['../src/**']\n",
      "INVALID_GLOB",
    ],
    [
      "backslash glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['src\\\\auth\\\\**']\n",
      "INVALID_GLOB",
    ],
    [
      "empty segment glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['src//**']\n",
      "INVALID_GLOB",
    ],
    [
      "trailing slash glob",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: ['src/auth/']\n",
      "INVALID_GLOB",
    ],
    [
      "duplicate applies_to pattern",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**, src/**]\n",
      "DUPLICATE_GLOB",
    ],
    [
      "unknown mode",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    mode: shout\n",
      "INVALID_MODE",
    ],
    [
      "unknown unobservable_read",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    unobservable_read: maybe\n",
      "INVALID_UNOBSERVABLE_READ",
    ],
    [
      "rule phase not declared",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    phases: [release]\n",
      "UNKNOWN_PHASE",
    ],
    [
      "empty rule phases",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    phases: []\n",
      "INVALID_RULE_PHASES",
    ],
    [
      "duplicate rule phase",
      "version: 1\nphases: [explore, review]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    phases: [explore, explore]\n",
      "DUPLICATE_PHASE",
    ],
    [
      "unknown top-level key is not ignored",
      "version: 1\nsurprise: true\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "UNKNOWN_KEY",
    ],
    [
      "unknown defaults key is not ignored",
      "version: 1\ndefaults:\n  mode: warn\n  extra: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n",
      "UNKNOWN_KEY",
    ],
    [
      "unknown rule key is not ignored",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    comment: hello\n",
      "UNKNOWN_KEY",
    ],
    [
      "negative max_successful_edits",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    max_successful_edits: -1\n",
      "INVALID_MAX_EDITS",
    ],
    [
      "non-integer max_successful_edits",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    max_successful_edits: 2.5\n",
      "INVALID_MAX_EDITS",
    ],
    [
      "max_successful_edits above the 10000 limit",
      "version: 1\nphases: [explore]\nrules:\n  - id: r1\n    source: [CLAUDE.md]\n    applies_to: [src/**]\n    max_successful_edits: 10001\n",
      "INVALID_MAX_EDITS",
    ],
  ];

  it.each(cases)("rejects: %s", (_name, yaml, code) => {
    expectReject(yaml, code);
  });
});

describe("JSON Schema cross-check (schemas/guidance-rule-v1.schema.json)", () => {
  const schema = JSON.parse(
    readFileSync(
      new URL("../../schemas/guidance-rule-v1.schema.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const ajv = new Ajv2020({ strict: true });
  const validate = ajv.compile(schema);

  it("the shipped example validates against the JSON Schema", () => {
    const text = readFileSync(
      new URL("../../guidancepulse.example.yaml", import.meta.url),
      "utf8",
    );
    const raw = parseYaml(text) as Record<string, unknown>;
    expect(validate(raw)).toBe(true);
  });

  it("an unknown mode fails the JSON Schema", () => {
    const raw = parseYaml(BASE_YAML) as Record<string, unknown>;
    const defaults = raw["defaults"] as Record<string, unknown>;
    defaults["mode"] = "shout";
    expect(validate(raw)).toBe(false);
  });

  it("a missing rules array fails the JSON Schema", () => {
    const raw = parseYaml(BASE_YAML) as Record<string, unknown>;
    delete raw["rules"];
    expect(validate(raw)).toBe(false);
  });
});
