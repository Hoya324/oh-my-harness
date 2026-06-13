# Verification & Weight-Aware Harness

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

The hook emits `[omh:weight]` so you can see which tier fired.

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

A disk-anchored `STATE.md` captures the working goal, current phase, key decisions, and progress. It is re-injected at **SessionStart** and integrated at **PreCompact**, so long or compacted sessions don't lose the thread (context-rot defense). It pairs naturally with the loop's `PROGRESS.md`: `STATE.md` is the durable "where are we" anchor; `PROGRESS.md` is the per-iteration log.

---

## Configuration

All settings live in `.claude/.omh/harness.config.json` (project-local, with a `~/.claude/.omh` global fallback). Toggle the feature with `features.weightRouting`; tune `tier3.*` and `verify.*` as above. See [Configuration](configuration.md) for the full reference.
