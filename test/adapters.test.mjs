import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewWithCodex } from '../lib/adapters/codex.mjs';
import { reviewWithGemini } from '../lib/adapters/gemini.mjs';

test('codex adapter returns structured error result for missing binary', () => {
  const r = reviewWithCodex('noop', { bin: 'nonexistent-cmd-xyz-123' });
  assert.equal(typeof r.ok, 'boolean');
  assert.equal(r.ok, false);
  assert.equal(typeof r.output, 'string');
  assert.equal(typeof r.error, 'string');
});

test('gemini adapter returns structured error result for missing binary', () => {
  const r = reviewWithGemini('noop', { bin: 'nonexistent-cmd-xyz-123' });
  assert.equal(r.ok, false);
  assert.equal(typeof r.output, 'string');
  assert.equal(typeof r.error, 'string');
});
