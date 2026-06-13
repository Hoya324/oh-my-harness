import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { renderState, writeState, readState, stateSummary } from '../lib/state.mjs';

test('renderState includes provided fields', () => {
  const md = renderState({ goal: 'G', phase: 'P', decisions: ['D1'], todo: ['T1'], done: ['X1'] });
  assert.match(md, /## Goal\nG/);
  assert.match(md, /## Current Phase\nP/);
  assert.match(md, /- D1/);
  assert.match(md, /- \[ \] T1/);
  assert.match(md, /- \[x\] X1/);
});

test('writeState then readState roundtrips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omh-state-'));
  try {
    writeState(dir, { goal: 'roundtrip goal' });
    assert.match(readState(dir), /roundtrip goal/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readState/stateSummary null when absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omh-state-'));
  try {
    assert.equal(readState(dir), null);
    assert.equal(stateSummary(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
