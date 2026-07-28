import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Sandbox lives outside the repo tree so loop-guard's git probes (computeDiff)
// can't pick up the repo's own working-tree state during the test.
const TMP = join(tmpdir(), `omh_loop_guard_test_${process.pid}`);
const HOOKS_DIR = join(__dirname, '..', 'hooks');
const OMH = join(TMP, '.claude', '.omh');

function runHook(stdinData, env = {}) {
  const input = typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData);
  return execFileSync('node', [join(HOOKS_DIR, 'loop-guard.mjs')], {
    input,
    // Isolate HOME so the global config fallback (~/.claude/.omh) can't leak the
    // developer's real config into tests. Points at an empty path.
    env: { ...process.env, PROJECT_PATH: TMP, HOME: join(TMP, '__home'), USERPROFILE: join(TMP, '__home'), ...env },
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
}

function parse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function writeConfig(config) {
  mkdirSync(OMH, { recursive: true });
  writeFileSync(join(OMH, 'harness.config.json'), JSON.stringify(config));
}

function writeState(state) {
  mkdirSync(OMH, { recursive: true });
  writeFileSync(join(OMH, 'loop-state.json'), JSON.stringify(state));
}

function activeState(over = {}) {
  return {
    active: true, stopRequested: false, sessionId: 's1', tier: 'standard',
    goal: 'make tests pass', specPath: 'SPEC.md',
    iteration: 0, totalIterations: 0, deepVerifies: 0,
    startedAt: Date.now(), history: [], ...over,
  };
}

beforeEach(() => { mkdirSync(TMP, { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

describe('loop-guard hook', () => {
  it('forces continuation with the load-bearing Stop contract (exit 0 + top-level decision:block)', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState());
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
    assert.equal(parsed.decision, 'block', 'must use TOP-LEVEL decision:block, not nested');
    assert.ok(!parsed.hookSpecificOutput, 'must NOT nest under hookSpecificOutput for Stop');
    assert.match(parsed.reason, /\[omh:loop\]/);
    assert.match(parsed.reason, /Iteration 1\/8/);
  });

  it('fails open on repeated continuation attempts when loop state cannot be persisted', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState());
    chmodSync(OMH, 0o555);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
        assert.notEqual(parsed?.decision, 'block');
        assert.match(parsed?.hookSpecificOutput?.additionalContext || '', /persistence failed.*allowing/i);
      }
    } finally {
      chmodSync(OMH, 0o755);
    }
  });

  it('binds the loop to the session on first fire when sessionId is null', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState({ sessionId: null }));
    const parsed = parse(runHook({ session_id: 's-bound', stop_hook_active: false }));
    assert.equal(parsed.decision, 'block'); // not ignored — it ran
    const saved = JSON.parse(execFileSync('cat', [join(OMH, 'loop-state.json')], { encoding: 'utf8' }));
    assert.equal(saved.sessionId, 's-bound');
  });

  it('stays silent when the feature is disabled', () => {
    writeConfig({ features: { autonomousLoop: false }, loop: {} });
    writeState(activeState());
    const parsed = parse(runHook({ session_id: 's1' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('stays silent when DISABLE_HARNESS is set', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState());
    const parsed = parse(runHook({ session_id: 's1' }, { DISABLE_HARNESS: '1' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('stays silent when no loop is active (no state file)', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    const parsed = parse(runHook({ session_id: 's1' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('ignores a different session (worktree isolation)', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState({ sessionId: 's1' }));
    const parsed = parse(runHook({ session_id: 'other-session' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('exits immediately when stop_hook_active (no self-triggered infinite loop)', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState());
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: true }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('honors the STOP sentinel kill switch (allows stop, not block)', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState());
    writeFileSync(join(OMH, 'STOP'), '');
    const parsed = parse(runHook({}));
    assert.notEqual(parsed.decision, 'block');
    assert.match(parsed.hookSpecificOutput.additionalContext, /Loop ended: kill_switch/);
  });

  it('fail-opens on a corrupt state file (deletes it, stays silent)', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    mkdirSync(OMH, { recursive: true });
    writeFileSync(join(OMH, 'loop-state.json'), 'not json!!!');
    const parsed = parse(runHook({ session_id: 's1' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
    assert.ok(!existsSync(join(OMH, 'loop-state.json')), 'corrupt state should be removed');
  });

  it('ends the loop with a summary when the goal is met (done)', () => {
    writeConfig({ features: { autonomousLoop: true }, loop: {} });
    writeState(activeState({ tier: 'quick', pending: { verifyPassed: true } }));
    const parsed = parse(runHook({ session_id: 's1' }));
    assert.notEqual(parsed.decision, 'block');
    assert.match(parsed.hookSpecificOutput.additionalContext, /goal met/);
  });
});
