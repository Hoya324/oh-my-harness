/**
 * Task-weight classifier for oh-my-harness.
 * Pure logic — no I/O — so it is unit-testable.
 */
import { getDictionary } from './dictionary.mjs';

/**
 * Count independent tasks in a prompt using the language patterns.
 * Mirrors the heuristic previously inlined in pre-prompt.mjs.
 * @param {string} prompt
 * @param {object} patterns - from getDictionary(prompt).patterns
 * @returns {number}
 */
export function countTasks(prompt, patterns) {
  let count = 0;
  const numbered = prompt.match(/^\s*\d+[\.\)]/gm);
  if (numbered) count = Math.max(count, numbered.length);
  const bullets = prompt.match(/^\s*[-*]\s+\S/gm);
  if (bullets) count = Math.max(count, bullets.length);
  const conjunctions = prompt.match(patterns.conjunctions);
  if (conjunctions) count = Math.max(count, conjunctions.length + 1);
  const commaItems = prompt.match(/[\w가-힣]+(?:\s*,\s*[\w가-힣]+){2,}/g);
  if (commaItems) {
    const maxItems = Math.max(...commaItems.map((m) => m.split(',').length));
    count = Math.max(count, maxItems);
  }
  return count;
}

/**
 * Classify a prompt into Tier 1 (light) / 2 (standard) / 3 (heavy).
 * Conservative: any up-signal wins (don't-miss-it priority).
 * @param {string} prompt
 * @param {object} [config] - harness config (uses config.tier3)
 * @returns {{ tier: 1|2|3, reasons: string[], taskCount: number }}
 */
export function classifyTier(prompt, config = {}) {
  const text = String(prompt || '');
  const { patterns } = getDictionary(text);
  const t3 = config.tier3 || {};
  const taskThreshold = t3.taskThreshold ?? 5;
  const reasons = [];
  let up = 0;
  let down = 0;

  if (patterns.weightUp && patterns.weightUp.test(text)) {
    up++;
    reasons.push('weight-up expression');
  }
  if (patterns.weightDown && patterns.weightDown.test(text)) {
    down++;
    reasons.push('weight-down expression');
  }
  for (const kw of t3.domainKeywords || []) {
    if (kw && text.includes(kw)) {
      up++;
      reasons.push(`domain:${kw}`);
    }
  }
  const taskCount = countTasks(text, patterns);
  if (taskCount >= taskThreshold) {
    up++;
    reasons.push(`tasks:${taskCount}`);
  }

  let tier;
  if (up > 0) tier = 3;
  else if (down > 0) tier = 1;
  else tier = 2;

  return { tier, reasons, taskCount };
}
