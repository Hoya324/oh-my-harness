import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLoop, classifyTier, buildLadder, autoCommands,
  failureSignature, detectPlateau, detectOscillation,
  defaultState, resolveTier, DEFAULT_TIERS, TIERS,
} from '../lib/loop.mjs';

// Base config used in most evaluateLoop tests (no tier overrides -> DEFAULT_TIERS).
const CONFIG = { maxTotalIterations: 30, stopOnNoProgress: true, reflectionWindow: 3 };

function baseState(over = {}) {
  return { ...defaultState({ goal: 'g', specPath: 'SPEC.md', sessionId: 'sess-1', tier: 'standard', nowMs: 0 }), ...over };
}

describe('defaultState / resolveTier', () => {
  it('creates an active state with sane defaults', () => {
    const s = defaultState({ goal: 'do x', nowMs: 1000 });
    assert.equal(s.active, true);
    assert.equal(s.iteration, 0);
    assert.equal(s.tier, 'standard');
    assert.equal(s.startedAt, 1000);
    assert.deepEqual(s.history, []);
  });

  it('falls back to standard for an invalid tier', () => {
    assert.equal(defaultState({ goal: 'x', tier: 'bogus', nowMs: 0 }).tier, 'standard');
  });

  it('merges built-in tier budgets with config overrides', () => {
    const t = resolveTier({ tiers: { deep: { maxIterations: 99 } } }, 'deep');
    assert.equal(t.maxIterations, 99);
    assert.equal(t.model, DEFAULT_TIERS.deep.model); // untouched fields preserved
  });
});

describe('classifyTier', () => {
  it('honors an explicit override above everything', () => {
    assert.equal(classifyTier({ goal: 'rename a var', override: 'deep' }), 'deep');
  });

  it('honors config.classify when not auto', () => {
    assert.equal(classifyTier({ goal: 'anything', config: { classify: 'quick' } }), 'quick');
  });

  it('detects deep work from keywords', () => {
    assert.equal(classifyTier({ goal: 'refactor the auth architecture across modules' }), 'deep');
  });

  it('detects deep work from breadth estimates', () => {
    assert.equal(classifyTier({ goal: 'update things', fileEstimate: 8 }), 'deep');
  });

  it('detects quick work from keywords', () => {
    assert.equal(classifyTier({ goal: 'fix a typo in the README' }), 'quick');
  });

  it('defaults to standard for a normal feature request', () => {
    assert.equal(classifyTier({ goal: 'add a logout button to the navbar' }), 'standard');
  });
});

describe('autoCommands / buildLadder', () => {
  it('maps a TypeScript node project to tsc + npm test', () => {
    const cmds = autoCommands({ language: 'node', testFramework: 'vitest', buildTool: 'typescript', linter: 'eslint' });
    assert.equal(cmds.quickCheck, 'npx tsc --noEmit');
    assert.equal(cmds.verify, 'npm test');
  });

  it('maps a pytest+ruff python project', () => {
    const cmds = autoCommands({ language: 'python', testFramework: 'pytest', linter: 'ruff' });
    assert.equal(cmds.quickCheck, 'ruff check .');
    assert.equal(cmds.verify, 'pytest -q');
  });

  it('returns empty commands for an unknown stack', () => {
    assert.deepEqual(autoCommands({}), { quickCheck: '', verify: '' });
  });

  it('builds an ordered ladder, explicit config overriding auto-detection', () => {
    const ladder = buildLadder(
      { language: 'go' },
      { verifyCommand: 'make test', rungTimeoutSec: { quickCheck: 10, verify: 60 } }
    );
    assert.equal(ladder[0].rung, 'quickCheck');
    assert.equal(ladder[0].command, 'go vet ./...');
    assert.equal(ladder[0].timeoutSec, 10);
    assert.equal(ladder[1].rung, 'verify');
    assert.equal(ladder[1].command, 'make test'); // explicit override
  });

  it('omits rungs with no command', () => {
    const ladder = buildLadder({ language: 'java', buildTool: 'gradle' }, {});
    // java has no quickCheck command -> only verify rung
    assert.equal(ladder.length, 1);
    assert.equal(ladder[0].rung, 'verify');
    assert.equal(ladder[0].command, './gradlew test');
  });
});

describe('failureSignature', () => {
  it('is empty when nothing failed', () => {
    assert.equal(failureSignature([{ rung: 'verify', status: 'pass' }]), '');
  });

  it('is stable regardless of rung order', () => {
    const a = failureSignature([{ rung: 'verify', status: 'fail', signature: 'X' }, { rung: 'quickCheck', status: 'fail', signature: 'Y' }]);
    const b = failureSignature([{ rung: 'quickCheck', status: 'fail', signature: 'Y' }, { rung: 'verify', status: 'fail', signature: 'X' }]);
    assert.equal(a, b);
  });
});

describe('detectPlateau', () => {
  it('is false with too little history', () => {
    assert.equal(detectPlateau([{ diffFiles: 0, verifyPassed: false }], 2), false);
  });

  it('flags repeated no-artifact, still-failing iterations', () => {
    assert.equal(detectPlateau([{ diffFiles: 0, verifyPassed: false }, { diffFiles: 0, verifyPassed: false }], 2), true);
  });

  it('is false when a recent iteration made progress', () => {
    assert.equal(detectPlateau([{ diffFiles: 0, verifyPassed: false }, { diffFiles: 3, verifyPassed: false }], 2), false);
  });
});

describe('detectOscillation', () => {
  it('flags 3 identical failure signatures', () => {
    assert.equal(detectOscillation([{ failureSignature: 'A' }, { failureSignature: 'A' }, { failureSignature: 'A' }]), true);
  });

  it('flags A-B-A-B alternation', () => {
    assert.equal(detectOscillation([{ failureSignature: 'A' }, { failureSignature: 'B' }, { failureSignature: 'A' }, { failureSignature: 'B' }]), true);
  });

  it('is false for steady distinct progress', () => {
    assert.equal(detectOscillation([{ failureSignature: 'A' }, { failureSignature: 'B' }, { failureSignature: 'C' }]), false);
  });
});

describe('evaluateLoop — guards', () => {
  it('ignores immediately when stop_hook_active (prevents self-loop)', () => {
    const r = evaluateLoop(baseState(), { stopHookActive: true, nowMs: 1, config: CONFIG });
    assert.equal(r.action, 'ignore');
    assert.equal(r.stopCause, 'stop_hook_active');
  });

  it('ignores when no active loop', () => {
    const r = evaluateLoop({ active: false }, { nowMs: 1, config: CONFIG });
    assert.equal(r.action, 'ignore');
    assert.equal(r.stopCause, 'inactive');
  });

  it('ignores another session (worktree isolation), leaving state untouched', () => {
    const st = baseState();
    const r = evaluateLoop(st, { sessionId: 'other', nowMs: 1, config: CONFIG });
    assert.equal(r.action, 'ignore');
    assert.equal(r.stopCause, 'session_mismatch');
    assert.equal(r.nextState, st);
  });

  it('stops on the STOP sentinel kill switch', () => {
    const r = evaluateLoop(baseState(), { sessionId: 'sess-1', stopSentinel: true, nowMs: 1, config: CONFIG });
    assert.equal(r.action, 'stop');
    assert.equal(r.stopCause, 'kill_switch');
    assert.equal(r.nextState.active, false);
  });
});

describe('evaluateLoop — termination causes', () => {
  it('stops as done when verify is green and the tier needs no cross-verify (quick)', () => {
    const r = evaluateLoop(baseState({ tier: 'quick' }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h1', diff: { files: 2, lines: 10 },
      ladder: [{ rung: 'verify', status: 'pass' }], verifyPassed: true, config: CONFIG,
    });
    assert.equal(r.action, 'stop');
    assert.equal(r.stopCause, 'done');
  });

  it('requires cross-verify PASS to be done on standard tier', () => {
    const sig = { sessionId: 'sess-1', nowMs: 1, headSha: 'h1', diff: { files: 2, lines: 10 }, verifyPassed: true, config: CONFIG };
    // verify green but no cross-verify verdict yet -> continue, not done
    const cont = evaluateLoop(baseState({ tier: 'standard' }), sig);
    assert.equal(cont.action, 'continue');
    // with PASS -> done
    const done = evaluateLoop(baseState({ tier: 'standard' }), { ...sig, crossVerifyVerdict: 'PASS' });
    assert.equal(done.stopCause, 'done');
  });

  it('fails safe to stop on an INCONCLUSIVE cross-verify verdict', () => {
    const r = evaluateLoop(baseState({ tier: 'standard' }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h1', diff: { files: 1, lines: 1 },
      verifyPassed: true, crossVerifyVerdict: 'INCONCLUSIVE', config: CONFIG,
    });
    assert.equal(r.action, 'stop');
    assert.equal(r.stopCause, 'cross_verify_inconclusive');
  });

  it('stops on a non-retryable infra error rather than burning iterations', () => {
    const r = evaluateLoop(baseState(), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h1', diff: { files: 0, lines: 0 },
      ladder: [{ rung: 'verify', status: 'error', retryable: false, signature: 'no test runner' }], config: CONFIG,
    });
    assert.equal(r.action, 'stop');
    assert.equal(r.stopCause, 'infra_error');
  });

  it('stops on the per-tier iteration budget', () => {
    // quick maxIterations=3; starting at iteration 2 -> becomes 3 -> budget hit
    const r = evaluateLoop(baseState({ tier: 'quick', iteration: 2 }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h1', diff: { files: 1, lines: 1 }, verifyPassed: false, config: CONFIG,
    });
    assert.equal(r.action, 'stop');
    assert.equal(r.stopCause, 'budget_iterations');
  });

  it('stops on the cross-tier total budget', () => {
    const r = evaluateLoop(baseState({ tier: 'deep', iteration: 1, totalIterations: 29 }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h1', diff: { files: 1, lines: 1 }, verifyPassed: false, config: CONFIG,
    });
    assert.equal(r.stopCause, 'budget_total');
  });

  it('stops on wall-clock timeout (independent of iteration count)', () => {
    // quick maxWallClockMinutes=5; elapsed 6 min
    const r = evaluateLoop(baseState({ tier: 'quick', startedAt: 0, iteration: 0 }), {
      sessionId: 'sess-1', nowMs: 6 * 60000, headSha: 'h1', diff: { files: 1, lines: 1 }, verifyPassed: false, config: CONFIG,
    });
    assert.equal(r.stopCause, 'timeout');
  });

  it('stops and escalates on oscillation (A-B-A-B)', () => {
    const hist = [
      { failureSignature: 'verify:fail:A', diffFiles: 1, verifyPassed: false },
      { failureSignature: 'verify:fail:B', diffFiles: 1, verifyPassed: false },
      { failureSignature: 'verify:fail:A', diffFiles: 1, verifyPassed: false },
    ];
    const r = evaluateLoop(baseState({ tier: 'deep', iteration: 3, history: hist }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h2', diff: { files: 1, lines: 5 },
      ladder: [{ rung: 'verify', status: 'fail', signature: 'B' }], verifyPassed: false, config: CONFIG,
    });
    assert.equal(r.action, 'stop');
    assert.equal(r.stopCause, 'oscillation');
  });

  it('stops on plateau (no new artifact, still failing)', () => {
    const r = evaluateLoop(baseState({ tier: 'standard', iteration: 1, history: [{ diffFiles: 0, verifyPassed: false, failureSignature: 'verify:fail:X' }] }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'same', diff: { files: 0, lines: 0 },
      ladder: [{ rung: 'verify', status: 'fail', signature: 'Y' }], verifyPassed: false, config: CONFIG,
    });
    assert.equal(r.action, 'stop');
    assert.equal(r.stopCause, 'plateau');
  });
});

describe('evaluateLoop — continue', () => {
  it('continues with a grounded reason when under budget and not done', () => {
    const r = evaluateLoop(baseState({ tier: 'standard', iteration: 0 }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h1', diff: { files: 2, lines: 9 },
      ladder: [{ rung: 'verify', status: 'fail', signature: 'boom', output: 'AssertionError: expected 2' }],
      verifyPassed: false, config: CONFIG,
    });
    assert.equal(r.action, 'continue');
    assert.match(r.reason, /\[omh:loop\]/);
    assert.match(r.reason, /Iteration 1\/8/);
    assert.match(r.reason, /AssertionError/);          // actual failing output piped in
    assert.match(r.reason, /NO PLACEHOLDERS/);
    assert.equal(r.nextState.iteration, 1);
    assert.equal(r.nextState.history.length, 1);
  });

  it('re-injects recent reflections to avoid repeating them', () => {
    const r = evaluateLoop(baseState({ tier: 'standard', iteration: 1, history: [{ reflection: 'tried mocking the clock, did not help', diffFiles: 1, verifyPassed: false }] }), {
      sessionId: 'sess-1', nowMs: 1, headSha: 'h2', diff: { files: 1, lines: 3 }, verifyPassed: false, config: CONFIG,
    });
    assert.equal(r.action, 'continue');
    assert.match(r.reason, /mocking the clock/);
  });
});
