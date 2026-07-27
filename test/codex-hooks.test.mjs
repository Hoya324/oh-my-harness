import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { translateHookOutput } from '../hooks/codex/adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CODEX_BRIDGE = join(PROJECT_ROOT, 'hooks', 'codex', 'run.mjs');
let tempProject;

function writeConfig(config = { features: { dangerousGuard: true } }) {
  const configDir = join(tempProject, '.claude', '.omh');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'harness.config.json'), JSON.stringify(config));
}

function runCodexHook(hookFile, input) {
  const raw = execFileSync('node', [CODEX_BRIDGE, hookFile], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: {
      ...process.env,
      PROJECT_PATH: tempProject,
      HOME: join(tempProject, '__home'),
      USERPROFILE: join(tempProject, '__home'),
    },
  }).trim();
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  tempProject = mkdtempSync(join(tmpdir(), 'omh-codex-hooks-'));
  writeConfig();
});

afterEach(() => {
  rmSync(tempProject, { recursive: true, force: true });
});

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

describe('Codex hook bridge', () => {
  it('denies a dangerous pre-tool command', () => {
    const denied = runCodexHook('dangerous-guard.mjs', {
      session_id: 's1',
      turn_id: 't1',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf build' },
    });
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('stays quiet for a safe pre-tool command', () => {
    const quiet = runCodexHook('dangerous-guard.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    assert.equal(quiet, null);
  });

  it('denies an out-of-scope Codex apply_patch command', () => {
    writeConfig({
      features: { scopeGuard: true },
      scopeGuard: { allowedPaths: ['src'] },
    });
    const denied = runCodexHook('scope-guard.mjs', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: docs/nope.md\n+out of scope\n*** End Patch',
      },
    });
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  });
});

describe('Codex hook registration', () => {
  it('registers every event with the required bridge order, timeouts, and status messages', () => {
    const config = JSON.parse(readFileSync(join(PROJECT_ROOT, 'hooks', 'codex', 'hooks.json'), 'utf8'));
    const expected = {
      SessionStart: [['session-start.mjs', 10]],
      UserPromptSubmit: [['pre-prompt.mjs', 3]],
      PreToolUse: [['dangerous-guard.mjs', 3], ['plan-gate.mjs', 5], ['scope-guard.mjs', 3]],
      PostToolUse: [['commit-convention.mjs', 3], ['usage-tracker.mjs', 3]],
      PreCompact: [['pre-compact.mjs', 5]],
      Stop: [['loop-guard.mjs', 600], ['verify-gate.mjs', 600], ['post-task.mjs', 5]],
    };

    assert.deepEqual(Object.keys(config.hooks), Object.keys(expected));
    for (const [event, hooks] of Object.entries(expected)) {
      const entries = config.hooks[event][0].hooks;
      assert.deepEqual(entries.map(({ command, timeout }) => [command.split(' ').at(-1), timeout]), hooks);
      assert.ok(entries.every(({ command }) => command.includes('${PLUGIN_ROOT}/hooks/codex/run.mjs')));
      assert.ok(entries.every(({ statusMessage }) => statusMessage.startsWith('oh-my-harness:')));
    }
  });
});
