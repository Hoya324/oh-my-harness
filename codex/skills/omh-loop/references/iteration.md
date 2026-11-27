# One loop iteration

Read by `omh-loop` before each iteration. One iteration = one unit of work.

1. Read the spec, compact the resolved `loop.logFile`, recent reflections, the resolved
   `loop.learningsFile`, and available `omh-memory` facts.
2. Select exactly one incomplete unit. Search the repository before implementing; do not use
   placeholders.
3. Run the cheapest verify ladder: `quickCheckCommand`, then `contractCommand` when set, then `verifyCommand`. Stop at the first
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
