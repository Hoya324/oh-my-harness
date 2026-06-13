import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDefault } from '../lib/config.mjs';

test('defaults include tier3 thresholds', () => {
  const c = getDefault();
  assert.equal(c.tier3.taskThreshold, 5);
  assert.equal(c.tier3.fileThreshold, 5);
  assert.deepEqual(c.tier3.domainKeywords, []);
});

test('defaults include verify config', () => {
  const c = getDefault();
  assert.equal(c.verify.rounds, 3);
  assert.equal(c.verify.stopWhenClean, true);
  assert.equal(c.verify.autoFix, false);
  assert.ok(Array.isArray(c.verify.lenses));
  assert.equal(c.verify.lenses[0].model, 'claude');
});

test('features include weightRouting toggle', () => {
  const c = getDefault();
  assert.equal(c.features.weightRouting, true);
});
