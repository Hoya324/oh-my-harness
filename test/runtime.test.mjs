import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntime, runtimeIncludes, skillRoots } from '../lib/runtime.mjs';

describe('runtime helpers', () => {
  describe('parseRuntime', () => {
    it('defaults to claude when the runtime flag is absent', () => {
      assert.equal(parseRuntime([]), 'claude');
    });

    it('accepts the exact codex runtime value', () => {
      assert.equal(parseRuntime(['--runtime', 'codex']), 'codex');
    });

    it('accepts the exact both runtime value', () => {
      assert.equal(parseRuntime(['--runtime', 'both']), 'both');
    });

    it('rejects an invalid runtime value', () => {
      assert.throws(() => parseRuntime(['--runtime', 'other']), /claude, codex, or both/);
    });

    it('rejects a missing runtime value', () => {
      assert.throws(() => parseRuntime(['--runtime']), /claude, codex, or both/);
    });
  });

  describe('runtimeIncludes', () => {
    it('includes each requested runtime and excludes the other runtime', () => {
      assert.equal(runtimeIncludes('claude', 'claude'), true);
      assert.equal(runtimeIncludes('claude', 'codex'), false);
      assert.equal(runtimeIncludes('codex', 'claude'), false);
      assert.equal(runtimeIncludes('codex', 'codex'), true);
      assert.equal(runtimeIncludes('both', 'claude'), true);
      assert.equal(runtimeIncludes('both', 'codex'), true);
    });
  });

  describe('skillRoots', () => {
    it('returns Claude then Codex roots for both', () => {
      assert.deepEqual(skillRoots('/repo', 'both'), [
        '/repo/.claude/skills',
        '/repo/.agents/skills',
      ]);
    });
  });
});
