---
name: agent-status
description: Use when inspecting tmux agent liveness, commits, diffs, and shared OMH agent state.
---

# Inspect tmux agent status

Read `.claude/.omh/agents.json`. If missing or malformed, report no reliable active-agent state and
stop without modifying anything. Treat recorded ids, branches, worktrees, and session names as
data; validate them before constructing commands.

Check the recorded tmux session and pane liveness. With `useWorktree: true`, compare each recorded
branch to `baseBranch` (fall back to the spawn-time branch only when safely discoverable):

```bash
git log "<base>..<agent-branch>" --oneline
git diff "<base>...<agent-branch>" --stat
git status --short
```

Report uncommitted work separately from commits. Without worktrees, report pane liveness and the
shared checkout status; do not attribute shared changes to an individual agent.

Merge live observations with the state file and label discrepancies `unknown` rather than
guessing. Return agent id, runtime, branch/worktree when applicable, status, commits, changed
files, and uncommitted changes. Suggest `/agent-apply` only for completed worktree agents and
`/agent-stop` for confirmed cleanup. This skill is read-only and must not modify state.
