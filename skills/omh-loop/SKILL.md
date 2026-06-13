---
name: omh-loop
description: Run an autonomous, spec-driven, tiered self/cross-verifying loop — the harness forces continuation until the goal is objectively met or a guardrail fires
level: 2
---

Run an autonomous loop that keeps working until a SPEC.md is objectively satisfied. The **Stop hook (`loop-guard.mjs`) is the loop engine**: it forces continuation (`decision:block`) while the goal is unmet and under budget, and allows the session to stop when the verify ladder + cross-verify confirm done, or when a guardrail fires (budget, timeout, no-progress, oscillation). Termination is owned by the harness, never by self-assessment.

Usage: /omh-loop ["<goal>" | <path-to-SPEC.md> | stop]
Example: /omh-loop SPEC.md
Example: /omh-loop make all tests in test/auth pass and lint clean
Example: /omh-loop stop   (abort the active loop)

## Steps

1. **Handle `stop`**: If `$ARGUMENTS` is `stop`, create the kill switch `.claude/.omh/STOP` and set `.claude/.omh/loop-state.json` `active:false` (atomic write). Confirm: `[omh:loop] Loop stopped.` Then exit.

2. **Read config**: Load `.claude/.omh/harness.config.json`. If `features.autonomousLoop` is false, tell the user and exit. Extract the `loop` block and `modelRouting`.

3. **Spec gate** (`loop.requireSpec`): Ensure `loop.specPath` (default `SPEC.md`) exists.
   - If `$ARGUMENTS` is a bare goal and no spec exists → run **/omh-spec** first (or offer to), so the loop has a machine-checkable anchor. Do not start the loop on a vague goal.
   - If the spec contains any `[NEEDS CLARIFICATION]` markers → refuse to start; use **AskUserQuestion** to resolve, update the spec, then continue.

4. **Classify the tier** (`loop.classify`, default `auto`): size effort to the task.
   - `quick` — single-file / mechanical (typo, rename): budget ~3 iters, no cross-verify.
   - `standard` — normal feature/bugfix: budget ~8 iters, cross-verify once at done.
   - `deep` — architectural / multi-file / ambiguous: budget ~20 iters, cross-verify every few iters + at done.
   Heuristic: deep keywords (architecture, refactor, migrate, security, "across modules") or ≥5 files / ≥6 criteria → deep; trivial keywords or ≤1 file → quick; else standard. An explicit tier in `$ARGUMENTS` (e.g. `--tier deep`) overrides. Default cheapest tier and **escalate on signals** (verify failure, large diff, repeated failure) — record each tier transition in PROGRESS.md.

5. **Confirm with user** via AskUserQuestion (autonomous loops are powerful — always confirm):
   ```
   About to start an autonomous loop:
     Spec     : {specPath}
     Goal     : {goal}
     Tier     : {tier}  →  budget {maxIterations} iters / {maxWallClockMinutes} min
     Verify   : quickCheck=`{quickCheckCommand}`  verify=`{verifyCommand}`
     Cross-verify: {crossVerify ? crossVerifyModel : "off for this tier"}
     Commit each iteration: {requireCommit}
   Proceed? [yes / cancel]
   ```
   Stop immediately on cancel.

6. **Initialize state** — write `.claude/.omh/loop-state.json` (atomic): `{ active:true, sessionId:null, tier, goal, specPath, iteration:0, totalIterations:0, deepVerifies:0, startedAt:<ms>, history:[] }`. (The hook binds `sessionId` to this session on its first fire, so concurrent sessions/worktrees aren't cross-blocked.) Create/seed `PROGRESS.md` with the plan derived from the spec.

7. **Run ONE iteration** (then end your turn — the Stop hook drives the next):
   1. Pull exactly **one** unit of work from the spec/PROGRESS.md. Never batch multiple tasks.
   2. **ripgrep before implementing** (don't assume something isn't there). **NO PLACEHOLDERS** — full implementations only.
   3. Run the **verify ladder, cheapest first**: `quickCheckCommand` (lint/typecheck) → `verifyCommand` (tests/build). On the first failure, stop the ladder and fix that.
   4. If the work passes the ladder, and the tier requires it, run **cross-verify** (step 8).
   5. Write the outcome to PROGRESS.md: append findings, **mark + prune** completed items, and on failure write a **Reflexion** note ("attempt N failed because X; root cause Y; next I will Z").
   6. Record the iteration outcome into `loop-state.json` under `pending` so the hook can evaluate: `{ verifyPassed:<bool>, ladder:[{rung,status,signature,output,retryable}], crossVerifyVerdict:<PASS|FAIL|INCONCLUSIVE|null>, reflection:<string|null> }`. Distinguish a real test **fail** (retryable) from an infra **error** like "no test runner" (`retryable:false` → the loop will stop and ask).
   7. **Commit** this iteration (one task = one commit) following the project's commit convention.
   8. End your turn. The Stop hook re-injects the next instruction or ends the loop.

8. **Cross-verify** (different model than the generator, `loop.crossVerifyModel`, default `architect`/opus). Announce `[omh:model-routing → opus]`. Dispatch an independent agent that:
   - scores **each** SPEC acceptance criterion PASS/FAIL **with evidence**, not a vibe score;
   - verifies **independently against repo state** — runs the tests, greps the diff — rather than trusting your "I did X" summary;
   - runs a **revert-and-rerun mutation check**: revert the change against the per-iteration commit and confirm the new tests FAIL on reverted code (guards against vacuous/placeholder tests);
   - returns a typed verdict `PASS | FAIL | INCONCLUSIVE`. **INCONCLUSIVE fails safe → stop and report.** Emit `[omh:cross-verify]` with the rubric table.
   Gate cost: if the deterministic ladder and a quick self-review already agree, you may skip cross-verify until done (Agreement-Based Cascading). Cap deep cross-verifies at `loop.maxDeepVerifiesPerTask`.

9. **On loop end** (the hook prints `[omh:loop] ... ended: <cause>`): read `loop-state.json` `stopCause` and report:
   - `done` → summarize what shipped; the verify ladder is green and (if required) cross-verify PASSed.
   - `budget_iterations` / `budget_total` / `timeout` → report progress + what remains; do NOT claim done.
   - `plateau` / `oscillation` → "this looks architectural, not iterative" — surface the recurring failure and ask the user how to proceed.
   - `infra_error` / `cross_verify_inconclusive` → report the blocker and ask.
   Remove the kill switch if present.

## Policies
- **Always confirm before starting** — never auto-start a loop.
- **Harness owns termination** — never declare "done" yourself; the verify ladder + cross-verify + the Stop hook decide. Never emit a false completion (it seeds the next turn's context and compounds).
- **One unit of work per iteration**; if a single iteration's diff exceeds `loop.maxDiffFilesPerIteration`, split it.
- **Keep the best commit**: if an iteration's verify score regresses, prefer resetting to the highest-scoring commit (per-iteration commits make this trivial).
- **Human gates** (formalize OMH's existing guards): halt for confirmation before anything outside `scopeGuard.allowedPaths`, deletions, force-push, or merging a cross-verify branch. Never auto-merge.
- **PROGRESS.md hygiene**: prune completed items; compact when it grows large (it's re-loaded every iteration). Cache build/test invocations in `loop.learningsFile`.
- **Kill switch**: `/omh-loop stop` or creating `.claude/.omh/STOP` halts the loop on the next Stop event.
