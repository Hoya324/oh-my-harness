---
name: omh-spec
description: Use when authoring or refining a machine-checkable SPEC.md for an autonomous Oh My Harness loop.
---

# Author an OMH spec

Create or refine the path at `loop.specPath` from `.claude/.omh/harness.config.json` (default
`SPEC.md`). A disabled `features.autonomousLoop` does not prevent authoring, but report that the
loop cannot start until enabled.

## Gather evidence and intent

Read an existing spec when the argument names one. Ask necessary questions directly in chat when
the goal, scope, constraints, compatibility boundary, or success measure is ambiguous. Do not
guess. Resolve all blocking questions before presenting a runnable spec.

Read `.claude/.omh/conventions.json` or detect the stack to propose `quickCheckCommand` and
`verifyCommand`. Query connected `omh-memory` project facts first for previously verified commands;
fall back to the local helper only when it exists. Skip memory gracefully when unavailable. A
criterion counts as machine-checkable only when a named command or specific test exits zero on
success.

## Required document shape

Write exactly these semantic sections:

```markdown
# SPEC: <title>

## Goal
<end state and why it matters>

## Acceptance criteria (EARS)
- WHEN <trigger> THE SYSTEM SHALL <response>. — verify: `<command or test>`
- WHILE <precondition> THE SYSTEM SHALL <response>. — verify: `<command or test>`

## Out of scope
- <explicit exclusion>

## Constraints
- <compatibility, performance, style, and allowed paths>

## Verify
- quickCheck: `<lint or typecheck command>`
- verify: `<test or build command>`

## Open questions
- [NEEDS CLARIFICATION] <unresolved item>
```

Use EARS-style observable statements. Keep one feature per spec. Map every acceptance criterion to
a check and align allowed files with `scopeGuard.allowedPaths`.

## Gate

Self-review the proposed spec before writing:

- Reject subjective criteria such as “looks good.”
- Never fabricate scope or acceptance criteria.
- Split independent subsystems into separate specs.
- If any `[NEEDS CLARIFICATION]` remains, show the draft and stop; the loop must not start.

Show the final target and summary, then ask for explicit confirmation before creating or
overwriting the spec. After writing, recommend `/omh-loop <path>`.
