/**
 * Decision Log — an always-on, append-only record of what each OMH hook decided
 * and why, so a blocked Stop or a Tier-3 classification is never a black box.
 *
 * File: <project>/.claude/.omh/decisions.jsonl (one JSON object per line).
 *
 * Privacy: prompt text and file contents are NEVER stored — only the hook name,
 * the decision, the [omh:*] tags it emitted, and classifier reasons.
 *
 * Every function here is fail-open: logging must never change a hook's result.
 */
import {
  appendFileSync, existsSync, readFileSync, statSync, writeFileSync,
} from 'fs';
import { join, basename } from 'path';

export const DECISIONS = ['context', 'warn', 'block', 'deny', 'override'];
export const MAX_LINES = 500;
const TRIM_TO = 400;
const TRIM_CHECK_BYTES = 128 * 1024;

export function decisionLogPath(root) {
  return join(root, '.claude', '.omh', 'decisions.jsonl');
}

/** Names of [omh:*] tags in a message, e.g. ['omh:tier', 'omh:plan-gate']. */
export function extractTags(message) {
  const found = String(message || '').match(/\[omh:[\w-]+/g) || [];
  return [...new Set(found.map((t) => t.slice(1)))];
}

let pendingMeta = null;

/**
 * Attach structured metadata (tier, reasons, promptId...) to the NEXT decision
 * this process records. Lets a hook explain itself without changing its output.
 */
export function setDecisionMeta(meta) {
  pendingMeta = meta && typeof meta === 'object' ? { ...meta } : null;
}

function isDisabled(env) {
  return env.OMH_DECISION_LOG === '0' || env.OMH_DECISION_LOG === 'false';
}

/**
 * Keep the log bounded. Reading the file on every hook call would cost more
 * than the hook itself, so the line count is only checked once the file is
 * past a byte threshold (~500 average-sized lines).
 */
export function trimIfLarge(path, thresholdBytes = TRIM_CHECK_BYTES) {
  try {
    if (statSync(path).size < thresholdBytes) return;
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= MAX_LINES && statSync(path).size < thresholdBytes * 2) return;
    writeFileSync(path, lines.slice(-TRIM_TO).join('\n') + '\n');
  } catch { /* fail-open */ }
}

/**
 * Append one decision. Only writes when the project already has an OMH state
 * directory — logging must never create .claude/.omh in an unrelated repo.
 *
 * @param {{hook?: string, event?: string, decision: string, message?: string,
 *          reasons?: string[], [k: string]: unknown}} entry
 * @param {{root?: string, env?: object, now?: () => number}} [opts]
 * @returns {boolean} whether a line was written
 */
export function recordDecision(entry, opts = {}) {
  const env = opts.env || process.env;
  try {
    if (isDisabled(env)) return false;
    const root = opts.root || env.PROJECT_PATH || process.cwd();
    const omh = join(root, '.claude', '.omh');
    if (!existsSync(omh)) return false;
    const failNames = String(env.OMH_TEST_FAIL_WRITE || '').split(',').map((s) => s.trim());
    if (failNames.includes('*') || failNames.includes('decisions')) return false;

    const meta = pendingMeta || {};
    pendingMeta = null;
    const { message, ...rest } = entry || {};
    const line = {
      ts: new Date((opts.now || Date.now)()).toISOString(),
      hook: rest.hook || hookNameFromArgv(),
      ...rest,
      tags: extractTags(message),
      ...meta,
      durationMs: Math.round(process.uptime() * 1000),
    };
    if (!line.sessionId && env.OMH_SESSION_ID) line.sessionId = env.OMH_SESSION_ID;
    const path = decisionLogPath(root);
    appendFileSync(path, JSON.stringify(line) + '\n');
    trimIfLarge(path);
    return true;
  } catch {
    return false;
  }
}

export function hookNameFromArgv(argv = process.argv) {
  const script = argv && argv[1] ? basename(argv[1]).replace(/\.m?js$/, '') : 'unknown';
  return script || 'unknown';
}

/** Read decisions (oldest first). Malformed lines are skipped. */
export function readDecisions(root) {
  const path = decisionLogPath(root);
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    try { out.push(JSON.parse(raw)); } catch { /* skip */ }
  }
  return out;
}

/**
 * Aggregate decisions for `oh-my-harness why` and weekly metrics.
 * @returns {{total:number, byHook:Record<string,Record<string,number>>,
 *            overrides:number, prompts:number, overrideRate:number|null,
 *            stopMs:{p50:number|null,p95:number|null}}}
 */
export function summarizeDecisions(entries) {
  const byHook = {};
  let overrides = 0;
  let prompts = 0;
  const stopDurations = [];
  for (const e of entries) {
    const hook = e.hook || 'unknown';
    byHook[hook] = byHook[hook] || {};
    byHook[hook][e.decision] = (byHook[hook][e.decision] || 0) + 1;
    if (e.event === 'UserPromptSubmit' && e.tier != null) prompts += 1;
    if (e.override) overrides += 1;
    if (e.event === 'Stop' && typeof e.durationMs === 'number') stopDurations.push(e.durationMs);
  }
  stopDurations.sort((a, b) => a - b);
  const pct = (p) => (stopDurations.length
    ? stopDurations[Math.min(stopDurations.length - 1, Math.floor(p * stopDurations.length))]
    : null);
  return {
    total: entries.length,
    byHook,
    overrides,
    prompts,
    overrideRate: prompts ? overrides / prompts : null,
    stopMs: { p50: pct(0.5), p95: pct(0.95) },
  };
}

/** Human-readable one-liner for a decision entry. */
export function formatDecision(e) {
  const time = String(e.ts || '').replace('T', ' ').slice(0, 19);
  const parts = [`${time}  ${e.hook || '?'}  ${String(e.decision || '?').toUpperCase()}`];
  if (e.tier != null) parts.push(`tier=${e.tier}`);
  if (e.override) parts.push(`override=${e.override}`);
  if (e.tags && e.tags.length) parts.push(e.tags.join(','));
  if (e.reasons && e.reasons.length) parts.push(`reasons: ${e.reasons.join('; ')}`);
  return parts.join('  ');
}
