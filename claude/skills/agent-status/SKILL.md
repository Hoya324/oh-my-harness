---
name: agent-status
description: Check status of running oh-my-harness agents (commits, files changed, pane state)
level: 2
---

Check the status of running oh-my-harness agents.

Usage: /agent-status

## Steps

1. **Read agent state** from `.claude/.omh/agents.json`. If no file exists, report "No active agents." and exit.

2. **Read `useWorktree`** from `agents.json` to determine how to check progress.

3. **Check tmux session**: `tmux has-session -t "{tmuxSession}" 2>/dev/null`
   If the session doesn't exist, report that agents are no longer running and suggest cleanup.

4. **For each agent**, check:
   - Is the tmux pane still alive: `tmux list-panes -t "{tmuxSession}" -F '#{pane_index} #{pane_pid} #{pane_dead}'`
   - If `useWorktree` is true:
     - New commits: `git log "main..omh/agent-{i}" --oneline`
     - Diff summary: `git diff "main...omh/agent-{i}" --stat`
   - If `useWorktree` is false:
     - Report pane status only (no branch-level diff available)

5. **Display status table**:
   ```
   | Agent | Branch          | Status  | Commits | Files Changed |
   |-------|-----------------|---------|---------|---------------|
   | 1     | omh/agent-1     | running | 3       | 5             |
   | 2     | omh/agent-2     | done    | 1       | 2             |
   ```
   When `useWorktree` is false, omit Branch/Commits/Files columns and show only Agent/Status.

6. **Suggest next actions** based on status:
   - All done → suggest `/agent-apply` (worktree mode) or `/agent-stop`
   - Some running → suggest waiting or `/agent-stop {id}` for specific ones
