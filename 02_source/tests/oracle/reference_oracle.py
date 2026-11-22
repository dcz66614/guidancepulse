#!/usr/bin/env python3
"""Independent reference Oracle — P025 GuidancePulse, T009.

Re-implements the Guidance Lease semantics of PROJECT_BOOK.md v1.0.0
§5 from scratch, using Python 3.12 standard library only.

INDEPENDENCE (IMPLEMENTATION_PLAN §7.5 — hard requirement)
-----------------------------------------------------------
* This file does NOT import TypeScript code, does NOT run the
  production CLI, and shares NO state-transition function with the
  production code. It was written from the spec (§5.1–§5.5) and the
  fixture format, reading the production sources only as a semantic
  reference for frozen edge choices that the spec leaves open
  (fail-closed on unknown cwd/phase, budget-0 leases, lazy expiry).
* The 48 Golden Expected outputs in ``tests/golden/expected-v1.json``
  were hand-written (see ``tests/fixtures/s0/author-fixtures.py``).
  A mismatch between this Oracle and Golden is a FAILURE — this file
  never overwrites Golden with computed values.
* Path ids are ``hmac:<sha256-hmac-hex>`` over the normalised path,
  keyed with the FIXED test key ``guidancepulse-s0-test-key-v1``
  (synthetic; never a real key). No randomness, no wall clock: every
  timestamp comes from the fixture steps.

Usage:
    python3 tests/oracle/reference_oracle.py --verify-golden
        Replay all 48 fixtures, compare decisions + final leases
        against the golden file (and cross-check the fixture inline
        ``expected`` against the same golden entry). Exit 0 iff 48/48.
    python3 tests/oracle/reference_oracle.py --self-test
        Run the Oracle's own unit checks (HMAC vector, path
        normalisation, glob, state machine, aggregation). Exit 0 iff
        all pass.
    python3 tests/oracle/reference_oracle.py --fixture C01 [--json]
        Replay one fixture and print the computed result.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import sys
from pathlib import Path

TEST_PATH_KEY = "guidancepulse-s0-test-key-v1"
FIXTURE_GROUPS = ("control", "compact", "cwd", "unread", "scope")


# ---------------------------------------------------------------- paths
def normalize_path_for_id(raw):
    """Port of T003 ``normalizePathForId`` (sanitize.ts).

    Backslashes -> ``/``; ``.`` / empty segments collapse; ``..``
    pops (or is kept for relative paths); absolute result keeps its
    leading ``/``; empty result -> ``/`` for absolute, else None.
    """
    if not isinstance(raw, str):
        return None
    trimmed = raw.strip()
    if len(trimmed) == 0:
        return None
    forward = trimmed.replace("\\", "/")
    absolute = forward.startswith("/")
    out = []
    for segment in forward.split("/"):
        if segment == "" or segment == ".":
            continue
        if segment == "..":
            if out and out[-1] != "..":
                out.pop()
            elif not absolute:
                out.append("..")
            continue
        out.append(segment)
    joined = "/".join(out)
    if len(joined) == 0:
        return "/" if absolute else None
    return "/" + joined if absolute else joined


def compute_path_id(raw_path, key=TEST_PATH_KEY):
    """``hmac:<sha256-hmac-hex>`` over the normalised path."""
    normalised = normalize_path_for_id(raw_path)
    if normalised is None:
        raise ValueError(f"INVALID_PATH: {raw_path!r}")
    if len(key) == 0:
        raise ValueError("EMPTY_PATH_KEY")
    digest = hmac.new(key.encode("utf-8"), normalised.encode("utf-8"),
                      hashlib.sha256).hexdigest()
    return "hmac:" + digest


def normalize_target_path(raw):
    """Port of T002 ``normalizeTargetPath`` (glob.ts).

    Relative only: absolute or ``..``-escaping paths return None.
    """
    if not isinstance(raw, str) or len(raw) == 0:
        return None
    if raw != raw.strip():
        return None
    forward = raw.replace("\\", "/")
    if forward.startswith("/"):
        return None
    out = []
    for segment in forward.split("/"):
        if segment == "" or segment == ".":
            continue
        if segment == "..":
            if not out:
                return None
            out.pop()
            continue
        out.append(segment)
    if not out:
        return None
    return "/".join(out)


# ---------------------------------------------------------------- glob
def _scan_char_class(segment, open_idx):
    """Index of the closing ``]`` of the class at ``open_idx``, or -1."""
    i = open_idx + 1
    if i < len(segment) and segment[i] in ("!", "^"):
        i += 1
    if i < len(segment) and segment[i] == "]":
        i += 1
    while i < len(segment):
        if segment[i] == "]":
            return i
        i += 1
    return -1


def _match_char_class(body, ch):
    negated = False
    i = 0
    if i < len(body) and body[i] in ("!", "^"):
        negated = True
        i += 1
    matched = False
    first = True
    while i < len(body):
        c = body[i]
        if c == "]" and not first:
            break
        first = False
        if i + 2 < len(body) and body[i + 1] == "-" and body[i + 2] != "]":
            if body[i] <= ch <= body[i + 2]:
                matched = True
            i += 3
        else:
            if c == ch:
                matched = True
            i += 1
    return (not matched) if negated else matched


def _match_segment(pattern, value):
    """One-segment glob match (``*``, ``?``, ``[...]``) — port of glob.ts."""
    p = 0
    v = 0
    star_p = -1
    star_v = 0
    while v < len(value):
        if p < len(pattern):
            pc = pattern[p]
            if pc == "*":
                star_p = p
                star_v = v
                p += 1
                continue
            if pc == "?":
                p += 1
                v += 1
                continue
            if pc == "[":
                close = _scan_char_class(pattern, p)
                if close != -1 and _match_char_class(pattern[p + 1:close], value[v]):
                    p = close + 1
                    v += 1
                    continue
            elif pc == value[v]:
                p += 1
                v += 1
                continue
        if star_p != -1:
            p = star_p + 1
            star_v += 1
            v = star_v
            continue
        return False
    while p < len(pattern) and pattern[p] == "*":
        p += 1
    return p == len(pattern)


def _match_segments(pattern_segments, value_segments):
    if not pattern_segments:
        return len(value_segments) == 0
    head = pattern_segments[0]
    if head == "**":
        for skip in range(len(value_segments) + 1):
            if _match_segments(pattern_segments[1:], value_segments[skip:]):
                return True
        return False
    if not value_segments:
        return False
    if not _match_segment(head, value_segments[0]):
        return False
    return _match_segments(pattern_segments[1:], value_segments[1:])


def match_glob(pattern, target_path):
    """Port of T002 ``matchGlob``: pattern must be a valid relative glob."""
    if not isinstance(pattern, str) or len(pattern) == 0:
        raise ValueError("INVALID_GLOB: empty pattern")
    if pattern != pattern.strip() or pattern.startswith("/") or pattern.endswith("/"):
        raise ValueError(f"INVALID_GLOB: {pattern!r}")
    if "\\" in pattern:
        raise ValueError(f"INVALID_GLOB: {pattern!r}")
    for segment in pattern.split("/"):
        if segment == "" or segment == "..":
            raise ValueError(f"INVALID_GLOB: {pattern!r}")
        if segment != "**" and "**" in segment:
            raise ValueError(f"INVALID_GLOB: {pattern!r}")
        if "[" in segment:
            i = 0
            while i < len(segment):
                if segment[i] == "[":
                    close = _scan_char_class(segment, i)
                    if close == -1:
                        raise ValueError(f"INVALID_GLOB: {pattern!r}")
                    i = close + 1
                else:
                    i += 1
    normalised = normalize_target_path(target_path)
    if normalised is None:
        return False
    return _match_segments(pattern.split("/"), normalised.split("/"))


def match_rules(config, target_path, phase_id):
    """Rules protecting ``target_path`` in ``phase_id``, config order.

    Port of T004 ``matchRules``: phase ``None`` matches any phase;
    otherwise the rule must list the phase. Un-normalisable targets
    match no rule.
    """
    normalised = normalize_target_path(target_path)
    if normalised is None:
        return []
    out = []
    for rule in config["rules"]:
        if phase_id is not None and phase_id not in rule["phases"]:
            continue
        if any(match_glob(p, normalised) for p in rule["applies_to"]):
            out.append(rule)
    return out


def aggregate_modes(modes):
    """Strictest mode wins: block > ask > warn (T002 ``aggregateModes``)."""
    if "block" in modes:
        return "block"
    if "ask" in modes:
        return "ask"
    if "warn" in modes:
        return "warn"
    raise ValueError("at least one mode is required to aggregate")


# ---------------------------------------------------------------- leases
def _lease_key(session, agent, guidance):
    return (session, agent, guidance)


class Oracle:
    """Independent lease store + transitions (PROJECT_BOOK §5)."""

    def __init__(self):
        self.leases = {}  # key -> lease dict; absence means UNSEEN

    def _expire_scope(self, session, agent, reason, keep):
        for key, lease in list(self.leases.items()):
            if key[0] != session or key[1] != agent:
                continue
            if lease["state"] != "FRESH" or keep(lease):
                continue
            lease["state"] = "EXPIRED"
            lease["reason"] = reason

    def apply_read(self, session, agent, guidance, phase, cwd, budget, t):
        state = "EXPIRED" if budget == 0 else "FRESH"
        self.leases[_lease_key(session, agent, guidance)] = {
            "session": session,
            "agent": agent,
            "guidance_id": guidance,
            "state": state,
            "phase": phase,
            "cwd": cwd,
            "remaining": budget,
            "max": budget,
            "reason": "EDIT_BUDGET_EXHAUSTED" if budget == 0 else None,
            "last_read": t,
        }

    def apply_compact(self, session, agent):
        self._expire_scope(session, agent, "CONTEXT_COMPACTION", lambda _l: False)

    def apply_cwd(self, session, agent, new_cwd):
        # FIX-T013 (old F-06): a cwd step with no `new` path is
        # ignored, symmetric with production `adaptCwdChanged`
        # (which returns `ignored` when old/new cwd is missing)
        # instead of raising ValueError from compute_path_id.
        # check_write already fail-closes on cwd=None the same way.
        if new_cwd is None:
            return
        new_id = compute_path_id(new_cwd)
        self._expire_scope(
            session, agent, "CWD_MISMATCH",
            lambda lease: compute_path_id(lease["cwd"]) == new_id)

    def apply_phase(self, session, agent, phase):
        self._expire_scope(
            session, agent, "PHASE_MISMATCH",
            lambda lease: lease["phase"] == phase)

    def check_write(self, session, agent, cwd, phase, rules):
        """§5.4 write check with lazy expiry. Returns (decision, per_rule)."""
        per_rule = []
        cwd_id = compute_path_id(cwd) if cwd is not None else None
        for rule in rules:
            lease = self.leases.get(_lease_key(session, agent, rule["id"]))
            expired_reason = None
            if lease is None:
                state = "UNSEEN"
            elif lease["state"] != "FRESH":
                state = lease["state"]
            elif compute_path_id(lease["cwd"]) != cwd_id:
                state = "EXPIRED"
                expired_reason = "CWD_MISMATCH"
            elif lease["phase"] != phase:
                state = "EXPIRED"
                expired_reason = "PHASE_MISMATCH"
            elif lease["remaining"] <= 0:
                state = "EXPIRED"
                expired_reason = "EDIT_BUDGET_EXHAUSTED"
            else:
                state = "FRESH"
            if expired_reason is not None:
                lease["state"] = "EXPIRED"
                lease["reason"] = expired_reason
            per_rule.append({
                "guidance_id": rule["id"],
                "mode": rule["mode"],
                "state": state,
                "expired_reason": expired_reason,
            })
        failing = [r for r in per_rule if r["state"] != "FRESH"]
        if not failing:
            decision = "ALLOW"
        else:
            mode = aggregate_modes([r["mode"] for r in failing])
            decision = {"block": "DENY", "ask": "ASK", "warn": "WARN"}[mode]
        return decision, per_rule

    def record_write_outcome(self, session, agent, guidance, outcome):
        """§5.3: only a SUCCESSFUL write spends a FRESH lease's budget."""
        if outcome != "success":
            return
        lease = self.leases.get(_lease_key(session, agent, guidance))
        if lease is None or lease["state"] != "FRESH":
            return
        lease["remaining"] -= 1
        if lease["remaining"] <= 0:
            lease["remaining"] = 0
            lease["state"] = "EXPIRED"
            lease["reason"] = "EDIT_BUDGET_EXHAUSTED"

    def final_leases(self):
        out = [dict(lease) for lease in self.leases.values()]
        out.sort(key=lambda l: (l["session"], l["agent"], l["guidance_id"]))
        return out


# ---------------------------------------------------------------- replay
def replay_fixture(fixture):
    """Replay one fixture's steps through the Oracle.

    Returns {"decisions": [...], "leases": [...]} in golden shape.
    """
    config = fixture["config"]
    rules_by_id = {r["id"]: r for r in config["rules"]}
    oracle = Oracle()
    session = fixture["session"]
    agent = fixture["agent"]
    decisions = []
    for idx, step in enumerate(fixture["steps"]):
        kind = step["kind"]
        if kind in ("read", "load"):
            rule = rules_by_id[step["guidance_id"]]
            budget = step.get("max_successful_edits", rule["max_successful_edits"])
            oracle.apply_read(session, agent, step["guidance_id"],
                              step["phase"], step["cwd"], budget, step["t"])
        elif kind == "read_failed":
            pass  # a failed read issues nothing; stays UNSEEN
        elif kind == "compact":
            oracle.apply_compact(session, agent)
        elif kind == "cwd":
            oracle.apply_cwd(session, agent, step.get("new"))
        elif kind == "phase":
            oracle.apply_phase(session, agent, step["phase"])
        elif kind == "subagent":
            agent = step["agent"]  # new scope starts UNSEEN by absence
        elif kind == "agent":
            agent = step["agent"]  # harness-only scope switch, no event
        elif kind == "write":
            rules = match_rules(config, step["target"], step["phase"])
            cwd_id = compute_path_id(step["cwd"])
            decision, per_rule = oracle.check_write(
                session, agent, step["cwd"], step["phase"], rules)
            decisions.append({"step": idx, "decision": decision,
                              "per_rule": per_rule})
            if step["outcome"] == "success":
                for rule in rules:
                    oracle.record_write_outcome(session, agent, rule["id"], "success")
        else:
            raise ValueError(f"unknown step kind: {kind!r}")
    return {"decisions": decisions, "leases": oracle.final_leases()}


def load_fixtures(fixtures_dir):
    out = []
    for group in FIXTURE_GROUPS:
        for path in sorted(Path(fixtures_dir, group).glob("*.json")):
            out.append(json.loads(path.read_text(encoding="utf-8")))
    out.sort(key=lambda f: f["id"])
    return out


def verify_golden(fixtures_dir, golden_path):
    """Replay all fixtures; compare Oracle output to Golden.

    Also cross-checks each fixture's inline ``expected`` against the
    same golden entry. Returns (passed, failed, failures list).
    """
    golden_doc = json.loads(Path(golden_path).read_text(encoding="utf-8"))
    golden = golden_doc["fixtures"]
    fixtures = load_fixtures(fixtures_dir)
    failures = []
    passed = 0
    for fixture in fixtures:
        fid = fixture["id"]
        if fid not in golden:
            failures.append(f"{fid}: missing from golden file")
            continue
        computed = replay_fixture(fixture)
        problems = []
        if computed != golden[fid]:
            problems.append("oracle != golden")
            if computed["decisions"] != golden[fid]["decisions"]:
                problems.append(f"decisions: oracle={computed['decisions']!r} "
                                f"golden={golden[fid]['decisions']!r}")
            if computed["leases"] != golden[fid]["leases"]:
                problems.append(f"leases: oracle={computed['leases']!r} "
                                f"golden={golden[fid]['leases']!r}")
        if fixture["expected"] != golden[fid]:
            problems.append("fixture inline expected != golden")
        if problems:
            failures.append(f"{fid}: " + "; ".join(problems))
        else:
            passed += 1
    extra = sorted(set(golden) - {f["id"] for f in fixtures})
    if extra:
        failures.append(f"golden has fixtures with no file: {extra}")
    return passed, len(fixtures), failures


# ---------------------------------------------------------------- self-test
def self_test():
    """Oracle's own unit checks. Raises AssertionError on failure."""
    # HMAC path id: known vector, computed directly with hashlib/hmac.
    key = TEST_PATH_KEY
    expect = "hmac:" + hmac.new(key.encode(), b"/proj",
                                hashlib.sha256).hexdigest()
    assert compute_path_id("/proj") == expect
    assert compute_path_id("/proj/") == expect  # trailing slash normalises away
    assert compute_path_id("/proj//sub/../sub") == compute_path_id("/proj/sub")
    assert normalize_path_for_id("") is None
    assert normalize_path_for_id("/") == "/"
    assert normalize_path_for_id("a/../b") == "b"
    # Target normalisation.
    assert normalize_target_path("src/auth/login.ts") == "src/auth/login.ts"
    assert normalize_target_path("./src//auth/./login.ts") == "src/auth/login.ts"
    assert normalize_target_path("/abs/path") is None
    assert normalize_target_path("../escape") is None
    assert normalize_target_path("src/../../escape") is None
    # Glob: **, *, ?, char classes.
    assert match_glob("src/auth/**", "src/auth/login.ts") is True
    assert match_glob("src/auth/**", "src/auth") is True  # ** matches zero segments
    assert match_glob("src/auth/**", "src/auth/a/b/c.ts") is True
    assert match_glob("src/auth/**", "src/api/routes.ts") is False
    assert match_glob("docs/**", "docs/guide.md") is True
    assert match_glob("src/*/login.ts", "src/auth/login.ts") is True
    assert match_glob("src/*/login.ts", "src/auth/x/login.ts") is False
    assert match_glob("src/?.ts", "src/a.ts") is True
    assert match_glob("src/[a-c].ts", "src/b.ts") is True
    assert match_glob("src/[a-c].ts", "src/d.ts") is False
    assert match_glob("src/[!a-c].ts", "src/d.ts") is True
    # Aggregation: block > ask > warn.
    assert aggregate_modes(["warn", "ask"]) == "ask"
    assert aggregate_modes(["warn", "block"]) == "block"
    assert aggregate_modes(["warn"]) == "warn"
    # Lease machine basics.
    o = Oracle()
    o.apply_read("s", "main", "g", "implementation", "/proj", 5, "2026-11-15T10:00:00Z")
    lease = o.leases[("s", "main", "g")]
    assert lease["state"] == "FRESH" and lease["remaining"] == 5
    decision, per = o.check_write("s", "main", "/proj", "implementation",
                                  [{"id": "g", "mode": "block"}])
    assert decision == "ALLOW" and per[0]["state"] == "FRESH"
    o.record_write_outcome("s", "main", "g", "failure")
    assert o.leases[("s", "main", "g")]["remaining"] == 5  # failed write: no spend
    o.record_write_outcome("s", "main", "g", "success")
    assert o.leases[("s", "main", "g")]["remaining"] == 4
    # Compact expires; re-read restores.
    o.apply_compact("s", "main")
    assert o.leases[("s", "main", "g")]["state"] == "EXPIRED"
    assert o.leases[("s", "main", "g")]["reason"] == "CONTEXT_COMPACTION"
    o.apply_read("s", "main", "g", "implementation", "/proj", 5, "2026-11-15T10:02:00Z")
    assert o.leases[("s", "main", "g")]["state"] == "FRESH"
    assert o.leases[("s", "main", "g")]["remaining"] == 5
    # Cwd: same-cwd change keeps, different-cwd expires.
    o.apply_cwd("s", "main", "/proj")
    assert o.leases[("s", "main", "g")]["state"] == "FRESH"
    o.apply_cwd("s", "main", "/other")
    assert o.leases[("s", "main", "g")]["reason"] == "CWD_MISMATCH"
    # FIX-T013 (old F-06): a cwd step with no `new` path is ignored
    # (production adaptCwdChanged returns `ignored`), not an error.
    o.apply_read("s", "main", "g", "implementation", "/proj", 5, "2026-11-15T10:02:30Z")
    o.apply_cwd("s", "main", None)
    assert o.leases[("s", "main", "g")]["state"] == "FRESH"
    # Phase: same-phase keeps, different-phase expires.
    o.apply_read("s", "main", "g", "implementation", "/proj", 5, "2026-11-15T10:03:00Z")
    o.apply_phase("s", "main", "implementation")
    assert o.leases[("s", "main", "g")]["state"] == "FRESH"
    o.apply_phase("s", "main", "review")
    assert o.leases[("s", "main", "g")]["reason"] == "PHASE_MISMATCH"
    # Budget 0 issues an immediately-EXPIRED lease.
    o.apply_read("s", "main", "g0", "implementation", "/proj", 0, "2026-11-15T10:04:00Z")
    assert o.leases[("s", "main", "g0")]["state"] == "EXPIRED"
    assert o.leases[("s", "main", "g0")]["reason"] == "EDIT_BUDGET_EXHAUSTED"
    # Lazy expiry on the write check itself (no CWD_CHANGED event).
    o2 = Oracle()
    o2.apply_read("s", "main", "g", "implementation", "/proj", 5, "2026-11-15T10:00:00Z")
    decision, per = o2.check_write("s", "main", "/other", "implementation",
                                   [{"id": "g", "mode": "block"}])
    assert decision == "DENY"
    assert per[0]["state"] == "EXPIRED" and per[0]["expired_reason"] == "CWD_MISMATCH"
    assert o2.leases[("s", "main", "g")]["reason"] == "CWD_MISMATCH"
    # Unknown scope is UNSEEN; subagent scope inherits nothing.
    decision, per = o2.check_write("s", "sub-1", "/proj", "implementation",
                                   [{"id": "g", "mode": "block"}])
    assert decision == "DENY" and per[0]["state"] == "UNSEEN"
    # Budget exhaustion via successful writes.
    o3 = Oracle()
    o3.apply_read("s", "main", "g", "implementation", "/proj", 2, "2026-11-15T10:00:00Z")
    o3.record_write_outcome("s", "main", "g", "success")
    o3.record_write_outcome("s", "main", "g", "success")
    assert o3.leases[("s", "main", "g")]["state"] == "EXPIRED"
    assert o3.leases[("s", "main", "g")]["reason"] == "EDIT_BUDGET_EXHAUSTED"
    assert o3.leases[("s", "main", "g")]["remaining"] == 0
    return True


# ---------------------------------------------------------------- CLI
def main(argv=None):
    here = Path(__file__).resolve()
    default_fixtures = here.parents[1] / "fixtures" / "s0"
    default_golden = here.parents[1] / "golden" / "expected-v1.json"
    parser = argparse.ArgumentParser(description="P025 GuidancePulse reference Oracle (T009)")
    parser.add_argument("--verify-golden", action="store_true",
                        help="replay all 48 fixtures and compare against the golden file")
    parser.add_argument("--self-test", action="store_true",
                        help="run the Oracle's own unit checks")
    parser.add_argument("--fixture", metavar="ID",
                        help="replay one fixture and print the computed result")
    parser.add_argument("--json", action="store_true",
                        help="with --fixture: print the result as JSON")
    parser.add_argument("--fixtures-dir", default=str(default_fixtures))
    parser.add_argument("--golden", default=str(default_golden))
    args = parser.parse_args(argv)

    if args.self_test:
        try:
            self_test()
        except AssertionError as exc:
            print(f"SELF-TEST FAILED: {exc}", file=sys.stderr)
            return 1
        print("oracle self-test: PASS")
        if not args.verify_golden and not args.fixture:
            return 0

    if args.fixture:
        fixtures = load_fixtures(args.fixtures_dir)
        match = [f for f in fixtures if f["id"] == args.fixture]
        if not match:
            print(f"unknown fixture: {args.fixture}", file=sys.stderr)
            return 2
        result = replay_fixture(match[0])
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"{args.fixture}: decisions={result['decisions']!r}")
            print(f"{args.fixture}: leases={result['leases']!r}")
        return 0

    if args.verify_golden:
        passed, total, failures = verify_golden(args.fixtures_dir, args.golden)
        print(f"oracle --verify-golden: {passed}/{total} fixtures match golden")
        if failures:
            for failure in failures:
                print(f"  FAIL: {failure}", file=sys.stderr)
            return 1
        print("oracle --verify-golden: PASS (48/48)")
        return 0

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
