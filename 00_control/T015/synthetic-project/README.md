# Synthetic test project — T015_CLAUDE_CODE_LIVE_E2E

Copy this whole directory to a short path WITHOUT spaces on the
test machine, for example `C:\t015-test\`, preserving the layout:

```
C:\t015-test\
  GUIDANCE.md                  <- guidance source (rule t015-guard)
  protected\notes.txt          <- protected target (applies_to)
  unprotected\scratch.txt      <- control target (no rule applies)
  guidancepulse-config.yaml    <- copy to .guidancepulse\config.yaml AFTER init
```

## Rules for the copy

- Do NOT rename any file: the config references `GUIDANCE.md` and
  `protected/**` exactly (PROJECT_BOOK §5.1; adapter matches rule
  `source` by exact relative path).
- Do NOT add `CLAUDE.md`, `.claude\rules\`, `AGENTS.md`, or any other
  guidance file: the initial lease state must be UNSEEN, and only
  an explicit Read of `GUIDANCE.md` may issue the FRESH lease.
- Do NOT add any other source files: this project is synthetic test
  content only, no real business source, no sensitive prompts.
- Verify the copied files before starting (see T015_TASK.md §1):
  their SHA-256 must match the values recorded in the task file.

## What `init` + the config copy do

`guidancepulse init` creates `.guidancepulse\` with the DEFAULT
config (rule `auth-change-safety`, sources `CLAUDE.md` and
`.claude\rules\security.md`). That default does NOT protect this
project. After `init`, overwrite `.guidancepulse\config.yaml` with
`guidancepulse-config.yaml` from this directory, then run
`install`. The T015 config has exactly one rule (`t015-guard`).
