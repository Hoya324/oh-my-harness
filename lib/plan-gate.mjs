/**
 * oh-my-harness — plan gate core (pure, side-effect free).
 *
 * Decides whether a mutating tool should be DENIED because a Tier-3 prompt has
 * not yet been planned. The PreToolUse hook (hooks/plan-gate.mjs) gathers the
 * marker + tool name and feeds them in. Companion to lib/risk.mjs: same
 * pure-core / impure-wrapper split. A per-prompt maxDenials cap guarantees the
 * gate can never permanently wedge a session.
 */

export const DEFAULT_GATED = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'];

export function isGatedTool(tool, gatedTools) {
  return (gatedTools || DEFAULT_GATED).includes(tool);
}
export function isClearTool(tool) {
  return tool === 'ExitPlanMode';
}

function denyReason(state) {
  return `[omh:plan-gate] ⛔ Tier-${state.tier || 3} work — editing is blocked until you plan. Call EnterPlanMode and write an implementation plan with Context · Approach · Files to change · Verification, then present it for approval.`;
}

/**
 * @param {object|null} state - plan-gate.json marker contents
 * @param {{toolName:string, gatedTools?:string[], maxDenials?:number, featureOff?:boolean, disabled?:boolean}} signals
 * @returns {{action:'allow'|'deny'|'clear', reason:string, stopCause:string, nextState:object|null}}
 */
export function evaluatePlanGate(state, signals) {
  const s = signals || {};
  if (s.featureOff || s.disabled) return { action: 'allow', reason: '', stopCause: 'disabled', nextState: state };
  if (!state || state.required !== true) return { action: 'allow', reason: '', stopCause: 'not_required', nextState: state };

  // Exiting plan mode satisfies the requirement (clear point).
  if (isClearTool(s.toolName)) {
    return { action: 'clear', reason: '', stopCause: 'plan_done', nextState: { ...state, satisfied: true } };
  }
  if (state.satisfied === true) return { action: 'allow', reason: '', stopCause: 'satisfied', nextState: state };

  // Only gate mutating tools; reads + plan-mode entry pass so the model can investigate/plan.
  if (!isGatedTool(s.toolName, s.gatedTools)) {
    return { action: 'allow', reason: '', stopCause: 'ungated_tool', nextState: state };
  }

  const denials = state.denials || 0;
  const maxDenials = s.maxDenials ?? 3;
  if (denials >= maxDenials) {
    return {
      action: 'allow',
      reason: `[omh:plan-gate] ⚠️ Proceeding without a plan after ${denials} reminder(s) — consider EnterPlanMode for this Tier-${state.tier || 3} work.`,
      stopCause: 'max_denials',
      nextState: { ...state, satisfied: true },
    };
  }
  return { action: 'deny', reason: denyReason(state), stopCause: 'plan_required', nextState: { ...state, denials: denials + 1 } };
}
