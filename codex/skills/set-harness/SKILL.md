---
name: set-harness
description: Use when viewing or changing Oh My Harness feature, threshold, routing, loop, verifier, or multi-agent settings.
---

# Set harness

Read `.claude/.omh/harness.config.json`. If missing, recommend `/harness-setup` and stop. With no
arguments, display current values without writing.

Parse an update as exactly `<dotted.path> <value>`. Reject unknown paths, invalid types, non-finite
numbers, invalid enum values, and prototype-polluting path segments. Parse booleans, numbers,
strings, arrays, and objects as JSON-compatible values. Show old value, new value, and target file;
ask for explicit confirmation before writing. Use an atomic replacement and preserve unrelated
keys.

Validate these constraints:

- `multiAgent.runtime`: `claude` or `codex`.
- `multiAgent.maxAgents`, `nativeTeam.maxTeammates`, `verify.rounds`, loop iteration budgets, and
  timeouts: positive integers within reasonable project limits.
- `multiAgent.tmuxSession` and `nativeTeam.defaultTeamName`: `^[a-zA-Z0-9_-]+$`.
- `commitConvention.style`: `auto`, `conventional`, or `gitmoji`.
- `loop.classify` and `loop.defaultTier`: `auto|quick|standard|deep` where applicable.
- model, verifier, and template entries: do not claim runtime/model availability until probed.

Support every key from `templates/harness.config.json.tmpl`, including all `features`,
`testEnforcement`, `modelRouting`, `autoPlan`, `ambiguityDetection`, `commitConvention`,
`scopeGuard`, `multiAgent`, `nativeTeam`, `loop`, `tier3`, `verifyGate`, `planGate`, `verify`, and
`conventions`. Do not rename keys; hooks consume their exact names.

Treat disabling guards, enabling `verify.autoFix`, selecting the Claude permission-bypass runtime,
or broadening `scopeGuard.allowedPaths` as safety-sensitive. Explain the effect and require
explicit confirmation. Never spawn agents as a side effect of configuration.
