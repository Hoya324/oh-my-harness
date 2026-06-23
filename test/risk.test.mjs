import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RISK, tierFloor, globMatch, classifyFiles, computeRisk, diffSignature, evaluateGate,
} from '../lib/risk.mjs';

const SENS = ['**/auth/**', '**/payment/**', '*migration*', '**/*migration*', '.env*', '**/.env*', '**/*.sql'];

function sig(files, diff) { return diffSignature(files, diff); }
function base(over = {}) {
  return {
    stopHookActive: false, sessionId: 's1', loopActive: false,
    stopSentinel: false, disabled: false, featureOff: false,
    files: [], diff: null, tier: null, sensitivePaths: SENS,
    thresholds: { largeFiles: 8, largeLines: 400 },
    ladderResults: null, riskThreshold: RISK.LADDER, maxBlocks: 2,
    recommendCrossVerify: true, nowMs: 1000,
    ...over,
  };
}

describe('globMatch', () => {
  it('** / matches zero or more leading dirs', () => {
    assert.ok(globMatch('**/auth/**', 'src/auth/login.ts'));
    assert.ok(globMatch('**/auth/**', 'auth/login.ts'));
  });
  it('does not match a substring that is not a real path segment', () => {
    assert.ok(!globMatch('**/auth/**', 'src/author.ts'));
  });
  it('*migration* is segment-bounded; **/*migration* crosses dirs', () => {
    assert.ok(globMatch('*migration*', 'db_migration_001.sql'));
    assert.ok(!globMatch('*migration*', 'src/db_migration.sql'));
    assert.ok(globMatch('**/*migration*', 'src/db_migration.sql'));
  });
  it('.env* and **/.env* and **/*.sql', () => {
    assert.ok(globMatch('.env*', '.env.local'));
    assert.ok(globMatch('**/.env*', 'config/.env'));
    assert.ok(globMatch('**/*.sql', 'db/x.sql'));
    assert.ok(globMatch('**/*.sql', 'x.sql'));
  });
});

describe('tierFloor', () => {
  it('maps tiers; unknown -> 0', () => {
    assert.equal(tierFloor(1), 0);
    assert.equal(tierFloor(2), 1);
    assert.equal(tierFloor(3), 2);
    assert.equal(tierFloor(null), 0);
    assert.equal(tierFloor(undefined), 0);
  });
});

describe('classifyFiles', () => {
  it('buckets code / docs / tests and computes testDelta', () => {
    const b = classifyFiles(['src/a.ts', 'README.md', 'src/a.test.ts'], []);
    assert.deepEqual(b.code, ['src/a.ts']);
    assert.deepEqual(b.docs, ['README.md']);
    assert.deepEqual(b.tests, ['src/a.test.ts']);
    assert.equal(b.testDelta, false);
  });
  it('testDelta true when code changes without any test', () => {
    assert.equal(classifyFiles(['src/a.ts'], []).testDelta, true);
  });
  it('flags sensitive files even when they are not code (.env)', () => {
    const b = classifyFiles(['.env.local'], SENS);
    assert.deepEqual(b.sensitive, ['.env.local']);
    assert.equal(b.code.length, 0);
  });
});

describe('computeRisk', () => {
  it('docs-only -> SILENT', () => {
    assert.equal(computeRisk({ files: ['README.md', 'docs/x.md'], diff: { files: 2, lines: 9 }, sensitivePaths: SENS }).level, RISK.SILENT);
  });
  it('tests-only -> SILENT', () => {
    assert.equal(computeRisk({ files: ['src/a.test.ts'], diff: { files: 1, lines: 9 }, sensitivePaths: SENS }).level, RISK.SILENT);
  });
  it('code with matching test, small -> SOFT', () => {
    const r = computeRisk({ files: ['src/a.ts', 'src/a.test.ts'], diff: { files: 2, lines: 30 }, sensitivePaths: SENS });
    assert.equal(r.level, RISK.SOFT);
  });
  it('code without test (test-delta) -> LADDER', () => {
    const r = computeRisk({ files: ['src/a.ts'], diff: { files: 1, lines: 10 }, sensitivePaths: SENS });
    assert.equal(r.level, RISK.LADDER);
    assert.ok(r.factors.includes('test-delta'));
  });
  it('moderate size -> LADDER', () => {
    const r = computeRisk({ files: ['src/a.ts', 'src/b.ts', 'src/a.test.ts'], diff: { files: 5, lines: 250 }, sensitivePaths: SENS });
    assert.equal(r.level, RISK.LADDER);
  });
  it('sensitive path -> LADDER_PLUS with sensitiveHits', () => {
    const r = computeRisk({ files: ['src/auth/login.ts', 'src/auth/login.test.ts'], diff: { files: 2, lines: 20 }, sensitivePaths: SENS });
    assert.equal(r.level, RISK.LADDER_PLUS);
    assert.ok(r.sensitiveHits.includes('src/auth/login.ts'));
  });
  it('large diff -> LADDER_PLUS', () => {
    const files = Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`);
    const r = computeRisk({ files, diff: { files: 12, lines: 50 }, sensitivePaths: SENS });
    assert.equal(r.level, RISK.LADDER_PLUS);
  });
  it('tier floor wins for an otherwise-silent change (docs-only + tier3 -> LADDER)', () => {
    const r = computeRisk({ files: ['README.md'], diff: { files: 1, lines: 3 }, tier: 3, sensitivePaths: SENS });
    assert.equal(r.level, RISK.LADDER);
    assert.ok(r.factors.includes('tier-floor:3'));
  });
  it('uses MAX not MIN (diff 3 + tier 1 stays 3)', () => {
    const r = computeRisk({ files: ['src/auth/x.ts'], diff: { files: 1, lines: 5 }, tier: 1, sensitivePaths: SENS });
    assert.equal(r.level, RISK.LADDER_PLUS);
  });
});

describe('diffSignature', () => {
  it('is stable across file reordering', () => {
    const d = { files: 2, lines: 10 };
    assert.equal(diffSignature(['b.ts', 'a.ts'], d), diffSignature(['a.ts', 'b.ts'], d));
  });
  it('differs when a file is added', () => {
    assert.notEqual(diffSignature(['a.ts'], { files: 1, lines: 1 }), diffSignature(['a.ts', 'b.ts'], { files: 2, lines: 1 }));
  });
});

describe('evaluateGate — guardrails', () => {
  it('stop_hook_active -> silent', () => {
    const r = evaluateGate(null, base({ stopHookActive: true, files: ['src/auth/x.ts'] }));
    assert.equal(r.action, 'silent');
    assert.equal(r.stopCause, 'stop_hook_active');
  });
  it('feature off / disabled -> silent', () => {
    assert.equal(evaluateGate(null, base({ featureOff: true, files: ['src/auth/x.ts'] })).action, 'silent');
    assert.equal(evaluateGate(null, base({ disabled: true, files: ['src/auth/x.ts'] })).action, 'silent');
  });
  it('STOP sentinel -> silent', () => {
    assert.equal(evaluateGate(null, base({ stopSentinel: true, files: ['src/auth/x.ts'] })).action, 'silent');
  });
  it('active loop -> defer (silent)', () => {
    const r = evaluateGate(null, base({ loopActive: true, files: ['src/auth/x.ts'] }));
    assert.equal(r.action, 'silent');
    assert.equal(r.stopCause, 'defer_to_loop');
  });
  it('different session -> silent', () => {
    const r = evaluateGate({ sessionId: 's1', signature: 'x' }, base({ sessionId: 'other', files: ['src/auth/x.ts'] }));
    assert.equal(r.action, 'silent');
    assert.equal(r.stopCause, 'session_mismatch');
  });
});

describe('evaluateGate — decisions', () => {
  it('low risk (docs) -> silent', () => {
    assert.equal(evaluateGate(null, base({ files: ['README.md'], diff: { files: 1, lines: 2 } })).action, 'silent');
  });
  it('risk 1 (code+test) -> soft, never blocks', () => {
    const r = evaluateGate(null, base({ files: ['src/a.ts', 'src/a.test.ts'], diff: { files: 2, lines: 20 } }));
    assert.equal(r.action, 'soft');
  });
  it('risk >= threshold and no ladder yet -> run-ladder', () => {
    const r = evaluateGate(null, base({ files: ['src/a.ts'], diff: { files: 1, lines: 10 } }));
    assert.equal(r.action, 'run-ladder');
  });
  it('green ladder -> allow and records lastVerifiedSignature', () => {
    const files = ['src/a.ts']; const diff = { files: 1, lines: 10 };
    const r = evaluateGate(null, base({ files, diff, ladderResults: [{ rung: 'quickCheck', status: 'pass' }] }));
    assert.equal(r.action, 'allow');
    assert.equal(r.nextState.lastVerifiedSignature, sig(files, diff));
  });
  it('timed-out/infra error is non-blocking -> allow', () => {
    const r = evaluateGate(null, base({ files: ['src/a.ts'], diff: { files: 1, lines: 10 }, ladderResults: [{ rung: 'quickCheck', status: 'error' }] }));
    assert.equal(r.action, 'allow');
  });
  it('red ladder -> block with [omh:verify-gate] reason, blockCount++', () => {
    const r = evaluateGate(null, base({ files: ['src/a.ts'], diff: { files: 1, lines: 10 }, ladderResults: [{ rung: 'quickCheck', status: 'fail', output: '2 errors' }] }));
    assert.equal(r.action, 'block');
    assert.match(r.reason, /\[omh:verify-gate\]/);
    assert.match(r.reason, /RED/);
    assert.equal(r.nextState.blockCount, 1);
  });
  it('risk 3 red block recommends /omh-verify', () => {
    const r = evaluateGate(null, base({ files: ['src/auth/x.ts'], diff: { files: 1, lines: 10 }, ladderResults: [{ rung: 'verify', status: 'fail', output: 'boom' }] }));
    assert.equal(r.action, 'block');
    assert.match(r.reason, /omh-verify/);
  });
  it('NEVER WEDGE: maxBlocks reached -> allow even on red', () => {
    const files = ['src/a.ts']; const diff = { files: 1, lines: 10 };
    const state = { sessionId: 's1', signature: sig(files, diff), blockCount: 2, lastVerifiedSignature: null };
    const r = evaluateGate(state, base({ files, diff, ladderResults: [{ rung: 'quickCheck', status: 'fail', output: 'still red' }] }));
    assert.equal(r.action, 'allow');
    assert.equal(r.stopCause, 'max_blocks');
  });
  it('already-verified signature -> silent (no re-gate)', () => {
    const files = ['src/a.ts']; const diff = { files: 1, lines: 10 };
    const state = { sessionId: 's1', signature: sig(files, diff), blockCount: 0, lastVerifiedSignature: sig(files, diff) };
    const r = evaluateGate(state, base({ files, diff }));
    assert.equal(r.action, 'silent');
    assert.equal(r.stopCause, 'already_verified');
  });
});
