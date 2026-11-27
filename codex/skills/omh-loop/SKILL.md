---
name: omh-loop
description: Use when running, continuing, or stopping a spec-driven autonomous Oh My Harness loop in Codex.
---

# Run the OMH loop

Use the installed Codex Stop hook as the loop engine. Ground every iteration in the spec and shared
state; never declare completion from self-assessment.

## Stop request

For `/omh-loop stop`, inspect `.claude/.omh/loop-state.json`. Show the active goal and consequences,
then require explicit confirmation before creating `.claude/.omh/STOP` and atomically setting
`active: false`. Report `[omh:loop] Loop stopped.` Do not delete history.

## Start gate

Resolve config exactly like the hooks: try project `.claude/.omh/harness.config.json`, then the
global fallback `~/.claude/.omh/harness.config.json`; the project config wins. Use the first
parseable candidate and deep-merge it with bundled defaults. Preserve all user keys, including
unknown future keys. Read `features.autonomousLoop`, `modelRouting`, and the full `loop` block.
Stop if disabled.

Before planning a new loop, inspect both `.claude/.omh/STOP` and
`.claude/.omh/loop-state.json`. Treat any active, malformed, partial, or otherwise unresolved state
as protected:

- For continuation, preserve the existing state exactly and continue only when its session,
  spec, and stop intent are consistent. A STOP sentinel beside active state is unresolved; do not
  silently clear it.
- For replacement or restart, show the existing goal/state and require explicit confirmation.
  Preserve malformed raw state for recovery until the user authorizes exact cleanup.
- For cancel, change nothing.

Never overwrite protected state. After a confirmed new start or replacement, clear a stale
`.claude/.omh/STOP` before activating the new state. Stop-command behavior remains the separate
explicit flow above.

Resolve `loop.specPath` (default `SPEC.md`) and refuse to start when it is missing or contains
`[NEEDS CLARIFICATION]`. Invoke `/omh-spec` behavior first for a bare or vague goal. Resolve the
human log from `loop.logFile` (default `PROGRESS.md`) and the learning cache from
`loop.learningsFile` (default `.claude/.omh/loop-learnings.md`); use those resolved paths
throughout instead of hardcoded filenames.

Then read `references/start.md`: choose the tier from its rules, confirm as below, and only then
perform the activation write it describes.

Show spec, goal, tier, iteration and wall-clock budgets, `quickCheckCommand`, `verifyCommand`,
cross-verifier identity/coverage, and `requireCommit`. Obtain explicit confirmation before
initializing the loop. That confirmation must separately disclose any planned `spawn_agent`,
worktree cleanup, permission bypass, or out-of-scope write; otherwise ask again at that boundary.

## Each iteration

Read `references/iteration.md`, run exactly one unit, write `pending`, and end the turn so the Stop
hook evaluates state.

## Termination

Report `done` only when all criteria checks pass and required cross-verification returns `PASS`.
For iteration/total budget, timeout, plateau, oscillation, infrastructure error, or
`cross_verify_inconclusive`, report what remains and the stop cause without claiming completion.
Keep `.claude/.omh/STATE.md` and memory learnings compatible across Codex and Claude. Require human
confirmation before writes outside `scopeGuard.allowedPaths`, deletions, force pushes, merges, or
destructive rollback. Never auto-merge.
