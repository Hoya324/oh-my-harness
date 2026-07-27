import { join } from 'path';

const RUNTIMES = new Set(['claude', 'codex', 'both']);
const SCOPES = new Set(['project', 'user']);

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

function invalidScope(message = 'Scope must be project or user.') {
  return new Error(message);
}

/**
 * Read an optional scope selector without guessing on malformed input.
 * `--global` remains a compatibility alias for `--scope user`.
 * @param {string[]} args
 * @returns {'project'|'user'|null}
 */
export function parseScope(args) {
  if (args.some(argument => argument.startsWith('--scope='))) {
    throw invalidScope();
  }

  const scopeIndexes = [];
  const globalIndexes = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--scope') scopeIndexes.push(index);
    if (args[index] === '--global') globalIndexes.push(index);
  }

  if (scopeIndexes.length + globalIndexes.length > 1) {
    throw invalidScope('Scope may be selected only once.');
  }
  if (globalIndexes.length === 1) return 'user';
  if (scopeIndexes.length === 0) return null;

  const scope = args[scopeIndexes[0] + 1];
  if (!SCOPES.has(scope)) throw invalidScope();
  return scope;
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
