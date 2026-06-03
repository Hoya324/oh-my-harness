/** GPT (Codex CLI) review adapter — read-only, non-interactive. */
import { spawnSync } from 'child_process';

/**
 * @param {string} prompt
 * @param {{ cwd?: string, timeoutMs?: number, bin?: string }} [opts]
 * @returns {{ ok: boolean, output: string, error: string }}
 */
export function reviewWithCodex(prompt, opts = {}) {
  const { cwd = process.cwd(), timeoutMs = 120000, bin = 'codex' } = opts;
  // -s read-only: verifier must never modify the workspace.
  const r = spawnSync(bin, ['exec', '-s', 'read-only', prompt], {
    cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return { ok: false, output: '', error: String(r.error.message || r.error) };
  const output = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, output, error: r.status === 0 ? '' : `exit ${r.status}` };
}
