import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import {
  recordDecision, readDecisions, summarizeDecisions, extractTags, trimIfLarge,
  decisionLogPath, formatDecision, MAX_LINES,
} from '../lib/decision-log.mjs';
import { parseOverrides } from '../hooks/lib/tier.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(tmpdir(), `omh_decision_log_test_${process.pid}`);
const OMH = join(TMP, '.claude', '.omh');
const HOOKS_DIR = join(__dirname, '..', 'hooks');
const CLI = join(__dirname, '..', 'bin', 'cli.mjs');

const ROUTING = {
  features: { weightRouting: true, planGate: true, verifyGate: true },
  planGate: { minTier: 3 },
  tier3: { domainKeywords: ['결제'] },
};

function env(extra = {}) {
  return { ...process.env, PROJECT_PATH: TMP, HOME: join(TMP, '__home'), USERPROFILE: join(TMP, '__home'), ...extra };
}
function runHook(file, stdin, extra = {}) {
  return execFileSync('node', [join(HOOKS_DIR, file)], {
    input: JSON.stringify(stdin), env: env(extra), encoding: 'utf8', timeout: 10000,
  }).trim();
}
function writeConfig(c) { mkdirSync(OMH, { recursive: true }); writeFileSync(join(OMH, 'harness.config.json'), JSON.stringify(c)); }
function planGate() { return JSON.parse(readFileSync(join(OMH, 'plan-gate.json'), 'utf8')); }

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('recordDecision', () => {
  it('writes nothing when the project has no .claude/.omh (never creates it)', () => {
    assert.equal(recordDecision({ decision: 'warn', message: '[omh:x] hi' }, { root: TMP }), false);
    assert.equal(existsSync(OMH), false);
  });

  it('appends one JSON line with tags extracted from the message', () => {
    mkdirSync(OMH, { recursive: true });
    assert.equal(recordDecision({ hook: 'h', event: 'Stop', decision: 'block', message: '[omh:verify-gate] red' }, { root: TMP }), true);
    const [entry] = readDecisions(TMP);
    assert.equal(entry.hook, 'h');
    assert.equal(entry.decision, 'block');
    assert.deepEqual(entry.tags, ['omh:verify-gate']);
    assert.equal(entry.message, undefined, 'the raw message is not stored');
    assert.ok(entry.ts);
  });

  it('can be disabled and fails closed to "not written" under injected failure', () => {
    mkdirSync(OMH, { recursive: true });
    assert.equal(recordDecision({ decision: 'warn' }, { root: TMP, env: { OMH_DECISION_LOG: '0' } }), false);
    assert.equal(recordDecision({ decision: 'warn' }, { root: TMP, env: { OMH_TEST_FAIL_WRITE: 'decisions' } }), false);
    assert.equal(readDecisions(TMP).length, 0);
  });

  it('skips malformed lines when reading', () => {
    mkdirSync(OMH, { recursive: true });
    writeFileSync(decisionLogPath(TMP), '{"decision":"warn"}\nnot json\n{"decision":"deny"}\n');
    assert.deepEqual(readDecisions(TMP).map((e) => e.decision), ['warn', 'deny']);
  });

  it('trims the log to a bounded size', () => {
    mkdirSync(OMH, { recursive: true });
    const lines = Array.from({ length: MAX_LINES + 50 }, (_, i) => JSON.stringify({ i })).join('\n') + '\n';
    writeFileSync(decisionLogPath(TMP), lines);
    trimIfLarge(decisionLogPath(TMP), 10);
    const kept = readDecisions(TMP);
    assert.ok(kept.length < MAX_LINES);
    assert.equal(kept.at(-1).i, MAX_LINES + 49, 'keeps the newest lines');
  });
});

describe('extractTags / summarizeDecisions / formatDecision', () => {
  it('dedupes tag names', () => {
    assert.deepEqual(extractTags('[omh:tier] a [omh:tier-3] b [omh:tier] c'), ['omh:tier', 'omh:tier-3']);
    assert.deepEqual(extractTags(undefined), []);
  });

  it('computes per-hook counts, override rate and Stop percentiles', () => {
    const s = summarizeDecisions([
      { hook: 'pre-prompt', event: 'UserPromptSubmit', decision: 'context', tier: 3, override: '!t1' },
      { hook: 'pre-prompt', event: 'UserPromptSubmit', decision: 'context', tier: 2 },
      { hook: 'verify-gate', event: 'Stop', decision: 'block', durationMs: 100 },
      { hook: 'verify-gate', event: 'Stop', decision: 'context', durationMs: 300 },
    ]);
    assert.equal(s.total, 4);
    assert.deepEqual(s.byHook['verify-gate'], { block: 1, context: 1 });
    assert.equal(s.overrideRate, 0.5);
    assert.equal(s.stopMs.p50, 300);
  });

  it('formats a readable line', () => {
    const line = formatDecision({ ts: '2026-11-27T07:00:00.000Z', hook: 'pre-prompt', decision: 'context', tier: 3, reasons: ['domain:결제'] });
    assert.match(line, /pre-prompt\s+CONTEXT\s+tier=3/);
    assert.match(line, /domain:결제/);
  });
});

describe('parseOverrides', () => {
  it('parses leading directives and strips them', () => {
    assert.deepEqual(parseOverrides('!t3 !noplan migrate payments'), { tier: 3, noPlan: true, tokens: ['!t3', '!noplan'], rest: 'migrate payments' });
    assert.equal(parseOverrides('  !T1 fix typo').tier, 1);
  });

  it('ignores directives that are not at the start or not exact', () => {
    assert.equal(parseOverrides('please !t3 this').tier, null);
    assert.equal(parseOverrides('!t30 nope').tier, null);
    assert.equal(parseOverrides('!t4 nope').tokens.length, 0);
  });
});

describe('pre-prompt hook + Decision Log', () => {
  it('records tier and reasons but never the prompt text', () => {
    writeConfig(ROUTING);
    runHook('pre-prompt.mjs', { prompt: '결제 테이블 SECRET_TOKEN_123 마이그레이션', session_id: 's1' });
    const entries = readDecisions(TMP).filter((e) => e.hook === 'pre-prompt');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].tier, 3);
    assert.ok(entries[0].reasons.includes('domain:결제'));
    assert.equal(entries[0].sessionId, 's1');
    assert.doesNotMatch(readFileSync(decisionLogPath(TMP), 'utf8'), /SECRET_TOKEN_123/);
  });

  it('!t1 overrides a Tier-3 classification and disarms the plan gate', () => {
    writeConfig(ROUTING);
    const raw = runHook('pre-prompt.mjs', { prompt: '!t1 결제 문구 오타 수정' });
    assert.match(raw, /\[omh:override\] !t1/);
    assert.equal(planGate().required, false);
    const [entry] = readDecisions(TMP);
    assert.equal(entry.tier, 1);
    assert.equal(entry.override, '!t1');
    assert.ok(entry.reasons.some((r) => r.startsWith('override:t1 (classifier said 3)')));
  });

  it('!noplan keeps Tier 3 but does not arm the plan gate', () => {
    writeConfig(ROUTING);
    runHook('pre-prompt.mjs', { prompt: '!noplan 결제 모듈 수정' });
    assert.equal(planGate().required, false);
    assert.equal(planGate().tier, 3);
  });

  it('hook output is identical when the Decision Log cannot be written', () => {
    writeConfig(ROUTING);
    const a = runHook('pre-prompt.mjs', { prompt: '결제 수정' });
    const b = runHook('pre-prompt.mjs', { prompt: '결제 수정' }, { OMH_TEST_FAIL_WRITE: 'decisions' });
    assert.equal(a, b);
  });
});

describe('oh-my-harness why', () => {
  it('prints JSON with recent entries and a summary', () => {
    writeConfig(ROUTING);
    runHook('pre-prompt.mjs', { prompt: '결제 수정' });
    const out = execFileSync('node', [CLI, 'why', '--json', '--last', '5'], { cwd: TMP, env: env(), encoding: 'utf8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.summary.byHook['pre-prompt'].context, 1);
  });

  it('explains an empty log instead of failing', () => {
    const out = execFileSync('node', [CLI, 'why'], { cwd: TMP, env: env(), encoding: 'utf8' });
    assert.match(out, /No decisions recorded yet/);
  });
});
