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

Read `.claude/.omh/harness.config.json`, including `features.autonomousLoop`, `modelRouting`, and the
full `loop` block. Stop if disabled. Resolve `loop.specPath` (default `SPEC.md`) and refuse to start
when it is missing or contains `[NEEDS CLARIFICATION]`. Invoke `/omh-spec` behavior first for a bare
or vague goal. Resolve the human log from `loop.logFile` (default `PROGRESS.md`) and the learning
cache from `loop.learningsFile` (default `.claude/.omh/loop-learnings.md`); use those resolved paths
throughout instead of hardcoded filenames.

Choose the initial tier with this precedence:

1. A valid `--tier quick|standard|deep` argument overrides configuration.
2. A fixed `loop.classify` value of `quick`, `standard`, or `deep` selects that tier.
3. `loop.classify: auto` runs the evidence-based classifier below, starting from
   `loop.defaultTier` when evidence is inconclusive.

Use the selected configured tier object:

- `quick`: mechanical or one-file work; default `maxIterations: 3`,
  `maxWallClockMinutes: 5`, no cross-verifier.
- `standard`: normal features or bug fixes; defaults 8 iterations and 15 minutes, with a final
  cross-verifier.
- `deep`: architectural, security, migration, multi-module, at least five files, or at least six
  criteria; defaults 20 iterations and 45 minutes, with periodic and final cross-verification.

Start at `loop.defaultTier` when classification is inconclusive. Escalate only on evidence such as
verify failure, large diff, replan, or repeated failure. Record every transition in the resolved
`loop.logFile`.
Honor `loop.maxTotalIterations`, `maxDiffFilesPerIteration`, `maxDeepVerifiesPerTask`,
`reflectionWindow`, tier `plateauWindow`, and every configured `maxIterations` and
`maxWallClockMinutes`.

Show spec, goal, tier, iteration and wall-clock budgets, `quickCheckCommand`, `verifyCommand`,
cross-verifier identity/coverage, and `requireCommit`. Obtain explicit confirmation before
initializing the loop. That confirmation must separately disclose any planned `spawn_agent`,
worktree cleanup, permission bypass, or out-of-scope write; otherwise ask again at that boundary.

Atomically write `.claude/.omh/loop-state.json` with:

```json
{
  "active": true,
  "sessionId": null,
  "tier": "quick",
  "goal": "...",
  "specPath": "SPEC.md",
  "iteration": 0,
  "totalIterations": 0,
  "deepVerifies": 0,
  "startedAt": 0,
  "history": []
}
```

Seed the resolved `loop.logFile` from the spec and retain the resolved `loop.learningsFile`.

## One iteration

1. Read the spec, compact the resolved `loop.logFile`, recent reflections, the resolved
   `loop.learningsFile`, and available `omh-memory` facts.
2. Select exactly one incomplete unit. Search the repository before implementing; do not use
   placeholders.
3. Run the cheapest verify ladder: `quickCheckCommand`, then `verifyCommand`. Stop at the first
   failure. Distinguish retryable test failure from non-retryable infrastructure error.
4. When configured, run a truly independent cross-verifier. Use `spawn_agent` only after the
   confirmation disclosed above, or use another configured read-only external runtime. Never use
   the generating agent as the independent judge.
5. Require the judge to score every SPEC criterion with repository evidence and return
   `PASS`, `FAIL`, or `INCONCLUSIVE`. Perform any revert-and-rerun mutation check only in an
   isolated disposable worktree and only after explicit confirmation for its creation and cleanup.
6. If the same model or runtime cannot establish independence, do not call it independent. Report
   reduced coverage; when cross-verification is mandatory, record `INCONCLUSIVE` and stop safely.
7. Append the result and a failure Reflexion to the resolved `loop.logFile`; prune completed items.
   Update the resolved `loop.learningsFile`. Persist useful facts to connected `omh-memory`,
   otherwise skip memory without blocking.
8. Atomically write `pending` in loop state with `verifyPassed`, ladder rungs and signatures,
   `crossVerifyVerdict`, and `reflection`.
9. If `loop.requireCommit` is true, show the intended commit and obtain any required repository
   authorization before committing this one unit. End the turn so the Stop hook evaluates state.

## Termination

Report `done` only when all criteria checks pass and required cross-verification returns `PASS`.
For iteration/total budget, timeout, plateau, oscillation, infrastructure error, or
`cross_verify_inconclusive`, report what remains and the stop cause without claiming completion.
Keep `.claude/.omh/STATE.md` and memory learnings compatible across Codex and Claude. Require human
confirmation before writes outside `scopeGuard.allowedPaths`, deletions, force pushes, merges, or
destructive rollback. Never auto-merge.
