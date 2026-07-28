---
name: set-harness
description: Configure oh-my-harness settings (features, thresholds, model routing, multi-agent)
level: 2
---

Configure oh-my-harness settings.

Usage: /set-harness [setting.path value]
Example: /set-harness testEnforcement.minCases 3
Example: /set-harness features.scopeGuard true
Example: /set-harness multiAgent.useWorktree false

## Steps

1. Read the current configuration from `.claude/.omh/harness.config.json`.
   If the file doesn't exist, suggest running `/harness-setup` first.

2. If no arguments provided, display all current values in a readable table format and exit.

3. If arguments are provided via `$ARGUMENTS`, parse them as `<path> <value>` and update the config.

4. Write the modified config back to `.claude/.omh/harness.config.json` and confirm the change.

## Available Settings

- **features.conventionSetup** (bool) — Auto-detect project conventions on session start
- **features.testEnforcement** (bool) — Remind about tests after code changes
- **features.contextOptimization** (bool) — Enable model routing for subagents
- **features.autoPlanMode** (bool) — Suggest plan mode for multi-task requests
- **features.ambiguityDetection** (bool) — Ask clarifying questions for vague requests
- **features.dangerousGuard** (bool) — Warn before destructive commands
- **features.contextSnapshot** (bool) — Save context before compaction
- **features.commitConvention** (bool) — Remind commit message format
- **features.scopeGuard** (bool) — Restrict file modifications to allowed paths
- **features.usageTracking** (bool) — Track tool usage per session
- **features.autoGitignore** (bool) — Auto-add .claude/.omh/ to .gitignore
- **features.skillScaffolding** (bool) — Scaffold project-specific skills on init
- **testEnforcement.minCases** (number) — Minimum test cases required per file
- **testEnforcement.promptOnMissing** (bool) — Alert when tests are missing
- **modelRouting.quick/standard/complex** (haiku/sonnet/opus) — Model for each tier
- **autoPlan.threshold** (number) — Task count to trigger auto-plan
- **ambiguityDetection.threshold** (number) — Ambiguity score to trigger clarification
- **commitConvention.style** (auto/conventional/gitmoji) — Commit message format
- **scopeGuard.allowedPaths** (string[]) — Directories allowed for modification
- **multiAgent.maxAgents** (number) — Maximum parallel agents
- **multiAgent.useWorktree** (bool) — Use isolated git worktrees per agent
- **multiAgent.tmuxSession** (string) — Tmux session name for agents
- **features.nativeTeam** (bool) — Enable native Claude Code team skills
- **nativeTeam.maxTeammates** (number) — Maximum teammates per team
- **nativeTeam.defaultTeamName** (string) — Default team name
