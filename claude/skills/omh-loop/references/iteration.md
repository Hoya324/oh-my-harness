# One loop iteration

Read by `/omh-loop` step 7. One iteration = one unit of work = one commit.

1. Pull exactly **one** unit of work from the spec / PROGRESS.md. Never batch multiple tasks. If a single iteration's diff exceeds `loop.maxDiffFilesPerIteration`, split it.
2. **ripgrep before implementing** (don't assume something isn't there). **NO PLACEHOLDERS** — full implementations only.
3. Run the **verify ladder, cheapest first**: `quickCheckCommand` (lint/typecheck) → `contractCommand` if set (API spec diff, migration validate, architecture rules) → `verifyCommand` (tests/build). On the first failure, stop the ladder and fix that.
4. If the work passes the ladder and the tier requires it, run cross-verify (`cross-verify.md`).
5. Write the outcome to PROGRESS.md: append findings, **mark + prune** completed items, and on failure write a **Reflexion** note ("attempt N failed because X; root cause Y; next I will Z"). Also persist it to long-term memory (`memory.md`).
6. Record the outcome into `loop-state.json` under `pending` so the hook can evaluate:
   `{ verifyPassed:<bool>, ladder:[{rung,status,signature,output,retryable}], crossVerifyVerdict:<PASS|FAIL|INCONCLUSIVE|null>, reflection:<string|null> }`.
   Distinguish a real test **fail** (retryable) from an infra **error** such as "no test runner" (`retryable:false` → the loop stops and asks).
7. **Commit** this iteration (one task = one commit) following the project's commit convention.
8. End your turn. The Stop hook re-injects the next instruction or ends the loop.

## Hygiene

- **Keep the best commit**: if an iteration's verify score regresses, prefer resetting to the highest-scoring commit (per-iteration commits make this trivial).
- **PROGRESS.md**: prune completed items; compact it when it grows (it is re-loaded every iteration). Cache build/test invocations in `loop.learningsFile` and promote durable ones to long-term memory.
- Never emit a false completion: it seeds the next turn's context and compounds.
