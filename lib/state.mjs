/** Disk-anchored living project state (.claude/.omh/STATE.md). */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';

export function statePath(root) {
  return join(root, '.claude', '.omh', 'STATE.md');
}

export function renderState({ goal = '', phase = '', decisions = [], todo = [], done = [] } = {}) {
  const lines = ['# Project State', ''];
  if (goal) lines.push('## Goal', goal, '');
  if (phase) lines.push('## Current Phase', phase, '');
  if (decisions.length) { lines.push('## Key Decisions'); decisions.forEach((d) => lines.push(`- ${d}`)); lines.push(''); }
  if (done.length) { lines.push('## Done'); done.forEach((d) => lines.push(`- [x] ${d}`)); lines.push(''); }
  if (todo.length) { lines.push('## Todo'); todo.forEach((d) => lines.push(`- [ ] ${d}`)); lines.push(''); }
  return lines.join('\n').trimEnd() + '\n';
}

export function readState(root) {
  const p = statePath(root);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

export function writeState(root, fields) {
  const p = statePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, renderState(fields));
  return p;
}

export function stateSummary(root, maxLines = 10, maxChars = 1000) {
  const s = readState(root);
  if (!s) return null;
  // Human-owned lines first (goal, decisions), then the generated snapshot.
  const manual = manualPart(s).split('\n').slice(0, maxLines).join('\n').trim();
  const auto = autoPart(s);
  const out = [manual, auto].filter(Boolean).join('\n\n');
  return out.length > maxChars ? `${out.slice(0, maxChars - 1)}…` : out;
}

// ---------------------------------------------------------------------------
// AUTO block: the part of STATE.md that hooks regenerate from deterministic
// sources (git, loop-state, verify-gate state). Humans and the model own the
// rest of the file (Goal, Decisions). A hand-maintained progress log drifts;
// a generated one cannot.
// ---------------------------------------------------------------------------
export const AUTO_START = '<!-- OMH:AUTO:START -->';
export const AUTO_END = '<!-- OMH:AUTO:END -->';
const AUTO_RE = /<!-- OMH:AUTO:START -->[\s\S]*?<!-- OMH:AUTO:END -->\n?/;
const MAX_FILES = 8;
const MAX_COMMITS = 5;

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
  } catch { return null; }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** Gather facts only from machine sources. Never reads prompts or file contents. */
export function collectAutoState(root) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const log = git(root, ['log', `-${MAX_COMMITS}`, '--pretty=format:%h %s']);
  const status = git(root, ['status', '--porcelain']);
  const changed = status == null ? null : status.split('\n').filter(Boolean).map((l) => l.slice(3));
  const omh = join(root, '.claude', '.omh');
  const loop = readJson(join(omh, 'loop-state.json'));
  const gate = readJson(join(omh, 'verify-gate-state.json'));
  return {
    branch,
    commits: log ? log.split('\n').filter(Boolean) : [],
    changed,
    loop: loop && typeof loop === 'object'
      ? { active: !!loop.active, tier: loop.tier || null, iteration: loop.iteration ?? null, stopCause: loop.stopCause || null }
      : null,
    verify: gate && typeof gate === 'object'
      ? { verified: !!gate.lastVerifiedSignature && gate.lastVerifiedSignature === gate.signature, blocks: gate.blocks ?? 0 }
      : null,
  };
}

export function renderAutoBlock(auto, now = new Date()) {
  const lines = [AUTO_START, `## Snapshot (auto, ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC)`];
  if (auto.branch) lines.push(`- Branch: ${auto.branch}`);
  if (auto.changed) {
    const shown = auto.changed.slice(0, MAX_FILES).join(', ');
    const more = auto.changed.length > MAX_FILES ? ` (+${auto.changed.length - MAX_FILES} more)` : '';
    lines.push(`- Uncommitted: ${auto.changed.length ? `${auto.changed.length} file(s): ${shown}${more}` : 'none'}`);
  }
  if (auto.commits.length) {
    lines.push('- Recent commits:');
    for (const c of auto.commits) lines.push(`  - ${c}`);
  }
  if (auto.loop) {
    const l = auto.loop;
    lines.push(`- Loop: ${l.active ? `active, tier ${l.tier}, iteration ${l.iteration}` : `inactive${l.stopCause ? ` (last stop: ${l.stopCause})` : ''}`}`);
  }
  if (auto.verify) {
    lines.push(`- Verify gate: ${auto.verify.verified ? 'current diff verified' : 'current diff not verified'}${auto.verify.blocks ? `, ${auto.verify.blocks} block(s)` : ''}`);
  }
  lines.push(AUTO_END);
  return lines.join('\n') + '\n';
}

/** Replace (or append) the AUTO block, preserving every human-written line. */
export function upsertAutoBlock(text, block) {
  if (!text) {
    return `# Project State\n\n## Goal\n_(set by you)_\n\n## Key Decisions\n\n${block}`;
  }
  if (AUTO_RE.test(text)) return text.replace(AUTO_RE, block);
  return `${text.trimEnd()}\n\n${block}`;
}

/**
 * Regenerate the AUTO block on disk. Only runs when the project already has
 * .claude/.omh (never creates OMH state in an unrelated repo). Fail-open.
 * @returns {boolean} whether STATE.md was written
 */
export function syncAutoState(root, now = new Date()) {
  try {
    if (!existsSync(join(root, '.claude', '.omh'))) return false;
    const p = statePath(root);
    const next = upsertAutoBlock(readState(root), renderAutoBlock(collectAutoState(root), now));
    writeFileSync(p, next);
    return true;
  } catch { return false; }
}

/** The human-owned part of STATE.md (AUTO block removed). */
export function manualPart(text) {
  return String(text || '').replace(AUTO_RE, '').trim();
}

/** The AUTO block body, or null. */
export function autoPart(text) {
  const m = String(text || '').match(AUTO_RE);
  return m ? m[0].replace(AUTO_START, '').replace(AUTO_END, '').trim() : null;
}

// ---------------------------------------------------------------------------
// HANDOFF.md: a fresh session's starting context. The deterministic part
// (snapshot, goal, decisions) is generated; only "what was tried and why it
// failed" needs a human or the model, because nothing else knows it.
// ---------------------------------------------------------------------------
export function handoffPath(root) {
  return join(root, '.claude', '.omh', 'HANDOFF.md');
}

export function renderHandoff(root, now = new Date()) {
  const state = readState(root);
  const manual = manualPart(state);
  const auto = renderAutoBlock(collectAutoState(root), now)
    .replace(AUTO_START, '').replace(AUTO_END, '').trim();
  const fill = '_(fill in)_';
  return [
    '# Handoff',
    '',
    `_Generated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC. Start the next session with this file._`,
    '',
    '## Tried',
    fill,
    '',
    '## Worked',
    fill,
    '',
    '## Failed (and why)',
    fill,
    '',
    '## Next steps',
    fill,
    '',
    ...(manual ? ['## From STATE.md', manual.replace(/^# Project State\s*/, '').trim(), ''] : []),
    auto,
    '',
  ].join('\n');
}

export function writeHandoff(root, now = new Date()) {
  const p = handoffPath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, renderHandoff(root, now));
  return p;
}
