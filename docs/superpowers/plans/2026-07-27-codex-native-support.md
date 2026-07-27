# Codex Native Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make oh-my-harness a first-class, installable Codex CLI and Codex desktop plugin while preserving all existing Claude Code behavior.

**Architecture:** Keep `lib/` and the existing Claude hooks as the shared implementation. Add a Codex hook bridge that translates Codex wire output without duplicating decisions, a Codex manifest and runtime-specific skills, and runtime-aware CLI installers. Both runtimes continue to share `.claude/.omh/` project state and `~/.omh/memory/graph.jsonl`.

**Tech Stack:** Node.js 18+ ESM, Node built-in test runner, JSON/TOML-compatible Codex configuration, Markdown skills, Codex lifecycle hooks, MCP stdio server.

## Global Constraints

- The existing Claude Code plugin, hooks, skills, agents, CLI defaults, and project state behavior must remain compatible.
- The CLI default runtime remains `claude`.
- Runtime choices are exactly `claude`, `codex`, and `both`.
- Project state remains under `.claude/.omh/` for this compatibility release.
- Long-term memory remains at `~/.omh/memory/graph.jsonl`.
- Codex hook trust must not be bypassed.
- Auxiliary hooks fail open; dangerous command and explicit scope-policy violations fail closed in Codex.
- English and Korean documentation must remain in parity.
- Do not overwrite user-owned configuration, state, unrelated hooks, `AGENTS.md` content, or project skills on update.

---

## File Map

- `hooks/codex/adapter.mjs`: Pure conversion from existing OMH hook output to the Codex hook contract.
- `hooks/codex/run.mjs`: Thin subprocess bridge that runs an existing OMH hook and translates its output.
- `hooks/codex/hooks.json`: Codex plugin lifecycle registration.
- `.codex-plugin/plugin.json`: Codex plugin manifest.
- `.claude-plugin/marketplace.json`: Existing marketplace upgraded to serve Claude Code and Codex through Codex's documented legacy-compatible location.
- `codex/AGENTS.md`: Full Codex durable-guidance source used by the installer.
- `codex/agents/*.toml`: Codex quick, standard, and architect role configurations.
- `codex/skills/*/SKILL.md`: Codex-native variants of OMH workflows.
- `lib/runtime.mjs`: Runtime argument parsing and install destination helpers.
- `lib/scaffold-skills.mjs`: Runtime-aware project skill destination selection.
- `bin/cli.mjs`: Runtime-aware init, update, reset, status, and help flows.
- `test/codex-hooks.test.mjs`: Codex hook wire-contract tests.
- `test/codex-plugin.test.mjs`: Manifest, marketplace, skills, agents, and MCP package tests.
- `test/runtime.test.mjs`: Runtime parser and path helper tests.
- `test/cli.test.mjs`: Installation matrix and backward-compatibility tests.
- Root and `docs/` Markdown/HTML/i18n files: dual-runtime documentation.

---

### Task 1: Codex Hook Bridge and Wire Contracts

**Files:**
- Create: `hooks/codex/adapter.mjs`
- Create: `hooks/codex/run.mjs`
- Create: `hooks/codex/hooks.json`
- Create: `test/codex-hooks.test.mjs`

**Interfaces:**
- Consumes: Existing hook executables under `hooks/*.mjs`; their JSON stdout; Codex stdin payloads.
- Produces: `translateHookOutput(hookName: string, raw: string): string` and an executable bridge `node hooks/codex/run.mjs <hook-file>`.

- [ ] **Step 1: Write failing adapter contract tests**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateHookOutput } from '../hooks/codex/adapter.mjs';

describe('Codex hook output adapter', () => {
  it('removes Claude suppress-only output that Codex PreToolUse rejects', () => {
    assert.equal(translateHookOutput('dangerous-guard.mjs', '{"continue":true,"suppressOutput":true}'), '');
  });

  it('turns a dangerous warning into a Codex pre-tool denial', () => {
    const raw = JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: '[omh:dangerous-guard] WARNING: rm -rf. Confirm with the user.',
      },
    });
    assert.deepEqual(JSON.parse(translateHookOutput('dangerous-guard.mjs', raw)), {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '[omh:dangerous-guard] WARNING: rm -rf. Confirm with the user.',
      },
    });
  });

  it('preserves Stop continuation at the top level', () => {
    const raw = '{"decision":"block","reason":"Run the next iteration."}';
    assert.equal(translateHookOutput('loop-guard.mjs', raw), raw);
  });
});
```

- [ ] **Step 2: Run the new tests and confirm the missing module failure**

Run: `node --test test/codex-hooks.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `hooks/codex/adapter.mjs`.

- [ ] **Step 3: Implement the pure output adapter**

```js
export function translateHookOutput(hookName, raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return JSON.stringify({ systemMessage: text }); }

  const context = parsed.hookSpecificOutput?.additionalContext;
  if (hookName === 'dangerous-guard.mjs' && context?.includes('[omh:dangerous-guard]')) {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: context,
      },
    });
  }

  if (parsed.suppressOutput === true &&
      !parsed.systemMessage &&
      !parsed.decision &&
      !parsed.hookSpecificOutput?.additionalContext) return '';

  delete parsed.suppressOutput;
  if (parsed.continue === true &&
      !parsed.systemMessage &&
      !parsed.decision &&
      !parsed.hookSpecificOutput) return '';
  return JSON.stringify(parsed);
}
```

- [ ] **Step 4: Add bridge execution tests**

Extend `test/codex-hooks.test.mjs` with a temporary project config and `execFileSync` helper. Assert:

```js
const denied = runCodexHook('dangerous-guard.mjs', {
  session_id: 's1',
  turn_id: 't1',
  tool_name: 'Bash',
  tool_input: { command: 'rm -rf build' },
});
assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');

const quiet = runCodexHook('dangerous-guard.mjs', {
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
});
assert.equal(quiet, null);
```

- [ ] **Step 5: Implement the subprocess bridge**

`hooks/codex/run.mjs` must:

```js
const ALLOWED = new Set([
  'session-start.mjs', 'pre-prompt.mjs', 'dangerous-guard.mjs',
  'plan-gate.mjs', 'commit-convention.mjs', 'scope-guard.mjs',
  'usage-tracker.mjs', 'pre-compact.mjs', 'loop-guard.mjs',
  'verify-gate.mjs', 'post-task.mjs',
]);
```

Read stdin once, reject a filename outside `ALLOWED`, run `node <PLUGIN_ROOT>/hooks/<name>` with `spawnSync`, pass stdin and environment through, call `translateHookOutput`, print only non-empty translated output, and fail open with exit zero if the child cannot run.

- [ ] **Step 6: Register every Codex event**

Create `hooks/codex/hooks.json` using `${PLUGIN_ROOT}/hooks/codex/run.mjs`. Register the same hook ordering and timeouts as `hooks/hooks.json` for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, and `Stop`. Add `statusMessage` values beginning with `oh-my-harness:`.

- [ ] **Step 7: Run focused and existing hook tests**

Run: `node --test test/codex-hooks.test.mjs test/hooks.test.mjs test/loop-guard.test.mjs test/verify-gate.test.mjs`

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add hooks/codex test/codex-hooks.test.mjs
git commit -m "feat(codex): add native hook bridge"
```

---

### Task 2: Codex Plugin Package, MCP, Roles, and Status Skill

**Files:**
- Create: `.codex-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Verify: `.mcp.json`
- Create: `codex/agents/quick.toml`
- Create: `codex/agents/standard.toml`
- Create: `codex/agents/architect.toml`
- Create: `codex/skills/omh-status/SKILL.md`
- Create: `test/codex-plugin.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `hooks/codex/hooks.json`, `.mcp.json`, `.claude/.omh/{harness.config.json,loop-state.json,usage.json}`.
- Produces: An installable `.codex-plugin/plugin.json`, marketplace entry, bundled MCP declaration, role configs, and `omh-status`.

- [ ] **Step 1: Write package validation tests**

The test must parse all JSON and assert:

```js
assert.equal(manifest.name, 'oh-my-harness');
assert.equal(manifest.skills, './codex/skills/');
assert.equal(manifest.hooks, './hooks/codex/hooks.json');
assert.equal(manifest.mcpServers, './.mcp.json');
assert.equal(marketplace.plugins[0].source, './');
assert.equal(marketplace.plugins[0].name, 'oh-my-harness');
assert.ok(mcp.mcpServers['omh-memory'].args[0].includes('${CLAUDE_PLUGIN_ROOT}'));
```

Also verify every manifest-relative path exists and every `codex/skills/*/SKILL.md` has `name` and `description` frontmatter.

- [ ] **Step 2: Run the package test and confirm missing-manifest failure**

Run: `node --test test/codex-plugin.test.mjs`

Expected: FAIL because `.codex-plugin/plugin.json` does not exist.

- [ ] **Step 3: Add the Codex manifest and marketplace**

The manifest must include:

```json
{
  "name": "oh-my-harness",
  "version": "0.5.0",
  "description": "Spec-driven autonomous harness for Claude Code and Codex",
  "author": { "name": "Hoya324" },
  "homepage": "https://github.com/Hoya324/oh-my-harness",
  "repository": "https://github.com/Hoya324/oh-my-harness",
  "license": "MIT",
  "keywords": ["codex", "claude-code", "harness", "autonomous-loop", "verification"],
  "skills": "./codex/skills/",
  "mcpServers": "./.mcp.json",
  "hooks": "./hooks/codex/hooks.json",
  "interface": {
    "displayName": "Oh My Harness",
    "shortDescription": "Spec-driven loops, guards, and verification",
    "developerName": "Hoya324",
    "category": "Productivity",
    "capabilities": ["Read", "Write"]
  }
}
```

The existing `.claude-plugin/marketplace.json` remains the single marketplace catalog. Preserve its Claude-compatible `source: "./"` entry and add only cross-runtime metadata that the Codex legacy-compatible marketplace reader accepts.

- [ ] **Step 4: Make the MCP launcher runtime-neutral**

Keep `.mcp.json` on `${CLAUDE_PLUGIN_ROOT}/bin/omh-memory.sh`. Codex explicitly supplies `CLAUDE_PLUGIN_ROOT` for compatibility with existing plugin hooks and MCP configuration, so changing this path would add risk without adding capability. Do not create a second memory store.

- [ ] **Step 5: Add role configuration**

Create three TOML role files with explicit descriptions and overrideable defaults:

```toml
# quick.toml
model = "gpt-5.6-luna"
model_reasoning_effort = "low"
developer_instructions = "Handle read-only lookup, search, and narrow exploration tasks. Do not edit files unless the parent explicitly requests it."
```

Use `gpt-5.6-terra`/`medium` for `standard` and `gpt-5.6-sol`/`xhigh` for `architect`.

- [ ] **Step 6: Implement `omh-status`**

The skill must instruct Codex to read the shared config and state files, tolerate missing files, and return exactly these sections when data exists:

```text
OMH status
- Runtime: Codex
- Tier: <tier or inactive>
- Loop: <inactive|iteration N, tier T, stop cause>
- Verify: <pending|pass|fail|unknown>
- Usage: <total calls and session count>
- Memory: <connected|unavailable>
```

It must not modify state.

- [ ] **Step 7: Update package contents and version metadata**

Add `.codex-plugin`, `codex`, and `.mcp.json` to `package.json#files`. Set package, Claude marketplace, Claude manifest, and Codex manifest versions consistently to `0.5.0`.

- [ ] **Step 8: Run package tests**

Run: `node --test test/codex-plugin.test.mjs test/i18n-parity.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add .codex-plugin .mcp.json codex/agents codex/skills/omh-status package.json .claude-plugin test/codex-plugin.test.mjs
git commit -m "feat(codex): package plugin roles and status"
```

---

### Task 3: Codex-Native OMH Skills

**Files:**
- Create: `codex/skills/{harness-setup,set-harness,init-project,omh-spec,omh-loop,omh-verify,agent-spawn,agent-status,agent-apply,agent-stop,team-spawn,team-status,team-stop}/SKILL.md`
- Create: `codex/references/runtime-map.md`
- Modify: `test/codex-plugin.test.mjs`

**Interfaces:**
- Consumes: Existing skill behavior, Codex tools (`spawn_agent`, `list_agents`, `send_message`, `interrupt_agent`), `codex exec`, `.agents/skills`, and shared OMH state.
- Produces: The same public workflow names with Codex-native tool and path instructions.

- [ ] **Step 1: Extend tests for the full skill set**

Assert the exact set:

```js
const expected = [
  'agent-apply', 'agent-spawn', 'agent-status', 'agent-stop',
  'harness-setup', 'init-project', 'omh-loop', 'omh-spec',
  'omh-status', 'omh-verify', 'set-harness',
  'team-spawn', 'team-status', 'team-stop',
];
assert.deepEqual(actual.sort(), expected);
```

Reject Claude-only tool names in each directory that contains a `SKILL.md`:

```js
for (const forbidden of ['TeamCreate', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion']) {
  assert.ok(!body.includes(forbidden), `${skill}: ${forbidden}`);
}
```

- [ ] **Step 2: Run the focused test and confirm missing skills**

Run: `node --test test/codex-plugin.test.mjs`

Expected: FAIL listing the thirteen missing skills.

- [ ] **Step 3: Add shared runtime mapping**

`codex/references/runtime-map.md` defines:

- Ask a necessary question directly in chat.
- `TeamCreate`/`Agent` → `spawn_agent`.
- `TaskList`/team state → `list_agents` plus `.claude/.omh/teams.json`.
- `SendMessage` → `send_message`.
- Teammate shutdown → `interrupt_agent`.
- Project skills → `.agents/skills`.
- Durable project guidance → `AGENTS.md`.
- External read-only GPT verifier → `codex exec -s read-only`.

- [ ] **Step 4: Port the common workflow skills**

Create Codex variants of `harness-setup`, `set-harness`, `init-project`, `omh-spec`, `omh-loop`, and `omh-verify`. Preserve their config keys, safety gates, SPEC structure, budgets, verification ladder, memory behavior, and public usage. Replace only runtime surfaces:

- `CLAUDE.md` → `AGENTS.md` where durable Codex guidance is intended.
- `.claude/skills` → `.agents/skills`.
- Claude-only interaction tool names → direct user questions.
- Native Claude verifier rounds → a Codex subagent or another configured external verifier; never use the generating agent as the independent judge.

- [ ] **Step 5: Port tmux/worktree agent skills**

In `agent-spawn`, add `multiAgent.runtime` with accepted values `claude` and `codex`. The Codex launch command is:

```bash
codex exec --sandbox workspace-write --cd "<worktree>" "Read TASK.md and complete its instructions."
```

Keep task text in `TASK.md`, require confirmation, validate tmux names/counts, preserve worktree isolation, and never auto-merge. Adapt status/apply/stop to the same `agents.json` state format.

- [ ] **Step 6: Port native team skills**

Use Codex collaboration operations semantically:

- `team-spawn`: confirm, decompose, call `spawn_agent`, persist canonical task/agent ids.
- `team-status`: call `list_agents`, merge live status with `teams.json`, report incomplete tasks.
- `team-stop`: inspect status, warn about incomplete work, then call `interrupt_agent` only after confirmation.

Do not spawn agents automatically during skill installation or setup.

- [ ] **Step 7: Run skill package tests**

Run: `node --test test/codex-plugin.test.mjs`

Expected: PASS with all fourteen skills discoverable and no Claude-only tool names.

- [ ] **Step 8: Commit**

```bash
git add codex/skills test/codex-plugin.test.mjs
git commit -m "feat(codex): port harness workflows"
```

---

### Task 4: Runtime Parsing and Skill Scaffolding

**Files:**
- Create: `lib/runtime.mjs`
- Modify: `lib/scaffold-skills.mjs`
- Create: `test/runtime.test.mjs`
- Modify: `test/scaffold-skills.test.mjs`

**Interfaces:**
- Produces: `parseRuntime(args): "claude"|"codex"|"both"`, `runtimeIncludes(runtime, target): boolean`, `skillRoots(root, runtime): string[]`.
- Consumes: Parsed runtime in the CLI and detected project conventions in skill scaffolding.

- [ ] **Step 1: Write failing runtime tests**

```js
assert.equal(parseRuntime([]), 'claude');
assert.equal(parseRuntime(['--runtime', 'codex']), 'codex');
assert.equal(parseRuntime(['--runtime', 'both']), 'both');
assert.throws(() => parseRuntime(['--runtime', 'other']), /claude, codex, or both/);
assert.deepEqual(skillRoots('/repo', 'both'), [
  '/repo/.claude/skills',
  '/repo/.agents/skills',
]);
```

- [ ] **Step 2: Run the tests and confirm missing-module failure**

Run: `node --test test/runtime.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement runtime helpers**

Use exact string matching, reject a missing value after `--runtime`, and return deterministic destination ordering (`claude` before `codex` for `both`).

- [ ] **Step 4: Extend scaffolding tests**

Add:

```js
const both = scaffoldProjectSkills(TMP, conventions, { runtime: 'both' });
assert.ok(existsSync(join(TMP, '.claude/skills/code-review/SKILL.md')));
assert.ok(existsSync(join(TMP, '.agents/skills/code-review/SKILL.md')));
assert.equal(both.created.length, 6);
```

Retain the current default test proving Claude-only output.

- [ ] **Step 5: Make scaffolding runtime-aware**

Change `scaffoldProjectSkills` options to:

```js
{ force = false, runtime = 'claude' }
```

Loop over `skillRoots(projectRoot, runtime)`, render the same source template into each destination, and report created/skipped entries as `claude:code-review` or `codex:code-review` when runtime is `both`.

- [ ] **Step 6: Run focused tests**

Run: `node --test test/runtime.test.mjs test/scaffold-skills.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/runtime.mjs lib/scaffold-skills.mjs test/runtime.test.mjs test/scaffold-skills.test.mjs
git commit -m "feat(cli): add runtime-aware skill scaffolding"
```

---

### Task 5: Runtime-Aware CLI Installation, Update, Status, and Reset

**Files:**
- Modify: `bin/cli.mjs`
- Create: `templates/AGENTS.md.tmpl`
- Modify: `test/cli.test.mjs`

**Interfaces:**
- Consumes: `parseRuntime`, `runtimeIncludes`, Codex hooks/skills/agents, existing config and state.
- Produces: `init/update/status/reset --runtime claude|codex|both` with project/user scope.

- [ ] **Step 1: Add failing CLI matrix tests**

Add tests that run the CLI in isolated `HOME` and assert:

```js
runCli('init', '--runtime', 'codex', '--scope', 'project');
assert.ok(existsSync(join(TMP, '.codex', 'hooks.json')));
assert.ok(existsSync(join(TMP, 'AGENTS.md')));
assert.ok(existsSync(join(TMP, '.agents', 'skills', 'omh-loop', 'SKILL.md')));
assert.ok(!existsSync(join(TMP, '.claude', 'CLAUDE.md')));

runCli('init', '--runtime', 'both', '--scope', 'project');
assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
assert.ok(existsSync(join(TMP, '.codex', 'hooks.json')));
```

Add preservation tests with pre-existing `AGENTS.md`, `.codex/hooks.json`, `.agents/skills/custom/SKILL.md`, and `.claude/.omh/harness.config.json`.

- [ ] **Step 2: Run CLI tests and confirm unsupported-option failures**

Run: `node --test test/cli.test.mjs`

Expected: FAIL because Codex destinations are not created.

- [ ] **Step 3: Split runtime-specific install functions**

Keep `initClaude(root, scope)` behavior byte-compatible with the current `init`.

Add `initCodex(root, scope)` that:

- Creates or preserves shared `.claude/.omh/harness.config.json`.
- Copies `hooks/codex/hooks.json` to project `.codex/hooks.json` with commands rewritten to the installed shared hook directory.
- Copies required hook scripts and `lib/` modules under `.claude/.omh/runtime/`.
- Installs built-in skills under `.agents/skills/`.
- Writes role config under `.codex/agents/`.
- Inserts a marked `<!-- HARNESS:START -->` block into `AGENTS.md`.
- Merges user-level Codex config only when `scope=user`, without deleting unrelated TOML.

`init(root, scope, runtime)` calls one or both functions.

- [ ] **Step 4: Add Codex durable guidance**

`templates/AGENTS.md.tmpl` must express:

- Relay `[omh:*]` messages.
- Test enforcement.
- Plan and ambiguity gates.
- Dangerous-operation confirmation.
- Commit and scope conventions.
- Autonomous SPEC/loop/verify behavior.
- Codex quick/standard/architect role semantics.
- Collaboration safety and no automatic merge/shutdown.

The CLI inserts or replaces only the marked harness block.

- [ ] **Step 5: Make update, status, reset, and help runtime-aware**

Exact behavior:

- `update --runtime codex`: refresh managed Codex hooks, roles, built-in skills, and the marked `AGENTS.md` block.
- `status --runtime both`: show separate Claude and Codex installation lines plus shared feature state.
- `reset --runtime codex`: remove only OMH-managed Codex files and marked guidance; preserve shared config when Claude remains installed.
- `reset --runtime both`: preserve the current non-interactive reset behavior, remove both runtime registrations, and then remove shared state. Do not introduce a new prompt that would break existing Claude CLI automation.
- Help lists `--runtime claude|codex|both` and explains the default.

- [ ] **Step 6: Verify idempotency and backward compatibility**

Run:

```bash
node --test test/cli.test.mjs test/scaffold-skills.test.mjs
```

Expected: all previous Claude assertions and all new Codex/both assertions PASS.

- [ ] **Step 7: Commit**

```bash
git add bin/cli.mjs templates/AGENTS.md.tmpl test/cli.test.mjs
git commit -m "feat(cli): install Claude and Codex runtimes"
```

---

### Task 6: Full Documentation and Release Notes

**Files:**
- Modify: `README.md`
- Modify: `README.ko.md`
- Modify: `docs/features.md`
- Modify: `docs/features.ko.md`
- Modify: `docs/architecture.md`
- Modify: `docs/architecture.ko.md`
- Modify: `docs/configuration.md`
- Modify: `docs/configuration.ko.md`
- Modify: `docs/loop.md`
- Modify: `docs/loop.ko.md`
- Modify: `docs/verify.md`
- Modify: `docs/verify.ko.md`
- Modify: `docs/multi-agent.md`
- Modify: `docs/multi-agent.ko.md`
- Modify: `docs/index.html`
- Modify: `docs/i18n.js`
- Modify: `CHANGELOG.md`
- Modify: `PRIVACY.md`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: Final CLI commands, manifest names, hook trust behavior, shared-state paths, and tested feature behavior.
- Produces: Complete English/Korean user documentation and documentation-site parity for version `0.5.0`.

- [ ] **Step 1: Add documentation assertions before editing prose**

Extend `test/i18n-parity.test.mjs` or create `test/docs-codex.test.mjs` to assert both root READMEs contain:

```text
--runtime codex
--runtime both
.codex-plugin
/hooks
omh-status
```

Assert every English/Korean document pair contains a `Codex` section and the site i18n dictionary has equal English/Korean keys.

- [ ] **Step 2: Run documentation tests and confirm they fail**

Run: `node --test test/docs-codex.test.mjs test/i18n-parity.test.mjs`

Expected: FAIL on missing Codex installation and trust text.

- [ ] **Step 3: Update root onboarding**

Both READMEs must include:

```bash
# Claude Code
claude plugin marketplace add Hoya324/oh-my-harness
claude plugin install oh-my-harness@oh-my-harness

# Codex CLI / desktop local marketplace
codex plugin marketplace add Hoya324/oh-my-harness

# Local CLI installation into a project
oh-my-harness init --runtime codex
oh-my-harness init --runtime both
```

Add a feature-parity table, shared-state note, hook trust `/hooks` step, Codex HUD/`omh-status` difference, and CLI/desktop support statement.

- [ ] **Step 4: Update detailed documentation pairs**

Use identical headings and facts across each pair:

- Features: runtime support and HUD presentation.
- Architecture: shared core plus hook bridge and manifests.
- Configuration: runtime option, role defaults, state paths.
- Loop: Codex Stop continuation contract.
- Verify: generator/verifier independence on both runtimes.
- Multi-agent: Codex collaboration tools and Codex tmux command.

- [ ] **Step 5: Update the documentation site**

Add a Codex badge/feature card, installation tabs or blocks, parity table, and trust note in `docs/index.html`. Add every new string to both language dictionaries in `docs/i18n.js`; do not embed one-language copy outside the dictionary except product names and shell commands.

- [ ] **Step 6: Update release, contribution, and privacy text**

- `CHANGELOG.md`: add `0.5.0` with Codex plugin, hooks, skills, installer, roles, memory, docs, and HUD difference.
- `CONTRIBUTING.md`: add Codex-focused test commands and dual-runtime documentation parity rules.
- `PRIVACY.md`: clarify that both runtimes use the same local memory store and no new telemetry is introduced.

- [ ] **Step 7: Run documentation tests**

Run: `node --test test/docs-codex.test.mjs test/i18n-parity.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add README.md README.ko.md docs CHANGELOG.md CONTRIBUTING.md PRIVACY.md test/docs-codex.test.mjs
git commit -m "docs: document Claude and Codex support"
```

---

### Task 7: Regression, Package, and Local Codex Installation

**Files:**
- Modify only if verification exposes a defect: files owned by Tasks 1-6 and their focused tests.
- No generated local plugin cache, auth, memory graph, or hook trust state is committed.

**Interfaces:**
- Consumes: Complete implementation.
- Produces: Passing full suite, valid package contents, installed local Codex plugin, MCP connection evidence, and smoke-test evidence.

- [ ] **Step 1: Run static and full test verification**

Run:

```bash
git diff --check
npm test
npm pack --dry-run
```

Expected: no whitespace errors, all tests PASS, and the dry-run file list includes `.codex-plugin`, `.agents`, `codex`, `.mcp.json`, hooks, skills, lib, and docs intended for the package.

- [ ] **Step 2: Run isolated install smoke tests**

Create `/private/tmp/omh-codex-smoke` as a fresh temporary git repository and run:

```bash
node /Users/hoyana/Documents/Codex/2026-07-27/https-developers-openai-com-codex-app/work/oh-my-harness-codex/bin/cli.mjs init --runtime both --scope project
node /Users/hoyana/Documents/Codex/2026-07-27/https-developers-openai-com-codex-app/work/oh-my-harness-codex/bin/cli.mjs status --runtime both
```

Expected: both runtimes report installed; `AGENTS.md`, `.codex/hooks.json`, `.agents/skills`, `.claude/settings.local.json`, and shared config exist.

- [ ] **Step 3: Register and install the local Codex marketplace**

Run:

```bash
codex plugin marketplace add /Users/hoyana/Documents/Codex/2026-07-27/https-developers-openai-com-codex-app/work/oh-my-harness-codex
codex plugin marketplace list
codex plugin install oh-my-harness@oh-my-harness
```

If the installed CLI exposes a different exact install subcommand, use `codex plugin --help` as the source of truth, record the command used, and do not edit user config manually unless the CLI lacks installation support.

Expected: marketplace and plugin are listed and enabled.

- [ ] **Step 4: Verify MCP and hooks**

Run:

```bash
codex mcp list
codex exec --sandbox read-only "Use the oh-my-harness status skill and report whether its memory MCP is available."
```

Expected: `omh-memory` is configured; Codex discovers `omh-status`. Inspect `/hooks` in the interactive CLI or desktop app and report exact hooks awaiting trust. Do not bypass review.

- [ ] **Step 5: Smoke-test denial and continuation**

In an isolated temporary project:

- Feed a Codex `PreToolUse` fixture for `rm -rf build` through `hooks/codex/run.mjs`; assert `permissionDecision=deny`.
- Create a valid active loop-state fixture below its budget with a failing pending verification; feed a Codex `Stop` fixture; assert top-level `decision=block`.
- Feed the same Stop fixture with `stop_hook_active=true`; assert no continuation output.

- [ ] **Step 6: Fix only evidence-backed failures and rerun the narrowest test first**

For each failure:

1. Capture the exact failing output.
2. Add or strengthen a regression test.
3. Make the minimal implementation change.
4. Run the focused test.
5. Re-run `npm test`.

- [ ] **Step 7: Run final branch review**

Run:

```bash
git status --short
git log --oneline --decorate -8
git diff main...HEAD --stat
git diff main...HEAD --check
```

Expected: only intentional source/docs changes, clean whitespace, no local cache/auth/state files.

- [ ] **Step 8: Commit final verification fixes if any**

```bash
git add hooks/codex codex lib bin templates test package.json .codex-plugin .claude-plugin .mcp.json
git commit -m "fix(codex): resolve integration verification findings"
```

Skip this commit when no fixes were needed.
