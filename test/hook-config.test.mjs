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

test('fills missing feature defaults from DEFAULTS (stale pre-0.3.0 config)', () => {
  const proj = mkdtempSync(join(tmpdir(), 'omh-proj-'));
  const home = mkdtempSync(join(tmpdir(), 'omh-home-'));
  try {
    // A config written before autonomousLoop/verifyGate/planGate existed:
    // those keys are simply absent, not intentionally off.
    writeConfig(proj, { version: 1, features: { testEnforcement: true, weightRouting: true } });
    const cfg = loadConfig(proj, { homeDir: home });
    assert.equal(cfg.features.autonomousLoop, true); // inherited from defaults, not undefined
    assert.equal(cfg.features.verifyGate, true);
    assert.equal(cfg.features.planGate, true);
    assert.equal(cfg.features.testEnforcement, true); // explicit value kept
  } finally {
    rmSync(proj, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('does not clobber explicit feature flags with defaults', () => {
  const proj = mkdtempSync(join(tmpdir(), 'omh-proj-'));
  const home = mkdtempSync(join(tmpdir(), 'omh-home-'));
  try {
    writeConfig(proj, { features: { autonomousLoop: false, testEnforcement: false } });
    const cfg = loadConfig(proj, { homeDir: home });
    assert.equal(cfg.features.autonomousLoop, false); // explicit OFF must survive the merge
    assert.equal(cfg.features.testEnforcement, false);
    assert.equal(cfg.features.conventionSetup, true); // unset key still gets its default
  } finally {
    rmSync(proj, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('deep-merges nested blocks, keeping sibling defaults', () => {
  const proj = mkdtempSync(join(tmpdir(), 'omh-proj-'));
  const home = mkdtempSync(join(tmpdir(), 'omh-home-'));
  try {
    writeConfig(proj, { loop: { maxTotalIterations: 5 } });
    const cfg = loadConfig(proj, { homeDir: home });
    assert.equal(cfg.loop.maxTotalIterations, 5); // override applied
    assert.equal(cfg.loop.specPath, 'SPEC.md'); // sibling default preserved
  } finally {
    rmSync(proj, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
