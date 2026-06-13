# OMH Autonomous Loop — Design Spec

> Status: approved (2026-06-13) · Target version: oh-my-harness 0.2.0
> Author: brainstormed with the user; design hardened by a fan-out web-research pass (9 agents, 8 angles) whose findings are cited inline.

## 1. Context & motivation

oh-my-harness (OMH) today is a *thin guard layer* over Claude Code: hooks that warn (test enforcement, dangerous-op guard, ambiguity guard) plus multi-agent/team skills. Its stated philosophy is "minimal guards, warnings instead of walls."

The user wants OMH to evolve into a **spec-driven autonomous harness**: define a goal once, and OMH loops — implementing, **self-verifying**, and **cross-verifying** — until the spec is objectively met, with *enforceable* guardrails so autonomy never becomes runaway. This is the OMH-native absorption of the "Ralph Wiggum loop" / `/goal` / `/loop` family of agentic-loop patterns.

This is a deliberate identity shift: from "warnings instead of walls" to **"autonomy with real walls"** — the loop *forces continuation* and *forces termination*, both owned by the harness, not the model's self-assessment.

## 2. Goals / non-goals

**Goals**
- A Stop-hook-driven, in-session autonomous loop that continues until an objective stop condition.
- **Tiered** effort: `quick` / `standard` / `deep` set iteration & wall-clock budgets and verification depth; default to cheapest tier, escalate on signals.
- **Cheap-first verification ladder** (deterministic checks → self-review → cross-verify agent) that fails fast and feeds the *actual* failing output back as the next iteration's context.
- **Cross-verification** by a *different* model against the SPEC and repo state (not the agent's self-report).
- Real, layered **termination guarantees** (budget, timeout, no-progress/plateau, oscillation) plus a kill switch.
- Spec authoring support (`/omh-spec`) with machine-checkable acceptance criteria.
- Full EN/KO doc refresh; easier install; version bump to 0.2.0.

**Non-goals (YAGNI for 0.2.0)**
- A detached overnight bash/cron runner (Ralph's fresh-context-per-iteration via separate processes). In-session loop first; note as future work.
- Trained/learned effort routers (e.g. Ares Qw3-1.7B). Heuristic tier classification only.
- Self-consistency sample-and-vote for the cross-verify verdict (multiplies cost; only valid for boolean gates). Single different-model judge with INCONCLUSIVE→stop.
- Token/USD cost metering (no reliable hook signal). Use iteration count + wall-clock as cost proxies.

## 3. Design decisions (research-backed)

Each decision cites the synthesis from the research pass. Confidence and "unverified" caveats are respected — illustrative cost multipliers and exact epsilons ship as *tunable config*, never as hard truths.

### D1 — Stop-hook continuation contract (load-bearing correctness)
The loop hook MUST print **top-level** `{"decision":"block","reason":<next-step>}` on stdout and **exit 0**. It must NOT use exit code 2 (broken for plugin-distributed hooks) and must NOT use OMH's existing `hookBlock()` helper, which nests `decision:{block:true,reason}` inside `hookSpecificOutput` — that shape silently fails to continue.
→ Add a new `hookStopContinue(reason)` helper + a regression test asserting exit 0 and valid top-level block JSON.
*Refs: code.claude.com/docs/en/hooks; anthropics/claude-code#10412 (plugin exit-2 caveat); anthropics/claude-code ralph-loop stop-hook.sh.*

### D2 — Termination is a layered checklist owned by the hook
Evaluated on **every** Stop event, in order:
1. `stop_hook_active === true` → exit 0 immediately (prevents the hook's own respond→block→respond infinite loop; "not optional").
2. STOP sentinel file present → stop (kill switch).
3. session_id mismatch → exit 0 without touching state (concurrent-session/worktree isolation).
4. loop not active → silent passthrough (let normal post-task run).
5. iteration ≥ tier.maxIterations OR total ≥ maxTotalIterations → stop (budget).
6. elapsed > tier.maxWallClockMinutes → stop (timeout).
7. done-quorum met → stop (done).
8. plateau (no improvement + empty/cosmetic diff for `plateauWindow` iters) → stop.
9. oscillation (repeated failure signature / A-B-A-B) → stop + escalate to user.
10. else → continue (emit block).
The model never decides termination ("let the model decide when to stop is not a strategy").
*Refs: dev.to/alanwest infinite-loop; claudefa.st autonomous-agent-loops + stop-hook-task-enforcement.*

### D3 — State file: ralph-loop architecture, ported to Node + JSON
`.claude/.omh/loop-state.json` (consistent with OMH's existing `usage.json`/`teams.json`/`agents.json`). Carries: `active, sessionId, tier, goal, specPath, iteration, totalIterations, startedAt, history[]` (per-iter: verify rung statuses, diff stats, failure signature, reflection). Writes are **atomic** (temp file + rename). Every corruption/edge path is **fail-open**: delete state, exit 0, never trap the user. `PROGRESS.md` at project root is the human-readable plan+log.
*Refs: ralph-loop stop-hook.sh (session isolation, atomic mv, fail-open); skywork.ai layered guardrails / kill switch.*

### D4 — Verify ladder: deterministic gate first, escalate only when green
Strictly ordered rungs with hard early-exit (`skipHigherTiers`): `quickCheck` (lint/typecheck, seconds) → `verify` (unit tests/build) → self-review (same model) → cross-verify agent. On the **first** non-zero exit, block with the **actual failing output** piped into `reason` — never spend a model judge on structurally broken code. Each rung gets its own subprocess timeout; results logged as `{rung, status: pass|fail|error|skipped, retryable, signature}`. `error`/infra states are `retryable:false` → stop and ask (distinguishes a real failure from "no test runner found").
*Refs: dev.to/saurav tiered deterministic-before-judge; claudefa.st remediation-reason; arxiv 2506.11442 (ReVeal dense feedback).*

### D5 — Progress & oscillation from the per-iteration commit
The per-iteration commit gives a free, durable progress signal: commit count = iteration, diff = progress. Empty/whitespace-only diff = "no new artifact." Plateau = verify result not improving AND cosmetic diff for `plateauWindow` consecutive iters (quick w=2, deep w=3). Oscillation = hash of `(failureSignature + fixDiff)`; identical-repeat or A-B-A-B over the last 3–4 iters → stop + escalate ("architectural, not iterative").
*Refs: agentpatterns.tech infinite-loop; dev.to/alanwest action-hashing; dev.to/adamo call-hashing.*

### D6 — Hard budgets per tier + graceful force-final
Config `loop` block (deep-merged into DEFAULTS). Per-tier `maxIterations`, `maxWallClockMinutes`; cross-tier `maxTotalIterations`. On any hard-limit hit, do NOT silently cut off or error — inject a "final iteration" directive (terminal PROGRESS.md entry "stopped: budget/timeout at iteration N", final commit, clean stop). Wall-clock is an independent axis (catches a hung test under iteration/cost caps).
*Refs: agentpatterns.tech budgets; dev.to/adamo dual-ceilings + force-final; devops.com timeboxing. (Dollar anecdotes are motivation only — not OMH risk estimates.)*

### D7 — SPEC.md as the anchor; fixed digest re-injected each iteration
Loop start gates on a durable SPEC.md with machine-checkable acceptance criteria (EARS-style: precondition/trigger/expected-response). If SPEC is missing/vague or has unresolved `[NEEDS CLARIFICATION]` markers → do NOT start; fall back to OMH's existing Ambiguity Guard (AskUserQuestion). Each acceptance criterion maps to a verify command; the loop may stop only when every criterion's command exits 0. A **compact, fixed digest** of SPEC (not the whole file, not a growing transcript) is re-injected as the hook's `reason` every iteration — the fresh-context discipline that prevents intent drift.
*Refs: github/spec-kit spec-driven.md; kiro.dev executable acceptance criteria + EARS; ghuntley.com/ralph fresh-context.*

### D8 — Cross-verify: different model, criterion rubric, independent, fail-safe
The cross-verify agent must be (a) a **different** model than the generator (generator=sonnet → judge=opus via OMH model routing) to kill self-enhancement bias; (b) a **criterion-separated rubric** judge scoring each SPEC acceptance criterion pass/fail *with evidence*, not a vibe score; (c) verifying **independently against repo state** — run the tests, grep the diff — not re-reading the agent's "I did X" summary (factored Chain-of-Verification). Verdict is typed `PASS|FAIL|INCONCLUSIVE`; INCONCLUSIVE **fails safe to STOP-and-report**. Emits `[omh:cross-verify]` with the rubric table.
*Refs: arxiv 2412.05579 (LLM-judge biases + different-model/reference-guided); arxiv 2309.11495 (CoVe); arxiv 2303.17651 (Self-Refine self-bias caveat); dev.to/adamo typed verdict.*

### D9 — Gate the expensive judge on cheap-signal agreement (cost)
Default tier = `quick` for every task; `standard`/`deep` are **escalation states** reached only via observed signals (verify failure, large diff, replan, repeated failure signature). Agreement-Based Cascading: treat the deterministic rung result and the standard self-verdict as two voters — if both agree the work is good, **skip** the opus cross-verify; escalate only on disagreement. Cap deep-verifies per task (`maxDeepVerifiesPerTask`). Record every tier transition in PROGRESS.md (auditable cost).
*Refs: arxiv 2407.02348 (ABC); arxiv 2407.18370 (Trust-or-Escalate); portkey.ai FrugalGPT. (5–10× figures: illustrative only.)*

### D10 — Reflexion on failure, not blind retry; diminishing-returns exit
On verify failure the agent writes a structured Reflexion block to PROGRESS.md ("attempt N failed because X; root cause Y; next I will Z"); the hook re-injects the last `reflectionWindow` reflections. If the SAME failure signature/root-cause recurs across N iters, or the verify-score delta falls below a tier epsilon (quick ~5%, deep ~2% — tunable, not validated constants), stop + escalate with an explicit "architectural, not iterative" message.
*Refs: arxiv 2303.11366 (Reflexion); softcery.com diminishing-returns / "10 iters = architectural"; ghuntley.com/ralph reflection memory.*

### D11 — Loop hygiene & anti-reward-hacking
- PROGRESS.md: append findings, **mark+prune** completed items, compact past a size threshold (~150k token practical ceiling is medium-confidence — used only as a conservative trigger). Companion `.claude/.omh/loop-learnings.md` caches build/test invocations so fresh iters don't relearn them.
- **One unit of work per iteration**; if a single iteration's diff exceeds `maxDiffFilesPerIteration`, treat as a smell and split.
- Loop prompt rules: "ripgrep before implementing," "NO PLACEHOLDERS — full implementations only."
- Cross-verify runs a **revert-and-rerun mutation check** (revert the change against the per-iteration commit; new tests must FAIL on reverted code) so the agent can't satisfy its own gate with vacuous tests.
- Validation rung is **serialized** (one validator running build/test at a time); read/search may fan out.
*Refs: ghuntley.com/ralph (one-task, no-placeholders, ripgrep, hygiene); arxiv 2506.11442 (ReVeal anti-reward-hacking).*

### D12 — Risk-tiered human gates (wire existing OMH guards into the loop)
quick/standard may self-verify and auto-commit autonomously, but the loop MUST halt for human confirmation before irreversible/out-of-scope actions: anything outside `scopeGuard.allowedPaths`, deletions, force-push, or merging a cross-verify branch — formalizing OMH's existing Dangerous-Op Guard and "NEVER auto-merge" rules as hard loop gates. Ship an attended/dry-run posture before fully-unattended deep loops; approval-window timeout fails safe to DENIED.
*Refs: codecentric attended→unattended; strata.io risk-tiered gates / fail-safe-to-denied.*

## 4. Architecture

```
/omh-spec  ──► SPEC.md (EARS acceptance criteria + verify commands)
                 │
/omh-loop "<goal>"|SPEC.md ──► classify tier ──► confirm ──► write loop-state.json (active, sessionId)
                 │                                              + iteration 1 (one task → ladder → PROGRESS.md → commit)
                 ▼
   Stop event ──► hooks/loop-guard.mjs  (thin wrapper, fail-open)
                    │  gather signals: stop_hook_active, session_id, STOP sentinel,
                    │                  git HEAD/diff, ladder rung results
                    ▼
                 lib/loop.mjs :: evaluateLoop(state, signals)  ← PURE, unit-tested
                    │  layered checklist (D2) + tier budgets (D6) + plateau/oscillation (D5)
                    ├─ continue → hookStopContinue(reason = fixed SPEC digest + last failure + reflections + next-step)
                    └─ stop     → silent passthrough + [omh:loop] summary; (done-path triggers cross-verify D8)
```

### Components
- **`hooks/lib/output.mjs`** — add `hookStopContinue(reason)` → `JSON.stringify({decision:'block', reason})`. (Leave existing helpers untouched; `hookBlock` is currently unused dead code.)
- **`lib/loop.mjs`** (NEW, pure & exported for tests):
  - `evaluateLoop(state, signals) → {action:'continue'|'stop'|'ignore', reason, nextState, stopCause}`
  - `classifyTier({goal, specText, fileEstimate, override}) → 'quick'|'standard'|'deep'`
  - `buildLadder(conventions, config) → rung[]` (commands + per-rung timeout, ordered)
  - `failureSignature(rungResults) → string`; `detectPlateau(history, window)`; `detectOscillation(history)`
  - `parseState/serializeState`, `defaultState(...)`
- **`hooks/loop-guard.mjs`** (NEW, thin wrapper): reads stdin (`stop_hook_active`, `session_id`), reads/writes state atomically, checks STOP sentinel, gathers cheap signals, optionally runs ladder (cheap rungs only, within timeout), calls `evaluateLoop`, emits result. Honors `features.autonomousLoop` flag + `DISABLE_HARNESS`. Try/catch → fail-open.
- **`skills/omh-loop/SKILL.md`** — orchestrator (classify, spec-gate, confirm, iterate one task, ladder, PROGRESS.md, commit, cross-verify dispatch, `/omh-loop stop`).
- **`skills/omh-spec/SKILL.md`** — EARS acceptance-criteria spec authoring; refuses vague specs.
- **`lib/config.mjs`** + `templates/harness.config.json.tmpl` — `features.autonomousLoop` + `loop` block (see §5).
- **`hooks/hooks.json`** — add `loop-guard.mjs` as a Stop hook *before* `post-task.mjs` (generous timeout, e.g. 600s; per-rung timeouts keep it short in practice).
- **`hooks/lib/dictionary.mjs`** — add `loop` messages (ko/en).
- **CLAUDE.md (root + .claude) + `templates/CLAUDE.md.tmpl` + `bin/cli.mjs` buildClaudeMd** — add "Autonomous Loop" smart-default section; bump HARNESS:VERSION.
- **Docs** — README(.ko), docs/features(.ko), docs/architecture(.ko), docs/configuration(.ko), NEW docs/loop(.ko); CHANGELOG; version 0.1.0→0.2.0 across plugin.json/marketplace.json/package.json/README badge.

## 5. Config schema (`loop` block, deep-merged defaults)

```jsonc
"features": { "autonomousLoop": true },
"loop": {
  "classify": "auto",               // auto | quick | standard | deep
  "defaultTier": "quick",           // start cheap, escalate on signals (D9)
  "requireSpec": true,
  "specPath": "SPEC.md",
  "logFile": "PROGRESS.md",
  "learningsFile": ".claude/.omh/loop-learnings.md",
  "requireCommit": true,
  "oneTaskPerIteration": true,
  "maxDiffFilesPerIteration": 20,
  "maxTotalIterations": 30,
  "stopOnNoProgress": true,
  "quickCheckCommand": "",          // fast rung (lint/typecheck); auto-detected from conventions
  "verifyCommand": "",              // full rung (tests/build); auto-detected
  "verifyInHook": true,
  "rungTimeoutSec": { "quickCheck": 30, "verify": 180 },
  "crossVerify": true,
  "crossVerifyModel": "architect",  // different model than generator (D8)
  "maxDeepVerifiesPerTask": 3,
  "reflectionWindow": 3,
  "tiers": {
    "quick":    { "model": "standard",  "maxIterations": 3,  "maxWallClockMinutes": 5,  "plateauWindow": 2, "crossVerify": false, "marginalGainEpsilon": 0.05 },
    "standard": { "model": "standard",  "maxIterations": 8,  "maxWallClockMinutes": 15, "plateauWindow": 2, "crossVerify": true,  "crossVerifyEvery": 0, "marginalGainEpsilon": 0.03 },
    "deep":     { "model": "architect", "maxIterations": 20, "maxWallClockMinutes": 45, "plateauWindow": 3, "crossVerify": true,  "crossVerifyEvery": 5, "marginalGainEpsilon": 0.02 }
  }
}
```
> Iteration budgets (quick 3 / standard 8 / deep 20) are the user-approved defaults. The research pass suggested more conservative numbers (3/5/8) for cost; docs note this as a tuning option.

## 6. Testing plan

- `test/loop.test.mjs` (pure `evaluateLoop` + helpers): continue when under budget & no done; stop on stop_hook_active; stop on budget (iteration & total); stop on wall-clock timeout; stop on plateau; stop+escalate on oscillation; stop on done-quorum; ignore on session mismatch; ignore when inactive; tier classification (quick/standard/deep); ladder ordering & skipHigherTiers; failureSignature stability.
- `test/loop-guard.test.mjs` (shipped hook via execFileSync, mirroring hooks.test.mjs): **exit 0 + top-level `{decision:block,reason}` regression** (D1); silent when feature disabled / DISABLE_HARNESS; silent when no active loop; fail-open on corrupt state; STOP sentinel halts; session mismatch passthrough.
- `test/config.test.mjs` additions: `loop` defaults present; partial loop config deep-merges; tier overrides preserved.

Each test file covers happy / edge / error per OMH's own test-enforcement rule.

## 7. Rollout

- Version 0.1.0 → 0.2.0 everywhere; CHANGELOG entry.
- `features.autonomousLoop` defaults ON but is inert until `/omh-loop` writes an active state — zero overhead for non-loop sessions (hook returns silent immediately when no active state).
- Install/onboarding: README top gets copy-paste `claude plugin install …` + `npx oh-my-harness@latest init` (no global install); emphasize zero-setup (works on defaults; `/harness-setup` optional). Marketplace description/tags add the loop.
- Cleanup: removed accidental empty nested repo `oh-my-harness/oh-my-harness/` (done).

## 8. Named techniques cited (for docs & resume)
Ralph Wiggum loop · Reflexion · Self-Refine · Chain-of-Verification (factored CoVe) · LLM-as-judge (different-model/reference-guided/criterion-separated) · FrugalGPT cascade · Agreement-Based Cascading · Cascaded Selective Evaluation ("Trust or Escalate") · Self-consistency (boolean gates only) · ReVeal · EARS acceptance-criteria notation · Spec-Driven Development / constitutional gates.
```
