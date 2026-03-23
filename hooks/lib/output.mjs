/**
 * Hook output helpers — standardized JSON format for Claude Code hooks.
 */

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

