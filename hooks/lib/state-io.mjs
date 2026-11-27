/**
 * Shared atomic JSON writer for hook state files (.claude/.omh/*.json).
 *
 * Every hook that persists state goes through writeJsonAtomic so that:
 *   1. a crash can never leave a half-written file (temp file + rename), and
 *   2. tests can simulate a persistence failure deterministically via
 *      OMH_TEST_FAIL_WRITE, independent of filesystem permissions. chmod-based
 *      simulation does not work when tests run as root (Docker, devcontainers),
 *      because root ignores directory write bits.
 *
 * OMH_TEST_FAIL_WRITE is a comma-separated list of state names
 * (e.g. "loop-state,plan-gate") or "*" for every write.
 */
import { mkdirSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { dirname } from 'path';

export function shouldFailWrite(name, env = process.env) {
  const raw = env.OMH_TEST_FAIL_WRITE;
  if (!raw) return false;
  const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return names.includes('*') || names.includes(name);
}

/**
 * @param {string} path  - destination file
 * @param {unknown} data - JSON-serializable value
 * @param {string} name  - logical state name, used for failure injection
 * @param {{suffix?: string}} [opts]
 */
export function writeJsonAtomic(path, data, name, opts = {}) {
  if (shouldFailWrite(name)) {
    throw new Error(`injected write failure: ${name}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}${opts.suffix || ''}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    renameSync(tmp, path);
  } catch (error) {
    try { unlinkSync(tmp); } catch {}
    throw error;
  }
}
