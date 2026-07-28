# Configuration

Settings live in `.claude/.omh/harness.config.json`.

## Runtime Support

The local CLI accepts exactly `--runtime claude|codex|both`; omitting it keeps the backward-compatible `claude` default. `--scope project|user` applies to runtime registration:

```bash
oh-my-harness init --runtime claude --scope project
oh-my-harness init --runtime codex --scope project
oh-my-harness init --runtime both --scope project
oh-my-harness update --runtime codex
oh-my-harness status --runtime both
oh-my-harness reset --runtime codex
```

Codex project installs use `.codex/hooks.json`, `.codex/agents/`, `.agents/skills/`, and a marked block in `AGENTS.md`. Claude and Codex still share `.claude/.omh/harness.config.json` and all project state. A Codex update refreshes managed hooks, roles, built-in skills, marked guidance, and the project-local memory runtime/registration. Claude plugin updates continue through `claude plugin update` plus `/harness-setup`; their managed payload differs. User config, custom skills, unrelated hooks, and unmarked guidance are preserved. A single-runtime reset preserves shared state while the other runtime remains registered. Reset can remove unused `.claude/.omh/` project state, but it never deletes the separate long-term memory store at `~/.omh/memory/graph.jsonl`.

Codex role defaults are overrideable configuration, not workflow invariants:

| Role | Default model | Reasoning | Intended work |
|---|---|---|---|
| quick | `gpt-5.6-luna` | low | Read-only lookup and narrow exploration |
| standard | `gpt-5.6-terra` | medium | Focused implementation, testing, and review |
| architect | `gpt-5.6-sol` | xhigh | Architecture, complex planning, security, independent verification |

After installation, review trust in `/hooks`. Codex status is available through `omh-status`; the Claude HUD is not installed in Codex.

The read-only `omh-status` skill selects project config/state first, then the **user-global fallback**, without mixing roots. CLI `status`, `update`, and `reset` honor the explicit `--scope project` or `--scope user`; Claude project and user lifecycles are isolated. A malformed managed config, settings file, or guidance marker fails validation **before mutation**, including combined-runtime operations.

## Config Resolution (project → global)

Hooks resolve config in this order, using the first that exists:

1. `<project>/.claude/.omh/harness.config.json` — project-local (wins)
2. `~/.claude/.omh/harness.config.json` — user-global fallback

This lets you set a global default once (User scope) that applies to every project, while still overriding per-project. If neither file exists, hooks stay silent (no-op).

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
    "autonomousLoop": true,
    "weightRouting": true
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
  },
  "tier3": { "taskThreshold": 5, "fileThreshold": 5, "domainKeywords": [] },
  "verify": {
    "rounds": 3,
    "stopWhenClean": true,
    "autoFix": false,
    "lenses": [
      { "model": "claude", "focus": "logic" },
      { "model": "gpt",    "focus": "edge-cases" },
      { "model": "gemini", "focus": "security" }
    ]
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
/set-harness features.weightRouting false   # Disable prompt-weight classification
/set-harness verify.rounds 5                 # Run 5 independent verify rounds
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
| `features.weightRouting` | bool | `true` | Classify task weight (Tier 1/2/3) and route guardrails proportionally |
| `tier3.taskThreshold` | number | `5` | Task count that forces Tier 3 |
| `tier3.fileThreshold` | number | `5` | Changed-file count that forces Tier 3 |
| `tier3.domainKeywords` | string[] | `[]` | Project terms that force Tier 3 (e.g. `["payment","결제"]`) |
| `verify.rounds` | number | `3` | `/omh-verify` independent verify rounds |
| `verify.stopWhenClean` | bool | `true` | Stop early when a round finds nothing |
| `verify.autoFix` | bool | `false` | Auto-apply fixes (vs. confirm first) |
| `verify.lenses` | object[] | claude/gpt/gemini | Verifier models + focus, rotated per round; missing CLIs auto-excluded |
| `features.verifyGate` | bool | `true` | Enable the risk-gated verify gate (Stop hook) in plain sessions |
| `verifyGate.riskThreshold` | number | `2` | Min risk level (0–3) at which the ladder runs |
| `verifyGate.maxBlocks` | number | `2` | Hard cap of blocks per change before allowing the stop (never-wedge) |
| `verifyGate.runLadder` | bool | `true` | Run the deterministic ladder (vs. soft reminders only) |
| `verifyGate.recommendCrossVerify` | bool | `true` | Recommend `/omh-verify` for sensitive/large changes |
| `verifyGate.largeFiles` / `largeLines` | number | `8` / `400` | Diff-size thresholds for the risk score |
| `verifyGate.sensitivePaths` | string[] | auth/payment/migration/.env/… | Globs that escalate a change to the top risk level |
| `features.planGate` | bool | `true` | Force a plan-mode plan before edits on Tier-3 prompts |
| `planGate.minTier` | number | `3` | Prompt tier ≥ this arms the gate |
| `planGate.maxDenials` | number | `3` | Hard cap of edit-denials per prompt (never-wedge) |
| `planGate.gatedTools` | string[] | Edit/Write/NotebookEdit/MultiEdit | Tools blocked until a plan exists |

> `features.autonomousLoop` defaults ON but stays inert until `/omh-loop` writes an active loop state — there is zero overhead for non-loop sessions (the Stop hook returns immediately when no loop is active).

> `features.verifyGate` defaults ON: in a plain session (no active `/omh-loop`), the Stop hook scores each turn's diff (sensitive paths, size, source-without-test) floored by the prompt tier, and runs the verify ladder when the risk warrants it — blocking on real red. It defers to an active loop and can never wedge a session (`maxBlocks` cap + fail-open). Disable with `/set-harness features.verifyGate false`.

> `features.planGate` defaults ON. Claude blocks Edit/Write/NotebookEdit/MultiEdit until `ExitPlanMode`. Codex maps `apply_patch` to an edit and clears only for a non-empty `update_plan` whose entries each have a nonblank `step` and an allowed `status`; other payloads do not clear it. Read-only tools pass, and `maxDenials` is the non-wedging escape hatch. Disable with `/set-harness features.planGate false`.

> `features.weightRouting` defaults ON: every prompt is auto-classified into Tier 1/2/3 by weight, and Tier 3 (heavy/risky work) forces verification. The `tier3.*` thresholds control when a task is forced to Tier 3, and the `verify.*` block configures the `/omh-verify` independent multi-model verify+fix rounds.

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

## Weight Routing (`tier3` block)

The weight-aware harness classifies every prompt by weight into **Tier 1** (light), **Tier 2** (medium), and **Tier 3** (heavy/risky). Tier 3 forces verification before completion. The `tier3.*` thresholds decide when a task is escalated. See **[Weight Routing](verify.md)** for the full design.

Settings are deep-merged into defaults, so you only need to override the fields you care about.

| Path | Type | Default | Description |
|------|------|---------|-------------|
| `tier3.taskThreshold` | number | `5` | Task count that forces Tier 3 |
| `tier3.fileThreshold` | number | `5` | Changed-file count that forces Tier 3 |
| `tier3.domainKeywords` | string[] | `[]` | Project terms that force Tier 3 (e.g. `["payment","결제"]`) |

## Independent Verification (`verify` block)

The `verify.*` block configures `/omh-verify`: N independent multi-model verify+fix rounds using Claude, GPT-codex, and Gemini lenses. External verifiers are read-only.

| Path | Type | Default | Description |
|------|------|---------|-------------|
| `verify.rounds` | number | `3` | `/omh-verify` independent verify rounds |
| `verify.stopWhenClean` | bool | `true` | Stop early when a round finds nothing |
| `verify.autoFix` | bool | `false` | Auto-apply fixes (vs. confirm first) |
| `verify.lenses` | object[] | claude/gpt/gemini | Verifier models + focus, rotated per round; missing CLIs auto-excluded |

```bash
/set-harness features.weightRouting false        # Disable prompt-weight classification
/set-harness tier3.taskThreshold 3               # Force Tier 3 at 3+ tasks
/set-harness tier3.domainKeywords '["payment","결제"]' # Force Tier 3 on domain-sensitive work
/set-harness verify.rounds 5                      # Run 5 independent verify rounds
/set-harness verify.autoFix true                 # Auto-apply fixes instead of confirming
```

---

## CLI Commands

```bash
oh-my-harness init [--runtime claude|codex|both] [--scope project|user]
oh-my-harness update [--runtime claude|codex|both]
oh-my-harness status [--runtime claude|codex|both]
oh-my-harness reset [--runtime claude|codex|both]
```

The runtime default is `claude`. `update` refreshes managed runtime files and `reset` removes only the selected managed registration, preserving user-owned content and state still used by another registration.

## Slash Commands (Skills)

| Command | Description |
|---------|-------------|
| `/harness-setup` | Initialize oh-my-harness (plugin mode) |
| `/set-harness [path] [value]` | View or modify harness settings |
| `/init-project` | Detect conventions and set up test infrastructure |
| `/agent-spawn [N] [task]` | Spawn N selected-runtime Claude Code or Codex workers in tmux |
| `/agent-status` | Check status of running agents |
| `/agent-apply [id\|all]` | Merge agent worktree changes |
| `/agent-stop [id\|all]` | Stop agents and cleanup |
| `/team-spawn [template\|N] [task]` | Create native team with teammates |
| `/team-status` | Check team and task progress |
| `/team-stop` | Shutdown team and cleanup |
| `/omh-spec [goal]` | Author a machine-checkable `SPEC.md` (EARS acceptance criteria) |
| `/omh-loop [goal\|SPEC.md]` | Run the spec-driven autonomous loop |
| `/omh-loop stop` | Abort the running loop (kill switch) |
| `/omh-verify [N]` | Run N rounds of independent multi-model verify+fix (Claude/GPT-codex/Gemini lenses) |
| `omh-status` | Codex-only read-only summary of tier, loop, verification, usage, and memory |

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

# Local CLI — Claude only (also the bare reset default)
oh-my-harness reset --runtime claude

# Local CLI — Codex only
oh-my-harness reset --runtime codex

# Local CLI — remove both runtime registrations
oh-my-harness reset --runtime both

# Then remove the globally linked/installed CLI if desired
npm uninstall -g oh-my-harness
```

The bare `oh-my-harness reset` defaults to Claude only; it is not a dual-runtime uninstall. Project skills are user-owned and preserved. The separate memory graph at `~/.omh/memory/graph.jsonl` is also preserved.

## Requirements

- **Node.js** >= 18
- **Claude Code** CLI and/or **Codex** CLI/desktop
- **tmux** — for multi-agent only (`brew install tmux`)
- **git** — for worktree isolation
