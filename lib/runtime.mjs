import { join } from 'path';

const RUNTIMES = new Set(['claude', 'codex', 'both']);

function invalidRuntime() {
  return new Error('Runtime must be claude, codex, or both.');
}

/**
 * Read an optional --runtime argument, preserving Claude-only compatibility.
 * @param {string[]} args
 * @returns {'claude'|'codex'|'both'}
 */
export function parseRuntime(args) {
  const index = args.indexOf('--runtime');
  if (index === -1) return 'claude';

  const runtime = args[index + 1];
  if (!RUNTIMES.has(runtime)) throw invalidRuntime();
  return runtime;
}

/**
 * Whether a runtime selection includes a particular runtime target.
 * @param {'claude'|'codex'|'both'} runtime
 * @param {'claude'|'codex'} target
 * @returns {boolean}
 */
export function runtimeIncludes(runtime, target) {
  return runtime === 'both' || runtime === target;
}

/**
 * Return project skill roots in their deterministic installation order.
 * @param {string} root
 * @param {'claude'|'codex'|'both'} runtime
 * @returns {string[]}
 */
export function skillRoots(root, runtime) {
  const roots = [];
  if (runtimeIncludes(runtime, 'claude')) roots.push(join(root, '.claude', 'skills'));
  if (runtimeIncludes(runtime, 'codex')) roots.push(join(root, '.agents', 'skills'));
  return roots;
}
