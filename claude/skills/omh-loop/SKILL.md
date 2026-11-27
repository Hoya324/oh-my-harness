---
name: omh-loop
description: Run an autonomous, spec-driven, tiered self/cross-verifying loop — the harness forces continuation until the goal is objectively met or a guardrail fires
level: 2
---

Run an autonomous loop that keeps working until a SPEC.md is objectively satisfied. The **Stop hook (`loop-guard.mjs`) is the loop engine**: it forces continuation while the goal is unmet and under budget, and ends the loop when the verify ladder + cross-verify confirm done, or a guardrail fires (budget, timeout, no-progress, oscillation). Termination is owned by the harness, never by self-assessment.

Usage: /omh-loop ["<goal>" | <path-to-SPEC.md> | stop]
Example: /omh-loop SPEC.md
Example: /omh-loop stop   (abort the active loop)

## Start (once per loop)

1. **Handle `stop`**: if `$ARGUMENTS` is `stop`, create `.claude/.omh/STOP`, set `.claude/.omh/loop-state.json` `active:false` (atomic write), confirm `[omh:loop] Loop stopped.` and exit.
2. **Read config**: `.claude/.omh/harness.config.json`. If `features.autonomousLoop` is false, say so and exit. Use the `loop` block and `modelRouting`.
3. **Spec gate**: `loop.specPath` (default `SPEC.md`) must exist. A bare goal with no spec → run **/omh-spec** first. Any `[NEEDS CLARIFICATION]` marker → refuse, resolve with AskUserQuestion, then continue.
4. **Classify the tier** (`loop.classify`, default `auto`): `quick` (mechanical, ~3 iters, no cross-verify), `standard` (feature/bugfix, ~8 iters, cross-verify at done), `deep` (architecture, security, migration, 5+ files or 6+ criteria, ~20 iters, periodic + final cross-verify). `--tier <name>` overrides. Start cheap and escalate on evidence; log each transition in PROGRESS.md.
5. **Confirm with the user** (AskUserQuestion) showing spec, goal, tier and budget, `quickCheckCommand` / `verifyCommand`, cross-verify model, and `requireCommit`. Stop on cancel.
6. **Initialize state** atomically: `{ active:true, sessionId:null, tier, goal, specPath, iteration:0, totalIterations:0, deepVerifies:0, startedAt:<ms>, history:[] }` in `loop-state.json` (the hook binds `sessionId` on first fire). Seed PROGRESS.md from the spec.

## Each iteration

7. Run exactly **one** unit of work, then end your turn. Read `references/iteration.md` the first time in a session; it defines the ladder, the `pending` record the hook reads, and the commit rule.
8. When the tier requires it, cross-verify with a different model as described in `references/cross-verify.md`.
9. Use long-term memory as described in `references/memory.md` (skip silently if the MCP server is unavailable).

## On loop end

The hook prints `[omh:loop] ... ended: <cause>`. Read `stopCause` from `loop-state.json` and report:
- `done` → what shipped; ladder green and, if required, cross-verify PASS.
- `budget_iterations` / `budget_total` / `timeout` → progress and what remains; do NOT claim done.
- `plateau` / `oscillation` → likely architectural; surface the recurring failure and ask.
- `infra_error` / `cross_verify_inconclusive` → report the blocker and ask.
Remove the kill switch if present.

## Policies
- Always confirm before starting; never auto-start.
- Harness owns termination: never declare "done" yourself.
- Human gates: confirm before writes outside `scopeGuard.allowedPaths`, deletions, force-push, or merges. Never auto-merge.
- Kill switch: `/omh-loop stop` or `.claude/.omh/STOP` halts on the next Stop event.
