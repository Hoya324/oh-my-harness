---
name: harness-setup
description: Use when initializing or upgrading Oh My Harness configuration for a Codex project.
---

# Harness setup

Initialize only project configuration and optional project guidance. Never spawn an agent during
setup. Read `../../references/runtime-map.md` before adapting runtime actions.

## First-run gate

Check `.claude/.omh/harness.config.json`.

- If it exists, summarize it and ask whether to merge current defaults, reset after confirmation,
  or cancel. Preserve user values during a merge. Treat reset as destructive and require explicit
  confirmation before overwriting.
- If it is absent, welcome the user and ask directly in chat for installation scope, convention
  detection, feature profile, commit convention, weight routing, verifier selection, and
  `multiAgent.runtime` (`codex` recommended here, or `claude`). Wait for the answers before writing.
- Detect `codex` and `gemini` executables read-only. Offer only detected external verifiers.
  Availability does not prove model independence.

## Create configuration

Create `.claude/.omh/` and derive the config from the bundled
`../../../templates/harness.config.json.tmpl`, resolved relative to this installed skill.
Preserve every template key and exact spelling. In
particular, preserve:

- all `features` toggles, including `skillScaffolding`, `nativeTeam`, `autonomousLoop`,
  `weightRouting`, `verifyGate`, and `planGate`;
- `testEnforcement`, `modelRouting`, `autoPlan`, `ambiguityDetection`, `commitConvention`,
  `scopeGuard`, `tier3`, `verifyGate`, `planGate`, and `conventions`;
- `multiAgent.maxAgents`, `useWorktree`, `tmuxSession`, and add
  `multiAgent.runtime: "codex" | "claude"`;
- `nativeTeam.maxTeammates`, `defaultTeamName`, and `templates`;
- the full `loop` block, including its state paths, verify ladder, budgets, tier definitions,
  reflection, and cross-verification limits;
- `verify.rounds`, `verify.stopWhenClean`, `verify.autoFix`, and `verify.lenses`.

Apply choices:

- Full: keep template feature defaults.
- Minimal: disable every feature except `testEnforcement`, `dangerousGuard`,
  `commitConvention`, and `autoGitignore`.
- Custom: ask which exact feature keys to enable.
- Auto-detect: scan project manifests and save `.claude/.omh/conventions.json`.
- Manual: ask for language, test framework, linter, formatter, and build tool.
- Weight routing disabled: set `features.weightRouting` false.
- Weight routing enabled: keep `verify.rounds` at the chosen positive integer and
  `verify.autoFix` at the explicit choice.
- Verifier lenses: include only selected, available runtimes. Mark a same-model Codex lens as
  non-independent later; never imply that a configured lens guarantees separation.

If `.gitignore` lacks `.claude/.omh/`, show the proposed addition and ask before changing it.
For durable Codex guidance, propose an `AGENTS.md` change and require explicit confirmation before
overwriting existing guidance. Project skills belong in `.agents/skills`.

Report scope, detected conventions, config path, enabled features, runtime, loop budgets, verifier
availability, and reduced-coverage caveats. Do not modify global settings unless the user selected
global scope and separately confirmed the exact target.
