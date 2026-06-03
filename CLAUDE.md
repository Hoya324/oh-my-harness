<!-- HARNESS:START -->
<!-- HARNESS:VERSION:0.2.1 -->
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

### Weight Routing (Tier 1/2/3)
The pre-prompt hook classifies each request by weight and emits `[omh:tier]`. Relay the tag.
- **Tier 1 (light)** — trivial change (typo, quick fix): proceed with minimal overhead.
- **Tier 2 (standard)** — feature/bugfix: follow conventions + tests + self-review.
- **Tier 3 (heavy)** — high-stakes (production, payment/auth, migration, 5+ tasks, or configured `tier3.domainKeywords`): you MUST pass the convention checklist AND run `/omh-verify` BEFORE declaring the task complete. Relay the `[omh:tier-3]` reminder; do not skip verification.

### N-Round Independent Verify (/omh-verify)
On Tier 3 (or when asked), run `/omh-verify` before completion:
1. Reviews the current `git diff` over N independent rounds (config `verify.rounds`).
2. Each round rotates the verifier model (Claude → GPT/codex → Gemini) for independence; missing CLIs are auto-skipped (graceful degrade).
3. External verifiers are read-only — apply fixes yourself (or automatically when `verify.autoFix`).
4. Issues flagged by 2+ models are high-confidence. Report agreements/disagreements; never inject a prior round's conclusions into the next verifier.

### Living State (STATE.md)
For Tier 2/3 work, maintain `.claude/.omh/STATE.md` (goal, current phase, key decisions, progress). It is re-injected at session start as `[omh:state]` and referenced on compaction, so context survives session boundaries. Update it at major milestones.
<!-- HARNESS:END -->
