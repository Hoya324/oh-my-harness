#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';
import { getDictionary } from './lib/dictionary.mjs';
import { classifyTier, countTasks, parseOverrides } from './lib/tier.mjs';
import { setDecisionMeta } from '../lib/decision-log.mjs';
import { loadConfig } from './lib/hook-config.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  config = loadConfig(projectRoot); if (!config) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const rawPrompt = input.prompt || input.message || '';
  if (!rawPrompt.trim()) { console.log(hookSilent()); process.exit(0); }
  // `!t1` / `!t3` / `!noplan` prefixes override the classifier for this prompt.
  const overrides = parseOverrides(rawPrompt);
  const prompt = overrides.rest || rawPrompt;

  const dict = getDictionary(prompt);
  const { patterns, messages } = dict;
  const result = [];

  // 4-A: Multi-task detection → Auto-Plan
  if (config.features?.autoPlanMode) {
    const threshold = config.autoPlan?.threshold || 3;
    const taskCount = countTasks(prompt, patterns);
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

  // 4-C: Tier classification → weight-proportional routing
  const classification = classifyTier(prompt, config);
  if (overrides.tier) {
    classification.reasons.push(`override:t${overrides.tier} (classifier said ${classification.tier})`);
    classification.tier = overrides.tier;
  }
  if (overrides.tokens.length) {
    result.push(`[omh:override] ${overrides.tokens.join(' ')} applied by the user — treat these tokens as harness directives, not as part of the task.`);
  }
  if (config.features?.weightRouting) {
    result.push(messages.tierNotice(classification.tier, classification.reasons));
    if (classification.tier === 3) {
      result.push(messages.tier3Reminder);
    }
  }

  // Persist the classified tier so the verify-gate (Stop hook) can use it as a
  // risk floor at end-of-turn. Own try/catch — a write failure must never break
  // prompt submission (fail-open: the gate just loses the floor, diff-risk stays).
  if (config.features?.verifyGate !== false) {
    try {
      const omhDir = join(projectRoot, '.claude', '.omh');
      mkdirSync(omhDir, { recursive: true });
      const tmp = join(omhDir, `last-prompt.json.${process.pid}.tmp`);
      writeFileSync(tmp, JSON.stringify({ tier: classification.tier, sessionId: input.session_id || input.sessionId || null, ts: Date.now() }));
      renameSync(tmp, join(omhDir, 'last-prompt.json'));
    } catch { /* fail-open */ }
  }

  // Arm / disarm the plan gate for this prompt (Tier >= minTier => require a plan
  // before any edit). Own try/catch — fail-open: on error the gate just isn't armed.
  if (config.features?.planGate !== false) {
    try {
      const omhDir = join(projectRoot, '.claude', '.omh');
      mkdirSync(omhDir, { recursive: true });
      const minTier = config.planGate?.minTier ?? 3;
      const armed = !overrides.noPlan && classification.tier >= minTier;
      let promptId = 1;
      try { promptId = (JSON.parse(readFileSync(join(omhDir, 'plan-gate.json'), 'utf8')).promptId || 0) + 1; } catch {}
      const marker = {
        required: armed, satisfied: false, denials: 0,
        tier: classification.tier, promptId,
        sessionId: input.session_id || input.sessionId || null, ts: Date.now(),
      };
      const tmp = join(omhDir, `plan-gate.json.${process.pid}.tmp`);
      writeFileSync(tmp, JSON.stringify(marker));
      renameSync(tmp, join(omhDir, 'plan-gate.json'));
      if (armed) {
        result.push(`[omh:plan-gate] Tier-${classification.tier} work detected — before editing any file you MUST call EnterPlanMode and write an implementation plan (Context · Approach · Files to change · Verification). Editing is blocked until the plan is presented and approved.`);
      }
    } catch { /* fail-open: gate just isn't armed */ }
  }

  if (result.length > 0) {
    // Explain this prompt's routing in the Decision Log (no prompt text stored).
    setDecisionMeta({
      tier: classification.tier,
      reasons: classification.reasons,
      taskCount: classification.taskCount,
      override: overrides.tokens.length ? overrides.tokens.join(' ') : undefined,
      sessionId: input.session_id || input.sessionId || undefined,
    });
    console.log(hookOutput('UserPromptSubmit', result.join('\n')));
  }
} catch {
  console.log(hookSilent());
}
