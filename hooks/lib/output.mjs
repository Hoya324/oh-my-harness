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

/**
 * Stop-hook continuation contract.
 *
 * To force Claude to CONTINUE (not stop), a Stop hook must emit the decision as
 * TOP-LEVEL JSON keys (`{ "decision": "block", "reason": ... }`) and exit 0.
 * This is intentionally NOT `hookBlock()` above — that helper nests `decision`
 * inside `hookSpecificOutput`, which is the PreToolUse/UserPromptSubmit shape and
 * is silently ignored by the Stop event, so the loop would never continue.
 * Never use exit code 2 for this: it is broken for plugin-distributed hooks
 * (Claude prints "Stop hook prevented continuation" and halts).
 *
 * @param {string} reason - Instruction fed back to the model as the next turn.
 * @returns {string} JSON to print on stdout (then exit 0).
 */
export function hookStopContinue(reason) {
  return JSON.stringify({ decision: 'block', reason });
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

