import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, expectedBlock, currentBlock } from '../scripts/sync-claude-md.mjs';

describe('repo CLAUDE.md harness block', () => {
  for (const rel of TARGETS) {
    it(`${rel} matches the generator output (run npm run sync:claude-md)`, () => {
      const current = currentBlock(rel);
      assert.ok(current, `${rel} has no HARNESS block`);
      assert.equal(current, expectedBlock());
    });
  }

  it('carries no stale hand-written version stamp', () => {
    for (const rel of TARGETS) {
      assert.doesNotMatch(currentBlock(rel) || '', /HARNESS:VERSION/);
    }
  });
});
