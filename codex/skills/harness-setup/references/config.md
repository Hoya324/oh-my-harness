# Configuration keys and choices

Read by `harness-setup` while creating configuration.

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
