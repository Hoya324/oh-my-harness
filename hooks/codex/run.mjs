#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { translateHookOutput } from './adapter.mjs';
import { loadConfig } from '../lib/hook-config.mjs';
import { evaluatePlanGate, isGatedTool } from '../../lib/plan-gate.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const EVENT_PIPELINES = Object.freeze({
  SessionStart: [
    { hookName: 'session-start.mjs', timeoutMs: 10_000, critical: false },
  ],
  UserPromptSubmit: [
    { hookName: 'pre-prompt.mjs', timeoutMs: 3_000, critical: false },
  ],
  PreToolUse: [
    { hookName: 'dangerous-guard.mjs', timeoutMs: 3_000, critical: true },
    { hookName: 'plan-gate.mjs', timeoutMs: 5_000, critical: true },
    { hookName: 'scope-guard.mjs', timeoutMs: 3_000, critical: true },
  ],
  PostToolUse: [
    { hookName: 'commit-convention.mjs', timeoutMs: 3_000, critical: false },
    { hookName: 'usage-tracker.mjs', timeoutMs: 3_000, critical: false },
  ],
  PreCompact: [
    { hookName: 'pre-compact.mjs', timeoutMs: 5_000, critical: false },
  ],
  Stop: [
    { hookName: 'loop-guard.mjs', timeoutMs: 600_000, critical: false },
    { hookName: 'verify-gate.mjs', timeoutMs: 600_000, critical: false },
    { hookName: 'post-task.mjs', timeoutMs: 5_000, critical: false },
  ],
});

const LEGACY_HOOK_EVENTS = new Map(
  Object.entries(EVENT_PIPELINES)
    .flatMap(([eventName, hooks]) => hooks.map(({ hookName }) => [hookName, eventName])),
);

function isValidPlanPayload(toolInput) {
  return Array.isArray(toolInput?.plan) &&
    toolInput.plan.length > 0 &&
    toolInput.plan.every((item) =>
      item &&
      typeof item.step === 'string' &&
      item.step.trim() &&
      ['pending', 'in_progress', 'completed'].includes(item.status));
}

export function inputForSharedHook(hookName, input) {
  if (hookName !== 'plan-gate.mjs') return input;
  const toolName = input?.tool_name || input?.toolName || '';
  if (toolName === 'apply_patch') {
    return { ...input, tool_name: 'Edit' };
  }
  const toolInput = input?.tool_input || input?.toolInput || {};
  if (toolName === 'update_plan' && isValidPlanPayload(toolInput)) {
    return { ...input, tool_name: 'ExitPlanMode' };
  }
  return input;
}

function defaultRunner({ hookName, input, timeoutMs, root, env }) {
  return spawnSync(process.execPath, [join(root, 'hooks', hookName)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env,
    timeout: timeoutMs,
  });
}

function failClosed(eventName, hookName, detail) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: eventName,
      permissionDecision: 'deny',
      permissionDecisionReason:
        `[omh:hook-bridge] ${hookName} could not complete its safety check (${detail}). ` +
        'The tool was denied; inspect the hook configuration and retry.',
    },
  });
}

function writePlanMarker(projectRoot, state) {
  const omhDir = join(projectRoot, '.claude', '.omh');
  const markerPath = join(omhDir, 'plan-gate.json');
  mkdirSync(omhDir, { recursive: true });
  const temporary = `${markerPath}.${process.pid}.codex.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, markerPath);
}

function codexPlanPreflight(input, env) {
  const projectRoot = env.PROJECT_PATH || process.cwd();
  const markerPath = join(projectRoot, '.claude', '.omh', 'plan-gate.json');
  if (!existsSync(markerPath)) return null;

  const normalized = inputForSharedHook('plan-gate.mjs', input);
  const toolName = normalized.tool_name || normalized.toolName || '';
  let state;
  try {
    state = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (!state || typeof state !== 'object' || Array.isArray(state) ||
        typeof state.required !== 'boolean') throw new Error('invalid marker shape');
  } catch {
    if (isGatedTool(toolName)) {
      return {
        handled: true,
        output: failClosed(
          'PreToolUse',
          'plan-gate',
          'the plan-gate marker is corrupt',
        ),
      };
    }
    // Do not invoke the shared hook: it deletes corrupt markers as part of its
    // Claude fail-open behavior, which would silently disarm the Codex gate.
    return { handled: true, output: '' };
  }

  // A valid explicit config is handled by the shared hook. When config is
  // absent/corrupt, retain the default-on gate rather than silently disarming
  // an already-armed marker.
  if (loadConfig(projectRoot)) return null;
  const result = evaluatePlanGate(state, {
    toolName,
    maxDenials: 3,
    featureOff: false,
    disabled: false,
    isPlanFile: false,
  });
  if (['plan_done', 'plan_required', 'max_denials'].includes(result.stopCause)) {
    writePlanMarker(projectRoot, result.nextState);
  }
  if (result.action === 'deny') {
    return {
      handled: true,
      output: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: result.reason,
        },
      }),
    };
  }
  if (result.reason) {
    return {
      handled: true,
      output: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: result.reason,
        },
      }),
    };
  }
  return { handled: true, output: '' };
}

function mergeOutputs(eventName, outputs) {
  if (outputs.length === 0) return '';
  const parsed = outputs.map((output) => JSON.parse(output));

  if (eventName === 'PreToolUse') {
    const denial = parsed.find((item) =>
      item.hookSpecificOutput?.permissionDecision === 'deny' ||
      item.decision === 'block');
    if (denial) return JSON.stringify(denial);
  }
  if (eventName === 'Stop') {
    const continuation = parsed.find((item) => item.decision === 'block');
    if (continuation) return JSON.stringify(continuation);
  }

  const contexts = parsed
    .map((item) => item.hookSpecificOutput?.additionalContext)
    .filter(Boolean);
  const messages = parsed.map((item) => item.systemMessage).filter(Boolean);
  if (contexts.length > 0) {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: contexts.join('\n'),
      },
    });
  }
  if (messages.length > 0) return JSON.stringify({ systemMessage: messages.join('\n') });
  return outputs.at(-1) || '';
}

/**
 * Run every shared hook for one Codex event in a deterministic sequence.
 * The injected runner keeps failure and ordering behavior directly testable.
 */
export function runHookPipeline(eventOrHook, input, options = {}) {
  const eventName = EVENT_PIPELINES[eventOrHook]
    ? eventOrHook
    : LEGACY_HOOK_EVENTS.get(eventOrHook);
  const descriptors = EVENT_PIPELINES[eventName];
  if (!descriptors) throw new Error(`Unsupported Codex hook event: ${eventOrHook}`);

  const selected = EVENT_PIPELINES[eventOrHook]
    ? descriptors
    : descriptors.filter(({ hookName }) => hookName === eventOrHook);
  const root = options.pluginRoot || pluginRoot;
  const env = options.env || process.env;
  const runner = options.runner || defaultRunner;
  const outputs = [];

  for (const descriptor of selected) {
    if (descriptor.hookName === 'plan-gate.mjs') {
      const preflight = codexPlanPreflight(input, env);
      if (preflight?.handled) {
        if (preflight.output) outputs.push(preflight.output);
        let parsed;
        try { parsed = JSON.parse(preflight.output); } catch { parsed = null; }
        if (parsed?.hookSpecificOutput?.permissionDecision === 'deny') break;
        continue;
      }
    }
    const childInput = inputForSharedHook(descriptor.hookName, input);
    let child;
    try {
      child = runner({ ...descriptor, input: childInput, root, env });
    } catch (error) {
      if (descriptor.critical) {
        return failClosed(eventName, descriptor.hookName, error?.message || 'execution error');
      }
      continue;
    }

    if (child?.error || child?.status !== 0) {
      if (descriptor.critical) {
        const detail = child?.error?.message || `exit ${child?.status ?? 'unknown'}`;
        return failClosed(eventName, descriptor.hookName, detail);
      }
      continue;
    }

    const output = translateHookOutput(descriptor.hookName, child.stdout, {
      eventName,
      critical: descriptor.critical,
      projectRoot: env.PROJECT_PATH || process.cwd(),
    });
    if (!output) continue;
    outputs.push(output);

    let parsed;
    try { parsed = JSON.parse(output); } catch { parsed = null; }
    if (eventName === 'PreToolUse' &&
        (parsed?.hookSpecificOutput?.permissionDecision === 'deny' ||
         parsed?.decision === 'block')) break;
    if (eventName === 'Stop' && parsed?.decision === 'block') break;
  }

  return mergeOutputs(eventName, outputs);
}

function main() {
  const eventName = process.argv[2];
  const stdin = readFileSync(0, 'utf8');
  let input;
  try {
    input = JSON.parse(stdin || '{}');
  } catch {
    if (eventName === 'PreToolUse') {
      process.stdout.write(`${failClosed('PreToolUse', 'input', 'malformed JSON')}\n`);
    }
    return;
  }

  try {
    const output = runHookPipeline(eventName, input);
    if (output) process.stdout.write(`${output}\n`);
  } catch {
    process.exitCode = 1;
  }
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
