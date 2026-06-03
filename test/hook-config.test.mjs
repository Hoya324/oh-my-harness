import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from '../hooks/lib/hook-config.mjs';

function writeConfig(root, obj) {
  const dir = join(root, '.claude', '.omh');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'harness.config.json'), JSON.stringify(obj));
}

test('project config wins over home fallback', () => {
  const proj = mkdtempSync(join(tmpdir(), 'omh-proj-'));
  const home = mkdtempSync(join(tmpdir(), 'omh-home-'));
  try {
    writeConfig(proj, { source: 'project' });
    writeConfig(home, { source: 'home' });
    assert.equal(loadConfig(proj, { homeDir: home }).source, 'project');
  } finally {
    rmSync(proj, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('falls back to home global when project config absent', () => {
  const proj = mkdtempSync(join(tmpdir(), 'omh-proj-'));
  const home = mkdtempSync(join(tmpdir(), 'omh-home-'));
  try {
    writeConfig(home, { source: 'home' });
    assert.equal(loadConfig(proj, { homeDir: home }).source, 'home');
  } finally {
    rmSync(proj, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('returns null when neither exists', () => {
  const proj = mkdtempSync(join(tmpdir(), 'omh-proj-'));
  const home = mkdtempSync(join(tmpdir(), 'omh-home-'));
  try {
    assert.equal(loadConfig(proj, { homeDir: home }), null);
  } finally {
    rmSync(proj, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
