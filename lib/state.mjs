/** Disk-anchored living project state (.claude/.omh/STATE.md). */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

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

export function stateSummary(root, maxLines = 10) {
  const s = readState(root);
  if (!s) return null;
  return s.split('\n').slice(0, maxLines).join('\n').trim();
}
