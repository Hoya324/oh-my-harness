# Oh My Harness

Lightweight Claude Code harness. Zero config, instant boost.

Oh My Harness (OMH) is a minimal customization layer for Claude Code. No heavy plugins — just native hooks, commands, and CLAUDE.md instructions that make every session smarter from the start.

## Quick Start

```bash
# Install globally
npm install -g oh-my-harness

# Initialize in your project
cd your-project
oh-my-harness init

# That's it. Start Claude Code as usual.
```

---

## Features Overview

| # | Feature | Hook / Trigger | Default | Description |
|---|---------|---------------|---------|-------------|
| 1 | Convention Auto-Detect | SessionStart | ON | Scans package.json, pyproject.toml, go.mod, etc. and injects project conventions |
| 2 | Test Enforcement | Stop | ON | Reminds to verify tests with multiple cases after every code change |
| 3 | Model Routing | CLAUDE.md + agents | ON | Routes subagents to haiku/sonnet/opus by task complexity |
| 4 | Auto-Plan Mode | UserPromptSubmit | ON | Detects 3+ tasks and suggests plan mode |
| 5 | Ambiguity Guard | UserPromptSubmit | ON | Forces clarification for vague requests |
| 6 | Dangerous Guard | PreToolUse | ON | Warns before rm -rf, git push --force, DROP TABLE, .env writes |
| 7 | Context Snapshot | PreCompact | ON | Saves task state before context compaction |
| 8 | Commit Convention | PostToolUse | ON | Reminds commit format (Conventional Commits / Gitmoji) |
| 9 | Scope Guard | PostToolUse | OFF | Warns when modifying files outside allowed paths |
| 10 | Usage Tracking | PostToolUse | ON | Records tool usage per session to usage.json |
| 11 | Auto .gitignore | CLI init | ON | Adds .claude/.omh/ to .gitignore |
| 12 | Multi-Agent | /agent-spawn | — | Spawns parallel Claude agents in tmux panes with git worktrees |

---

## How It Works

OMH generates native Claude Code files — no runtime daemon, no plugin system:

```
.claude/
├── settings.local.json      ← hooks registered here
├── CLAUDE.md                ← behavioral rules appended
├── commands/
│   ├── set-harness.md       ← /set-harness
│   ├── init-project.md      ← /init-project
│   ├── agent-spawn.md       ← /agent-spawn
│   ├── agent-status.md      ← /agent-status
│   ├── agent-apply.md       ← /agent-apply
│   └── agent-stop.md        ← /agent-stop
└── .omh/
    ├── harness.config.json   ← your settings
    ├── conventions.json      ← cached project detection
    ├── usage.json            ← tool usage tracking
    ├── agents.json           ← active agent state (when running)
    ├── context-snapshot.md   ← saved before compaction
    └── hooks/
        ├── lib/output.mjs    ← shared hook output helpers
        ├── session-start.mjs
        ├── pre-prompt.mjs
        ├── dangerous-guard.mjs
        ├── commit-convention.mjs
        ├── scope-guard.mjs
        ├── usage-tracker.mjs
        ├── pre-compact.mjs
        └── post-task.mjs
```

### Hook Pipeline

```
SessionStart ──→ session-start.mjs ──→ Detect conventions, inject context
                                        (Node/Python/Go/Rust/Java)

UserPromptSubmit ──→ pre-prompt.mjs ──→ Multi-task? → Suggest plan mode
                                        Ambiguous?  → Force clarification

PreToolUse ──→ dangerous-guard.mjs ──→ rm -rf? git push --force? .env?
                                        → Warn before proceeding

PostToolUse ──→ commit-convention.mjs ──→ git commit? → Show convention
            ──→ scope-guard.mjs       ──→ Outside allowed paths? → Warn
            ──→ usage-tracker.mjs     ──→ Record tool usage (silent)

PreCompact ──→ pre-compact.mjs ──→ Save context snapshot to file

Stop ──→ post-task.mjs ──→ Code changed? → Remind about tests
```

### Hook Output Format

All hooks output standardized JSON (compatible with Claude Code hook protocol):

```json
{ "continue": true, "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "message" } }
```

Hooks never block Claude Code execution. On error: `{ "continue": true, "suppressOutput": true }`.

---

## Feature Details

### 1. Convention Auto-Detect

Scans project root on every session start and injects detected conventions as context.

| Project File | Detected |
|-------------|----------|
| `package.json` | jest/vitest/mocha, eslint/biome, prettier, typescript/vite/webpack |
| `pyproject.toml` | pytest, ruff/flake8, black, mypy |
| `go.mod` | go test, golangci-lint |
| `Cargo.toml` | cargo test, clippy, rustfmt |
| `build.gradle` | junit, gradle |
| `pom.xml` | junit, maven |

Results cached in `.claude/.omh/conventions.json` (refreshed hourly).

### 2. Test Enforcement

After code changes (Edit/Write tools), injects a reminder:
- Verify test files exist for changed code
- Each test file has at least N cases (configurable, default: 2)
- Suggest adding tests if missing

**Policy:** Tests must cover happy path, edge case, and error case at minimum.

### 3. Model Routing

Three agent tiers registered in `settings.local.json`:

| Agent | Model | Use For |
|-------|-------|---------|
| `harness:quick` | haiku | File lookups, simple questions, exploration |
| `harness:standard` | sonnet | Implementation, bug fixes, debugging |
| `harness:architect` | opus | Architecture, complex analysis, security review |

**Policy:** CLAUDE.md instructs Claude to delegate to the appropriate tier automatically based on task complexity.

### 4. Auto-Plan Mode

Detects 3+ independent tasks in a single message:
- Numbered items (1. 2. 3.)
- Bullet points (-, *)
- Korean conjunctions (그리고, 또한, 추가로)

**Policy:** Suggests plan mode — does not force it. User can proceed without planning.

### 5. Ambiguity Guard

Detects vague requests and forces AskUserQuestion before work begins.

**Detection criteria** (score-based, threshold: 2):
- Vague references: "이거", "그거", "저거" (+1)
- Scope-less verbs: "리팩토링해줘", "개선해줘" without file/function target (+1)
- Open-ended choices: "~하거나", "~든지" (+1)
- Short message (<15 chars) without specific identifiers (+1)
- English patterns: "fix it", "clean up" without target (+1)

**Policy:** When score >= threshold, Claude MUST ask for clarification before starting.

### 6. Dangerous Guard

Warns before potentially destructive operations.

**Detected patterns (Bash tool):**
| Pattern | Label |
|---------|-------|
| `rm -rf`, `rm --force` | File deletion |
| `git push --force` | Force push |
| `git reset --hard` | Hard reset |
| `git clean -f` | Git clean |
| `DROP TABLE/DATABASE` | Database destruction |
| `TRUNCATE TABLE` | Table truncation |
| `DELETE FROM` (no WHERE) | Mass deletion |
| `chmod 777` | Unsafe permissions |
| `curl \| sh` | Remote execution |
| `npm publish` | Package publish |

**Detected patterns (Write/Edit tool):**
| Pattern | Label |
|---------|-------|
| `.env` files | Environment secrets |
| `credentials` | Credential files |
| `secret` | Secret files |
| `id_rsa`, `.pem`, `.key` | Private keys |

**Policy:** Warning only — does not block. Asks Claude to confirm with user.

### 7. Context Snapshot

Before context compaction (PreCompact), saves current state to `.claude/.omh/context-snapshot.md` including:
- Session summary
- Active tasks
- Reminder to restore context

**Policy:** Claude should summarize key decisions and progress before compaction occurs.

### 8. Commit Convention

When `git commit` is detected, reminds the commit message format.

**Auto-detection order:**
1. commitlint config files → Conventional Commits
2. `package.json` with gitmoji dependency → Gitmoji
3. `package.json` with commitizen → Conventional Commits
4. Default → Conventional Commits

**Conventional Commits format:**
```
<type>(<scope>): <description>
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
```

### 9. Scope Guard

When enabled with `allowedPaths`, warns if Edit/Write targets files outside the allowed directories.

**Example config:**
```json
{
  "features": { "scopeGuard": true },
  "scopeGuard": { "allowedPaths": ["src/auth", "src/utils"] }
}
```

**Policy:** Warning only. Claude asks user to confirm out-of-scope modifications.

### 10. Usage Tracking

Silently records every tool invocation to `.claude/.omh/usage.json`:

```json
{
  "sessions": {
    "session-id": {
      "tool_counts": { "Edit": 5, "Bash": 3, "Read": 12 },
      "total_calls": 20,
      "started_at": "2026-03-23T10:00:00Z",
      "updated_at": "2026-03-23T10:30:00Z",
      "last_tool": "Edit"
    }
  }
}
```

### 11. Auto .gitignore

On `oh-my-harness init`, automatically adds `.claude/.omh/` to `.gitignore`. This prevents cache files (conventions.json, usage.json, agents.json) from being committed.

---

## Multi-Agent System

Spawn parallel Claude Code instances in tmux panes, each with an isolated git worktree.

### Commands

| Command | Description |
|---------|-------------|
| `/agent-spawn [N] [task]` | Spawn N agents (default: 2) with worktrees in tmux panes |
| `/agent-status` | Check status of all running agents (commits, changed files) |
| `/agent-apply [id\|all]` | Preview and merge agent worktree changes to main branch |
| `/agent-stop [id\|all]` | Stop agents, warn about unmerged work, cleanup worktrees |

### Workflow

```
/agent-spawn 3 "fix TypeScript errors"
    │
    ├── Reads multiAgent config (useWorktree, maxAgents, tmuxSession)
    ├── Asks user: "Spawn 3 agents with worktrees? Proceed? [yes/cancel]"
    ├── Creates git worktrees (if useWorktree=true): .claude/.omh/worktrees/agent-{1,2,3}
    ├── Creates tmux session: omh-agents (3 panes)
    ├── Launches claude --dangerously-skip-permissions in each pane
    └── Saves state to .claude/.omh/agents.json

/agent-status
    │
    └── Shows: branch, status (running/done), commits, files changed

/agent-apply all               ← worktree mode only
    │
    ├── Shows diff preview for each agent
    ├── Asks user: Apply all / Apply selected / Cancel
    └── Merges selected branches with --no-ff

/agent-stop all
    │
    ├── If useWorktree=true AND unmerged commits exist:
    │     Asks: Apply first / Discard / Cancel
    ├── Kills tmux panes
    ├── Removes worktrees + branches (if useWorktree=true)
    └── Cleans agents.json
```

### Worktree Mode vs Shared Mode

| | `useWorktree=true` (default) | `useWorktree=false` |
|---|---|---|
| Isolation | Each agent on its own branch | All agents in project root |
| Conflicts | Impossible during parallel work | Possible — use with care |
| `/agent-apply` | Required to merge changes | Not applicable |
| `/agent-stop` | Warns about unmerged commits | Just kills panes |
| Best for | Any parallel code changes | Read-only tasks, analysis |

### Architecture (worktree mode)

```
main branch ─────────────────────────────────────────────────→
     │
     ├── omh/agent-1 (worktree) ──→ commits ──→ /agent-apply ──→ merge
     ├── omh/agent-2 (worktree) ──→ commits ──→ /agent-apply ──→ merge
     └── omh/agent-3 (worktree) ──→ commits ──→ /agent-apply ──→ merge
```

### Policies

- **User confirmation required** before spawning — always shows what will happen before doing anything
- **`useWorktree=true` (default)**: each agent gets an isolated git branch+worktree; changes reach main only via `/agent-apply`
- **`useWorktree=false`**: agents share the main working directory — safe only for read-only or clearly non-conflicting tasks
- **`--dangerously-skip-permissions`**: spawned agents bypass tool confirmation prompts; the user is always told this upfront
- **Never auto-merge** — `/agent-apply` always shows a diff and waits for approval
- **Never silently discard** — `/agent-stop` on an agent with unmerged commits requires explicit user choice (apply / discard / cancel)
- **tmux session name**: `omh-agents` (configurable via `multiAgent.tmuxSession`)

### Prerequisites

- `tmux` must be installed
- Project must be a git repository
- `claude` CLI must be available in PATH

---

## Configuration

All settings in `.claude/.omh/harness.config.json`:

```json
{
  "version": 1,
  "features": {
    "conventionSetup": true,
    "testEnforcement": true,
    "contextOptimization": true,
    "autoPlanMode": true,
    "ambiguityDetection": true,
    "dangerousGuard": true,
    "contextSnapshot": true,
    "commitConvention": true,
    "scopeGuard": false,
    "usageTracking": true,
    "autoGitignore": true
  },
  "testEnforcement": {
    "minCases": 2,
    "promptOnMissing": true
  },
  "modelRouting": {
    "quick": "haiku",
    "standard": "sonnet",
    "complex": "opus"
  },
  "autoPlan": { "threshold": 3 },
  "ambiguityDetection": { "threshold": 2, "language": "auto" },
  "commitConvention": { "style": "auto" },
  "scopeGuard": { "allowedPaths": [] },
  "multiAgent": {
    "maxAgents": 4,
    "useWorktree": true,
    "tmuxSession": "omh-agents"
  }
}
```

> **Note:** `scopeGuard` is `false` by default. Enable it and set `allowedPaths` to restrict modifications (e.g., `["src/auth", "src/utils"]`).

### Modify Settings Mid-Session

```
/set-harness                                # Show current config
/set-harness testEnforcement.minCases 3     # Require 3+ test cases
/set-harness modelRouting.standard opus     # Use opus for implementation
/set-harness features.autoPlanMode false    # Disable auto-plan
/set-harness features.scopeGuard true       # Enable scope guard
/set-harness scopeGuard.allowedPaths ["src/auth"]
/set-harness multiAgent.maxAgents 6         # Allow up to 6 parallel agents
/set-harness commitConvention.style gitmoji # Switch to gitmoji
```

### All Settings Reference

| Path | Type | Default | Description |
|------|------|---------|-------------|
| `features.conventionSetup` | bool | true | Auto-detect project conventions |
| `features.testEnforcement` | bool | true | Remind about tests after changes |
| `features.contextOptimization` | bool | true | Enable model routing |
| `features.autoPlanMode` | bool | true | Suggest plan mode for multi-task |
| `features.ambiguityDetection` | bool | true | Force clarification for vague requests |
| `features.dangerousGuard` | bool | true | Warn before destructive commands |
| `features.contextSnapshot` | bool | true | Save state before compaction |
| `features.commitConvention` | bool | true | Remind commit format |
| `features.scopeGuard` | bool | false | Restrict file modification scope |
| `features.usageTracking` | bool | true | Track tool usage |
| `features.autoGitignore` | bool | true | Auto-update .gitignore |
| `testEnforcement.minCases` | number | 2 | Minimum test cases per file |
| `testEnforcement.promptOnMissing` | bool | true | Alert when tests missing |
| `modelRouting.quick` | string | haiku | Model for exploration |
| `modelRouting.standard` | string | sonnet | Model for implementation |
| `modelRouting.complex` | string | opus | Model for architecture |
| `autoPlan.threshold` | number | 3 | Tasks to trigger auto-plan |
| `ambiguityDetection.threshold` | number | 2 | Score to trigger clarification |
| `commitConvention.style` | string | auto | auto / conventional / gitmoji |
| `scopeGuard.allowedPaths` | string[] | [] | Allowed directories (empty = no limit) |
| `multiAgent.maxAgents` | number | 4 | Max parallel agents |
| `multiAgent.useWorktree` | bool | true | Use git worktrees for isolation |
| `multiAgent.tmuxSession` | string | omh-agents | tmux session name |

---

## CLI Commands

```bash
oh-my-harness init      # Set up harness in current project
oh-my-harness update    # Regenerate settings from config
oh-my-harness status    # Show current configuration
oh-my-harness reset     # Remove all harness files (clean uninstall)
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/set-harness [path] [value]` | View or modify harness settings |
| `/init-project` | Run convention detection and set up test infrastructure |
| `/agent-spawn [N] [task]` | Spawn N parallel Claude agents in tmux |
| `/agent-status` | Check status of running agents |
| `/agent-apply [id\|all]` | Merge agent worktree changes |
| `/agent-stop [id\|all]` | Stop agents and cleanup worktrees |

---

## OMC Compatibility

OMH coexists cleanly with [Oh My ClaudeCode](https://github.com/Yeachan-Heo/oh-my-claudecode):

- CLAUDE.md uses `<!-- HARNESS:START/END -->` markers (OMC uses `<!-- OMC:START/END -->`)
- Hooks are in `.claude/.omh/` (OMC hooks come from plugin cache)
- Agents use `harness:` prefix (OMC uses `oh-my-claudecode:`)
- Set `DISABLE_HARNESS=1` to temporarily bypass (like OMC's `DISABLE_OMC`)

## Disable / Uninstall

```bash
# Temporarily disable (env var)
DISABLE_HARNESS=1 claude

# Fully remove
oh-my-harness reset
npm uninstall -g oh-my-harness
```

## Requirements

- Node.js >= 18
- Claude Code CLI
- tmux (for multi-agent only)
- git (for worktree isolation)

## License

MIT
