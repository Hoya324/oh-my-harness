export function translateHookOutput(hookName, raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return JSON.stringify({ systemMessage: text }); }

  const context = parsed.hookSpecificOutput?.additionalContext;
  if ((hookName === 'dangerous-guard.mjs' && context?.includes('[omh:dangerous-guard]')) ||
      (hookName === 'scope-guard.mjs' && context?.includes('[omh:scope-guard]'))) {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: context,
      },
    });
  }

  if (parsed.suppressOutput === true &&
      !parsed.systemMessage &&
      !parsed.decision &&
      !parsed.hookSpecificOutput?.additionalContext) return '';

  delete parsed.suppressOutput;
  if (parsed.continue === true &&
      !parsed.systemMessage &&
      !parsed.decision &&
      !parsed.hookSpecificOutput) return '';
  return JSON.stringify(parsed);
}
