import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import {
  renderAutoBlock, upsertAutoBlock, syncAutoState, collectAutoState, manualPart, autoPart,
  stateSummary, statePath, renderHandoff, AUTO_START, AUTO_END,
} from '../lib/state.mjs';
import { notePrompt, noteCompaction, handoffMessage } from '../lib/session-health.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(tmpdir(), `omh_state_sync_test_${process.pid}`);
const OMH = join(TMP, '.claude', '.omh');
const HOOKS_DIR = join(__dirname, '..', 'hooks');
const CLI = join(__dirname, '..', 'bin', 'cli.mjs');
const NOW = new Date('2026-11-27T07:00:00Z');

function env(extra = {}) {
  return {
    ...process.env, PROJECT_PATH: TMP, HOME: join(TMP, '__home'), USERPROFILE: join(TMP, '__home'),
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...extra,
  };
}
function sh(cmd, args) { return execFileSync(cmd, args, { cwd: TMP, env: env(), encoding: 'utf8' }); }
function runHook(file, stdin, extra = {}) {
  return execFileSync('node', [join(HOOKS_DIR, file)], { input: JSON.stringify(stdin), env: env(extra), encoding: 'utf8', timeout: 10000 }).trim();
}
function writeConfig(c) { mkdirSync(OMH, { recursive: true }); writeFileSync(join(OMH, 'harness.config.json'), JSON.stringify(c)); }
function gitRepo() {
  sh('git', ['init', '-q']);
  writeFileSync(join(TMP, 'a.txt'), 'a');
  sh('git', ['add', 'a.txt']);
  sh('git', ['commit', '-q', '-m', 'feat: first commit']);
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('AUTO block rendering', () => {
  it('renders git, loop and verify facts between markers', () => {
    const block = renderAutoBlock({
      branch: 'main', commits: ['abc123 feat: x'], changed: ['src/a.kt'],
      loop: { active: true, tier: 'standard', iteration: 2, stopCause: null },
      verify: { verified: false, blocks: 1 },
    }, NOW);
    assert.ok(block.startsWith(AUTO_START));
    assert.ok(block.trimEnd().endsWith(AUTO_END));
    assert.match(block, /Branch: main/);
    assert.match(block, /Uncommitted: 1 file\(s\): src\/a\.kt/);
    assert.match(block, /abc123 feat: x/);
    assert.match(block, /Loop: active, tier standard, iteration 2/);
    assert.match(block, /current diff not verified, 1 block/);
  });

  it('caps the changed-file list', () => {
    const changed = Array.from({ length: 12 }, (_, i) => `f${i}.ts`);
    const block = renderAutoBlock({ branch: null, commits: [], changed, loop: null, verify: null }, NOW);
    assert.match(block, /12 file\(s\).*\(\+4 more\)/);
  });
});

describe('upsertAutoBlock', () => {
  const block = `${AUTO_START}\n## Snapshot\n- Branch: x\n${AUTO_END}\n`;

  it('creates a skeleton with human-owned sections when STATE.md is absent', () => {
    const text = upsertAutoBlock(null, block);
    assert.match(text, /## Goal/);
    assert.match(text, /## Key Decisions/);
    assert.ok(text.includes(block));
  });

  it('replaces only the generated block and keeps every human line', () => {
    const human = '# Project State\n\n## Goal\nShip OMH 0.6\n\n## Key Decisions\n- keep hooks fail-open\n';
    const first = upsertAutoBlock(human, block);
    const second = upsertAutoBlock(first, block.replace('Branch: x', 'Branch: y'));
    assert.match(second, /Ship OMH 0\.6/);
    assert.match(second, /keep hooks fail-open/);
    assert.match(second, /Branch: y/);
    assert.doesNotMatch(second, /Branch: x/);
    assert.equal(second.split(AUTO_START).length, 2, 'exactly one block');
  });

  it('manualPart / autoPart split the file', () => {
    const text = upsertAutoBlock('# Project State\n\n## Goal\nG\n', block);
    assert.equal(manualPart(text), '# Project State\n\n## Goal\nG');
    assert.match(autoPart(text), /Branch: x/);
  });
});

describe('syncAutoState', () => {
  it('never creates OMH state in a project without .claude/.omh', () => {
    assert.equal(syncAutoState(TMP, NOW), false);
    assert.equal(existsSync(OMH), false);
  });

  it('writes git facts and preserves the human goal', () => {
    gitRepo();
    mkdirSync(OMH, { recursive: true });
    writeFileSync(statePath(TMP), '# Project State\n\n## Goal\nMy goal\n');
    writeFileSync(join(TMP, 'b.txt'), 'b');
    assert.equal(syncAutoState(TMP, NOW), true);
    const text = readFileSync(statePath(TMP), 'utf8');
    assert.match(text, /My goal/);
    assert.match(text, /feat: first commit/);
    assert.match(text, /b\.txt/);
  });

  it('works without git (no branch/commit lines, no crash)', () => {
    mkdirSync(OMH, { recursive: true });
    const auto = collectAutoState(TMP);
    assert.deepEqual(auto.commits, []);
    assert.equal(syncAutoState(TMP, NOW), true);
  });

  it('stateSummary puts human lines first and stays within the budget', () => {
    mkdirSync(OMH, { recursive: true });
    const long = Array.from({ length: 50 }, (_, i) => `- decision ${i} ${'x'.repeat(40)}`).join('\n');
    writeFileSync(statePath(TMP), upsertAutoBlock(`# Project State\n\n## Goal\nG\n\n## Key Decisions\n${long}\n`, renderAutoBlock({ branch: 'main', commits: [], changed: [], loop: null, verify: null }, NOW)));
    const summary = stateSummary(TMP);
    assert.ok(summary.startsWith('# Project State'));
    assert.ok(summary.length <= 1000);
  });
});

describe('Stop and PreCompact hooks refresh STATE.md', () => {
  it('post-task (Stop) syncs the AUTO block even when testEnforcement is off', () => {
    gitRepo();
    writeConfig({ features: { testEnforcement: false } });
    runHook('post-task.mjs', {});
    assert.match(readFileSync(statePath(TMP), 'utf8'), /OMH:AUTO:START[\s\S]*feat: first commit/);
  });

  it('respects features.stateSync=false', () => {
    gitRepo();
    writeConfig({ features: { testEnforcement: false, stateSync: false } });
    runHook('post-task.mjs', {});
    assert.equal(existsSync(statePath(TMP)), false);
  });

  it('pre-compact counts the compaction and syncs state', () => {
    gitRepo();
    writeConfig({ features: { contextSnapshot: true } });
    runHook('pre-compact.mjs', { session_id: 's1' });
    assert.equal(JSON.parse(readFileSync(join(OMH, 'session-health.json'), 'utf8')).compactions, 1);
    assert.ok(existsSync(statePath(TMP)));
  });
});

describe('session health and handoff suggestion', () => {
  it('suggests once after the prompt threshold, then stays quiet', () => {
    mkdirSync(OMH, { recursive: true });
    const results = Array.from({ length: 4 }, () => notePrompt(TMP, 's1', { promptThreshold: 3 }).suggest);
    assert.deepEqual(results, [false, false, true, false]);
  });

  it('suggests on the next prompt after a compaction', () => {
    mkdirSync(OMH, { recursive: true });
    notePrompt(TMP, 's1');
    noteCompaction(TMP, 's1');
    const r = notePrompt(TMP, 's1');
    assert.equal(r.suggest, true);
    assert.match(handoffMessage(r.reason), /\[omh:handoff\].*compacted 1 time/);
  });

  it('a new session resets the count', () => {
    mkdirSync(OMH, { recursive: true });
    notePrompt(TMP, 's1', { promptThreshold: 2 });
    notePrompt(TMP, 's1', { promptThreshold: 2 });
    assert.equal(notePrompt(TMP, 's2', { promptThreshold: 2 }).state.prompts, 1);
  });

  it('never suggests when the counter cannot be persisted (no repeat nagging)', () => {
    mkdirSync(OMH, { recursive: true });
    noteCompaction(TMP, 's1');
    const prev = process.env.OMH_TEST_FAIL_WRITE;
    process.env.OMH_TEST_FAIL_WRITE = 'session-health';
    try { assert.equal(notePrompt(TMP, 's1').suggest, false); }
    finally { if (prev === undefined) delete process.env.OMH_TEST_FAIL_WRITE; else process.env.OMH_TEST_FAIL_WRITE = prev; }
  });

  it('pre-prompt emits [omh:handoff] after a compaction', () => {
    writeConfig({ features: { weightRouting: false, contextSnapshot: true } });
    runHook('pre-compact.mjs', { session_id: 's9' });
    const out = runHook('pre-prompt.mjs', { prompt: '다음 작업 이어서 진행해줘', session_id: 's9' });
    assert.match(out, /\[omh:handoff\]/);
    const again = runHook('pre-prompt.mjs', { prompt: '계속 진행해줘', session_id: 's9' });
    assert.doesNotMatch(again, /\[omh:handoff\]/);
  });
});

describe('handoff', () => {
  it('renders the four human sections, the goal, and the generated snapshot', () => {
    gitRepo();
    mkdirSync(OMH, { recursive: true });
    writeFileSync(statePath(TMP), '# Project State\n\n## Goal\nFinish PR 6\n');
    const text = renderHandoff(TMP, NOW);
    for (const h of ['## Tried', '## Worked', '## Failed (and why)', '## Next steps']) assert.ok(text.includes(h), h);
    assert.match(text, /Finish PR 6/);
    assert.match(text, /feat: first commit/);
    assert.doesNotMatch(text, /OMH:AUTO/, 'markers are not copied into the handoff');
  });

  it('oh-my-harness handoff writes .claude/.omh/HANDOFF.md', () => {
    gitRepo();
    mkdirSync(OMH, { recursive: true });
    execFileSync('node', [CLI, 'handoff'], { cwd: TMP, env: env(), encoding: 'utf8' });
    assert.match(readFileSync(join(OMH, 'HANDOFF.md'), 'utf8'), /## Next steps/);
  });

  it('oh-my-harness handoff refuses without OMH state', () => {
    assert.throws(() => execFileSync('node', [CLI, 'handoff'], { cwd: TMP, env: env(), encoding: 'utf8', stdio: 'pipe' }));
  });
});
