# Plan Gate — Design Spec

> Date: 2026-06-23 · Status: approved (design), pending implementation
> Companion to the Risk-Gated Verify Gate (`lib/risk.mjs` + `hooks/verify-gate.mjs`).

## Context

OMH already classifies every prompt by weight (`hooks/lib/tier.mjs::classifyTier` → Tier 1/2/3) and has a soft Auto-Plan reminder (`pre-prompt.mjs` suggests plan mode on 3+ tasks). But for genuinely heavy work, "write a plan first" is only a CLAUDE.md instruction the model can skip — there is no hard wall. The user wants: **when a command arrives, assess the work volume, and for heavy (Tier 3) work, mandatorily produce a structured implementation plan and enter Claude's plan mode before any code is written** — owned by the harness, not the model's self-assessment.

This mirrors the philosophy just shipped in the Verify Gate: the deterministic part (detect + enforce) is the harness's; the action (planning) is the model's, but the harness makes it non-optional via a real wall.

**Key constraint (load-bearing):** a hook **cannot** switch Claude into plan mode — only the model calling `EnterPlanMode` (or the user) can. So "mandatory plan mode" is enforced indirectly: a `PreToolUse` hook **denies mutating tools** until the model has planned, which forces it to call `EnterPlanMode` and present a plan.

## Locked decisions

1. **Enforcement = PreToolUse hard gate.** Heavy prompt → editing tools are denied until a plan is produced. (Not a soft reminder.)
2. **Trigger = Tier 3** (configurable `planGate.minTier`, default 3), reusing the existing prompt-weight classifier. Assessment happens at prompt time (no diff yet).
3. **Artifact = native plan mode + superpowers structure.** The model enters plan mode and writes an implementation plan with **Context · Approach · Files to change · Verification**. The gate clears on `ExitPlanMode`.

## Non-goals (v1)

- Gating `Bash` (an `echo > file` write can bypass; rare, suppressed by the directive — see Limitations).
- Mid-session escalation from accumulated diff size (the Verify Gate already covers end-of-turn diff risk; Plan Gate triggers at prompt time only).
- A separate committed `SPEC.md` (EARS) — that remains the `/omh-spec` + loop path; Plan Gate uses the in-plan-mode plan.

## Architecture

Same pure-core / impure-wrapper split as the Verify Gate.

### Flow
```
① UserPromptSubmit — pre-prompt.mjs
   classifyTier(prompt) ≥ planGate.minTier (3)
     → write .claude/.omh/plan-gate.json
        { required:true, sessionId, promptId, denials:0, satisfied:false, ts }
     → inject directive (enter plan mode + superpowers-structure plan)

② PreToolUse — plan-gate.mjs  (matcher "*", branch by tool_name)
   - read-only tools (Read/Grep/Glob/LS/EnterPlanMode/…) → allow (must investigate to plan)
   - ExitPlanMode                                 → mark satisfied:true, allow  ← clear point
   - gated mutating tools (Edit/Write/NotebookEdit/MultiEdit):
       required && !satisfied:
         denials ≥ maxDenials → allow + warning   (NEVER-WEDGE)
         else                 → denials++, DENY with the plan directive
       else                   → allow

③ Model: EnterPlanMode → (plan mode blocks edits natively) → writes plan → ExitPlanMode (approved)
   → satisfied:true → edits flow.
```

### Components
- **`lib/plan-gate.mjs`** (new, pure) — `evaluatePlanGate(state, signals) → { action:'allow'|'deny'|'clear', reason, nextState }`. No fs/git/time. Helpers: `isGatedTool`, `isClearTool` (ExitPlanMode). Mirrors `lib/risk.mjs`.
- **`hooks/plan-gate.mjs`** (new, impure, PreToolUse) — reads the marker, calls `evaluatePlanGate`, emits the PreToolUse decision, persists state atomically, fail-open.
- **`hooks/pre-prompt.mjs`** (modify) — after the existing `classifyTier`, when tier ≥ `minTier` write/refresh the `plan-gate.json` marker (fresh `promptId` per prompt) and append the directive to the injected context. Own try/catch.
- **`lib/config.mjs` + template** (modify) — `features.planGate` (default `true`) + `planGate { minTier:3, maxDenials:3, gatedTools:["Edit","Write","NotebookEdit","MultiEdit"] }`.
- **`hooks/hooks.json`** (modify) — add `plan-gate.mjs` to `PreToolUse` (matcher `*`), alongside `dangerous-guard.mjs`.

### Marker file — `.claude/.omh/plan-gate.json`
Per-prompt. `promptId` distinguishes prompts (monotonic counter from prior marker, or a hash). A new UserPromptSubmit overwrites it, so the requirement never leaks across prompts. Tier 1/2 prompts write `required:false` (or remove the marker) so the gate is inert.

### PreToolUse deny contract
Deny via the PreToolUse permission shape: `{ hookSpecificOutput: { hookEventName:"PreToolUse", permissionDecision:"deny", permissionDecisionReason:"…" } }` (verify the exact shape against Claude Code during implementation; fall back to legacy `{decision:"block",reason}` if needed). Allow uses the standard `{continue:true,…}` / silent passthrough.

### Injected directive (superpowers structure)
> `[omh:plan-gate] Tier-3 work detected (<reasons>). Before editing any file you MUST call EnterPlanMode and write an implementation plan with: **Context** (why) · **Approach** · **Files to change** · **Verification**. Editing is blocked until the plan is presented and approved.`

## Never-wedge guardrails (required — this gate denies edits every session)
- **`maxDenials` cap** (default 3) per `promptId` → after N denials, allow with a warning. Guarantees the model is never permanently blocked.
- **Per-prompt scope** — marker is overwritten each UserPromptSubmit; only Tier-≥`minTier` prompts arm it.
- **Read-only tools never gated** — the model must be able to investigate to write a good plan.
- **Off switches** — `features.planGate:false`, `DISABLE_HARNESS`, a `STOP`/skip sentinel.
- **Fail-open** — any error / corrupt marker → allow (never trap the user).
- **Defer-to-nothing** — independent of the loop/verify gates (different event, different concern).

## Known limitations (documented, accepted for v1)
1. **Bash bypass.** Only Edit/Write/NotebookEdit/MultiEdit are gated. A determined `echo > file` via Bash slips through. Gating all Bash would block investigation commands and harm the planning flow, so it is out of scope for v1; the directive discourages it.
2. **Clearing signal.** `satisfied` is set when `ExitPlanMode` is called. If the user rejects the plan, the model stays in plan mode where edits are blocked natively (independent of our marker), so a prematurely-set `satisfied` is harmless.

## Config
```jsonc
"features": { "planGate": true },
"planGate": {
  "minTier": 3,                 // tier ≥ this arms the gate
  "maxDenials": 3,              // hard cap of denies per prompt (never-wedge)
  "gatedTools": ["Edit", "Write", "NotebookEdit", "MultiEdit"]
}
```

## Testing
- **`test/plan-gate.test.mjs`** (pure): required+unsatisfied → deny; read-only tool → allow; satisfied → allow; `EnterPlanMode`/`ExitPlanMode` → clear (satisfied); **maxDenials reached → allow** (never-wedge); not-required → allow; off → allow.
- **`test/plan-gate-hook.test.mjs`** (integration, spawn the hook): deny an `Edit` when the marker is armed; allow after an `ExitPlanMode` cleared it; never-wedge after `maxDenials`; `features.planGate:false`/`DISABLE_HARNESS` → allow; corrupt marker → fail-open allow.
- Full suite stays green (currently 230 → +~15).

## Acceptance criteria
1. A Tier-3 prompt arms the marker and injects the plan directive; a Tier-1/2 prompt does not.
2. With the marker armed, an `Edit`/`Write`/`NotebookEdit`/`MultiEdit` is **denied** with the `[omh:plan-gate]` directive; `Read`/`Grep`/etc. are allowed.
3. After `ExitPlanMode`, the same edit is **allowed**.
4. After `maxDenials` denials on one prompt, the edit is allowed (no permanent wedge).
5. `features.planGate:false`, `DISABLE_HARNESS`, and a corrupt marker all result in allow (fail-open).
6. Decision logic is pure and unit-tested in `lib/plan-gate.mjs`.
