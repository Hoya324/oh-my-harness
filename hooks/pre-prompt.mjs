#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';
import { getDictionary } from './lib/dictionary.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const prompt = input.prompt || input.message || '';
  if (!prompt.trim()) { console.log(hookSilent()); process.exit(0); }

  const dict = getDictionary(prompt);
  const { patterns, messages } = dict;
  const result = [];

  // 4-A: Multi-task detection → Auto-Plan
  if (config.features?.autoPlanMode) {
    const threshold = config.autoPlan?.threshold || 3;
    let taskCount = 0;
    const numbered = prompt.match(/^\s*\d+[\.\)]/gm);
    if (numbered) taskCount = Math.max(taskCount, numbered.length);
    const bullets = prompt.match(/^\s*[-*]\s+\S/gm);
    if (bullets) taskCount = Math.max(taskCount, bullets.length);
    const conjunctions = prompt.match(patterns.conjunctions);
    if (conjunctions) taskCount = Math.max(taskCount, conjunctions.length + 1);
    // Comma-separated noun phrases: "기능, 성능, 컨벤션" or "features, performance, conventions"
    const commaItems = prompt.match(/[\w가-힣]+(?:\s*,\s*[\w가-힣]+){2,}/g);
    if (commaItems) {
      const maxItems = Math.max(...commaItems.map(m => m.split(',').length));
      taskCount = Math.max(taskCount, maxItems);
    }
    if (taskCount >= threshold) {
      result.push(messages.autoPlan(taskCount));
    }
  }

  // 4-B: Ambiguity detection → AskUserQuestion enforcement
  if (config.features?.ambiguityDetection) {
    const ambThreshold = config.ambiguityDetection?.threshold || 2;
    let ambiguityScore = 0;
    if (patterns.vaguePronouns.test(prompt)) ambiguityScore++;
    if (patterns.vagueVerbs.test(prompt) && !patterns.targetNouns.test(prompt)) ambiguityScore++;
    if (patterns.vagueExpressions.test(prompt)) ambiguityScore++;
    if (patterns.openEndedScope.test(prompt)) ambiguityScore++;
    if (prompt.trim().length <= 15 && !/[A-Za-z_]\w*[\./]/.test(prompt)) ambiguityScore++;
    if (ambiguityScore >= ambThreshold) {
      result.push(messages.ambiguityGuard);
    }
  }

  if (result.length > 0) {
    console.log(hookOutput('UserPromptSubmit', result.join('\n')));
  }
} catch {
  console.log(hookSilent());
}
