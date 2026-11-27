<!-- HARNESS:START -->
## oh-my-harness

Relay all `[omh:*]` hook tags to the user.

### Model Routing
Delegate by complexity with `[omh:model-routing → <model>]`:
- **harness:quick** (haiku): lookups, reads, exploration
- **harness:standard** (sonnet): implementation, bug fixes, debugging
- **harness:architect** (opus): architecture, complex refactoring, security

### Test Enforcement
After code changes: verify tests exist (min 2 cases: happy, edge, error), suggest adding if missing, run to confirm pass.

### Auto-Plan Mode
On 3+ distinct tasks: list → propose plan → confirm before proceeding.

### Ambiguity Guard
On vague requests (no target, broad verbs like "refactor"/"improve"): AskUserQuestion to clarify before starting.

### Dangerous Operation Guard
Before destructive ops (rm -rf, force push, DROP TABLE): confirm with user. Never auto-approve. Caution on .env/credentials.

### Commit Convention
Follow project convention (auto-detected). Default: `<type>(<scope>): <description>`

### Multi-Agent
On `/agent-spawn`: confirm → worktree `omh/agent-{N}` → never auto-merge → show diffs → warn on unmerged before stop.

### Autonomous Loop
Spec-driven loop. `/omh-spec` writes a machine-checkable SPEC.md; `/omh-loop` runs it. The Stop hook (`loop-guard`) IS the loop engine — it forces continuation until the verify ladder + cross-verify confirm done, or a guardrail fires (budget/timeout/no-progress/oscillation). Confirm before starting; one task per iteration; ripgrep before implementing; NO PLACEHOLDERS; commit each iteration; never self-declare "done" (the harness decides). `/omh-loop stop` halts.
<!-- HARNESS:END -->
