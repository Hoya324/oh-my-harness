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
    "autoGitignore": true,
    "nativeTeam": true,
    "autonomousLoop": true
  },
  "testEnforcement": { "minCases": 2, "promptOnMissing": true },
  "modelRouting": { "quick": "haiku", "standard": "sonnet", "complex": "opus" },
  "autoPlan": { "threshold": 3 },
  "ambiguityDetection": { "threshold": 2, "language": "auto" },
  "commitConvention": { "style": "auto" },
  "scopeGuard": { "allowedPaths": [] },
  "multiAgent": { "maxAgents": 4, "useWorktree": true, "tmuxSession": "omh-agents" },
  "nativeTeam": { "maxTeammates": 4, "defaultTeamName": "omh-team" },
  "loop": {
    "classify": "auto",
    "defaultTier": "quick",
    "requireSpec": true,
    "specPath": "SPEC.md",
    "logFile": "PROGRESS.md",
    "learningsFile": ".claude/.omh/loop-learnings.md",
    "requireCommit": true,
    "oneTaskPerIteration": true,
    "maxDiffFilesPerIteration": 20,
    "maxTotalIterations": 30,
    "stopOnNoProgress": true,
    "quickCheckCommand": "",
    "verifyCommand": "",
    "verifyInHook": true,
    "rungTimeoutSec": { "quickCheck": 30, "verify": 180 },
    "crossVerify": true,
    "crossVerifyModel": "architect",
    "maxDeepVerifiesPerTask": 3,
    "reflectionWindow": 3,
    "tiers": {
      "quick":    { "model": "standard",  "maxIterations": 3,  "maxWallClockMinutes": 5,  "plateauWindow": 2, "crossVerify": false, "marginalGainEpsilon": 0.05 },
      "standard": { "model": "standard",  "maxIterations": 8,  "maxWallClockMinutes": 15, "plateauWindow": 2, "crossVerify": true,  "crossVerifyEvery": 0, "marginalGainEpsilon": 0.03 },
      "deep":     { "model": "architect", "maxIterations": 20, "maxWallClockMinutes": 45, "plateauWindow": 3, "crossVerify": true,  "crossVerifyEvery": 5, "marginalGainEpsilon": 0.02 }
    }
  }
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
/set-harness nativeTeam.maxTeammates 6        # Allow up to 6 teammates
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
| `features.nativeTeam` | bool | `true` | Enable native team skills |
| `nativeTeam.maxTeammates` | number | `4` | Max teammates per team |
| `nativeTeam.defaultTeamName` | string | `omh-team` | Default team name |
| `features.autonomousLoop` | bool | `true` | Enable the spec-driven autonomous loop (`/omh-loop`) |

> `features.autonomousLoop` defaults ON but stays inert until `/omh-loop` writes an active loop state — there is zero overhead for non-loop sessions (the Stop hook returns immediately when no loop is active).

---

## Autonomous Loop (`loop` block)

The `loop` block configures the spec-driven autonomous loop that runs via `/omh-loop`. The loop forces continuation and forces termination — the harness owns *when to stop*, never the model's self-assessment. See **[Autonomous Loop](loop.md)** for the full design.

Settings are deep-merged into defaults, so you only need to override the fields you care about.

| Path | Type | Default | Description |
|------|------|---------|-------------|
| `loop.classify` | string | `auto` | Tier selection: `auto` (heuristic) / `quick` / `standard` / `deep` |
| `loop.defaultTier` | string | `quick` | Starting tier; escalates to `standard`/`deep` on observed signals |
| `loop.requireSpec` | bool | `true` | Require a `SPEC.md` before a loop may start |
| `loop.specPath` | string | `SPEC.md` | Path to the spec with EARS acceptance criteria |
| `loop.logFile` | string | `PROGRESS.md` | Human-readable plan + iteration log |
| `loop.learningsFile` | string | `.claude/.omh/loop-learnings.md` | Cache of build/test invocations across iterations |
| `loop.requireCommit` | bool | `true` | Commit each iteration (commit count = iteration, diff = progress) |
| `loop.oneTaskPerIteration` | bool | `true` | One unit of work per iteration |
| `loop.maxDiffFilesPerIteration` | number | `20` | Split an iteration whose diff exceeds this (smell guard) |
| `loop.maxTotalIterations` | number | `30` | Cross-tier iteration cap (hard wall) |
| `loop.stopOnNoProgress` | bool | `true` | Stop on plateau (no improvement + empty/cosmetic diff) |
| `loop.quickCheckCommand` | string | `""` | Fast rung (lint/typecheck); auto-detected from conventions when empty |
| `loop.verifyCommand` | string | `""` | Full rung (tests/build); auto-detected when empty |
| `loop.verifyInHook` | bool | `true` | Run the cheap verify rungs inside the Stop hook |
| `loop.rungTimeoutSec.quickCheck` | number | `30` | Per-rung subprocess timeout for `quickCheck` (seconds) |
| `loop.rungTimeoutSec.verify` | number | `180` | Per-rung subprocess timeout for `verify` (seconds) |
| `loop.crossVerify` | bool | `true` | Enable cross-verification by a different model |
| `loop.crossVerifyModel` | string | `architect` | Model routing slot for the judge (different from the generator) |
| `loop.maxDeepVerifiesPerTask` | number | `3` | Cap on expensive cross-verifies per task |
| `loop.reflectionWindow` | number | `3` | Number of recent Reflexion entries re-injected each iteration |

### Tier budgets (`loop.tiers`)

Each tier sets its own iteration and wall-clock budgets and verification depth. The loop starts on the cheapest tier and escalates only on signals (verify failure, large diff, replan, repeated failure signature).

| Field | `quick` | `standard` | `deep` |
|-------|---------|------------|--------|
| `model` | `standard` | `standard` | `architect` |
| `maxIterations` | `3` | `8` | `20` |
| `maxWallClockMinutes` | `5` | `15` | `45` |
| `plateauWindow` | `2` | `2` | `3` |
| `crossVerify` | `false` | `true` | `true` |
| `crossVerifyEvery` | — | `0` (at done) | `5` (+ at done) |
| `marginalGainEpsilon` | `0.05` | `0.03` | `0.02` |

> **Cost tuning.** The default iteration budgets (quick 3 / standard 8 / deep 20) are the recommended starting point. The design's research pass suggested more conservative numbers — **quick 3 / standard 5 / deep 8** — to cap cost on tighter budgets. Lower `tiers.*.maxIterations` (and/or `maxTotalIterations`) to adopt them.

```bash
/set-harness features.autonomousLoop false       # Disable the autonomous loop
/set-harness loop.defaultTier standard           # Start loops on the standard tier
/set-harness loop.tiers.standard.maxIterations 5 # Adopt the conservative 3/5/8 budgets
/set-harness loop.crossVerify false              # Skip cross-verification entirely
```

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
| `/team-spawn [template\|N] [task]` | Create native team with teammates |
| `/team-status` | Check team and task progress |
| `/team-stop` | Shutdown team and cleanup |
| `/omh-spec [goal]` | Author a machine-checkable `SPEC.md` (EARS acceptance criteria) |
| `/omh-loop [goal\|SPEC.md]` | Run the spec-driven autonomous loop |
| `/omh-loop stop` | Abort the running loop (kill switch) |

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
claude plugin uninstall oh-my-harness@oh-my-harness

# npm mode — full removal
oh-my-harness reset
npm uninstall -g oh-my-harness
```

## Requirements

- **Node.js** >= 18
- **Claude Code** CLI
- **tmux** — for multi-agent only (`brew install tmux`)
- **git** — for worktree isolation
