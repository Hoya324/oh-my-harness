import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAvailable, availableLenses, selectLens, buildReviewPrompt,
} from '../lib/verify.mjs';

const LENSES = [
  { model: 'claude', via: 'native-subagent', focus: 'correctness' },
  { model: 'gpt', via: 'codex', cmd: 'codex exec', focus: 'convention' },
  { model: 'gemini', via: 'gemini', cmd: 'gemini -p --approval-mode plan', focus: 'regression' },
];

test('isAvailable: real binary true, fake false', () => {
  assert.equal(isAvailable('node'), true);
  assert.equal(isAvailable('nonexistent-cmd-xyz-123'), false);
});

test('selectLens rotates 1-indexed round', () => {
  assert.equal(selectLens(1, LENSES).model, 'claude');
  assert.equal(selectLens(2, LENSES).model, 'gpt');
  assert.equal(selectLens(4, LENSES).model, 'claude');
  assert.equal(selectLens(1, []), null);
});

test('availableLenses always keeps claude, filters missing CLIs', () => {
  const fake = [
    { model: 'claude', via: 'native-subagent' },
    { model: 'ghost', cmd: 'nonexistent-cmd-xyz-123 run' },
  ];
  const got = availableLenses(fake);
  assert.equal(got.length, 1);
  assert.equal(got[0].model, 'claude');
});

test('buildReviewPrompt includes focus, diff, spec, and sentinel', () => {
  const p = buildReviewPrompt({ diff: 'DIFFBODY', spec: 'SPEC', focus: 'convention' });
  assert.match(p, /convention/);
  assert.match(p, /DIFFBODY/);
  assert.match(p, /NO ISSUES FOUND/);
  assert.match(p, /SPEC/);
});
