---
name: omh-verify
description: Use when independently reviewing a Git diff in configured OMH verification rounds before completion.
---

# Verify with independent lenses

Read `.claude/.omh/harness.config.json` and use `verify.rounds`, `verify.stopWhenClean`,
`verify.autoFix`, and `verify.lenses`. Treat a positive positional integer as a proposed round
override: show the configured and requested values and ask before using the override.

## Plan

Inspect the working-tree diff with the bundled verifier plan command or an equivalent read-only
`git diff`. If no diff exists, report no verification target and stop. Read durable context from
`.claude/.omh/STATE.md` and query connected `omh-memory` for past high-confidence findings; degrade
gracefully when either is absent or malformed.

Probe each configured lens executable without changing state. Exclude unavailable lenses and
report reduced coverage. A configured profile or executable does not prove model independence.
Before calling a lens independent, establish that it uses a different model or external runtime
from the generating agent. The same model or same runtime without demonstrable separation is a
self-review, not independent evidence. Never use the generating agent as the independent judge.

## Rounds

For each round from 1 through the selected count:

1. Select `verify.lenses[(round - 1) % availableLenses.length]`.
2. Give the verifier the unchanged task/spec and current diff, not prior findings.
3. Run external GPT as `codex exec -s read-only`; use the bundled review adapter when available.
   Keep every external verifier read-only. Use a fresh `spawn_agent` only when a different model is
   explicitly available and the user has given explicit confirmation before spawn.
4. Ask for concrete numbered findings with file and line evidence, or exactly `NO ISSUES FOUND`.
5. Stop early only when the round is clean and `verify.stopWhenClean` is true.
6. Record the model/runtime, focus, findings, errors, and whether independence was established.

If no independent lens remains, continue deterministic checks and optional self-review only,
report reduced coverage, and return `INCONCLUSIVE` whenever policy requires independent review.
Never relabel repeated same-model passes as multi-model consensus.

## Fix and state gates

External reviewers must never edit. If findings exist and `verify.autoFix` is false, propose fixes
without applying them. If `verify.autoFix` is true, show and apply ordinary in-scope, reversible fixes
from the main Codex session, then re-run affected checks. Still obtain explicit confirmation before
deletions, out-of-scope edits, destructive state changes, permission bypass, or any verifier spawn.

Report each round plus agreements and disagreements. Mark a finding high-confidence only when two
demonstrably independent models/runtimes reached it without seeing each other's conclusions.
Before persisting high-confidence findings to `omh-memory` or `.claude/.omh/STATE.md`, show the
state change and obtain explicit confirmation. Skip persistence when memory is unavailable.
