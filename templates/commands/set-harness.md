Configure oh-my-harness settings.

Read the current configuration from `.claude/.omh/harness.config.json` and display all current values to the user in a readable table format.

If arguments are provided (e.g., `$ARGUMENTS`), parse them as `<path> <value>` and update the config:
- `testEnforcement.minCases 3` → set minimum test cases to 3
- `modelRouting.standard opus` → change standard model to opus
- `features.autoPlanMode false` → disable auto-plan mode
- `ambiguityDetection.threshold 3` → adjust ambiguity sensitivity
- `autoPlan.threshold 5` → require 5+ tasks before auto-plan triggers

After updating, write the modified config back to `.claude/.omh/harness.config.json` and confirm the change.

Available settings:
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
- **testEnforcement.minCases** (number) — Minimum test cases required per file
- **testEnforcement.promptOnMissing** (bool) — Alert when tests are missing
- **modelRouting.quick/standard/complex** (haiku/sonnet/opus) — Model for each tier
- **autoPlan.threshold** (number) — Task count to trigger auto-plan
- **ambiguityDetection.threshold** (number) — Ambiguity score to trigger clarification
- **commitConvention.style** (auto/conventional/gitmoji) — Commit message format
- **scopeGuard.allowedPaths** (string[]) — Directories allowed for modification
