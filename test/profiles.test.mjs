import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { applyProfile, suggestProfileChanges, DEFAULT_PROFILE } from '../lib/profiles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = JSON.parse(readFileSync(join(__dirname, '..', 'templates', 'harness.config.json.tmpl'), 'utf8'));
const CLI = join(__dirname, '..', 'bin', 'cli.mjs');
const TMP = join(tmpdir(), `omh_profiles_test_${process.pid}`);
const NOW = Date.parse('2026-11-27T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 24 * 3600 * 1000).toISOString();
const on = (cfg) => Object.entries(cfg.features).filter(([, v]) => v).map(([k]) => k).sort();

describe('applyProfile', () => {
  it('minimal keeps only immediate-payoff guards', () => {
    assert.deepEqual(on(applyProfile(TEMPLATE, 'minimal')),
      ['autoGitignore', 'commitConvention', 'conventionSetup', 'dangerousGuard', 'stateSync', 'verifyGate']);
  });

  it('standard adds testing, routing and planning', () => {
    const f = applyProfile(TEMPLATE, 'standard').features;
    for (const k of ['testEnforcement', 'weightRouting', 'planGate', 'dangerousGuard']) assert.equal(f[k], true, k);
    for (const k of ['autonomousLoop', 'nativeTeam', 'ambiguityDetection', 'scopeGuard']) assert.equal(f[k], false, k);
  });

  it('full keeps template defaults and every non-feature key', () => {
    const full = applyProfile(TEMPLATE, 'full');
    assert.deepEqual(full, TEMPLATE);
    assert.deepEqual(applyProfile(TEMPLATE, 'minimal').loop, TEMPLATE.loop);
  });

  it('rejects unknown profiles and defaults to minimal', () => {
    assert.throws(() => applyProfile(TEMPLATE, 'huge'), /Unknown profile/);
    assert.equal(DEFAULT_PROFILE, 'minimal');
  });
});

describe('suggestProfileChanges', () => {
  const minimal = applyProfile(TEMPLATE, 'minimal');

  it('suggests planning and tests after repeated verify-gate blocks', () => {
    const entries = [1, 2, 3].map((d) => ({ ts: daysAgo(d), hook: 'verify-gate', event: 'Stop', decision: 'block', tags: ['omh:verify-gate'] }));
    const s = suggestProfileChanges(entries, minimal, { now: NOW });
    assert.deepEqual(s.filter((x) => x.action === 'enable').map((x) => x.feature).sort(), ['planGate', 'testEnforcement']);
  });

  it('suggests disabling a nudge that never fired, but never a safety guard', () => {
    const entries = [
      { ts: daysAgo(20), hook: 'pre-prompt', tags: ['omh:tier'] },
      { ts: daysAgo(1), hook: 'pre-prompt', tags: ['omh:tier'] },
    ];
    const full = applyProfile(TEMPLATE, 'full');
    const disable = suggestProfileChanges(entries, full, { now: NOW }).filter((x) => x.action === 'disable').map((x) => x.feature);
    assert.ok(disable.includes('ambiguityDetection'));
    assert.ok(!disable.includes('weightRouting'), 'fired recently');
    assert.ok(!disable.includes('dangerousGuard'));
    assert.ok(!disable.includes('verifyGate'));
  });

  it('says nothing about quiet features before there is enough history', () => {
    const entries = [{ ts: daysAgo(2), hook: 'pre-prompt', tags: ['omh:tier'] }];
    assert.deepEqual(suggestProfileChanges(entries, applyProfile(TEMPLATE, 'full'), { now: NOW }), []);
  });

  it('suggests tuning when users keep overriding the tier', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      ts: daysAgo(1), hook: 'pre-prompt', event: 'UserPromptSubmit', tier: 3, override: i < 8 ? '!t1' : undefined, tags: ['omh:tier'],
    }));
    const tune = suggestProfileChanges(entries, minimal, { now: NOW }).find((x) => x.action === 'tune');
    assert.match(tune.reason, /8\/20 prompts overrode/);
  });

  it('returns nothing for an empty log', () => {
    assert.deepEqual(suggestProfileChanges([], minimal, { now: NOW }), []);
  });
});

describe('cli --profile', () => {
  const cliEnv = () => ({ ...process.env, HOME: join(TMP, '__home'), USERPROFILE: join(TMP, '__home'), OMH_SKIP_GLOBAL: '1' });
  const cfg = () => JSON.parse(readFileSync(join(TMP, '.claude', '.omh', 'harness.config.json'), 'utf8'));
  beforeEach(() => mkdirSync(TMP, { recursive: true }));
  afterEach(() => rmSync(TMP, { recursive: true, force: true }));

  it('a fresh init uses the minimal profile', () => {
    execFileSync('node', [CLI, 'init', '--scope', 'project'], { cwd: TMP, env: cliEnv(), encoding: 'utf8' });
    assert.equal(cfg().features.autonomousLoop, false);
    assert.equal(cfg().features.dangerousGuard, true);
  });

  it('--profile standard is honored and an existing config is never re-profiled', () => {
    execFileSync('node', [CLI, 'init', '--scope', 'project', '--profile', 'standard'], { cwd: TMP, env: cliEnv(), encoding: 'utf8' });
    assert.equal(cfg().features.planGate, true);
    execFileSync('node', [CLI, 'init', '--scope', 'project', '--profile', 'minimal'], { cwd: TMP, env: cliEnv(), encoding: 'utf8' });
    assert.equal(cfg().features.planGate, true, 'existing config preserved');
  });

  it('rejects an unknown profile', () => {
    const r = spawnSync('node', [CLI, 'init', '--scope', 'project', '--profile', 'huge'], { cwd: TMP, env: cliEnv(), encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Unknown profile/);
  });

  it('why --json includes suggestions', () => {
    execFileSync('node', [CLI, 'init', '--scope', 'project'], { cwd: TMP, env: cliEnv(), encoding: 'utf8' });
    const log = join(TMP, '.claude', '.omh', 'decisions.jsonl');
    const now = Date.now();
    writeFileSync(log, [1, 2, 3].map((d) => JSON.stringify({ ts: new Date(now - d * 3600e3).toISOString(), hook: 'verify-gate', event: 'Stop', decision: 'block', tags: ['omh:verify-gate'] })).join('\n') + '\n');
    const out = JSON.parse(execFileSync('node', [CLI, 'why', '--json'], { cwd: TMP, env: cliEnv(), encoding: 'utf8' }));
    assert.ok(out.suggestions.some((s) => s.feature === 'planGate' && s.action === 'enable'));
  });
});

describe('setup skills describe the same profiles as the code', () => {
  const minimalKeys = on(applyProfile(TEMPLATE, 'minimal'));
  for (const file of [
    'claude/skills/harness-setup/references/onboarding.md',
    'claude/skills/harness-setup/references/config.md',
    'codex/skills/harness-setup/references/config.md',
  ]) {
    it(`${file} lists exactly the minimal features`, () => {
      const text = readFileSync(join(__dirname, '..', file), 'utf8');
      const line = text.split('\n').find((l) => /Minimal/.test(l) && /except/.test(l));
      assert.ok(line, 'a Minimal profile line exists');
      const listed = [...line.slice(line.indexOf('except')).matchAll(/`(\w+)`/g)].map((m) => m[1]).sort();
      assert.deepEqual(listed, minimalKeys);
    });
  }
});
