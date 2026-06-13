<!-- HARNESS:START -->
<!-- HARNESS:VERSION:0.2.0 -->
## oh-my-harness: Smart Defaults

### Hook Output Visibility
When you receive `[omh:*]` tags from hook output (via system-reminder or additionalContext), always relay them to the user.
Show the tag and message in your response so the user can see which OMH feature fired.

### Test Enforcement
After completing any code change, verify:
1. Tests exist for the changed code
2. Each test file has at least 2 test cases covering: happy path, edge case, error case
3. If tests are missing, suggest adding them before marking task complete
4. Run existing tests to confirm they pass

### Model Routing
When delegating to subagents, use the appropriate model and announce with `[omh:model-routing]`:
- **harness:quick** (haiku): file lookups, simple questions, listing/reading, exploration
- **harness:standard** (sonnet): implementation, bug fixes, standard features, debugging
- **harness:architect** (opus): architecture decisions, complex refactoring, system design, security review

When delegating, prefix with: `[omh:model-routing → <model>]` (e.g. `[omh:model-routing → sonnet]`)

### Auto-Plan Mode
When a user message contains 3+ distinct requests or tasks:
1. Call the `EnterPlanMode` tool to switch to plan mode (Shift+Tab equivalent)
2. In plan mode, propose an execution plan with ordering and dependencies
3. Wait for user approval before proceeding with implementation

### Ambiguity Guard
When a request is vague (no specific file/function target, scope-less verbs like "refactor" or "improve"):
- Use AskUserQuestion to clarify scope, target files, and expected behavior before starting work
- Do NOT guess the user's intent — ask first

### Dangerous Operation Guard
Before executing potentially destructive commands (rm -rf, git push --force, DROP TABLE, etc.):
- Always confirm with the user before proceeding
- Never auto-approve destructive operations
- Be cautious when writing to .env, credentials, or key files

### Commit Convention
When creating git commits, follow the project's commit message convention (auto-detected or configured).
Default: Conventional Commits format — `<type>(<scope>): <description>`

### Scope Guard
When `scopeGuard.allowedPaths` is configured, only modify files within the allowed directories.
If a modification is needed outside the scope, confirm with the user first.

### Multi-Agent (tmux + worktree)
When the user requests parallel work with `/agent-spawn`:
1. Always confirm with the user before spawning agents
2. Each agent runs in its own git worktree branch (`omh/agent-{N}`) when `useWorktree=true`
3. Use `/agent-status` to check progress, `/agent-apply` to merge, `/agent-stop` to cleanup
4. NEVER auto-merge agent work — always show diffs and get user confirmation
5. Warn about unmerged changes before stopping agents

### Native Team
When the user requests team-based work with `/team-spawn`:
1. Always confirm with the user before creating a team
2. Use TeamCreate, TaskCreate, and Agent tools for native team management
3. Teammates communicate via SendMessage — messages arrive automatically
4. Use `/team-status` to check progress, `/team-stop` to shutdown
5. NEVER shut down teammates without checking for incomplete tasks
6. Announce model routing for each teammate: `[omh:model-routing -> {model}]`

### Autonomous Loop (Spec-driven)
When the user requests an autonomous loop with `/omh-loop` (or wants work done "until it's right"):
1. Require a machine-checkable `SPEC.md` first — use `/omh-spec` if it is missing or vague. Never start a loop on a vague goal or one with `[NEEDS CLARIFICATION]` markers.
2. Classify the tier (`quick`/`standard`/`deep`) and confirm the budget with the user before starting — never auto-start.
3. The Stop hook (`loop-guard`) owns termination: it forces continuation until the verify ladder + cross-verify confirm done, or a guardrail fires (budget, timeout, no-progress, oscillation). Never self-declare "done" — the harness decides via objective checks.
4. One unit of work per iteration; ripgrep before implementing; NO PLACEHOLDERS; on failure write a Reflexion note to `PROGRESS.md`; commit each iteration (one task = one commit).
5. Cross-verify with a different model than the generator (`[omh:model-routing → opus]`): score each acceptance criterion with evidence, verify independently against repo state, run a revert-and-rerun mutation check. `INCONCLUSIVE` fails safe to stop-and-report.
6. Honor human gates: halt for confirmation before anything outside `scopeGuard.allowedPaths`, deletions, force-push, or merging. `/omh-loop stop` (or creating `.claude/.omh/STOP`) halts the loop.

### Post-Plan Team Suggestion
After a plan is approved (ExitPlanMode), evaluate whether the plan contains parallelizable tasks:
- If the plan has 2+ independent tasks that can be worked on simultaneously → suggest using `/team-spawn` with an appropriate template
- Recommend a template based on task types:
  - Frontend + Backend + Tests → `fullstack`
  - Code changes + Review/Testing → `review`
  - Research/exploration + Implementation → `research`
  - Other combinations → suggest custom count (e.g., `/team-spawn 3 [task]`)
- Present the suggestion concisely: "이 계획은 병렬 작업이 가능합니다. `/team-spawn {template} {task}`로 팀을 구성할까요?"
- If the plan is sequential or simple (single stream of work) → proceed normally without suggesting a team
- NEVER auto-create a team — always suggest and wait for user confirmation
<!-- HARNESS:END -->
