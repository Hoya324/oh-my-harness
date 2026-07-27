import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { translateHookOutput } from '../hooks/codex/adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CODEX_BRIDGE = join(PROJECT_ROOT, 'hooks', 'codex', 'run.mjs');
let tempProject;

function writeConfig() {
  const configDir = join(tempProject, '.claude', '.omh');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'harness.config.json'), JSON.stringify({
    features: { dangerousGuard: true },
  }));
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
});
