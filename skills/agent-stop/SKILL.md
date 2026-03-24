---
name: agent-stop
description: Stop agents, kill tmux session, and clean up worktrees with safety warnings
level: 2
---

Stop agents, kill tmux session, and clean up worktrees.

Usage: /agent-stop [agent-id|all]
Example: /agent-stop all
Example: /agent-stop 2

## Steps

1. **Read agent state** from `.claude/.omh/agents.json`. If no file exists, report "No active agents." and exit.

2. **Parse arguments**: Determine which agent(s) to stop from `$ARGUMENTS` (default: all).
   Read `useWorktree` from `agents.json` to know whether worktree cleanup is needed.

3. **Check for unapplied changes** (only when `useWorktree` is true):
   For each agent being stopped:
   ```bash
   git log "main..omh/agent-{i}" --oneline
   ```
   If there are unmerged commits, **warn the user** using AskUserQuestion:
   ```
   Agent {i} has {N} unmerged commit(s):
     {commit list}

   What would you like to do?
     apply   — run /agent-apply {i} first, then stop
     discard — throw away these changes and stop
     cancel  — abort, do nothing
   ```
   Never silently discard work. Always wait for explicit user choice.

4. **Kill tmux panes** for target agents:
   ```bash
   # Stopping all agents:
   tmux kill-session -t "{tmuxSession}"
   # Stopping a specific agent:
   tmux send-keys -t "{tmuxSession}:0.{i-1}" C-c
   tmux send-keys -t "{tmuxSession}:0.{i-1}" "exit" Enter
   ```

5. **Remove worktrees** (only when `useWorktree` is true):
   ```bash
   git worktree remove .claude/.omh/worktrees/agent-{i} --force
   git branch -D "omh/agent-{i}"
   ```
   Skip this step entirely when `useWorktree` is false.

6. **Update agent state**:
   - All agents stopped → delete `.claude/.omh/agents.json`
   - Partial stop → set stopped agents' status to `"stopped"`, keep remaining entries

7. **Report cleanup summary** to user.

## Policies

- **ALWAYS warn about unapplied changes** before any cleanup when `useWorktree` is true
- **Never silently discard** — unmerged work requires explicit user confirmation
- **Kill tmux session** only when all agents in it are stopped
- **useWorktree=false** mode: skip steps 3 and 5 entirely (no branches or worktrees to clean up)
