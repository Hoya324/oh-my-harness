# Features

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

OMH hooks into Claude Code's lifecycle and activates automatically. No manual intervention needed.

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
│  │ → Warn + confirm     │   │ paths? → Warn         │            │
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
[omh:dangerous-guard]    → Warning before destructive command
[omh:model-routing → sonnet] → Delegating to sonnet for implementation
[omh:test-enforcement]   → Reminding to verify tests after code change
[omh:commit-convention]  → Showing commit format after git commit
[omh:scope-guard]        → Warning about edit outside allowed paths
[omh:convention-detect]  → Detected project conventions on session start
[omh:context-snapshot]   → Saving state before context compaction
[omh:loop]               → Autonomous loop forced continuation / stop decision
[omh:cross-verify]       → Cross-verification verdict (PASS / FAIL / INCONCLUSIVE)
[omh:spec]               → Spec authoring / acceptance-criteria check
```

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

After code changes (Edit / Write / NotebookEdit), injects a reminder at session stop:

- Verify test files exist for changed code
- Each test file has at least **N** cases (configurable, default: 2)
- Suggest adding tests if missing

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

Warns before potentially destructive operations:

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

> Warning only — does not block execution. Asks Claude to confirm with user.

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

When enabled with `allowedPaths`, warns if Edit/Write targets files outside the allowed directories.

```json
{
  "features": { "scopeGuard": true },
  "scopeGuard": { "allowedPaths": ["src/auth", "src/utils"] }
}
```

> OFF by default. Enable when you want to restrict Claude's write scope.

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

Automatically generates project-specific skills in `.claude/skills/` based on detected conventions.

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

1. Run `/init-project` or `oh-my-harness init`
2. OMH detects your project's language and tools
3. Skill templates are rendered with your specific tools (e.g., "vitest" not "test runner")
4. Skills are written to `.claude/skills/` — Claude Code auto-discovers them
5. Customize freely — OMH never overwrites existing skills

> Skills are user-owned files. `oh-my-harness reset` will NOT delete them.

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

Set to `false` to disable scaffold hints and skip skill generation during init.

### 12. Native Team

Orchestrate parallel work using Claude Code's built-in team system — no tmux or worktree dependencies.

**Templates:**

| Template | Members | Model Routing |
|----------|---------|---------------|
| `fullstack` | frontend + backend + tester | All sonnet |
| `review` | reviewer + tester | opus + sonnet |
| `research` | researcher + implementer + architect | haiku + sonnet + opus |

**Commands:**

| Command | What it does |
|---------|-------------|
| `/team-spawn [template\|N] [task]` | Create team, decompose tasks, spawn teammates |
| `/team-status` | Show teammate status and task progress |
| `/team-stop` | Shutdown team with incomplete task warnings |

**How it works:**

1. Run `/team-spawn fullstack build auth system`
2. OMH creates a native team via TeamCreate
3. Tasks are decomposed and assigned to teammates
4. Teammates work in parallel, communicating via SendMessage
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

The headline feature of 0.2.0. Define a goal once in a `SPEC.md`, then OMH *loops* — implementing, self-verifying, and cross-verifying — until the spec is objectively met. The philosophy here is the opposite of OMH's usual "warnings instead of walls": the **harness owns when to continue and when to stop**, never the model's self-assessment.

**Trigger:** the Stop hook `hooks/loop-guard.mjs` *is* the loop engine and safety enforcer. Once `/omh-loop` writes an active state, every Stop event re-enters the hook. To continue it prints a **top-level** `{"decision":"block","reason":...}` on stdout and exits 0 (never exit 2, never nested under `hookSpecificOutput`); when the goal is met or a guardrail fires, it lets the session stop. The pure, unit-tested core lives in `lib/loop.mjs` (`evaluateLoop`, `classifyTier`, `buildLadder`, `detectPlateau`, `detectOscillation`).

**Commands:**

| Command | What it does |
|---------|-------------|
| `/omh-loop "<goal>"` or `/omh-loop SPEC.md` | Classify tier, gate on the spec, confirm, then iterate one task at a time |
| `/omh-loop stop` | Kill switch — aborts the loop (same as creating `.claude/.omh/STOP`) |

**Cheap-first verify ladder** — strictly ordered rungs that fail fast and run the cheapest check first. On the first failure it blocks with the *actual* failing output piped back as the next iteration's instruction, so the model never burns an expensive judge on structurally broken code. Each rung has its own subprocess timeout.

```
quickCheck (lint / typecheck)  →  verify (tests / build)  →  self-review  →  cross-verify
   30s, deterministic              180s, deterministic        same model      different model
```

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
    "rungTimeoutSec": { "quickCheck": 30, "verify": 180 }
  }
}
```

> ON by default, but **inert** until `/omh-loop` writes an active state — zero overhead for non-loop sessions. See [the Autonomous Loop guide](loop.md) for the full config block and design rationale.

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
