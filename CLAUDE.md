<!-- HARNESS:START -->
<!-- HARNESS:VERSION:0.1.0 -->
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
1. List all detected tasks
2. Propose an execution plan with ordering and dependencies
3. Ask for confirmation before proceeding

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
<!-- HARNESS:END -->
