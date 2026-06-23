#!/usr/bin/env node
/**
 * Plan Gate — PreToolUse hook. For a Tier-3 prompt (armed by pre-prompt.mjs via
 * .claude/.omh/plan-gate.json), DENY mutating tools (Edit/Write/NotebookEdit/
 * MultiEdit) until ExitPlanMode clears the marker. Read-only tools always pass.
 * A per-prompt maxDenials cap guarantees it can never wedge a session. Fail-open.
 *
 * All decision logic lives in the pure lib/plan-gate.mjs::evaluatePlanGate.
 */
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { hookPreToolDeny, hookOutput, hookSilent, hookDebug } from './lib/output.mjs';
import { loadConfig } from './lib/hook-config.mjs';
import { evaluatePlanGate } from '../lib/plan-gate.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const omhDir = join(projectRoot, '.claude', '.omh');
const markerPath = join(omhDir, 'plan-gate.json');

function readStdin() { try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; } }
function writeMarkerAtomic(state) {
  mkdirSync(omhDir, { recursive: true });
  const tmp = `${markerPath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, markerPath);
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }
  const config = loadConfig(projectRoot);
  if (!config || config.features?.planGate === false) { console.log(hookSilent()); process.exit(0); }

  // No marker -> nothing armed.
  if (!existsSync(markerPath)) { console.log(hookSilent()); process.exit(0); }
  let state = null;
  try { state = JSON.parse(readFileSync(markerPath, 'utf8')); }
  catch { try { unlinkSync(markerPath); } catch {} console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const toolName = input.tool_name || input.toolName || '';
  const cfg = config.planGate || {};

  const result = evaluatePlanGate(state, {
    toolName,
    gatedTools: cfg.gatedTools,
    maxDenials: cfg.maxDenials ?? 3,
    featureOff: false,
    disabled: false,
  });

  // Persist only when the state actually changed (clear / deny / max-denials).
  // stopCause values come from evaluatePlanGate: 'plan_done' (clear),
  // 'plan_required' (deny), 'max_denials' (allow-after-cap).
  if (['plan_done', 'plan_required', 'max_denials'].includes(result.stopCause)) {
    try { writeMarkerAtomic(result.nextState); } catch (e) { hookDebug('plan-gate:write', e); }
  }

  if (result.action === 'deny') { console.log(hookPreToolDeny(result.reason)); process.exit(0); }
  if (result.reason) { console.log(hookOutput('PreToolUse', result.reason)); process.exit(0); } // warn-allow
  console.log(hookSilent());
  process.exit(0);
} catch (e) {
  hookDebug('plan-gate', e);
  console.log(hookSilent());
  process.exit(0);
}
