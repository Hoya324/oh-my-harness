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

### Weight Routing
Relay `[omh:tier]`. Tier 3 (production, payment/auth, migration, 5+ tasks, `tier3.domainKeywords`): pass the convention checklist and run `/omh-verify` before declaring done. Leading `!t1` / `!t3` / `!noplan` are user overrides, not task text.

### Plan Gate
On a Tier-3 prompt, EnterPlanMode and present a plan (context, approach, files, verification) before editing; edits are denied until then.

### Living State
`.claude/.omh/STATE.md` is re-injected at session start. Keep its Goal and Decisions current; hooks maintain the rest.

### Native Team
On `/team-spawn`: confirm first; never shut down teammates with incomplete tasks. After an approved plan with 2+ independent tasks, suggest `/team-spawn` (never auto-create).

### Multi-Agent
On `/agent-spawn`: confirm → worktree `omh/agent-{N}` → never auto-merge → show diffs → warn on unmerged before stop.

### Autonomous Loop
Spec-driven loop. `/omh-spec` writes a machine-checkable SPEC.md; `/omh-loop` runs it. The Stop hook (`loop-guard`) IS the loop engine — it forces continuation until the verify ladder + cross-verify confirm done, or a guardrail fires (budget/timeout/no-progress/oscillation). Confirm before starting; one task per iteration; ripgrep before implementing; NO PLACEHOLDERS; commit each iteration; never self-declare "done" (the harness decides). `/omh-loop stop` halts.
<!-- HARNESS:END -->
