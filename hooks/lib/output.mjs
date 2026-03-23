/**
 * Hook output helpers — standardized JSON format for Claude Code hooks.
 */
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

export function hookOutput(hookEventName, additionalContext) {
  return JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  });
}

export function hookBlock(hookEventName, reason) {
  return JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName,
      additionalContext: reason,
      decision: { block: true, reason },
    },
  });
}

export function hookWarn(hookEventName, additionalContext) {
  return JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
      decision: { block: false, reason: additionalContext },
    },
  });
}

export function hookCompact(systemMessage) {
  return JSON.stringify({
    continue: true,
    systemMessage,
  });
}

export function hookSilent() {
  return JSON.stringify({ continue: true, suppressOutput: true });
}

export function hookDebug(hookName, error) {
  if (!process.env.OMH_DEBUG) return;
  try {
    const { appendFileSync, mkdirSync } = _require('fs');
    const { join } = _require('path');
    const root = process.env.PROJECT_PATH || process.cwd();
    const logDir = join(root, '.claude', '.omh');
    mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const msg = `[${timestamp}] ${hookName}: ${error.message || error}\n${error.stack || ''}\n`;
    appendFileSync(join(logDir, 'debug.log'), msg);
  } catch { /* debug logging should never break hooks */ }
}

