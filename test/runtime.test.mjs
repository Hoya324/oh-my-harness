import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntime, parseScope, runtimeIncludes, skillRoots } from '../lib/runtime.mjs';

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

  describe('parseScope', () => {
    it('returns null when no scope selector is present', () => {
      assert.equal(parseScope([]), null);
    });

    it('accepts exact project, user, and global selectors', () => {
      assert.equal(parseScope(['--scope', 'project']), 'project');
      assert.equal(parseScope(['--scope', 'user']), 'user');
      assert.equal(parseScope(['--global']), 'user');
    });

    it('rejects missing and invalid scope values', () => {
      assert.throws(() => parseScope(['--scope']), /project or user/);
      assert.throws(() => parseScope(['--scope', '--runtime', 'codex']), /project or user/);
      assert.throws(() => parseScope(['--scope', 'banana']), /project or user/);
      assert.throws(() => parseScope(['--scope', 'PROJECT']), /project or user/);
      assert.throws(() => parseScope(['--scope=project']), /project or user/);
    });

    it('rejects duplicate and conflicting scope selectors', () => {
      assert.throws(
        () => parseScope(['--scope', 'project', '--scope', 'project']),
        /only once/,
      );
      assert.throws(
        () => parseScope(['--scope', 'project', '--scope', 'user']),
        /only once/,
      );
      assert.throws(
        () => parseScope(['--global', '--scope', 'user']),
        /only once/,
      );
      assert.throws(() => parseScope(['--global', '--global']), /only once/);
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
