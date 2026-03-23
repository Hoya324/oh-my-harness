Check the status of running oh-my-harness agents.

Usage: /agent-status

## Steps

1. **Read agent state** from `.claude/.omh/agents.json`. If no file exists, report "No active agents."

2. **Check tmux session**: `tmux has-session -t omh-agents 2>/dev/null`

3. **For each agent**, check:
   - Is the tmux pane still alive: `tmux list-panes -t omh-agents -F '#{pane_index} #{pane_pid} #{pane_dead}'`
   - Does the worktree branch have new commits: `git log main..omh/agent-{i} --oneline`
   - Diff summary: `git diff main...omh/agent-{i} --stat`

4. **Display status table**:
   ```
   | Agent | Branch          | Status  | Commits | Files Changed |
   |-------|-----------------|---------|---------|---------------|
   | 1     | omh/agent-1     | running | 3       | 5             |
   | 2     | omh/agent-2     | done    | 1       | 2             |
   ```

5. **Suggest next actions** based on status:
   - All done → suggest `/agent-apply`
   - Some running → suggest waiting or `/agent-stop` for specific ones
