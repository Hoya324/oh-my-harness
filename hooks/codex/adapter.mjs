import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../lib/hook-config.mjs';

const HOOK_EVENTS = Object.freeze({
  'session-start.mjs': 'SessionStart',
  'pre-prompt.mjs': 'UserPromptSubmit',
  'dangerous-guard.mjs': 'PreToolUse',
  'plan-gate.mjs': 'PreToolUse',
  'scope-guard.mjs': 'PreToolUse',
  'commit-convention.mjs': 'PostToolUse',
  'usage-tracker.mjs': 'PostToolUse',
  'pre-compact.mjs': 'PreCompact',
  'loop-guard.mjs': 'Stop',
  'verify-gate.mjs': 'Stop',
  'post-task.mjs': 'Stop',
});

function denial(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function parseRecords(text) {
  if (!text) return [];
  try { return [JSON.parse(text)]; }
  catch {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const records = [];
    try {
      for (const line of lines) records.push(JSON.parse(line));
      return records;
    } catch {
      return null;
    }
  }
}

function hasMeaningfulOutput(record) {
  return Boolean(
    record?.systemMessage ||
    record?.decision ||
    record?.reason ||
    record?.hookSpecificOutput?.additionalContext ||
    record?.hookSpecificOutput?.permissionDecision,
  );
}

function sanitizeRecord(hookName, record, eventName) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (record.suppressOutput === true && !hasMeaningfulOutput(record)) return null;

  const context = record.hookSpecificOutput?.additionalContext;
  const nestedDecision = record.hookSpecificOutput?.decision;
  if (eventName === 'PreToolUse') {
    const guardWarning =
      (hookName === 'dangerous-guard.mjs' && context?.includes('[omh:dangerous-guard]')) ||
      (hookName === 'scope-guard.mjs' && context?.includes('[omh:scope-guard]'));
    if (guardWarning || nestedDecision?.block === true) {
      return denial(
        record.hookSpecificOutput?.permissionDecisionReason ||
        nestedDecision?.reason ||
        context ||
        `[omh:hook-bridge] ${hookName} denied the tool.`,
      );
    }

    const permissionDecision = record.hookSpecificOutput?.permissionDecision;
    if (permissionDecision) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision,
          ...(record.hookSpecificOutput?.permissionDecisionReason
            ? { permissionDecisionReason: record.hookSpecificOutput.permissionDecisionReason }
            : {}),
          ...(context ? { additionalContext: context } : {}),
        },
      };
    }
    if (record.decision === 'block') {
      return denial(record.reason || `[omh:hook-bridge] ${hookName} denied the tool.`);
    }
    if (context) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: context,
        },
      };
    }
    return record.systemMessage ? { systemMessage: record.systemMessage } : null;
  }

  if (eventName === 'Stop' && record.decision === 'block') {
    return { decision: 'block', reason: record.reason || 'Continue the task.' };
  }

  if (context) {
    return {
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: context,
      },
    };
  }
  if (record.systemMessage) return { systemMessage: record.systemMessage };
  if (record.decision) {
    return {
      decision: record.decision,
      ...(record.reason ? { reason: record.reason } : {}),
    };
  }
  return null;
}

function shouldAddCodexSkillHint(projectRoot) {
  if (!projectRoot) return false;
  let config;
  try { config = loadConfig(projectRoot); } catch { return false; }
  return Boolean(
    config?.features?.conventionSetup &&
    config.features?.skillScaffolding !== false &&
    !existsSync(join(projectRoot, '.agents', 'skills')),
  );
}

function mergeRecords(eventName, records) {
  if (records.length === 0) return '';
  if (eventName === 'PreToolUse') {
    const denied = records.find((record) =>
      record.hookSpecificOutput?.permissionDecision === 'deny');
    if (denied) return JSON.stringify(denied);
  }
  if (eventName === 'Stop') {
    const continuation = records.find((record) => record.decision === 'block');
    if (continuation) return JSON.stringify(continuation);
  }

  const contexts = [...new Set(records
    .map((record) => record.hookSpecificOutput?.additionalContext)
    .filter(Boolean))];
  const messages = [...new Set(records.map((record) => record.systemMessage).filter(Boolean))];
  if (contexts.length > 0) {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: contexts.join('\n'),
      },
    });
  }
  if (messages.length > 0) return JSON.stringify({ systemMessage: messages.join('\n') });
  return '';
}

/**
 * Convert one shared Claude hook's stdout to a single Codex hook response.
 * Shared SessionStart hooks may emit several newline-delimited JSON records.
 */
export function translateHookOutput(hookName, raw, options = {}) {
  const eventName = options.eventName || HOOK_EVENTS[hookName] || 'SessionStart';
  const text = String(raw || '').trim();
  const parsed = parseRecords(text);
  if (parsed === null) {
    if (options.critical && eventName === 'PreToolUse') {
      return JSON.stringify(denial(
        `[omh:hook-bridge] ${hookName} returned malformed output; the safety check could not be verified.`,
      ));
    }
    return text ? JSON.stringify({ systemMessage: text }) : '';
  }

  const sanitized = parsed
    .map((record) => sanitizeRecord(hookName, record, eventName))
    .filter(Boolean);

  if (eventName === 'SessionStart') {
    const withoutClaudeSkillHint = sanitized.filter((record) =>
      !record.hookSpecificOutput?.additionalContext?.includes('[omh:skill-hint]'));
    if (shouldAddCodexSkillHint(options.projectRoot)) {
      withoutClaudeSkillHint.push({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext:
            '[omh:skill-hint] No Codex project skills found in .agents/skills. ' +
            'Run /init-project to scaffold.',
        },
      });
    }
    return mergeRecords(eventName, withoutClaudeSkillHint);
  }

  return mergeRecords(eventName, sanitized);
}
