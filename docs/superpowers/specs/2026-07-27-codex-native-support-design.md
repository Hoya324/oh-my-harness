# Codex Native Support Design

**Date:** 2026-07-27  
**Status:** Approved  
**Scope:** Add first-class Codex CLI and Codex desktop support without regressing Claude Code support.

## Goals

- Keep the existing Claude Code plugin, hooks, skills, agents, CLI behavior, and project state compatible.
- Add a native Codex plugin with Codex lifecycle hooks, skills, durable instructions, subagent roles, and shared memory.
- Support project- and user-scoped installation for `claude`, `codex`, or `both`.
- Install and smoke-test the Codex plugin on the current Mac after implementation.
- Update all user-facing English and Korean documentation, including the root README files and documentation site.

## Non-goals

- Moving existing `.claude/.omh/` state to a new directory in the first compatibility release.
- Making the Claude status-line HUD render identically in Codex, which has no equivalent documented status-line extension.
- Replacing Codex's native hook trust review or bypassing its security model.
- Requiring optional external verifier CLIs or the memory MCP server for the core harness to run.

## Chosen Approach

Use a shared runtime-neutral core with thin native adapters for Claude Code and Codex.

The alternatives were:

1. A single hook implementation that detects the runtime dynamically. This minimizes files but mixes two wire protocols and increases regression risk.
2. An install-time converter that rewrites the Claude plugin into Codex files. This is quick to build but creates drift between source and installed artifacts.

The chosen design keeps runtime contracts explicit while sharing all decisions, configuration, state, and verification logic.

## Architecture

```text
oh-my-harness/
├── .claude-plugin/          # Existing Claude manifest
├── .codex-plugin/           # New Codex manifest
├── lib/                     # Runtime-neutral core
├── hooks/
│   ├── hooks.json           # Existing Claude hook registration
│   ├── *.mjs                # Existing Claude adapters
│   └── codex/
│       ├── hooks.json       # Codex hook registration
│       └── *.mjs            # Codex input/output adapters
├── skills/                  # Existing Claude skills
├── codex/
│   ├── skills/              # Codex-native workflows
│   ├── agents/              # quick/standard/architect roles
│   └── AGENTS.md            # Codex durable guidance source
└── templates/
    ├── CLAUDE.md.tmpl
    └── AGENTS.md.tmpl
```

The existing Claude files and behavior remain intact. Runtime differences are isolated to:

- Hook input normalization.
- Hook output serialization.
- Runtime-specific agent and collaboration tool instructions.
- Install locations and manifest formats.

The following remain shared:

- Configuration schema and merge behavior.
- Convention and tier detection.
- Risk and plan-gate decisions.
- Loop evaluation, budgets, plateau/oscillation detection, and verification ladders.
- State, usage, and memory formats.
- External verifier adapters.

## Project State and Compatibility

The first dual-runtime release continues to use `.claude/.omh/` as the shared project state directory. Although the name is Claude-specific, retaining it avoids migrating or splitting existing configuration, loop state, learnings, usage, and snapshots.

Both runtimes read and write:

- `.claude/.omh/harness.config.json`
- `.claude/.omh/STATE.md`
- `.claude/.omh/loop-state.json`
- `.claude/.omh/loop-learnings.md`
- `.claude/.omh/conventions.json`
- `.claude/.omh/usage.json`

Long-term memory remains runtime-neutral at `~/.omh/memory/graph.jsonl`.

Future migration to a neutral project directory is explicitly deferred and must include a separate compatibility design.

## Feature Mapping

| Feature | Claude Code | Codex |
|---|---|---|
| Convention detection and Living State | `SessionStart` | `SessionStart` |
| Tier routing, ambiguity, auto-plan | `UserPromptSubmit` | `UserPromptSubmit` |
| Dangerous command and plan gates | `PreToolUse` | `PreToolUse` with `permissionDecision: deny` |
| Commit, scope, and usage tracking | `PostToolUse` | `PostToolUse` |
| Context snapshot | `PreCompact` | `PreCompact` |
| Test and verification gates | `Stop` | `Stop` continuation |
| Autonomous loop | Claude `decision:block` contract | Codex `decision:block` continuation contract |
| Spec and independent verify | Claude skills | Codex-native skills with the same public names |
| Long-term memory | `omh-memory` MCP | Same MCP server and store |
| Routed roles | Claude agents | Codex subagent roles |
| Native team | Claude team tools | Codex subagent/collaboration tools |
| tmux/worktree agents | Claude process | Selectable Claude or Codex process |
| Project skill scaffolding | `.claude/skills` | `.agents/skills` |

Codex roles expose the same semantic names:

- `quick`: fast model and low reasoning.
- `standard`: balanced model and medium reasoning.
- `architect`: high-capability model and high reasoning.

Concrete model identifiers are configuration defaults, not duplicated throughout skills and hooks, and users can override them.

## Hook Contracts

Codex adapters normalize Codex event payloads into the existing core decision inputs. They then serialize decisions using the current Codex contract:

- Context injection uses `hookSpecificOutput.additionalContext`.
- Pre-tool denial uses `hookSpecificOutput.permissionDecision = "deny"`.
- Stop continuation uses top-level `{ "decision": "block", "reason": "..." }`.
- Successful fail-open hooks exit zero with no output.

The autonomous loop uses `stop_hook_active` to prevent recursive continuation. A corrupt or inconsistent loop state is quarantined or cleared and reported instead of trapping the session.

## HUD and Observability

Claude keeps its custom status-line HUD unchanged.

Codex retains the same collected state and exposes it through:

- Hook `systemMessage` output for important guard and state transitions.
- A new `omh-status` skill that summarizes the current tier, loop, usage, and verification state.

This is functional observability parity, not identical UI rendering.

## Installation and Update Flow

The CLI gains:

```bash
oh-my-harness init --runtime claude
oh-my-harness init --runtime codex
oh-my-harness init --runtime both
```

The default remains `claude` for backward compatibility. `--scope project|user` applies to both runtimes.

Install destinations:

| Scope | Claude | Codex |
|---|---|---|
| Project | `.claude/` | `.codex/`, `AGENTS.md`, `.agents/skills/` |
| User | `~/.claude/` | `~/.codex/`, `~/.agents/skills/` |

For `both`, runtime registration files are installed independently while configuration, state, and long-term memory remain shared.

Updates preserve all user-owned configuration and state. Managed hooks, built-in skills, agent definitions, and templates may be refreshed. Existing Claude-only installations do not gain Codex files unless the user explicitly selects `codex` or `both`.

The repository includes a Codex plugin manifest and a local marketplace entry so the same source can be installed and tested from Codex CLI and the Codex desktop app.

Codex hook trust remains a required native security step. Installation diagnostics identify hooks awaiting review and direct the user to `/hooks`; the harness does not bypass trust.

## Error Handling

- Convention detection, usage tracking, snapshots, and memory access fail open.
- Dangerous commands and explicit scope violations fail closed.
- Corrupt loop state cannot trap a session.
- Missing optional verifier CLIs are skipped and reported.
- An unavailable memory MCP server disables memory steps without blocking the loop.
- Concurrent memory writers retain the existing single-writer warning.
- Hook output stays within Codex model-visible output limits, with concise continuation reasons and paths to detailed state when necessary.

## Testing

### Shared core

- Preserve and run the complete existing unit suite.
- Add tests only where shared behavior changes.

### Codex contracts

- Fixture tests for every supported Codex event.
- Input normalization tests.
- Context injection serialization tests.
- Pre-tool denial tests.
- Stop continuation and `stop_hook_active` tests.
- Fail-open malformed-input tests.

### Installer

Test the matrix:

- Runtime: `claude`, `codex`, `both`.
- Scope: `project`, `user`.
- First install, update, and repeated idempotent install.
- Preservation of existing config, state, skills, and unrelated hooks.
- Claude install fixtures remain unchanged.

### End-to-end smoke tests

On the current Mac:

1. Register the local repository as a Codex marketplace source.
2. Install the OMH Codex plugin.
3. Confirm the `omh-memory` MCP connection.
4. Inspect hook registration and trust status.
5. Verify automatic context injection.
6. Verify a dangerous command is denied before execution.
7. Verify an incomplete active spec causes a Stop continuation.
8. Verify all bundled skills are discoverable.
9. Re-run the Claude suite and a Claude installation smoke test.

## Documentation

Update English and Korean documentation together:

- `README.md`
- `README.ko.md`
- `docs/features.md`
- `docs/features.ko.md`
- `docs/architecture.md`
- `docs/architecture.ko.md`
- `docs/configuration.md`
- `docs/configuration.ko.md`
- `docs/loop.md`
- `docs/loop.ko.md`
- `docs/verify.md`
- `docs/verify.ko.md`
- `docs/multi-agent.md`
- `docs/multi-agent.ko.md`
- `docs/index.html`
- `docs/i18n.js`
- `CHANGELOG.md`

The documentation includes:

- Claude/Codex installation commands.
- A runtime feature-parity table.
- Codex hook trust instructions.
- The Codex HUD presentation difference.
- Shared-state and memory behavior.
- Upgrade and migration behavior.
- Runtime-specific multi-agent and verification examples.

English/Korean parity tests must continue to pass.

## Completion Criteria

The work is complete only when:

- All existing tests pass.
- New Codex contract and installer tests pass.
- Existing Claude install behavior remains compatible.
- The Codex plugin manifest and marketplace entry validate.
- Codex CLI and desktop discover the plugin and all skills.
- Hooks load, with any native trust requirement explicitly surfaced.
- Dangerous command denial and Stop continuation are demonstrated.
- The shared memory server is connected or its exact external blocker is reported.
- All listed English, Korean, and documentation-site files are updated.
- The implementation is committed and integrated without overwriting the original worktree's unrelated `docs/.claude/` files.
