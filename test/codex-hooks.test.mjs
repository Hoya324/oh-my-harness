import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { translateHookOutput } from '../hooks/codex/adapter.mjs';
import { EVENT_PIPELINES, runHookPipeline } from '../hooks/codex/run.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CODEX_BRIDGE = join(PROJECT_ROOT, 'hooks', 'codex', 'run.mjs');
let tempProject;

function writeConfig(config = { features: { dangerousGuard: true } }) {
  const configDir = join(tempProject, '.claude', '.omh');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'harness.config.json'), JSON.stringify(config));
}

function writePlanMarker(marker = { required: true, satisfied: false, denials: 0, tier: 3 }) {
  const configDir = join(tempProject, '.claude', '.omh');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'plan-gate.json'), JSON.stringify(marker));
}

function runCodexHook(event, input) {
  const raw = execFileSync('node', [CODEX_BRIDGE, event], {
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

  it('combines every SessionStart JSON record into one Codex response', () => {
    const raw = [
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '[omh:convention-detect] Project: node',
        },
      }),
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '[omh:state] Previous session state',
        },
      }),
    ].join('\n');

    const translated = JSON.parse(translateHookOutput('session-start.mjs', raw, {
      eventName: 'SessionStart',
      projectRoot: tempProject,
    }));
    assert.match(translated.hookSpecificOutput.additionalContext, /convention-detect/);
    assert.match(translated.hookSpecificOutput.additionalContext, /\[omh:state\]/);
    assert.equal(translated.continue, undefined);
  });

  it('uses .agents/skills for the Codex SessionStart scaffold hint', () => {
    mkdirSync(join(tempProject, '.agents', 'skills'), { recursive: true });
    const raw = JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '[omh:skill-hint] No project skills found. Run /init-project to scaffold.',
      },
    });

    assert.equal(translateHookOutput('session-start.mjs', raw, {
      eventName: 'SessionStart',
      projectRoot: tempProject,
    }), '');
  });

  it('denies when a critical PreToolUse hook emits malformed output', () => {
    const translated = JSON.parse(translateHookOutput('dangerous-guard.mjs', '{not-json', {
      eventName: 'PreToolUse',
      critical: true,
    }));
    assert.equal(translated.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(translated.hookSpecificOutput.permissionDecisionReason, /malformed output/i);
  });

  it('removes fields that Codex rejects from a PreToolUse advisory response', () => {
    const raw = JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: '[omh:plan-gate] reminder',
        decision: { block: false, reason: 'legacy Claude shape' },
      },
    });
    const translated = JSON.parse(translateHookOutput('plan-gate.mjs', raw, {
      eventName: 'PreToolUse',
    }));

    assert.equal(translated.continue, undefined);
    assert.equal(translated.suppressOutput, undefined);
    assert.equal(translated.hookSpecificOutput.decision, undefined);
    assert.equal(translated.hookSpecificOutput.additionalContext, '[omh:plan-gate] reminder');
  });
});

describe('Codex hook event orchestration', () => {
  it('runs PreToolUse guards in their declared order', () => {
    const calls = [];
    const output = runHookPipeline('PreToolUse', {
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    }, {
      runner({ hookName }) {
        calls.push(hookName);
        return { status: 0, stdout: '{"continue":true,"suppressOutput":true}' };
      },
    });

    assert.equal(output, '');
    assert.deepEqual(calls, EVENT_PIPELINES.PreToolUse.map(({ hookName }) => hookName));
  });

  it('fails closed when a critical guard process fails', () => {
    const output = JSON.parse(runHookPipeline('PreToolUse', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf build' },
    }, {
      runner({ hookName }) {
        if (hookName === 'dangerous-guard.mjs') return { status: 1, stdout: '' };
        return { status: 0, stdout: '' };
      },
    }));

    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /dangerous-guard/);
  });

  it('fails closed when a critical guard returns malformed output', () => {
    const output = JSON.parse(runHookPipeline('PreToolUse', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf build' },
    }, {
      runner({ hookName }) {
        if (hookName === 'dangerous-guard.mjs') return { status: 0, stdout: '{bad-json' };
        return { status: 0, stdout: '' };
      },
    }));

    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /malformed output/i);
  });

  it('keeps running after an advisory hook process fails', () => {
    const calls = [];
    const output = runHookPipeline('PostToolUse', {
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
    }, {
      runner({ hookName }) {
        calls.push(hookName);
        if (hookName === 'commit-convention.mjs') return { status: 1, stdout: '' };
        return { status: 0, stdout: '' };
      },
    });

    assert.equal(output, '');
    assert.deepEqual(calls, ['commit-convention.mjs', 'usage-tracker.mjs']);
  });

  it('short-circuits the ordered Stop pipeline after a continuation decision', () => {
    const calls = [];
    const output = JSON.parse(runHookPipeline('Stop', {}, {
      runner({ hookName }) {
        calls.push(hookName);
        if (hookName === 'loop-guard.mjs') {
          return { status: 0, stdout: '{"decision":"block","reason":"Continue the loop."}' };
        }
        return { status: 0, stdout: '' };
      },
    }));

    assert.deepEqual(calls, ['loop-guard.mjs']);
    assert.equal(output.decision, 'block');
  });
});

describe('Codex hook bridge', () => {
  it('denies a dangerous pre-tool command', () => {
    const denied = runCodexHook('PreToolUse', {
      session_id: 's1',
      turn_id: 't1',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf build' },
    });
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('stays quiet for a safe pre-tool command', () => {
    const quiet = runCodexHook('PreToolUse', {
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
    const denied = runCodexHook('PreToolUse', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: docs/nope.md\n+out of scope\n*** End Patch',
      },
    });
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('maps Codex apply_patch to a mutating plan-gate tool', () => {
    writeConfig({
      features: { dangerousGuard: false, planGate: true, scopeGuard: false },
      planGate: { maxDenials: 3 },
    });
    writePlanMarker();

    const denied = runCodexHook('PreToolUse', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: src/new.js\n+export default true;\n*** End Patch',
      },
    });

    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /\[omh:plan-gate\]/);
  });

  it('treats a valid Codex update_plan as the plan-gate clear signal', () => {
    writeConfig({
      features: { dangerousGuard: false, planGate: true, scopeGuard: false },
      planGate: { maxDenials: 3 },
    });
    writePlanMarker();

    assert.equal(runCodexHook('PreToolUse', {
      tool_name: 'update_plan',
      tool_input: {
        plan: [
          { step: 'Inspect the affected code', status: 'completed' },
          { step: 'Implement and verify the change', status: 'in_progress' },
        ],
      },
    }), null);

    const allowed = runCodexHook('PreToolUse', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: src/new.js\n+export default true;\n*** End Patch',
      },
    });
    assert.equal(allowed, null);
  });

  it('does not clear the plan gate for a malformed update_plan payload', () => {
    writeConfig({
      features: { dangerousGuard: false, planGate: true, scopeGuard: false },
      planGate: { maxDenials: 3 },
    });
    writePlanMarker();

    runCodexHook('PreToolUse', {
      tool_name: 'update_plan',
      tool_input: { plan: 'done' },
    });
    const denied = runCodexHook('PreToolUse', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: src/new.js\n+export default true;\n*** End Patch',
      },
    });

    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('fails closed for a mutating tool when the Codex plan marker is corrupt', () => {
    writeConfig({
      features: { dangerousGuard: false, planGate: true, scopeGuard: false },
    });
    writePlanMarker();
    writeFileSync(join(tempProject, '.claude', '.omh', 'plan-gate.json'), '{not-json');

    const denied = runCodexHook('PreToolUse', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: src/new.js\n+true\n*** End Patch',
      },
    });

    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /plan-gate.*corrupt/i);
  });

  it('keeps an armed Codex plan gate active when config is missing', () => {
    writePlanMarker();
    rmSync(join(tempProject, '.claude', '.omh', 'harness.config.json'));

    const denied = runCodexHook('PreToolUse', {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: src/new.js\n+true\n*** End Patch',
      },
    });

    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /\[omh:plan-gate\]/);
  });
});

describe('Codex hook registration', () => {
  it('registers one sequential orchestrator per event so Codex cannot launch sibling hooks concurrently', () => {
    const config = JSON.parse(readFileSync(join(PROJECT_ROOT, 'hooks', 'codex', 'hooks.json'), 'utf8'));
    const expected = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PreCompact', 'Stop'];

    assert.deepEqual(Object.keys(config.hooks), expected);
    for (const event of expected) {
      const entries = config.hooks[event][0].hooks;
      assert.equal(entries.length, 1, `${event} must have exactly one command hook`);
      assert.equal(entries[0].command.split(' ').at(-1), event);
      assert.ok(entries[0].command.includes('${PLUGIN_ROOT}/hooks/codex/run.mjs'));
      assert.ok(entries[0].statusMessage.startsWith('oh-my-harness:'));
      assert.ok(entries[0].commandWindows, `${event} declares a Windows command`);
    }
  });
});
