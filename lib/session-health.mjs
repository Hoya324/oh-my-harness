/**
 * Session health: one conversation should hold one context. When a session
 * has been compacted, or has run past a prompt threshold, OMH suggests
 * writing a handoff and continuing in a fresh session. It only suggests —
 * the user decides — and suggests at most once per session.
 *
 * State: .claude/.omh/session-health.json { sessionId, prompts, compactions, suggested }
 * All functions are fail-open.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { writeJsonAtomic } from '../hooks/lib/state-io.mjs';

export const DEFAULT_PROMPT_THRESHOLD = 40;

function healthPath(root) { return join(root, '.claude', '.omh', 'session-health.json'); }

function load(root, sessionId) {
  try {
    const s = JSON.parse(readFileSync(healthPath(root), 'utf8'));
    // A new session starts a new count. Unknown session ids share one bucket.
    if (s && s.sessionId === (sessionId || null)) return s;
  } catch {}
  return { sessionId: sessionId || null, prompts: 0, compactions: 0, suggested: false };
}

function save(root, s) {
  try {
    if (!existsSync(join(root, '.claude', '.omh'))) return false;
    writeJsonAtomic(healthPath(root), s, 'session-health');
    return true;
  } catch { return false; }
}

export function noteCompaction(root, sessionId) {
  const s = load(root, sessionId);
  s.compactions += 1;
  save(root, s);
  return s;
}

/**
 * Count a prompt and decide whether to suggest a handoff now.
 * @returns {{ suggest: boolean, reason: string|null, state: object }}
 */
export function notePrompt(root, sessionId, { promptThreshold = DEFAULT_PROMPT_THRESHOLD } = {}) {
  const s = load(root, sessionId);
  s.prompts += 1;
  let reason = null;
  if (!s.suggested) {
    if (s.compactions > 0) reason = `context was compacted ${s.compactions} time(s)`;
    else if (promptThreshold > 0 && s.prompts >= promptThreshold) reason = `${s.prompts} prompts in this session`;
  }
  if (reason) s.suggested = true;
  // Only report a suggestion that was actually persisted, so a write failure
  // can never make the suggestion repeat on every prompt.
  const saved = save(root, s);
  return { suggest: !!reason && saved, reason, state: s };
}

export function handoffMessage(reason) {
  return `[omh:handoff] Long session (${reason}). Consider running /omh-handoff, then continuing in a new session with the handoff file: one session, one context.`;
}
