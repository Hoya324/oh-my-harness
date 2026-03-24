import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readConfig, writeConfig, getDefault, configPath, sanitizeTmuxSession } from '../lib/config.mjs';

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
