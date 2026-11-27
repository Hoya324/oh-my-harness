# Features

## Codex Support

The Claude Code and Codex editions share the same feature core, config, `.claude/.omh/` project state, and `~/.omh/memory/graph.jsonl` memory store. Codex provides native lifecycle hooks, the same public workflow names, `.agents/skills/` scaffolding, quick/standard/architect roles, native collaboration operations, and selectable Codex tmux workers.

Presentation differs, not the underlying state. Claude Code keeps the custom status-line HUD. Codex has no equivalent custom status-line extension, so guard transitions appear as hook messages and the read-only `omh-status` skill reports tier, loop, verification, usage, and memory connection state. Review installed Codex hooks in `/hooks`; OMH does not bypass native trust.

| Capability | Claude Code | Codex |
|---|---|---|
| Hooks | Native Claude hook payloads | Native Codex payloads through the shared-core bridge |
| Workflows | `/omh-spec`, `/omh-loop`, `/omh-verify` | Same public names |
| Project skills | `.claude/skills/` | `.agents/skills/` |
| Status | Custom HUD | Hook messages + `omh-status` |

## Status Line (HUD)

OMH replaces Claude Code's default status line with a real-time dashboard:

```
[OMH] | 5h:14%(3h51m) | wk:7%(6d5h) | session:29m | ctx:39% | 🔧53 | agents:2 | opus-4-6
```

| Segment | Meaning |
|---------|---------|
| `5h:14%(3h51m)` | 5-hour rate limit usage 14%, resets in 3h 51m |
| `wk:7%(6d5h)` | Weekly rate limit usage 7%, resets in 6d 5h |
| `session:29m` | Current session duration |
| `ctx:39%` | Context window usage (green → yellow at 70% → red at 85%) |
| `🔧53` | Total tool calls this session |
| `agents:2` | Currently running subagents |
| `opus-4-6` | Active model |

> Rate limit data is fetched from the Anthropic OAuth API and cached for 90 seconds.

---

## Smart Defaults — What OMH Does Automatically

After runtime registration, OMH hooks into the Claude Code or Codex lifecycle and activates automatically. Codex profiles and durable guidance still require `/harness-setup` or CLI init.

Which of these run depends on your profile. A fresh config uses `minimal` (dangerous guard, verify gate, convention detection, commit convention, auto `.gitignore`, generated state); `standard` and `full` add more. See [Profiles](#profiles), and run `oh-my-harness why` to see what actually fired.

```
┌─────────────────────────────────────────────────────────────────┐
│  You type a prompt                                              │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ 🔍 Ambiguity Guard   │   │ 📋 Auto-Plan Mode    │            │
│  │ Vague request?       │   │ 3+ tasks detected?   │            │
│  │ → Ask for scope      │   │ → Suggest plan first  │            │
│  └──────────────────────┘   └──────────────────────┘            │
│                                                                 │
│  Claude starts working                                          │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ 🛡️ Dangerous Guard   │   │ 📁 Scope Guard       │            │
│  │ rm -rf / force push? │   │ Edit outside allowed  │            │
│  │ → Deny until safe    │   │ Codex? → Deny first   │            │
│  └──────────────────────┘   └──────────────────────┘            │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ 🤖 Model Routing     │   │ 📝 Commit Convention  │            │
│  │ Delegates to the     │   │ git commit detected?  │            │
│  │ right model tier:    │   │ → Remind format       │            │
│  │ haiku/sonnet/opus    │   │                       │            │
│  └──────────────────────┘   └──────────────────────┘            │
│                                                                 │
│  Task completes                                                 │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ ✅ Test Enforcement   │   │ 💾 Context Snapshot   │            │
│  │ Code changed?        │   │ Context compaction?   │            │
│  │ → Verify tests exist │   │ → Save state first    │            │
│  └──────────────────────┘   └──────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### Model Routing in Action

When Claude delegates to subagents, OMH automatically selects the right model:

| Agent Tier | Model | When Used | Example Tasks |
|:----------:|:-----:|-----------|---------------|
| `harness:quick` | **Haiku** | Simple lookups, exploration | "Find all TODO comments", "What's in this file?" |
| `harness:standard` | **Sonnet** | Implementation, fixes | "Fix this bug", "Add validation", "Write tests" |
| `harness:architect` | **Opus** | Architecture, design | "Design the auth system", "Security review", "Complex refactor" |

The current model is always visible in the HUD status line.

### Feature Tags — `[omh:*]`

Every OMH action is prefixed with a tag so you always know which feature fired:

```
[omh:ambiguity-guard]    → Asking for clarification on a vague request
[omh:auto-plan]          → Detected 3+ tasks, suggesting plan mode
[omh:dangerous-guard]    → Denial of destructive or malformed request
[omh:model-routing → sonnet] → Delegating to sonnet for implementation
[omh:test-enforcement]   → Reminding to verify tests after code change
[omh:commit-convention]  → Showing commit format after git commit
[omh:scope-guard]        → Codex denial / Claude report for an out-of-scope edit
[omh:convention-detect]  → Detected project conventions on session start
[omh:context-snapshot]   → Saving state before context compaction
[omh:loop]               → Autonomous loop forced continuation / stop decision
[omh:cross-verify]       → Cross-verification verdict (PASS / FAIL / INCONCLUSIVE)
[omh:spec]               → Spec authoring / acceptance-criteria check
[omh:tier]               → Prompt weight tier and the reasons for it
[omh:override]           → A leading !t1 / !t3 / !noplan was applied
[omh:verify-gate]        → Stop-time verification result (block on red)
[omh:plan-gate]          → Edit denied until a Tier-3 plan is presented
[omh:state]              → STATE.md re-injected at session start
[omh:handoff]            → Long session: suggests /omh-handoff and a fresh session
```

Every tag above, except model routing, is also appended to `.claude/.omh/decisions.jsonl`; see [Decision Log](#decision-log).

Example session output:
```
⏺ [omh:convention-detect] Project: node | test: vitest | lint: eslint
  ...
⏺ [omh:ambiguity-guard] 요청이 모호합니다. 구체적 범위를 확인합니다.
  ...
⏺ [omh:model-routing → haiku] Finding all TODO comments...
  ...
⏺ [omh:model-routing → sonnet] Implementing the auth middleware...
  ...
⏺ [omh:dangerous-guard] WARNING: rm -rf detected. Confirm with user.
  ...
⏺ [omh:test-enforcement] 코드 변경 감지. 테스트 존재 여부 확인.
```

---

## Feature Map

The features below group into three layers — the same grouping used in the [README](../README.md#features-overview):

**A. Automatic guards & routing** — fire on every session, no prompting:
[Convention Auto-Detect](#1-convention-auto-detect) · [Test Enforcement](#2-test-enforcement) · [Auto-Plan Mode](#4-auto-plan-mode) · [Ambiguity Guard](#5-ambiguity-guard) · [Dangerous Guard](#6-dangerous-guard) · [Context Snapshot](#7-context-snapshot) · [Commit Convention](#8-commit-convention) · [Scope Guard](#9-scope-guard) · [Usage Tracking](#10-usage-tracking) · [Weight Routing](#15-weight-routing-tier-123) · [Living State](#17-living-state-statemd) · [Verify Gate](#verify-gate) · [Plan Gate](#plan-gate) · [Handoff](#handoff)

**B. Autonomous execution** — explicit workflows you invoke:
[Native Team](#12-native-team) · [Autonomous Loop](#13-autonomous-loop) · [Spec Authoring](#14-spec-authoring) · [N-Round Verify](#16-n-round-independent-verify-omh-verify) · [Docs Sync](#docs-sync-opt-in)

**C. Routing, scaffolding & observability** — cross-cutting:
[Status Line (HUD)](#status-line-hud) · [Model Routing](#3-model-routing) · [Skill Scaffolding](#11-skill-scaffolding) · [Decision Log](#decision-log) · [Profiles](#profiles)

---

## Feature Details

### 1. Convention Auto-Detect

Scans project root on session start and injects detected conventions as context. Results are cached for 1 hour.

| Project File | Language | Detected Tools |
|-------------|----------|---------------|
| `package.json` | Node.js | jest / vitest / mocha, eslint / biome, prettier, typescript / vite / webpack |
| `pyproject.toml` | Python | pytest, ruff / flake8, black, mypy |
| `go.mod` | Go | go test, golangci-lint |
| `Cargo.toml` | Rust | cargo test, clippy, rustfmt |
| `build.gradle` | Java | junit, gradle |
| `pom.xml` | Java | junit, maven |

> Session start message example: `[oh-my-harness] Project: node | test: vitest | lint: eslint | fmt: prettier`

### 2. Test Enforcement

At Stop, checks every changed code file in the working tree (`git diff`, staged, and untracked; the last tool's file when git is unavailable):

- Changed code with no matching test → `[omh:anti-rationalization]` lists the files and forbids declaring the task complete
- Tests exist, but **no test changed in the same diff** → a note to confirm the existing tests cover the new behavior, or to add tests
- Tests exist and a test changed → a reminder to run them
- Each test file should have at least **N** cases (configurable, default: 2)

Test files are recognized by `.test.` / `.spec.` names, `test/` / `tests/` / `__tests__/` directories, and JVM names such as `FooTest.kt` under the mirrored `src/test/...` path.

> Tests must cover **happy path**, **edge case**, and **error case** at minimum.

### 3. Model Routing

Three agent tiers for cost-efficient subagent delegation:

| Agent | Model | Use For |
|-------|-------|---------|
| `harness:quick` | haiku | File lookups, simple questions, exploration |
| `harness:standard` | sonnet | Implementation, bug fixes, debugging |
| `harness:architect` | opus | Architecture, complex analysis, security review |

CLAUDE.md instructs Claude to delegate to the appropriate tier automatically based on task complexity.

### 4. Auto-Plan Mode

Detects 3+ independent tasks in a single message:

- Numbered items (`1. 2. 3.`)
- Bullet points (`-`, `*`)
- Korean conjunctions (`그리고`, `또한`, `추가로`, `아울러`, `더불어`)

Calls `EnterPlanMode` tool to switch to real plan mode (Shift+Tab equivalent).

### 5. Ambiguity Guard

Detects vague requests using a scoring system (threshold: 2):

| Signal | Score | Example |
|--------|:-----:|---------|
| Vague references | +1 | "fix this", "change that" |
| Scope-less verbs | +1 | "refactor" (no file/function target) |
| Open-ended choices | +1 | "or something", "whatever" |
| Very short message | +1 | < 15 chars without specific identifiers |
| English scope-less | +1 | "fix it", "clean up" without target |

When score >= threshold, Claude **must** ask for clarification before starting work.

### 6. Dangerous Guard

Denies potentially destructive operations before execution:

**Bash tool patterns:**

| Pattern | Warning |
|---------|---------|
| `rm -rf`, `rm --force` | File deletion |
| `git push --force` | Force push |
| `git reset --hard` | Hard reset |
| `git clean -f` | Git clean |
| `DROP TABLE / DATABASE` | Database destruction |
| `TRUNCATE TABLE` | Table truncation |
| `DELETE FROM` (no WHERE) | Mass deletion |
| `chmod 777` | Unsafe permissions |
| `curl \| sh` | Remote execution |
| `npm publish` | Package publish |
| `docker system prune` | Container cleanup |

**Write/Edit tool patterns:**

| Pattern | Warning |
|---------|---------|
| `.env` files | Environment secrets |
| `credentials` | Credential files |
| `secret` | Secret files |
| `id_rsa`, `.pem`, `.key` | Private keys |

> This is a hard `PreToolUse` guard: detected unsafe operations and malformed hook input are denied until the request is made safe.

### 7. Context Snapshot

Before context compaction (`PreCompact`), saves current state to `.claude/.omh/context-snapshot.md`:

- Session summary
- Active tasks
- Reminder to review snapshot after compaction

### 8. Commit Convention

When `git commit` is detected, reminds the commit format.

**Auto-detection priority:**
1. commitlint config files -> Conventional Commits
2. gitmoji dependency in `package.json` -> Gitmoji
3. commitizen in `package.json` -> Conventional Commits
4. Default -> Conventional Commits

```
# Conventional Commits
<type>(<scope>): <description>
# Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore

# Gitmoji
<emoji> <description>
```

### 9. Scope Guard

When enabled with `allowedPaths`, the event contract differs by runtime. **Codex PreToolUse** denies out-of-scope edits and recognized filesystem mutations with no auditable path before execution. **Claude PostToolUse** retains the existing observer registration and reports the result after the tool.

```json
{
  "features": { "scopeGuard": true },
  "scopeGuard": { "allowedPaths": ["src/auth", "src/utils"] }
}
```

> OFF by default. If Codex cannot load scope configuration, it still applies a project-boundary fallback: project paths pass, while traversal outside the project is denied.

### 10. Usage Tracking

Silently records every tool invocation to `.claude/.omh/usage.json`:

```json
{
  "sessions": {
    "session-id": {
      "tool_counts": { "Edit": 5, "Bash": 3, "Read": 12 },
      "total_calls": 20,
      "started_at": "2026-03-23T10:00:00Z",
      "last_tool": "Edit"
    }
  }
}
```

### 11. Skill Scaffolding

Automatically generates project-specific skills from detected conventions. Claude Code uses `.claude/skills/`; Codex uses `.agents/skills/`; `--runtime both` renders both destinations.

**Scaffolded skills:**

| Skill | What it does |
|-------|-------------|
| `code-review` | Language-specific review checklist |
| `test-write` | Test writing conventions for detected framework |
| `lint-fix` | Lint check and auto-fix workflow |

**Supported languages:**

| Language | Test Framework | Linter | Notes |
|----------|---------------|--------|-------|
| Node.js | vitest / jest / mocha | eslint / biome | TypeScript support auto-detected |
| Python | pytest | ruff / flake8 | black / ruff formatting |
| Go | go test | golangci-lint | Table-driven test patterns |
| Rust | cargo test | clippy | rustfmt formatting |
| Java | junit | — | Gradle / Maven build |
| Kotlin | kotest / junit5 | ktlint / detekt | Null safety checks |

**How it works:**

1. Run `/init-project` or `oh-my-harness init --runtime <claude|codex|both>`
2. OMH detects your project's language and tools
3. Skill templates are rendered with your specific tools (e.g., "vitest" not "test runner")
4. Skills are written to the selected runtime destination for native discovery
5. Customize freely — OMH never overwrites existing skills

> Skills are user-owned files. `oh-my-harness reset --runtime claude`, `--runtime codex`, and `--runtime both` do NOT delete them. A bare reset defaults to Claude only.

**Session hint:**

If no project skills are detected, OMH shows a hint on session start:
```
[omh:skill-hint] No project skills found. Run /init-project to scaffold.
```

**Configuration:**
```json
{
  "features": { "skillScaffolding": true }
}
```

Set `features.skillScaffolding` to `false` to disable scaffold hints and skip skill generation during init.

### 12. Native Team

Orchestrate parallel work using Claude Code's built-in team system or Codex collaboration operations — no tmux or worktree dependencies.

**Templates:**

| Template | Members | Agent Types |
|----------|---------|---------------|
| `fullstack` | frontend + backend + tester | all `standard` |
| `review` | reviewer + tester | `architect` + `standard` |
| `research` | researcher + implementer + architect | `quick` + `standard` + `architect` |

Claude maps these shared agent types to haiku/sonnet/opus. Codex treats them as available-profile preferences and does not promise a particular model.

**Commands:**

| Command | What it does |
|---------|-------------|
| `/team-spawn [template\|N] [task]` | Create team, decompose tasks, spawn teammates |
| `/team-status` | Show teammate status and task progress |
| `/team-stop` | Shutdown team with incomplete task warnings |

**How it works:**

1. Run `/team-spawn fullstack build auth system`
2. OMH uses Claude `TeamCreate` or confirmed Codex `spawn_agent` calls
3. Tasks are decomposed and assigned to teammates
4. Teammates work in parallel, communicating through Claude `SendMessage` or Codex `send_message`
5. Check progress with `/team-status`
6. Shutdown with `/team-stop` when done

**Configuration:**
```json
{
  "features": { "nativeTeam": true },
  "nativeTeam": {
    "maxTeammates": 4,
    "defaultTeamName": "omh-team"
  }
}
```

> Custom templates can be added via `nativeTeam.templates` in the config.

### 13. Autonomous Loop

The headline feature of 0.3.0. Define a goal once in a `SPEC.md`, then OMH *loops* — implementing, self-verifying, and cross-verifying — until the spec is objectively met. The philosophy here is the opposite of OMH's usual "warnings instead of walls": the **harness owns when to continue and when to stop**, never the model's self-assessment — autonomy with real walls.

**Trigger:** the Stop hook `hooks/loop-guard.mjs` *is* the loop engine and safety enforcer. Once `/omh-loop` writes an active state, every Stop event re-enters the hook. To continue it prints a **top-level** `{"decision":"block","reason":...}` on stdout and exits 0 (never exit 2, never nested under `hookSpecificOutput`); when the goal is met or a guardrail fires, it lets the session stop. The pure, unit-tested core lives in `lib/loop.mjs` (`evaluateLoop`, `classifyTier`, `buildLadder`, `detectPlateau`, `detectOscillation`).

**Commands:**

| Command | What it does |
|---------|-------------|
| `/omh-loop "<goal>"` or `/omh-loop SPEC.md` | Classify tier, gate on the spec, confirm, then iterate one task at a time |
| `/omh-loop stop` | Kill switch — aborts the loop (same as creating `.claude/.omh/STOP`) |

**Cheap-first verify ladder** — strictly ordered rungs that fail fast and run the cheapest check first. On the first failure it blocks with the *actual* failing output piped back as the next iteration's instruction, so the model never burns an expensive judge on structurally broken code. Each rung has its own subprocess timeout.

```
quickCheck (lint / typecheck)  →  contract (optional)  →  verify (tests / build)  →  self-review  →  cross-verify
   30s, deterministic              120s, deterministic     180s, deterministic        same model      different model
```

`contractCommand` checks knowledge that lives outside the code under change: an API spec diff (for example `openapi-diff`), a migration check (`flyway validate`), or architecture rules (ArchUnit). It is never auto-detected. A red rung is reported location-first: lines that point at `file:line` (gradle, kotlinc, tsc, eslint, pytest, go), otherwise the error lines from the end of the output, where build tools print the real failure. Kotlin/Java Gradle projects that use ktlint or detekt get `./gradlew ktlintCheck` or `./gradlew detekt` as the automatic quickCheck.

**Cross-verification** — a *different* model than the generator (opus, via model routing) acts as an LLM-as-judge that scores **each** SPEC acceptance criterion `PASS` / `FAIL` with evidence. It verifies **independently against repo state** — running the tests and grepping the diff, not re-reading the agent's "I did X" self-report — and runs a revert-and-rerun mutation check (revert the change; new tests must FAIL on the reverted code) so the agent can't satisfy its own gate with vacuous tests. The verdict is typed `PASS | FAIL | INCONCLUSIVE`, and **INCONCLUSIVE fails safe to stop-and-report**.

**Tiers** — start at the cheapest tier and escalate only on observed signals (verify failure, large diff, repeated failure):

| Tier | Iterations | Wall-clock | Cross-verify |
|------|:----------:|:----------:|--------------|
| `quick` | ≤ 3 | 5 min | none |
| `standard` | ≤ 8 | 15 min | at done |
| `deep` | ≤ 20 | 45 min | every 5 iters + at done |

> Cross-tier cap: `maxTotalIterations` = 30. Default tier is `quick`; `standard` / `deep` are escalation states.

**Guardrails (real walls)** — evaluated as a layered checklist on every Stop event:

- `stop_hook_active` is checked **first** to prevent the hook's own respond → block → respond infinite loop
- concurrent-session / worktree isolation via `sessionId` (mismatch → pass through untouched)
- `STOP` kill switch (`.claude/.omh/STOP` or `/omh-loop stop`)
- per-tier and cross-tier iteration budgets, plus an independent wall-clock timeout
- no-progress / plateau detection (empty or cosmetic commit diff across the tier's `plateauWindow`)
- oscillation detection (repeated failure signature / A-B-A-B → stop + escalate as "architectural, not iterative")
- atomic state writes and **fail-open** on corruption — a broken state file deletes itself and exits 0, never trapping the user

**State & logs:** machine state in `.claude/.omh/loop-state.json`; the human-readable plan + log in `PROGRESS.md`; cached build/test invocations in `.claude/.omh/loop-learnings.md`.

**Tags:** the hook emits `[omh:loop]` for each forced-continue / stop decision and `[omh:cross-verify]` with the rubric table for the judge's verdict.

**Techniques:** Ralph Wiggum loop, Reflexion, Self-Refine, Chain-of-Verification (CoVe), LLM-as-judge, FrugalGPT cascade, Agreement-Based Cascading, and Spec-Driven Development.

**Configuration:**
```json
{
  "features": { "autonomousLoop": true },
  "loop": {
    "defaultTier": "quick",
    "requireSpec": true,
    "specPath": "SPEC.md",
    "logFile": "PROGRESS.md",
    "maxTotalIterations": 30,
    "crossVerify": true,
    "crossVerifyModel": "architect",
    "quickCheckCommand": "",
    "contractCommand": "",
    "verifyCommand": "",
    "rungTimeoutSec": { "quickCheck": 30, "verify": 180 }
  }
}
```

> On in the `full` profile, but **inert** until `/omh-loop` writes an active state — zero overhead for non-loop sessions. See [the Autonomous Loop guide](loop.md) for the full config block and design rationale.

### 14. Spec Authoring

`/omh-spec` writes a machine-checkable `SPEC.md` that anchors the loop. Acceptance criteria use **EARS notation** — `WHEN <trigger> THE SYSTEM SHALL <response>` — and each criterion maps to a **verify command** that must exit 0 for the loop to consider it met. A compact, fixed digest of the spec is re-injected every iteration to prevent intent drift.

If a request is vague, `/omh-spec` inserts `[NEEDS CLARIFICATION]` markers and **refuses to start a loop** while any remain — falling back to OMH's existing Ambiguity Guard rather than guessing.

```json
{
  "features": { "autonomousLoop": true },
  "loop": { "requireSpec": true, "specPath": "SPEC.md" }
}
```

> Emits `[omh:spec]`. See [the Autonomous Loop guide](loop.md) for the EARS template and authoring workflow.

---

### 15. Weight Routing (Tier 1/2/3)

**Hook:** `UserPromptSubmit` · **Profile:** standard (`features.weightRouting`)

Classifies each prompt into a weight tier and routes guardrails proportionally, so small tasks stay light while heavy tasks get full treatment.

- **Signals:** task count heuristics + Korean/English weight-implying expressions (`dictionary.mjs` `weightUp`/`weightDown`) + configurable domain keywords. Any up-signal wins (conservative — don't-miss-it priority).
- **Tier 1 (light):** convention reminder only.
- **Tier 2 (standard):** convention checklist + tests + self-review.
- **Tier 3 (heavy):** injects a mandatory reminder to run `/omh-verify` before declaring complete.
- **Overrides:** start a prompt with `!t1` or `!t3` to force the tier, or `!noplan` to keep the tier but skip the plan gate, for that prompt only. The model is told these tokens are harness directives. Each use is recorded with the classifier's original answer (`override:t1 (classifier said 3)`), so the override rate in `oh-my-harness why` measures classifier error.
- **Measured, not guessed:** `test/fixtures/prompts.jsonl` holds 94 labelled Korean/English prompts, including keyword false positives and risky prompts without keywords. CI fails if accuracy, Tier-3 recall, or Tier-1 precision drops below the floors in `prompts.baseline.json`.

**Configuration:**
```json
{
  "features": { "weightRouting": true },
  "tier3": { "taskThreshold": 5, "fileThreshold": 5, "domainKeywords": ["payment", "결제"] }
}
```

### 16. N-Round Independent Verify (`/omh-verify`)

**Command:** `/omh-verify` · **Default:** triggered by Tier 3

Runs N independent verify+fix rounds over the current `git diff`, rotating models each round so no model rubber-stamps its own prior reasoning.

- **Model rotation:** Claude (native subagent) → GPT (`codex exec`) → Gemini (`gemini -p --approval-mode plan`).
- **Independence:** fresh context each round; previous round's conclusions are NOT fed to the next verifier.
- **Read-only externals:** external verifiers only diagnose; fixes are applied by the main loop.
- **Graceful degrade:** missing CLIs are auto-excluded (Claude-only fallback).
- **Agreement signal:** issues flagged by 2+ models are high-confidence.

**Configuration:**
```json
{
  "verify": {
    "rounds": 3,
    "stopWhenClean": true,
    "autoFix": false,
    "lenses": [
      { "model": "claude", "via": "native-subagent", "focus": "correctness" },
      { "model": "gpt", "via": "codex", "cmd": "codex exec", "focus": "convention" },
      { "model": "gemini", "via": "gemini", "cmd": "gemini -p --approval-mode plan", "focus": "regression" }
    ]
  }
}
```

### 17. Living State (STATE.md)

**Hook:** `Stop` and `PreCompact` (regenerate) / `SessionStart` (inject) · **Profile:** minimal (`features.stateSync`)

`.claude/.omh/STATE.md` has two owners. You (or the model, on request) own **Goal** and **Key Decisions**. Hooks own the block between `<!-- OMH:AUTO:START -->` and `<!-- OMH:AUTO:END -->`, regenerated on every Stop and before compaction from machine sources only: current branch, the last 5 commits, uncommitted files (up to 8 named), loop state, and whether the verify gate passed the current diff. A progress log nobody has to remember to update cannot drift.

At session start the human lines come first, then the snapshot, capped at 1000 characters. State is only written where `.claude/.omh` already exists, and every step is fail-open.

### 18. Long-Term Memory

**MCP:** `omh-memory` (knowledge graph) · **Availability:** whenever the MCP server is connected (not a feature flag)

A cross-session, **cross-runtime** knowledge graph, backed by pinned `@modelcontextprotocol/server-memory@2026.7.4` and stored at `~/.omh/memory/graph.jsonl` — **one store shared by Claude Code and Codex**. The plugin MCP changes to the plugin root and launches `bin/omh-memory.sh`; local Codex init installs the launcher/library under the selected scope and manages `[mcp_servers.omh-memory]`.

- **Read** — before planning, `/omh-loop` and `/omh-spec` query the graph for prior learnings, already-verified `quickCheck`/`verify` commands, and known pitfalls.
- **Write** — a failed iteration's Reflexion becomes a `Learning`; a green verify appends the verified commands to the `Project`; `/omh-verify` persists high-confidence findings (2+ model consensus).
- **Access** — plugin users use the MCP tools live. A local Codex project install can run `node .claude/.omh/runtime/lib/memory.mjs <command>`; after `oh-my-harness init --runtime codex --scope user`, user scope uses `node ~/.claude/.omh/runtime/lib/memory.mjs <command>`. Signatures: `read`; `search <query>`; `add-learning <project> <text...>`; `add-observation <entity> <text...>`; `stats`.
- **Graceful degradation** — if the server is unavailable, LTM steps are skipped silently; the loop never blocks on memory.
- **Concurrency** — the graph server is single-writer by design; fine for personal single-agent use, avoid heavy simultaneous writes from both runtimes at once.
- **Launch/platform boundary** — `npx --yes --prefer-offline` uses a warm cache when possible, but a first uncached launch needs npm registry/network access. Release verification on macOS warms the current machine's exact package cache. Native Windows Codex hooks declare `commandWindows`; the MCP launcher requires Bash.

> Store: `~/.omh/memory/graph.jsonl`. There is no bundled file-memory seed command; import observations through the live MCP tools or the installed scope-specific helper.

### Verify Gate

**Hook:** `Stop` (`verify-gate.mjs`) · **Profile:** minimal (`features.verifyGate`)

The autonomous loop only hard-enforces verification *inside* `/omh-loop`. The Verify Gate brings the same harness-owned enforcement to **plain sessions**. On every Stop it scores the turn's risk from the **actual working-tree diff** — not the model's self-assessment:

| Signal | Effect |
|--------|--------|
| Sensitive paths (`**/auth/**`, `**/payment/**`, `*migration*`, `.env*`, …) | escalate to the top risk level |
| Large diff (files/lines over `largeFiles`/`largeLines`) | escalate |
| Source changed without a matching test | run the ladder |
| Prompt tier (1/2/3) | acts as a **floor** — `level = max(diffRisk, tierFloor)` |

When the risk warrants it, the hook **runs the verify ladder itself** (cheap quickCheck for moderate risk; full ladder, including `contractCommand` when set, for sensitive/large) and:
- **red** → forces continuation with a location-first failure report (top-level `{"decision":"block"}` + exit 0);
- **green / low-risk** → allows the stop. Sensitive/large changes also get a `/omh-verify` cross-model recommendation.

**It can never wedge a session.** A per-diff `maxBlocks` cap guarantees it eventually allows the stop (even against a pre-existing red baseline), plus a `stop_hook_active` re-entry guard, already-verified skip, defer-to-active-loop, empty-ladder/git-missing pass-through, off switches (`features.verifyGate`, `DISABLE_HARNESS`, `STOP`), and fail-open on any error. Decision logic is the pure, unit-tested `lib/risk.mjs`.

> Emits `[omh:verify-gate]`. See the `verifyGate` block in [Configuration](configuration.md).

### Plan Gate

**Hook:** `PreToolUse` (`plan-gate.mjs`) · **Profile:** standard (`features.planGate`)

Where the Verify Gate enforces verification *after* a turn, the Plan Gate enforces planning *before* one. On a **Tier-3 prompt** (the existing prompt-weight classifier — architecture, security, migration, 5+ tasks, or configured domain keywords), `pre-prompt.mjs` arms a per-prompt marker and injects a directive to plan. The PreToolUse hook then **denies** mutating tools until the model plans:

| Tool | Behavior while armed |
|------|---------------------|
| `Edit` / `Write` / `NotebookEdit` / `MultiEdit` | **denied** with the plan directive (until cleared) |
| `Read` / `Grep` / `Glob` / `EnterPlanMode` / … | always allowed (you must investigate to plan) |
| `ExitPlanMode` | **clears** the requirement → edits flow |

So a heavy prompt forces the model to call `EnterPlanMode` and write an implementation plan with **Context · Approach · Files to change · Verification**, present it, and get approval before any file is touched. (A hook cannot switch Claude into plan mode directly — only the model or the user can — so the gate enforces it indirectly by blocking edits.)

That table is the Claude contract. On Codex, the bridge maps `apply_patch` to an edit and clears only for a non-empty `update_plan` whose entries each have a nonblank `step` and an allowed `status`. Other payloads do not clear the shared gate. The denial cap remains the final non-wedging escape hatch.

**It can never wedge a session.** A per-prompt `maxDenials` cap (default 3) eventually allows the edit with a warning; read-only tools are never gated; the marker is per-prompt (a Tier-1/2 prompt or a leading `!noplan` disarms it); and the off switches are `features.planGate` / `DISABLE_HARNESS`. The Claude wrapper fails open on a corrupt marker; the Codex critical preflight fails closed for an armed corrupt marker and a mapped gated tool. Decision logic is the pure, unit-tested `lib/plan-gate.mjs`.

> **Limitation (v1):** Claude gates Edit/Write/NotebookEdit/MultiEdit and Codex also maps `apply_patch`; a `Bash` file-write (`echo > file`) can bypass it. Gating all Bash would block investigation commands, so it is out of scope for v1.

> Emits `[omh:plan-gate]`. See the `planGate` block in [Configuration](configuration.md).

### Decision Log

**Written by:** every hook · **Profile:** always on (`OMH_DECISION_LOG=0` disables it)

Each non-silent hook output is appended to `.claude/.omh/decisions.jsonl` as one JSON line: time, hook, event, decision (`context`, `warn`, `block`, `deny`), the `[omh:*]` tags it emitted, and, for prompts, the tier, its reasons, any override, and the session id. Prompt text and file contents are never stored. The file is bounded to about 500 lines, written only where `.claude/.omh` already exists, and logging can never change a hook's output.

```bash
oh-my-harness why              # last 10 decisions, per-hook counts, override rate, Stop p50/p95
oh-my-harness why --last 30
oh-my-harness why --json       # entries + summary + suggestions
```

`why` also suggests feature changes from the log: enable `planGate` and `testEnforcement` after 3+ verify-gate blocks in a week, disable a nudge that has not fired in 14 days, and review `tier3.domainKeywords` when more than 30% of 20+ routed prompts were overridden. Safety guards are never suggested for removal.

### Handoff

**Skill:** `/omh-handoff` · **CLI:** `oh-my-harness handoff` · **Suggestion hook:** `UserPromptSubmit` (`features.stateSync`)

One session should hold one context. After a compaction, or once a session passes `handoff.promptThreshold` prompts (default 40), `[omh:handoff]` suggests a handoff, once per session. `oh-my-harness handoff` refreshes the `STATE.md` snapshot and writes `.claude/.omh/HANDOFF.md` with **Tried**, **Worked**, **Failed (and why)**, and **Next steps** sections plus your Goal, Decisions, and the generated snapshot. The skill fills only those four sections; start the next session with the file.

### Profiles

`oh-my-harness init --profile minimal|standard|full` (and the same choice in `/harness-setup`) decides which features a **new** config turns on. Existing configs are never re-profiled.

| Profile | Features on |
|---------|-------------|
| `minimal` (default) | `dangerousGuard`, `verifyGate`, `conventionSetup`, `commitConvention`, `autoGitignore`, `stateSync` |
| `standard` | minimal + `testEnforcement`, `weightRouting`, `planGate`, `contextSnapshot`, `skillScaffolding`, `contextOptimization` |
| `full` | every template default (all features except `scopeGuard`) |

Start small; turn more on when `oh-my-harness why` shows a need, with `/set-harness features.<name> true`.

### Docs Sync (opt-in)

**CLI:** `oh-my-harness docs-sync --install | --uninstall | --print` · **Skill:** `/omh-docs-sync`

Installs a `pre-push` git hook. On push it passes the branch's changed code files to `claude -p "/omh-docs-sync ..."` with only Read, Grep, Glob, and Edit allowed. The skill updates only the docs those changes made wrong (and their Korean twins). If any doc changed, the push stops so the doc change is reviewed and committed with the code. A missing `claude` CLI, a failed run, or `OMH_DOCS_SYNC=0` never blocks a push. A pre-push hook you wrote yourself is never replaced without `--force`, and never removed.
