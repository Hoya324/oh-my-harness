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
