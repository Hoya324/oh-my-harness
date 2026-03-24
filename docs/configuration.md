# Configuration

All settings live in `.claude/.omh/harness.config.json`.

## Default Config

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
  "testEnforcement": { "minCases": 2, "promptOnMissing": true },
  "modelRouting": { "quick": "haiku", "standard": "sonnet", "complex": "opus" },
  "autoPlan": { "threshold": 3 },
  "ambiguityDetection": { "threshold": 2, "language": "auto" },
  "commitConvention": { "style": "auto" },
  "scopeGuard": { "allowedPaths": [] },
  "multiAgent": { "maxAgents": 4, "useWorktree": true, "tmuxSession": "omh-agents" }
}
```

## Modify Settings

```bash
/set-harness                                # Show all current settings
/set-harness features.scopeGuard true       # Enable scope guard
/set-harness testEnforcement.minCases 3     # Require 3+ test cases
/set-harness modelRouting.standard opus     # Use opus for implementation
/set-harness commitConvention.style gitmoji # Switch to gitmoji
/set-harness multiAgent.maxAgents 6         # Allow up to 6 agents
```

## Settings Reference

| Path | Type | Default | Description |
|------|------|---------|-------------|
| `features.conventionSetup` | bool | `true` | Auto-detect project conventions |
| `features.testEnforcement` | bool | `true` | Remind about tests after changes |
| `features.contextOptimization` | bool | `true` | Enable model routing |
| `features.autoPlanMode` | bool | `true` | Suggest plan mode for multi-task |
| `features.ambiguityDetection` | bool | `true` | Force clarification for vague requests |
| `features.dangerousGuard` | bool | `true` | Warn before destructive commands |
| `features.contextSnapshot` | bool | `true` | Save state before compaction |
| `features.commitConvention` | bool | `true` | Remind commit format |
| `features.scopeGuard` | bool | `false` | Restrict file modification scope |
| `features.usageTracking` | bool | `true` | Track tool usage |
| `features.autoGitignore` | bool | `true` | Auto-update .gitignore |
| `testEnforcement.minCases` | number | `2` | Minimum test cases per file |
| `testEnforcement.promptOnMissing` | bool | `true` | Alert when tests missing |
| `modelRouting.quick` | string | `haiku` | Model for exploration |
| `modelRouting.standard` | string | `sonnet` | Model for implementation |
| `modelRouting.complex` | string | `opus` | Model for architecture |
| `autoPlan.threshold` | number | `3` | Tasks to trigger auto-plan |
| `ambiguityDetection.threshold` | number | `2` | Score to trigger clarification |
| `commitConvention.style` | string | `auto` | `auto` / `conventional` / `gitmoji` |
| `scopeGuard.allowedPaths` | string[] | `[]` | Allowed directories (empty = no limit) |
| `multiAgent.maxAgents` | number | `4` | Max parallel agents |
| `multiAgent.useWorktree` | bool | `true` | Use git worktrees for isolation |
| `multiAgent.tmuxSession` | string | `omh-agents` | tmux session name |

---

## CLI Commands

```bash
oh-my-harness init      # Set up harness in current project
oh-my-harness update    # Regenerate settings from config
oh-my-harness status    # Show current configuration
oh-my-harness reset     # Remove all harness files (clean uninstall)
```

## Slash Commands (Skills)

| Command | Description |
|---------|-------------|
| `/harness-setup` | Initialize oh-my-harness (plugin mode) |
| `/set-harness [path] [value]` | View or modify harness settings |
| `/init-project` | Detect conventions and set up test infrastructure |
| `/agent-spawn [N] [task]` | Spawn N parallel Claude agents in tmux |
| `/agent-status` | Check status of running agents |
| `/agent-apply [id\|all]` | Merge agent worktree changes |
| `/agent-stop [id\|all]` | Stop agents and cleanup |

---

## OMC Compatibility

Oh My Harness coexists cleanly with [Oh My ClaudeCode](https://github.com/yeachan-heo/oh-my-claudecode):

| Concern | OMH | OMC |
|---------|-----|-----|
| CLAUDE.md markers | `<!-- HARNESS:START/END -->` | `<!-- OMC:START/END -->` |
| Hook namespace | `.omh/hooks/` | OMC plugin hooks |
| Skill prefix | (none) | `oh-my-claudecode:` |
| Agent prefix | `harness:` | `oh-my-claudecode:` |
| Kill switch | `DISABLE_HARNESS=1` | `DISABLE_OMC=1` |

Both plugins can be installed simultaneously without conflicts.

---

## Disable / Uninstall

```bash
# Temporarily disable (env var)
DISABLE_HARNESS=1 claude

# Plugin mode — uninstall
claude plugins uninstall oh-my-harness

# npm mode — full removal
oh-my-harness reset
npm uninstall -g oh-my-harness
```

## Requirements

- **Node.js** >= 18
- **Claude Code** CLI
- **tmux** — for multi-agent only (`brew install tmux`)
- **git** — for worktree isolation
