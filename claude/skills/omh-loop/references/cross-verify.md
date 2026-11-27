# Cross-verify

Read by `/omh-loop` step 8. Use a different model than the generator (`loop.crossVerifyModel`, default `architect`/opus). Announce `[omh:model-routing → opus]` and dispatch an independent agent that:

- scores **each** SPEC acceptance criterion PASS/FAIL **with evidence**, not a vibe score;
- verifies **independently against repo state** — runs the tests, greps the diff — rather than trusting the generator's "I did X" summary;
- runs a **revert-and-rerun mutation check**: revert the change against the per-iteration commit and confirm the new tests FAIL on reverted code (guards against vacuous or placeholder tests);
- returns a typed verdict `PASS | FAIL | INCONCLUSIVE`. **INCONCLUSIVE fails safe → stop and report.** Emit `[omh:cross-verify]` with the rubric table.

Gate cost: if the deterministic ladder and a quick self-review already agree, you may skip cross-verify until done (agreement-based cascading). Cap deep cross-verifies at `loop.maxDeepVerifiesPerTask`.
