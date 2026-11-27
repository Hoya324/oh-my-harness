# Verification & Weight-Aware Harness

## Codex Support

Both runtimes preserve the same independence rule: the generator must not judge its own work. Claude Code can use a fresh native subagent or a demonstrably different external verifier. Codex can use a fresh Codex subagent or `codex exec -s read-only` only when the selected model/runtime is demonstrably distinct from the generator. If no distinct judge is available, report reduced coverage and do not label the result independent.

External verifiers are read-only and diagnose; the generating workflow applies fixes. Every round starts with fresh context and does not receive earlier conclusions. Missing optional CLIs degrade gracefully. Findings reported by two or more independent models remain the high-confidence agreement signal on both runtimes.

Codex-native `/omh-verify` reads the same diff and config, records shared findings in the same memory store, and uses quick/standard/architect role semantics without weakening read-only boundaries.

> Match guardrails to the weight of the work, and verify heavy work with **independent, multi-model** rounds before it's called done.

OMH's weight-aware harness has three parts: **weight routing** (classify every prompt), **`/omh-verify`** (N-round independent verify+fix), and **Living State** (`STATE.md`). They complement the [Autonomous Loop](loop.md): the loop drives *one task to done*, while these decide *how much scrutiny* a task deserves and verify it with outside eyes.

---

## Weight routing (Tier 1 / 2 / 3)

A `UserPromptSubmit` hook scores each prompt into a weight tier and routes guardrails proportionally — light tasks stay frictionless, heavy ones get tightened.

| Tier | Weight | Policy |
|:----:|--------|--------|
| **1** | trivial (typo, rename, one-liner) | minimal friction |
| **2** | standard feature / bugfix | normal guards |
| **3** | heavy / risky (broad scope, many files, sensitive domain) | **verification enforced before completion** |

Escalation to Tier 3 is driven by `tier3.*` thresholds:

```jsonc
"tier3": {
  "taskThreshold": 5,     // ≥ this many distinct tasks → Tier 3
  "fileThreshold": 5,     // ≥ this many files touched → Tier 3
  "domainKeywords": []    // custom keywords that force Tier 3 (e.g. "payment", "auth")
}
```

The hook emits `[omh:tier]` (plus `[omh:tier-3]` for heavy work) so you can see which tier fired and why.

**Overrides.** Start a prompt with `!t1` or `!t3` to force the tier for that prompt, or `!noplan` to keep the tier but skip the plan gate. The hook announces `[omh:override]`, and the Decision Log records the classifier's original answer, so `oh-my-harness why` shows how often the classifier was corrected.

**Measured accuracy.** `test/fixtures/prompts.jsonl` holds 94 labelled Korean/English prompts, including keyword false positives ("change the login button color") and risky work without keywords ("rotate the checkout API keys"). CI fails when accuracy, Tier-3 recall, or Tier-1 precision drops below `test/fixtures/prompts.baseline.json`.

Weight routing is on in the `standard` and `full` profiles.

---

## `/omh-verify` — N-round independent verification

`/omh-verify` runs the `git diff` through **N independent rounds**, rotating the verifier model each round so no single model rubber-stamps its own work.

```bash
/omh-verify              # verify the current diff per the `verify` config
```

Config (`verify` block):

```jsonc
"verify": {
  "rounds": 3,
  "stopWhenClean": true,   // stop early once a round reports NO ISSUES
  "autoFix": false,        // true: apply fixes; false: propose to the user
  "lenses": [
    { "model": "claude",  "via": "native-subagent", "focus": "correctness" },
    { "model": "gpt",     "via": "codex",  "cmd": "codex exec",                 "focus": "convention" },
    { "model": "gemini",  "via": "gemini", "cmd": "gemini -p --approval-mode plan", "focus": "regression" }
  ]
}
```

How it works:

- **Round `i` uses lens `i mod len(lenses)`** — Claude (correctness) → GPT/codex (convention) → Gemini (regression), then repeats.
- Each round is **independent**: the previous round's conclusions are *not* fed to the next verifier (prevents self-stamping).
- **External verifiers run read-only** (`codex exec -s read-only`); only the main loop applies fixes.
- Models without an installed CLI are skipped — it **gracefully degrades** to Claude-only.
- The final report tabulates findings per round and flags **cross-model consensus** (≥2 models raising the same issue = high-confidence).

This is the complement to the Autonomous Loop's cross-verification: where the loop's cross-verify confirms a *spec* is met, `/omh-verify` is a standalone, diff-focused, multi-model review you can run any time — and Tier 3 weight routing enforces it before a heavy task is considered complete.

---

## Living State (`STATE.md`)

`STATE.md` has two parts. You own **Goal** and **Key Decisions**. The `OMH:AUTO` block is regenerated on every **Stop** and before **PreCompact** from git, loop, and verify-gate state, so "where are we" never depends on someone remembering to update it. It is re-injected at **SessionStart** (your lines first), so long or compacted sessions don't lose the thread (context-rot defense). When a session runs long, `[omh:handoff]` suggests `/omh-handoff`, which writes a `HANDOFF.md` to start a fresh session from. It pairs naturally with the loop's `PROGRESS.md`: `STATE.md` is the durable "where are we" anchor; `PROGRESS.md` is the per-iteration log.

---

## Configuration

All settings live in `.claude/.omh/harness.config.json` (project-local, with a `~/.claude/.omh` global fallback). Toggle the feature with `features.weightRouting`; tune `tier3.*` and `verify.*` as above. See [Configuration](configuration.md) for the full reference.
