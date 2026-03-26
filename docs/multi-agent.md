# Multi-Agent System

Spawn parallel Claude Code instances in tmux panes, each with an isolated git worktree.

## Commands

| Command | Description |
|---------|-------------|
| `/agent-spawn [N] [task]` | Spawn N agents (default: 2) with worktrees in tmux panes |
| `/agent-status` | Check status of all agents (commits, changed files) |
| `/agent-apply [id\|all]` | Preview and merge agent changes to main (worktree mode only) |
| `/agent-stop [id\|all]` | Stop agents, warn about unmerged work, cleanup |

## Workflow

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

    APPLY --> DIFF[Show diff preview per agent]
    DIFF --> MERGE{"User approves?"}
    MERGE -->|Yes| GIT_MERGE["git merge --no-ff"]
    MERGE -->|Cancel| BACK[Back to running]

    STOP --> UNMERGED{"Unmerged commits?"}
    UNMERGED -->|Yes| WARN["Warn user:<br/>apply / discard / cancel"]
    UNMERGED -->|No| CLEANUP["Kill tmux + remove worktrees"]
    WARN -->|discard| CLEANUP
    WARN -->|apply| APPLY

    style START fill:#7C3AED,color:#fff
    style CONFIRM fill:#f59e0b,color:#000
    style MERGE fill:#f59e0b,color:#000
    style UNMERGED fill:#f59e0b,color:#000
```

## Worktree Branching Model

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

## Worktree Mode vs Shared Mode

| | `useWorktree: true` (default) | `useWorktree: false` |
|---|---|---|
| **Isolation** | Each agent on its own branch | All agents in project root |
| **Conflicts** | Impossible during parallel work | Possible — use with care |
| **`/agent-apply`** | Required to merge changes | Not applicable |
| **`/agent-stop`** | Warns about unmerged commits | Just kills panes |
| **Best for** | Any parallel code changes | Read-only tasks, analysis |

## Prerequisites

- **tmux** — `brew install tmux` (macOS) / `apt install tmux` (Linux)
- **git** — for worktree isolation
- **claude CLI** — must be available in PATH

## Safety Policies

- **Always ask first** — never spawn without explicit user confirmation
- **Never auto-merge** — `/agent-apply` always shows a diff and waits for approval
- **Never silently discard** — `/agent-stop` with unmerged commits requires explicit choice
- **`--dangerously-skip-permissions`** — agents bypass tool prompts; user is always told this upfront
- **Max agents** — capped by `multiAgent.maxAgents` (default: 4)

---

# Native Team System

Use Claude Code's built-in team orchestration — no tmux or worktree dependencies required.

## Commands

| Command | Description |
|---------|-------------|
| `/team-spawn [template\|N] [task]` | Create a team with teammates from a template or custom count |
| `/team-status` | Check teammate status and task progress |
| `/team-stop` | Shutdown teammates, warn about incomplete tasks, cleanup |

## Templates

| Template | Members | Use For |
|----------|---------|---------|
| `fullstack` | frontend (sonnet) + backend (sonnet) + tester (sonnet) | Full-stack feature development |
| `review` | reviewer (opus) + tester (sonnet) | Code review and testing |
| `research` | researcher (haiku) + implementer (sonnet) + architect (opus) | Research-driven development |

## Workflow

```mermaid
graph TD
    START["/team-spawn fullstack 'build auth system'"] --> CONFIG[Read nativeTeam config]
    CONFIG --> CONFIRM{"User confirms?"}
    CONFIRM -->|Cancel| ABORT[Abort]
    CONFIRM -->|Yes| CREATE[TeamCreate: create team + task list]
    CREATE --> TASKS[TaskCreate: decompose into subtasks]
    TASKS --> SPAWN["Spawn teammates via Agent tool<br/>(with team_name + name)"]
    SPAWN --> ASSIGN[TaskUpdate: assign tasks to teammates]
    ASSIGN --> RUNNING[Team running — messages arrive automatically]

    RUNNING --> STATUS["/team-status"]
    RUNNING --> STOP["/team-stop"]

    STOP --> CHECK{"Incomplete tasks?"}
    CHECK -->|Yes| WARN["Warn user:<br/>continue / stop / cancel"]
    CHECK -->|No| SHUTDOWN[SendMessage shutdown + TeamDelete]
    WARN -->|stop| SHUTDOWN

    style START fill:#7C3AED,color:#fff
    style CONFIRM fill:#f59e0b,color:#000
    style CHECK fill:#f59e0b,color:#000
```

## Multi-Agent vs Native Team

| | Multi-Agent (`/agent-spawn`) | Native Team (`/team-spawn`) |
|---|---|---|
| **Infrastructure** | tmux + git worktrees | Claude Code built-in tools |
| **Prerequisites** | tmux, git, claude CLI | None (built-in) |
| **Isolation** | Git branches per agent | Shared repo (or Agent tool isolation) |
| **Communication** | Observe tmux panes | SendMessage between teammates |
| **Task Management** | TASK.md files | TaskCreate / TaskList / TaskUpdate |
| **Merge Strategy** | `/agent-apply` (manual merge) | Not needed — no branches |
| **Best for** | Parallel code changes needing isolation | Coordinated team workflows |

## Safety Policies

- **Always ask first** — never create a team without explicit user confirmation
- **Never silently discard** — `/team-stop` with incomplete tasks requires explicit choice
- **Max teammates** — capped by `nativeTeam.maxTeammates` (default: 4)
- **One team at a time** — must stop existing team before creating a new one
