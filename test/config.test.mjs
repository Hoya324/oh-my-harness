import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readConfig, writeConfig, getDefault, configPath, sanitizeTmuxSession, mergeWithDefaults } from '../lib/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '__tmp_config');

beforeEach(() => { mkdirSync(join(TMP, '.claude', '.omh'), { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

describe('config', () => {
  it('returns defaults when no config file exists', () => {
    const config = readConfig(TMP);
    assert.equal(config.version, 1);
    assert.equal(config.features.testEnforcement, true);
    assert.equal(config.modelRouting.quick, 'haiku');
  });

  it('writes and reads config roundtrip', () => {
    const config = getDefault();
    config.testEnforcement.minCases = 5;
    writeConfig(TMP, config);
    const read = readConfig(TMP);
    assert.equal(read.testEnforcement.minCases, 5);
  });

  it('merges partial config with defaults', () => {
    writeFileSync(configPath(TMP), JSON.stringify({ features: { testEnforcement: false } }));
    const config = readConfig(TMP);
    assert.equal(config.features.testEnforcement, false);
    assert.equal(config.features.conventionSetup, true); // default preserved
    assert.equal(config.modelRouting.quick, 'haiku'); // default preserved
  });

  it('mergeWithDefaults does not alias shared DEFAULTS (mutating a result leaves later merges pristine)', () => {
    const a = mergeWithDefaults({}); // no nested overrides
    a.multiAgent.tmuxSession = 'mutated-by-caller'; // a consumer mutates a nested block of the result
    const b = mergeWithDefaults({}); // a later, independent merge
    assert.equal(b.multiAgent.tmuxSession, 'omh-agents'); // must still be the pristine default
  });

  it('includes autonomous-loop defaults', () => {
    const config = readConfig(TMP);
    assert.equal(config.features.autonomousLoop, true);
    assert.equal(config.loop.classify, 'auto');
    assert.equal(config.loop.maxTotalIterations, 30);
    assert.equal(config.loop.tiers.quick.maxIterations, 3);
    assert.equal(config.loop.tiers.standard.maxIterations, 8);
    assert.equal(config.loop.tiers.deep.maxIterations, 20);
    assert.equal(config.loop.tiers.deep.model, 'architect');
  });

  it('ships planGate defaults', () => {
    const d = getDefault();
    assert.equal(d.features.planGate, true);
    assert.equal(d.planGate.minTier, 3);
    assert.equal(d.planGate.maxDenials, 3);
    assert.deepEqual(d.planGate.gatedTools, ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);
  });

  it('deep-merges partial loop config with defaults', () => {
    writeFileSync(configPath(TMP), JSON.stringify({ loop: { tiers: { deep: { maxIterations: 50 } } } }));
    const config = readConfig(TMP);
    assert.equal(config.loop.tiers.deep.maxIterations, 50); // override
    assert.equal(config.loop.tiers.deep.crossVerify, true); // default preserved
    assert.equal(config.loop.tiers.quick.maxIterations, 3); // sibling default preserved
    assert.equal(config.loop.classify, 'auto'); // default preserved
  });

  it('handles corrupt config gracefully', () => {
    writeFileSync(configPath(TMP), 'not json!!!');
    const config = readConfig(TMP);
    assert.equal(config.version, 1); // falls back to defaults
  });

  it('sanitizes malicious tmuxSession in config before returning', () => {
    writeFileSync(configPath(TMP), JSON.stringify({ multiAgent: { tmuxSession: 'evil; rm -rf /' } }));
    const config = readConfig(TMP);
    assert.equal(config.multiAgent.tmuxSession, 'evilrm-rf');
  });
});

describe('sanitizeTmuxSession', () => {
  it('returns valid session names unchanged', () => {
    assert.equal(sanitizeTmuxSession('omh-agents'), 'omh-agents');
    assert.equal(sanitizeTmuxSession('my_session'), 'my_session');
    assert.equal(sanitizeTmuxSession('Session1'), 'Session1');
  });

  it('strips invalid characters from unsafe input', () => {
    assert.equal(sanitizeTmuxSession('evil; rm -rf /'), 'evilrm-rf');
    assert.equal(sanitizeTmuxSession('$(whoami)'), 'whoami');
    assert.equal(sanitizeTmuxSession('a b\tc'), 'abc');
  });

  it('falls back to omh-agents when result would be empty', () => {
    assert.equal(sanitizeTmuxSession(';;;'), 'omh-agents');
    assert.equal(sanitizeTmuxSession(''), 'omh-agents');
    assert.equal(sanitizeTmuxSession(null), 'omh-agents');
    assert.equal(sanitizeTmuxSession(42), 'omh-agents');
  });
});
