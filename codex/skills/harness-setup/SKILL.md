---
name: harness-setup
description: Use when initializing or upgrading Oh My Harness configuration for a Codex project.
---

# Harness setup

Initialize only project configuration and optional project guidance. Never spawn an agent during
setup. Read `../../references/runtime-map.md` before adapting runtime actions.

## First-run gate

Resolve existing configuration exactly like the hooks: try the project
`.claude/.omh/harness.config.json` first, then `~/.claude/.omh/harness.config.json` as the global
fallback; the project config wins. Use the first parseable candidate. Deep-merge it with bundled
defaults. Preserve all user keys, including unknown future keys.

- If a config exists, identify its scope, summarize it, and ask whether to merge current defaults, reset after confirmation,
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
Preserve every template key and exact spelling, and apply the onboarding answers, exactly as listed
in `references/config.md`.

For project scope, write `.claude/.omh/harness.config.json`. For global scope, write
`~/.claude/.omh/harness.config.json`; global scope must not create or change the project config.
Warn when an existing project config will continue to win over the global fallback. Deep-merge
updates without dropping user-defined or unknown keys.

## Codex registration surfaces

The Codex plugin manifest does not install custom role profiles or durable `AGENTS.md` guidance.
Do not imply that marketplace installation alone provides those surfaces. During setup, offer the
supported explicit provisioning step, or tell the user they can run
`oh-my-harness init --runtime codex --scope project|user`.

After explicit confirmation:

- Resolve bundled roles relative to this skill at `../../agents/quick.toml`,
  `../../agents/standard.toml`, and `../../agents/architect.toml`. For project scope, install
  confirmed missing profiles under `.codex/agents/`; for global scope use
  `~/.codex/agents/`. Preserve every user-owned same-name file. Refresh a role only when the
  scope's `.claude/.omh/codex-ownership.json` explicitly records OMH ownership.
- Resolve durable guidance from `../../../templates/AGENTS.md.tmpl`. For project scope target
  `AGENTS.md`; for global scope target `~/.codex/AGENTS.md`. Preserve all unmarked user-owned
  content. Insert or refresh exactly one block bounded by `<!-- HARNESS:START -->` and
  `<!-- HARNESS:END -->`; abort without writing when markers are incomplete.
- Preview exact destinations and changes before writing. Role installation and guidance insertion
  each require explicit confirmation. Write ownership metadata and changed files atomically.

If `.gitignore` lacks `.claude/.omh/`, show the proposed addition and ask before changing it.
For durable Codex guidance, propose an `AGENTS.md` change and require explicit confirmation before
overwriting existing guidance. Project skills belong in `.agents/skills`.

Report scope, detected conventions, config path, enabled features, runtime, loop budgets, verifier
availability, and reduced-coverage caveats. Do not modify global settings unless the user selected
global scope and separately confirmed the exact target.
