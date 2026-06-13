/** Gemini CLI review adapter — read-only (plan mode), non-interactive. */
import { spawnSync } from 'child_process';

/**
 * @param {string} prompt
 * @param {{ cwd?: string, timeoutMs?: number, bin?: string }} [opts]
 * @returns {{ ok: boolean, output: string, error: string }}
 */
export function reviewWithGemini(prompt, opts = {}) {
  const { cwd = process.cwd(), timeoutMs = 120000, bin = 'gemini' } = opts;
  const r = spawnSync(bin, ['-p', prompt, '--approval-mode', 'plan'], {
    cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return { ok: false, output: '', error: String(r.error.message || r.error) };
  const output = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, output, error: r.status === 0 ? '' : `exit ${r.status}` };
}
