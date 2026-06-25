<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Plugin-7C3AED?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJMMiA3bDEwIDUgMTAtNS0xMC01ek0yIDE3bDEwIDUgMTAtNS0xMC01LTEwIDV6TTIgMTJsMTAgNSAxMC01LTEwLTUtMTAgNXoiIGZpbGw9IndoaXRlIi8+PC9zdmc+" alt="Claude Code Plugin" />
  <img src="https://img.shields.io/badge/version-0.4.5-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-green?style=for-the-badge&logo=node.js" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/license-MIT-yellow?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/github/actions/workflow/status/Hoya324/oh-my-harness/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI" />
</p>

<h1 align="center">Oh My Harness</h1>

<p align="center">
  <strong>Spec-driven, weight-aware autonomous Claude Code harness. Define the goal — it loops until done.</strong><br/>
  An autonomous loop that self-verifies and cross-verifies, weight-aware routing with multi-model verification, a living on-disk state anchor, plus smart defaults, test enforcement, model routing, and multi-agent orchestration — all through native hooks.
</p>

<p align="center">
  <a href="README.ko.md">한국어</a> &middot;
  <a href="#quick-start">Get Started</a> &middot;
  <a href="docs/features.md">Features</a> &middot;
  <a href="docs/multi-agent.md">Multi-Agent</a> &middot;
  <a href="docs/configuration.md">Config</a> &middot;
  <a href="docs/architecture.md">Architecture</a>
</p>

---

## Why Oh My Harness?

Claude Code is powerful out of the box — but it stops at the end of a turn even when the job isn't done, it doesn't verify its own work against the goal, and it treats every request the same regardless of complexity.

**Oh My Harness (OMH)** turns Claude Code into a **spec-driven autonomous harness**: you define the goal once in a `SPEC.md`, and OMH *loops* — implementing, self-verifying, and cross-verifying — until the spec is objectively met. The loop runs on Claude Code's native hooks, so the **harness owns when to keep going and when to stop** — never the model's self-assessment. Around the loop sit the same lightweight smart defaults (test enforcement, dangerous-op guard, model routing, multi-agent) that make every session safer.

```mermaid
graph LR
    A[You type a prompt] --> B{OMH Hooks}
    B --> C[Ambiguity? Ask first]
    B --> D[3+ tasks? Plan mode]
    B --> E[rm -rf? Warn]
    B --> F[Code changed? Test reminder]
    B --> G[git commit? Convention check]
    style B fill:#7C3AED,color:#fff
```

---

## Philosophy

**Autonomy with real walls.**

Earlier OMH was "warnings instead of walls." The autonomous loop changes that where it counts: a loop that can't be stopped is dangerous, and a loop that stops too early is useless — so the loop has **real walls**. The harness *forces continuation* while the goal is unmet and under budget, and *forces termination* on objective signals (verify ladder green + cross-verify, or a guardrail: iteration/wall-clock budget, no-progress, oscillation). The model never decides it's "done"; the harness does, against machine-checkable acceptance criteria.

Everywhere else, OMH stays the harness you barely notice — smart defaults that guide with warnings, and **project-specific skills** auto-scaffolded from your detected stack (test conventions, review checklists, lint workflows) that you own and customize.

- **Built-in skills** (agent management, setup) stay in the plugin
- **Project skills** (code-review, test-write, lint-fix) live in `.claude/skills/` — your project, your rules
- Run `/init-project` to scaffold, then customize freely

---

## Quick Start

Install via the Claude Code plugin marketplace — one copy-paste:

```bash
claude plugin marketplace add Hoya324/oh-my-harness
claude plugin install oh-my-harness@oh-my-harness
```

That's it. **Zero setup required** — OMH works on sensible defaults the moment it's installed, and harness features (including the autonomous loop) activate automatically. `/harness-setup` is optional and only needed if you want to tune `harness.config.json`.

---

## Updating

When a new version is released, update to get the latest hooks, detection patterns, and features.

```bash
# Pull the latest plugin version
claude plugin update oh-my-harness@oh-my-harness

# Re-apply updated hooks and dictionary
/harness-setup
```

> **Note:** updating preserves your existing `harness.config.json`. Only hooks, commands, and CLAUDE.md instructions are refreshed.

---

## Features Overview

OMH's features fall into three groups — **automatic guards** that fire on every session, **autonomous execution** you invoke explicitly, and the cross-cutting **routing, scaffolding & observability** layer.

### A. Automatic guards & routing — always on

| Feature | Hook | Default | What it does |
|---------|------|:-------:|-------------|
| Convention Auto-Detect | `SessionStart` | ON | Scans project and injects language/test/lint context |
| Weight Routing (Tier 1/2/3) | `UserPromptSubmit` | ON | Classifies prompt weight and routes guardrails proportionally; Tier 3 enforces verification before completion |
| Ambiguity Guard | `UserPromptSubmit` | ON | Forces clarification for vague requests |
| Auto-Plan Mode | `UserPromptSubmit` | ON | Detects 3+ tasks and suggests planning first |
| Dangerous Guard | `PreToolUse` | ON | Warns before `rm -rf`, `git push --force`, `.env` writes |
| Plan Gate | `PreToolUse` (plan-gate) | ON | Tier-3 prompts must produce a plan-mode implementation plan before any edit |
| Commit Convention | `PostToolUse` | ON | Reminds commit format (Conventional / Gitmoji) |
| Scope Guard | `PostToolUse` | OFF | Warns when modifying files outside allowed paths |
| Usage Tracking | `PostToolUse` | ON | Records tool usage per session |
| Test Enforcement | `Stop` | ON | Reminds to verify tests after every code change |
| Verify Gate | `Stop` (verify-gate) | ON | Risk-judges each turn's diff and runs the verify ladder itself; blocks on red for sensitive/untested changes (never wedges) |
| Context Snapshot | `PreCompact` | ON | Saves task state before context compaction |
| Living State (`STATE.md`) | `SessionStart` / `PreCompact` | ON | Disk-anchored goal/phase/decisions re-injected across sessions to fight context rot |

### B. Autonomous execution — you invoke it

| Feature | Trigger | Default | What it does |
|---------|---------|:-------:|-------------|
| **Autonomous Loop** | `Stop` (loop-guard) + `/omh-loop` | ON | Spec-driven loop: forces continuation until the verify ladder + cross-verify confirm done, with tiered guardrails (budget, timeout, no-progress, oscillation) |
| Spec Authoring | `/omh-spec` | ON | Writes a machine-checkable `SPEC.md` (EARS acceptance criteria → verify commands) to anchor the loop |
| N-Round Verify | `/omh-verify` | — | N independent verify+fix rounds with model rotation (Claude → GPT/codex → Gemini); external verifiers run read-only |
| Native Team | `/team-spawn` | ON | Native Claude Code team orchestration with templates |
| Multi-Agent | `/agent-spawn` | — | Parallel Claude agents in tmux with git worktrees |

### C. Routing, scaffolding & observability

| Feature | Trigger | Default | What it does |
|---------|---------|:-------:|-------------|
| Model Routing | CLAUDE.md + agents | ON | Routes subagents to haiku / sonnet / opus by complexity |
| Skill Scaffolding | `/init-project` | ON | Auto-generates project-specific skills based on detected stack |
| Auto .gitignore | CLI init | ON | Adds `.claude/.omh/` to `.gitignore` |
| Status HUD | status line | ON | Real-time rate-limit, context, tool-call, and model dashboard |

> See [Feature Details](docs/features.md), the [Autonomous Loop guide](docs/loop.md), and the [Verification guide](docs/verify.md) for full descriptions.

---

## Autonomous Loop

Define the goal once; OMH loops until it's objectively met.

```bash
/omh-spec add JWT auth with refresh tokens   # writes a machine-checkable SPEC.md
/omh-loop SPEC.md                             # runs it autonomously
/omh-loop stop                                # kill switch (or create .claude/.omh/STOP)
```

**How it works** — the Stop hook (`loop-guard`) is the loop engine *and* the safety enforcer:

```mermaid
graph TD
    SPEC["SPEC.md<br/>(EARS acceptance criteria → verify cmds)"] --> START["/omh-loop"]
    START --> TIER{"classify tier<br/>quick · standard · deep"}
    TIER --> ITER["iterate: ONE task<br/>ripgrep → implement → ladder → commit"]
    ITER --> STOP{{"Stop hook: loop-guard"}}
    STOP -->|"goal unmet & under budget"| CONT["decision: block<br/>(force continue, re-inject spec digest)"]
    CONT --> ITER
    STOP -->|"verify ladder green + cross-verify PASS"| DONE["✅ done"]
    STOP -->|"budget / timeout / no-progress / oscillation"| GUARD["⛔ stop + escalate"]
    style STOP fill:#7C3AED,color:#fff
    style DONE fill:#16a34a,color:#fff
    style GUARD fill:#f59e0b,color:#000
```

- **Cheap-first verify ladder** — deterministic checks (lint/typecheck → tests/build) run first and fail fast, feeding the *actual* failing output back; the expensive model judge only runs on green.
- **Cross-verification** — a *different* model (opus) scores each acceptance criterion against repo state (not the agent's self-report), runs a revert-and-rerun mutation check, and returns `PASS | FAIL | INCONCLUSIVE` (INCONCLUSIVE fails safe to stop).
- **Tiered budgets** — `quick` (≤3 iters) · `standard` (≤8) · `deep` (≤20), each with a wall-clock cap and cross-verify policy.
- **Real guardrails** — per-tier & cross-tier iteration caps, wall-clock timeout, no-progress/plateau and oscillation detection, `stop_hook_active` self-loop guard, concurrent-session/worktree isolation, atomic state, fail-open, and a `STOP` kill switch.

The design and the research behind it (Ralph Wiggum loop, Reflexion, Chain-of-Verification, FrugalGPT-style cascades, EARS) are documented in [docs/loop.md](docs/loop.md).

---

## Weight-Aware Harness

Not every prompt deserves the same scrutiny. OMH classifies each request by **prompt weight** and routes guardrails proportionally — light requests stay frictionless, heavy ones get the full treatment.

```bash
/omh-verify add JWT auth with refresh tokens   # N-round independent multi-model verify + fix
```

- **Weight routing** — a `UserPromptSubmit` hook scores each prompt into **Tier 1** (trivial), **Tier 2** (standard), or **Tier 3** (heavy/risky). Higher tiers tighten guardrails automatically; **Tier 3 forces verification before completion**.
- **N-round verification** — `/omh-verify` runs N independent verify-and-fix rounds, **rotating the model lens each round** (Claude → GPT/codex → Gemini) so blind spots in one model are caught by another. External verifiers (codex, gemini) run **read-only** — they critique, they don't write.
- **Living state anchor** — a disk-anchored `STATE.md` (goal, phase, decisions, progress) is re-injected on `SessionStart` and refreshed before `PreCompact`, so the working context survives compaction and new sessions instead of rotting away.
- **Global config fallback** — settings resolve from the project's `harness.config.json` first, then fall back to a global `~/.claude/.omh`, so your defaults follow you across repos.

Full details, the verifier lenses, and the tier policy live in [docs/verify.md](docs/verify.md).

---

## Architecture

> Full details: [docs/architecture.md](docs/architecture.md)

OMH is built in **four layers**, so the load-bearing decision logic stays pure and unit-tested while the hooks that touch the outside world stay thin and fail-open.

| Layer | Components | Role |
|-------|-----------|------|
| **① Hooks** | 9 `.mjs` on Claude Code lifecycle events | Thin **fail-open** wrappers — gather impure signals (git, time, stdin) and emit decisions |
| **② Pure Core** (`lib/`) | `loop` · `tier` · `detect` · `config` · `verify` · `state` · `dictionary` | All decision logic as **pure functions** (no fs / git / time) → fully unit-tested |
| **③ Skills** | 12 slash commands | User-invoked workflows (`/omh-loop`, `/omh-verify`, `/team-spawn`, …) |
| **④ Agents** | `quick` · `standard` · `architect` | Model routing — haiku / sonnet / opus by task weight |

```mermaid
graph TB
    subgraph "Claude Code Session"
        direction TB
        CC[Claude Code] --> HOOKS[Hook System]
        CC --> SKILLS[Skill System]
        CC --> AGENTS[Agent System]
    end

    subgraph "Oh My Harness"
        direction TB
        HOOKS --> H1[session-start.mjs]
        HOOKS --> H2[pre-prompt.mjs]
        HOOKS --> H3[dangerous-guard.mjs]
        HOOKS --> H4[commit-convention.mjs]
        HOOKS --> H5[scope-guard.mjs]
        HOOKS --> H6[usage-tracker.mjs]
        HOOKS --> H7[pre-compact.mjs]
        HOOKS --> H8[post-task.mjs]
        HOOKS --> H9[loop-guard.mjs]

        SKILLS --> S1["/harness-setup"]
        SKILLS --> S2["/set-harness"]
        SKILLS --> S3["/agent-spawn"]
        SKILLS --> S4["/team-spawn"]
        SKILLS --> S5["/omh-spec"]
        SKILLS --> S6["/omh-loop"]
        SKILLS --> S7["/omh-verify"]

        AGENTS --> A1["harness:quick (haiku)"]
        AGENTS --> A2["harness:standard (sonnet)"]
        AGENTS --> A3["harness:architect (opus)"]
    end

    subgraph "Project Data (.claude/.omh/)"
        CONFIG[harness.config.json]
        CONV[conventions.json]
        USAGE[usage.json]
        SNAP[context-snapshot.md]
        LOOP[loop-state.json]
        STATE[STATE.md]
    end

    H1 --> CONV
    H6 --> USAGE
    H7 --> SNAP
    H9 --> LOOP
    H1 --> STATE
    H7 --> STATE
    H1 --> CONFIG
    H2 --> CONFIG
    H3 --> CONFIG

    style CC fill:#7C3AED,color:#fff
    style CONFIG fill:#f59e0b,color:#000
```

## Hook Pipeline

Each Claude Code lifecycle event triggers one OMH hook — the `Stop` event is where the autonomous loop lives:

| Lifecycle event | Hook | What it does |
|-----------------|------|-------------|
| `SessionStart` | `session-start.mjs` | Detect conventions · inject `STATE.md` |
| `UserPromptSubmit` | `pre-prompt.mjs` | Weight tier · ambiguity guard · auto-plan |
| `PreToolUse` | `dangerous-guard.mjs` · **`plan-gate.mjs`** | Warn on destructive commands · **plan gate (Tier 3)** |
| `PostToolUse` | `commit-convention` · `scope-guard` · `usage-tracker` | Commit format · scope · usage stats |
| `PreCompact` | `pre-compact.mjs` | Snapshot context · refresh `STATE.md` |
| `Stop` | **`loop-guard.mjs`** · **`verify-gate.mjs`** · `post-task.mjs` | **Autonomous loop engine** · **risk-gated verify gate** · test enforcement |

```mermaid
sequenceDiagram
    participant U as User
    participant CC as Claude Code
    participant OMH as OMH Hooks

    Note over CC,OMH: Session Start
    CC->>OMH: SessionStart
    OMH-->>CC: Project: node | test: vitest | lint: eslint

    Note over U,CC: User sends prompt
    U->>CC: "refactor auth and add tests"
    CC->>OMH: UserPromptSubmit
    OMH-->>CC: 2 tasks detected, suggest plan mode
    OMH-->>CC: Request is ambiguous, ask for clarification

    Note over CC,OMH: Tool execution
    CC->>OMH: PreToolUse (Bash: rm -rf dist/)
    OMH-->>CC: WARNING: rm -rf detected. Confirm with user.

    CC->>OMH: PostToolUse (Bash: git commit)
    OMH-->>CC: Convention: feat(scope): description

    Note over CC,OMH: Task complete
    CC->>OMH: Stop
    OMH-->>CC: Code changes detected. Verify tests exist.
```

## Multi-Agent

> Full details: [docs/multi-agent.md](docs/multi-agent.md)

```mermaid
graph TD
    START["/agent-spawn 3 'fix TypeScript errors'"] --> CONFIG[Read multiAgent config]
    CONFIG --> CONFIRM{"User confirms?"}
    CONFIRM -->|Cancel| ABORT[Abort]
    CONFIRM -->|Yes| CHECK[Check prerequisites: tmux, claude, git]
    CHECK --> WT{"useWorktree?"}

    WT -->|true| CREATE_WT["Create worktrees<br/>.claude/.omh/worktrees/agent-1,2,3"]
    WT -->|false| SHARED[Agents share project root]

    CREATE_WT --> TMUX[Create tmux session: omh-agents]
    SHARED --> TMUX

    TMUX --> LAUNCH["Launch claude in each pane<br/>(--dangerously-skip-permissions)"]
    LAUNCH --> STATE[Save state to agents.json]
    STATE --> DONE[Agents running in parallel]

    DONE --> STATUS["/agent-status"]
    DONE --> APPLY["/agent-apply all"]
    DONE --> STOP["/agent-stop all"]

    style START fill:#7C3AED,color:#fff
    style CONFIRM fill:#f59e0b,color:#000
```

```mermaid
gitGraph
    commit id: "main"
    commit id: "your work"
    branch omh/agent-1
    branch omh/agent-2
    branch omh/agent-3
    checkout omh/agent-1
    commit id: "agent-1: fix A"
    commit id: "agent-1: fix B"
    checkout omh/agent-2
    commit id: "agent-2: fix C"
    checkout omh/agent-3
    commit id: "agent-3: fix D"
    commit id: "agent-3: fix E"
    checkout main
    merge omh/agent-1 id: "/agent-apply 1"
    merge omh/agent-2 id: "/agent-apply 2"
    merge omh/agent-3 id: "/agent-apply 3"
```

## Native Team

> Full details: [docs/multi-agent.md](docs/multi-agent.md#native-team-system)

No tmux, no worktrees — use Claude Code's built-in team orchestration.

```mermaid
graph TD
    START["/team-spawn fullstack 'build auth system'"] --> CONFIG[Read nativeTeam config]
    CONFIG --> CONFIRM{"User confirms?"}
    CONFIRM -->|Cancel| ABORT[Abort]
    CONFIRM -->|Yes| CREATE[TeamCreate + TaskCreate]
    CREATE --> SPAWN["Spawn teammates via Agent tool"]
    SPAWN --> ASSIGN[Assign tasks to teammates]
    ASSIGN --> RUNNING[Team running — messages arrive automatically]

    RUNNING --> STATUS["/team-status"]
    RUNNING --> STOP["/team-stop"]

    style START fill:#7C3AED,color:#fff
    style CONFIRM fill:#f59e0b,color:#000
```

| Template | Members | Best For |
|----------|---------|----------|
| `fullstack` | frontend + backend + tester (all sonnet) | Full-stack features |
| `review` | reviewer (opus) + tester (sonnet) | Code review |
| `research` | researcher (haiku) + implementer (sonnet) + architect (opus) | Research-driven work |

---

## Documentation

| Document | Contents |
|----------|----------|
| **[Autonomous Loop](docs/loop.md)** | Spec-driven loop, verify ladder, cross-verification, tiers, guardrails, and the research behind the design |
| **[Verification](docs/verify.md)** | Weight routing (Tier 1/2/3), N-round multi-model verify+fix, read-only external verifiers, living `STATE.md` anchor |
| **[Features](docs/features.md)** | HUD status line, smart defaults, feature tags, detailed feature descriptions |
| **[Architecture](docs/architecture.md)** | System diagram, hook pipeline, plugin & local CLI directory structure |
| **[Multi-Agent](docs/multi-agent.md)** | Spawn commands, workflow, worktree branching model, safety policies |
| **[Configuration](docs/configuration.md)** | Settings reference, CLI commands, slash commands, OMC compatibility, uninstall |

---

## License

MIT
