import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { readConfig, writeConfig, getDefault, configPath } from '../lib/config.mjs';

const TMP = join(import.meta.dirname, '__tmp_config');

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
});
