#!/usr/bin/env python3
"""Hand-authored S0 Golden Fixtures — P025 GuidancePulse, T009.

WHAT THIS FILE IS
-----------------
The single hand-written source of the 48 S0 fixtures and their Golden
Expected outputs. Every ``expected`` block below was computed BY HAND
from PROJECT_BOOK.md v1.0.0 §5 (lease state machine §5.1–§5.5,
edit budget §5.3, write-check algorithm §5.4) and the frozen rule
config in this file — NOT by running the production TypeScript code,
NOT by running the Python Oracle, and NOT by copying any program
output. This script only serialises the hand-written data to JSON
(assigning fixed logical timestamps ``T(step_index)``); it executes
no production code and reads no production output.

Run it to (re-)emit the fixture files and the golden file:

    python3 tests/fixtures/s0/author-fixtures.py

INDEPENDENCE (IMPLEMENTATION_PLAN §7.5)
----------------------------------------
* The Oracle (``tests/oracle/reference_oracle.py``) replays the
  ``steps`` independently and compares its own output against
  ``tests/golden/expected-v1.json``. A mismatch is a FAILURE, never
  silently overwritten with a computed value.
* The TypeScript golden test (``tests/unit/golden.test.ts``) replays
  the same steps through the production lease machine and compares
  against each fixture's inline ``expected`` and the golden file.

FIXTURE FORMAT
--------------
* ``id`` / ``group``: C01..C16 control, K01..K08 compact,
  W01..W08 cwd, U01..U08 unread, S01..S08 scope.
* ``session``: fixed synthetic session id. ``agent``: starting agent
  scope (``main``); ``subagent`` / ``agent`` steps switch the current
  agent scope for later steps.
* ``config``: frozen rules — auth-change-safety (block, budget 5,
  phases implementation+review, ``src/auth/**``), docs-style (warn,
  budget 3, all phases, ``docs/**``), api-contract (ask, budget 2,
  implementation only, ``src/api/**``). C13 adds auth-audit (warn,
  budget 5, ``src/auth/**``).
* Steps (``t`` is assigned by the emitter as ``T(index)``):
  - ``read`` / ``load``: confirmed read / InstructionsLoaded load;
    issues a FRESH lease (budget 0 -> immediately EXPIRED).
  - ``read_failed``: a failed read; issues nothing (stays UNSEEN).
  - ``write``: a PreToolUse check. ``outcome`` is what happened to
    the write itself: ``success`` spends one edit from each matched
    FRESH lease, ``failure`` spends nothing, ``not_run`` means the
    write never ran (used after a DENY). A WARN/ASK decision with
    ``outcome: success`` means the write ran (warn allows; ask was
    confirmed by the user in the synthetic trace).
  - ``compact`` / ``cwd`` / ``phase``: PRE_COMPACT / CWD_CHANGED /
    PHASE_CHANGED in the CURRENT scope.
  - ``subagent``: SUBAGENT_STARTED + switch current scope to the new
    agent (new scope starts UNSEEN by absence).
  - ``agent``: harness-only scope switch back (no contract event).
* ``expected.decisions``: one entry per write step (``step`` = index
  into ``steps``), with the aggregated decision and per-rule outcomes
  in config order. ``expired_reason`` is set ONLY when the write
  check itself lazily expired the lease (W04 cwd race); a lease
  already EXPIRED by an earlier boundary event reports
  ``expired_reason: null``.
* ``expected.leases``: final state of every lease ever issued in the
  fixture (absence = UNSEEN, never listed). ``cwd`` is the RAW
  synthetic path (``/proj``); harnesses convert it to the fixed-key
  HMAC path id for comparison. ``last_read`` is the ``T(n)`` of the
  read step that issued the current lease.

All data is synthetic. No real paths, prompts, source code, or keys.
Fixed test path key (both harnesses): ``guidancepulse-s0-test-key-v1``.
"""

from __future__ import annotations

import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_TIME = datetime(2026, 11, 15, 10, 0, 0, tzinfo=timezone.utc)
TEST_PATH_KEY = "guidancepulse-s0-test-key-v1"

AUTH = "auth-change-safety"
DOCS = "docs-style"
API = "api-contract"
AUDIT = "auth-audit"

AUTH_TARGET = "src/auth/login.ts"
DOCS_TARGET = "docs/guide.md"
API_TARGET = "src/api/routes.ts"
MISC_TARGET = "src/misc/util.ts"


def T(n: int) -> str:
    """Fixed logical timestamp for step index n (no wall clock)."""
    return (BASE_TIME + timedelta(minutes=n)).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- helpers
def R(g, phase="implementation", cwd="/proj", budget=None):
    step = {"kind": "read", "guidance_id": g, "phase": phase, "cwd": cwd}
    if budget is not None:
        step["max_successful_edits"] = budget
    return step


def L(g, phase="implementation", cwd="/proj", budget=None):
    step = R(g, phase, cwd, budget)
    step["kind"] = "load"
    return step


def RF(g):
    return {"kind": "read_failed", "guidance_id": g}


def W(target, phase="implementation", cwd="/proj", outcome="success", tool="Write"):
    return {
        "kind": "write",
        "tool": tool,
        "target": target,
        "phase": phase,
        "cwd": cwd,
        "outcome": outcome,
    }


def K():
    return {"kind": "compact"}


def C(old, new):
    return {"kind": "cwd", "old": old, "new": new}


def P(phase):
    return {"kind": "phase", "phase": phase}


def SA(agent):
    return {"kind": "subagent", "agent": agent}


def AG(agent):
    return {"kind": "agent", "agent": agent}


def PR(g, mode, state, reason=None):
    return {
        "guidance_id": g,
        "mode": mode,
        "state": state,
        "expired_reason": reason,
    }


def D(step, decision, per_rule):
    return {"step": step, "decision": decision, "per_rule": per_rule}


def LS(sess, agent, g, state, phase, cwd, rem, mx, reason, last):
    return {
        "session": sess,
        "agent": agent,
        "guidance_id": g,
        "state": state,
        "phase": phase,
        "cwd": cwd,
        "remaining": rem,
        "max": mx,
        "reason": reason,
        "last_read": last,
    }


DEFAULT_CONFIG = {
    "phases": ["explore", "implementation", "review", "release"],
    "rules": [
        {
            "id": AUTH,
            "source": ["CLAUDE.md"],
            "applies_to": ["src/auth/**"],
            "phases": ["implementation", "review"],
            "mode": "block",
            "max_successful_edits": 5,
        },
        {
            "id": DOCS,
            "source": [".claude/rules/docs.md"],
            "applies_to": ["docs/**"],
            "phases": ["explore", "implementation", "review", "release"],
            "mode": "warn",
            "max_successful_edits": 3,
        },
        {
            "id": API,
            "source": ["CLAUDE.md"],
            "applies_to": ["src/api/**"],
            "phases": ["implementation"],
            "mode": "ask",
            "max_successful_edits": 2,
        },
    ],
}

C13_CONFIG = copy.deepcopy(DEFAULT_CONFIG)
C13_CONFIG["rules"].append(
    {
        "id": AUDIT,
        "source": [".claude/rules/audit.md"],
        "applies_to": ["src/auth/**"],
        "phases": ["implementation", "review"],
        "mode": "warn",
        "max_successful_edits": 5,
    }
)


def fixture(fid, group, description, steps, decisions, leases, config=None):
    sess = "sess-s0-" + fid.lower()
    # Canonical lease order for comparison: (session, agent, guidance_id).
    # Values are hand-written; only the ORDER is normalised here.
    leases = sorted(leases, key=lambda l: (l["session"], l["agent"], l["guidance_id"]))
    return {
        "id": fid,
        "group": group,
        "description": description,
        "spec": "PROJECT_BOOK.md v1.0.0 §5",
        "session": sess,
        "agent": "main",
        "config": copy.deepcopy(config if config is not None else DEFAULT_CONFIG),
        "steps": steps,
        "expected": {"decisions": decisions, "leases": leases},
    }


# ---------------------------------------------------------------- fixtures
def build_fixtures():
    fx = []

    # --- control: 16 (all writes ALLOW, no false positives) ---
    fx.append(fixture("C01", "control",
        "Read auth, one successful write: ALLOW, budget 5 -> 4.",
        [R(AUTH), W(AUTH_TARGET)],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c01", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0))]))
    fx.append(fixture("C02", "control",
        "Read auth, four successful writes: budget 5 -> 1, still FRESH.",
        [R(AUTH), W(AUTH_TARGET), W(AUTH_TARGET), W(AUTH_TARGET), W(AUTH_TARGET)],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(2, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(3, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(4, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c02", "main", AUTH, "FRESH", "implementation", "/proj", 1, 5, None, T(0))]))
    fx.append(fixture("C03", "control",
        "Read docs (warn, budget 3), one write: ALLOW, budget 3 -> 2.",
        [R(DOCS), W(DOCS_TARGET)],
        [D(1, "ALLOW", [PR(DOCS, "warn", "FRESH")])],
        [LS("sess-s0-c03", "main", DOCS, "FRESH", "implementation", "/proj", 2, 3, None, T(0))]))
    fx.append(fixture("C04", "control",
        "Read api (ask, budget 2), one write: ALLOW, budget 2 -> 1.",
        [R(API), W(API_TARGET)],
        [D(1, "ALLOW", [PR(API, "ask", "FRESH")])],
        [LS("sess-s0-c04", "main", API, "FRESH", "implementation", "/proj", 1, 2, None, T(0))]))
    fx.append(fixture("C05", "control",
        "Read auth and docs, one write each: both ALLOW, budgets spent independently.",
        [R(AUTH), R(DOCS), W(AUTH_TARGET), W(DOCS_TARGET)],
        [D(2, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(3, "ALLOW", [PR(DOCS, "warn", "FRESH")])],
        [LS("sess-s0-c05", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0)),
         LS("sess-s0-c05", "main", DOCS, "FRESH", "implementation", "/proj", 2, 3, None, T(1))]))
    fx.append(fixture("C06", "control",
        "Re-read refreshes a partially spent lease: 5 -> 3 -> re-read 5 -> 4.",
        [R(AUTH), W(AUTH_TARGET), W(AUTH_TARGET), R(AUTH), W(AUTH_TARGET)],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(2, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(4, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c06", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(3))]))
    fx.append(fixture("C07", "control",
        "A failed write spends no budget: ALLOW, 5 stays 5, then success -> 4.",
        [R(AUTH), W(AUTH_TARGET, outcome="failure"), W(AUTH_TARGET)],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(2, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c07", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0))]))
    fx.append(fixture("C08", "control",
        "Failed read issues nothing; the following successful read gates normally.",
        [RF(AUTH), R(AUTH), W(AUTH_TARGET)],
        [D(2, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c08", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(1))]))
    fx.append(fixture("C09", "control",
        "InstructionsLoaded load (not a Read tool) also issues a FRESH lease.",
        [L(AUTH), W(AUTH_TARGET)],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c09", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0))]))
    fx.append(fixture("C10", "control",
        "Write to an unprotected target with no read at all: no gate, ALLOW, no lease.",
        [W(MISC_TARGET)],
        [D(0, "ALLOW", [])],
        []))
    fx.append(fixture("C11", "control",
        "Auth rule is inactive in phase explore: write in explore is ungated, lease stays FRESH.",
        [R(AUTH), W(AUTH_TARGET, phase="explore")],
        [D(1, "ALLOW", [])],
        [LS("sess-s0-c11", "main", AUTH, "FRESH", "implementation", "/proj", 5, 5, None, T(0))]))
    fx.append(fixture("C12", "control",
        "Edit (not Write) tool is gated the same way: ALLOW, budget 5 -> 4.",
        [R(AUTH), W(AUTH_TARGET, tool="Edit")],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c12", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0))]))
    fx.append(fixture("C13", "control",
        "Two rules protect one target (block + warn), both FRESH: ALLOW, both budgets spent.",
        [R(AUTH), R(AUDIT), W(AUTH_TARGET)],
        [D(2, "ALLOW", [PR(AUTH, "block", "FRESH"), PR(AUDIT, "warn", "FRESH")])],
        [LS("sess-s0-c13", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0)),
         LS("sess-s0-c13", "main", AUDIT, "FRESH", "implementation", "/proj", 4, 5, None, T(1))],
        config=C13_CONFIG))
    fx.append(fixture("C14", "control",
        "Read and write both in phase review (auth active there): ALLOW.",
        [R(AUTH, phase="review"), W(AUTH_TARGET, phase="review")],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c14", "main", AUTH, "FRESH", "review", "/proj", 4, 5, None, T(0))]))
    fx.append(fixture("C15", "control",
        "Subagent reads guidance in its own scope and writes: ALLOW, parent scope untouched.",
        [SA("sub-1"), R(AUTH), W(AUTH_TARGET)],
        [D(2, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c15", "sub-1", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(1))]))
    fx.append(fixture("C16", "control",
        "Compact, then re-read, then write: recovery works, ALLOW.",
        [R(AUTH), K(), R(AUTH), W(AUTH_TARGET)],
        [D(3, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-c16", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(2))]))

    # --- compact: 8 (stale lease reused after PreCompact) ---
    fx.append(fixture("K01", "compact",
        "Read auth, compact, write: DENY, EXPIRED CONTEXT_COMPACTION.",
        [R(AUTH), K(), W(AUTH_TARGET, outcome="not_run")],
        [D(2, "DENY", [PR(AUTH, "block", "EXPIRED")])],
        [LS("sess-s0-k01", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "CONTEXT_COMPACTION", T(0))]))
    fx.append(fixture("K02", "compact",
        "Read docs, compact, write: WARN (warn mode), EXPIRED CONTEXT_COMPACTION.",
        [R(DOCS), K(), W(DOCS_TARGET, outcome="not_run")],
        [D(2, "WARN", [PR(DOCS, "warn", "EXPIRED")])],
        [LS("sess-s0-k02", "main", DOCS, "EXPIRED", "implementation", "/proj", 3, 3, "CONTEXT_COMPACTION", T(0))]))
    fx.append(fixture("K03", "compact",
        "Read api, compact, write: ASK (ask mode), EXPIRED CONTEXT_COMPACTION.",
        [R(API), K(), W(API_TARGET, outcome="not_run")],
        [D(2, "ASK", [PR(API, "ask", "EXPIRED")])],
        [LS("sess-s0-k03", "main", API, "EXPIRED", "implementation", "/proj", 2, 2, "CONTEXT_COMPACTION", T(0))]))
    fx.append(fixture("K04", "compact",
        "Compact, blocked write, re-read, write: DENY then ALLOW (recovery).",
        [R(AUTH), K(), W(AUTH_TARGET, outcome="not_run"), R(AUTH), W(AUTH_TARGET)],
        [D(2, "DENY", [PR(AUTH, "block", "EXPIRED")]),
         D(4, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-k04", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(3))]))
    fx.append(fixture("K05", "compact",
        "Compact expires both leases: auth write DENY, docs write WARN.",
        [R(AUTH), R(DOCS), K(), W(AUTH_TARGET, outcome="not_run"), W(DOCS_TARGET, outcome="not_run")],
        [D(3, "DENY", [PR(AUTH, "block", "EXPIRED")]),
         D(4, "WARN", [PR(DOCS, "warn", "EXPIRED")])],
        [LS("sess-s0-k05", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "CONTEXT_COMPACTION", T(0)),
         LS("sess-s0-k05", "main", DOCS, "EXPIRED", "implementation", "/proj", 3, 3, "CONTEXT_COMPACTION", T(1))]))
    fx.append(fixture("K06", "compact",
        "Compact with no lease at all: write stays UNSEEN, DENY.",
        [K(), W(AUTH_TARGET, outcome="not_run")],
        [D(1, "DENY", [PR(AUTH, "block", "UNSEEN")])],
        []))
    fx.append(fixture("K07", "compact",
        "Double compact: lease stays EXPIRED CONTEXT_COMPACTION, write DENY.",
        [R(AUTH), K(), K(), W(AUTH_TARGET, outcome="not_run")],
        [D(3, "DENY", [PR(AUTH, "block", "EXPIRED")])],
        [LS("sess-s0-k07", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "CONTEXT_COMPACTION", T(0))]))
    fx.append(fixture("K08", "compact",
        "Compact in the subagent scope does not touch the parent lease: sub write DENY (UNSEEN), parent write ALLOW.",
        [R(AUTH), SA("sub-1"), K(), W(AUTH_TARGET, outcome="not_run"), AG("main"), W(AUTH_TARGET)],
        [D(3, "DENY", [PR(AUTH, "block", "UNSEEN")]),
         D(5, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-k08", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0))]))

    # --- cwd: 8 (old-cwd lease reused after a directory change) ---
    fx.append(fixture("W01", "cwd",
        "Read at /proj, cwd -> /proj/sub, write there: DENY, EXPIRED CWD_MISMATCH.",
        [R(AUTH), C("/proj", "/proj/sub"), W(AUTH_TARGET, cwd="/proj/sub", outcome="not_run")],
        [D(2, "DENY", [PR(AUTH, "block", "EXPIRED")])],
        [LS("sess-s0-w01", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "CWD_MISMATCH", T(0))]))
    fx.append(fixture("W02", "cwd",
        "Read docs at /proj, cwd -> /proj/sub, write there: WARN, EXPIRED CWD_MISMATCH.",
        [R(DOCS), C("/proj", "/proj/sub"), W(DOCS_TARGET, cwd="/proj/sub", outcome="not_run")],
        [D(2, "WARN", [PR(DOCS, "warn", "EXPIRED")])],
        [LS("sess-s0-w02", "main", DOCS, "EXPIRED", "implementation", "/proj", 3, 3, "CWD_MISMATCH", T(0))]))
    fx.append(fixture("W03", "cwd",
        "Read api at /proj, cwd -> /proj/sub, write there: ASK, EXPIRED CWD_MISMATCH.",
        [R(API), C("/proj", "/proj/sub"), W(API_TARGET, cwd="/proj/sub", outcome="not_run")],
        [D(2, "ASK", [PR(API, "ask", "EXPIRED")])],
        [LS("sess-s0-w03", "main", API, "EXPIRED", "implementation", "/proj", 2, 2, "CWD_MISMATCH", T(0))]))
    fx.append(fixture("W04", "cwd",
        "No CWD_CHANGED event at all: the synchronous PreToolUse check lazily expires (CWD_MISMATCH) and DENYs.",
        [R(AUTH), W(AUTH_TARGET, cwd="/proj/other", outcome="not_run")],
        [D(1, "DENY", [PR(AUTH, "block", "EXPIRED", "CWD_MISMATCH")])],
        [LS("sess-s0-w04", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "CWD_MISMATCH", T(0))]))
    fx.append(fixture("W05", "cwd",
        "Cwd change, then re-read under the new cwd, then write: ALLOW.",
        [R(AUTH, cwd="/proj"), C("/proj", "/proj/sub"), R(AUTH, cwd="/proj/sub"), W(AUTH_TARGET, cwd="/proj/sub")],
        [D(3, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-w05", "main", AUTH, "FRESH", "implementation", "/proj/sub", 4, 5, None, T(2))]))
    fx.append(fixture("W06", "cwd",
        "Cwd changed away and the write returns to the OLD cwd: still EXPIRED, DENY (no revival).",
        [R(AUTH), C("/proj", "/proj/sub"), W(AUTH_TARGET, cwd="/proj", outcome="not_run")],
        [D(2, "DENY", [PR(AUTH, "block", "EXPIRED")])],
        [LS("sess-s0-w06", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "CWD_MISMATCH", T(0))]))
    fx.append(fixture("W07", "cwd",
        "Cwd change to the SAME cwd: lease survives, write ALLOW.",
        [R(AUTH), C("/proj", "/proj"), W(AUTH_TARGET)],
        [D(2, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-w07", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0))]))
    fx.append(fixture("W08", "cwd",
        "Cwd change expires both leases: auth DENY, docs WARN.",
        [R(AUTH), R(DOCS), C("/proj", "/proj/sub"),
         W(AUTH_TARGET, cwd="/proj/sub", outcome="not_run"),
         W(DOCS_TARGET, cwd="/proj/sub", outcome="not_run")],
        [D(3, "DENY", [PR(AUTH, "block", "EXPIRED")]),
         D(4, "WARN", [PR(DOCS, "warn", "EXPIRED")])],
        [LS("sess-s0-w08", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "CWD_MISMATCH", T(0)),
         LS("sess-s0-w08", "main", DOCS, "EXPIRED", "implementation", "/proj", 3, 3, "CWD_MISMATCH", T(1))]))

    # --- unread: 8 (write with no successful read) ---
    fx.append(fixture("U01", "unread",
        "No read at all: auth write DENY, UNSEEN.",
        [W(AUTH_TARGET, outcome="not_run")],
        [D(0, "DENY", [PR(AUTH, "block", "UNSEEN")])],
        []))
    fx.append(fixture("U02", "unread",
        "No read at all: docs write WARN, UNSEEN.",
        [W(DOCS_TARGET, outcome="not_run")],
        [D(0, "WARN", [PR(DOCS, "warn", "UNSEEN")])],
        []))
    fx.append(fixture("U03", "unread",
        "No read at all: api write ASK, UNSEEN.",
        [W(API_TARGET, outcome="not_run")],
        [D(0, "ASK", [PR(API, "ask", "UNSEEN")])],
        []))
    fx.append(fixture("U04", "unread",
        "Only a FAILED read: auth write DENY, UNSEEN.",
        [RF(AUTH), W(AUTH_TARGET, outcome="not_run")],
        [D(1, "DENY", [PR(AUTH, "block", "UNSEEN")])],
        []))
    fx.append(fixture("U05", "unread",
        "Only docs was read: auth write DENY, UNSEEN; docs lease stays FRESH.",
        [R(DOCS), W(AUTH_TARGET, outcome="not_run")],
        [D(1, "DENY", [PR(AUTH, "block", "UNSEEN")])],
        [LS("sess-s0-u05", "main", DOCS, "FRESH", "implementation", "/proj", 3, 3, None, T(0))]))
    fx.append(fixture("U06", "unread",
        "Budget spent by 5 successful writes: 6th write DENY, EXPIRED EDIT_BUDGET_EXHAUSTED.",
        [R(AUTH), W(AUTH_TARGET), W(AUTH_TARGET), W(AUTH_TARGET), W(AUTH_TARGET),
         W(AUTH_TARGET), W(AUTH_TARGET, outcome="not_run")],
        [D(1, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(2, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(3, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(4, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(5, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(6, "DENY", [PR(AUTH, "block", "EXPIRED")])],
        [LS("sess-s0-u06", "main", AUTH, "EXPIRED", "implementation", "/proj", 0, 5, "EDIT_BUDGET_EXHAUSTED", T(0))]))
    fx.append(fixture("U07", "unread",
        "Only docs was read: api write ASK, UNSEEN; docs lease stays FRESH.",
        [R(DOCS), W(API_TARGET, outcome="not_run")],
        [D(1, "ASK", [PR(API, "ask", "UNSEEN")])],
        [LS("sess-s0-u07", "main", DOCS, "FRESH", "implementation", "/proj", 3, 3, None, T(0))]))
    fx.append(fixture("U08", "unread",
        "Rule budget 0: read issues an immediately-EXPIRED lease, write DENY.",
        [R(AUTH, budget=0), W(AUTH_TARGET, outcome="not_run")],
        [D(1, "DENY", [PR(AUTH, "block", "EXPIRED")])],
        [LS("sess-s0-u08", "main", AUTH, "EXPIRED", "implementation", "/proj", 0, 0, "EDIT_BUDGET_EXHAUSTED", T(0))]))

    # --- scope: 8 (4 subagent + 4 phase) ---
    fx.append(fixture("S01", "scope",
        "Parent read, subagent writes: DENY UNSEEN (no inheritance); parent write still ALLOW.",
        [R(AUTH), SA("sub-1"), W(AUTH_TARGET, outcome="not_run"), AG("main"), W(AUTH_TARGET)],
        [D(2, "DENY", [PR(AUTH, "block", "UNSEEN")]),
         D(4, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-s01", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0))]))
    fx.append(fixture("S02", "scope",
        "Parent read docs, subagent writes docs: WARN UNSEEN (no inheritance).",
        [R(DOCS), SA("sub-1"), W(DOCS_TARGET, outcome="not_run")],
        [D(2, "WARN", [PR(DOCS, "warn", "UNSEEN")])],
        [LS("sess-s0-s02", "main", DOCS, "FRESH", "implementation", "/proj", 3, 3, None, T(0))]))
    fx.append(fixture("S03", "scope",
        "Subagent reads in its own scope and writes ALLOW; parent without its own read DENYs.",
        [SA("sub-1"), R(AUTH), W(AUTH_TARGET), AG("main"), W(AUTH_TARGET, outcome="not_run")],
        [D(2, "ALLOW", [PR(AUTH, "block", "FRESH")]),
         D(4, "DENY", [PR(AUTH, "block", "UNSEEN")])],
        [LS("sess-s0-s03", "sub-1", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(1))]))
    fx.append(fixture("S04", "scope",
        "Nested subagent sub-2 inherits nothing from sub-1: DENY UNSEEN; sub-1 write ALLOW.",
        [R(AUTH), SA("sub-1"), R(AUTH), SA("sub-2"), W(AUTH_TARGET, outcome="not_run"),
         AG("sub-1"), W(AUTH_TARGET)],
        [D(4, "DENY", [PR(AUTH, "block", "UNSEEN")]),
         D(6, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-s04", "main", AUTH, "FRESH", "implementation", "/proj", 5, 5, None, T(0)),
         LS("sess-s0-s04", "sub-1", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(2))]))
    fx.append(fixture("S05", "scope",
        "Read in implementation, phase -> review, write: DENY, EXPIRED PHASE_MISMATCH.",
        [R(AUTH, phase="implementation"), P("review"), W(AUTH_TARGET, phase="review", outcome="not_run")],
        [D(2, "DENY", [PR(AUTH, "block", "EXPIRED")])],
        [LS("sess-s0-s05", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "PHASE_MISMATCH", T(0))]))
    fx.append(fixture("S06", "scope",
        "Phase change, then re-read under the new phase, then write: ALLOW.",
        [R(AUTH, phase="implementation"), P("review"), R(AUTH, phase="review"),
         W(AUTH_TARGET, phase="review")],
        [D(3, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-s06", "main", AUTH, "FRESH", "review", "/proj", 4, 5, None, T(2))]))
    fx.append(fixture("S07", "scope",
        "Phase change to explore (auth rule inactive there): write is ungated ALLOW, but the lease is EXPIRED PHASE_MISMATCH.",
        [R(AUTH, phase="implementation"), P("explore"), W(AUTH_TARGET, phase="explore")],
        [D(2, "ALLOW", [])],
        [LS("sess-s0-s07", "main", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "PHASE_MISMATCH", T(0))]))
    fx.append(fixture("S08", "scope",
        "Phase change in the subagent scope expires only the subagent lease; parent write ALLOW.",
        [R(AUTH), SA("sub-1"), R(AUTH), P("review"),
         W(AUTH_TARGET, phase="review", outcome="not_run"), AG("main"), W(AUTH_TARGET)],
        [D(4, "DENY", [PR(AUTH, "block", "EXPIRED")]),
         D(6, "ALLOW", [PR(AUTH, "block", "FRESH")])],
        [LS("sess-s0-s08", "main", AUTH, "FRESH", "implementation", "/proj", 4, 5, None, T(0)),
         LS("sess-s0-s08", "sub-1", AUTH, "EXPIRED", "implementation", "/proj", 5, 5, "PHASE_MISMATCH", T(2))]))

    return fx


def main():
    here = Path(__file__).resolve().parent
    root = here.parents[2]  # 02_source/
    fixtures = build_fixtures()
    assert len(fixtures) == 48, f"expected 48 fixtures, got {len(fixtures)}"
    ids = [f["id"] for f in fixtures]
    assert len(set(ids)) == 48, "fixture ids must be unique"
    groups = {}
    for f in fixtures:
        groups[f["group"]] = groups.get(f["group"], 0) + 1
    assert groups == {"control": 16, "compact": 8, "cwd": 8, "unread": 8, "scope": 8}, groups

    group_dir = {"control": "control", "compact": "compact", "cwd": "cwd",
                 "unread": "unread", "scope": "scope"}
    golden = {}
    for f in fixtures:
        steps = []
        for i, step in enumerate(f["steps"]):
            s = dict(step)
            s["t"] = T(i)
            steps.append(s)
        out = dict(f)
        out["steps"] = steps
        out["test_path_key"] = TEST_PATH_KEY
        path = here / group_dir[f["group"]] / (f["id"] + ".json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        golden[f["id"]] = copy.deepcopy(f["expected"])

    golden_path = root / "tests" / "golden" / "expected-v1.json"
    golden_path.parent.mkdir(parents=True, exist_ok=True)
    golden_doc = {
        "version": 1,
        "spec": "PROJECT_BOOK.md v1.0.0 §5",
        "note": (
            "Hand-written Golden Expected outputs, serialised from "
            "tests/fixtures/s0/author-fixtures.py. No production code "
            "was executed to produce them; a mismatch against the "
            "Oracle or production replay is a FAILURE, never silently "
            "overwritten."
        ),
        "fixtures": golden,
    }
    golden_path.write_text(json.dumps(golden_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote 48 fixtures + {golden_path}")


if __name__ == "__main__":
    main()
