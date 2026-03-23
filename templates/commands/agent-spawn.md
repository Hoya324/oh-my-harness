Spawn multiple Claude Code agents in parallel tmux panes, each with optional isolated git worktrees.

Usage: /agent-spawn [count] [task description]
Example: /agent-spawn 3 fix all TypeScript errors in src/

## Steps

1. **Parse arguments**: Extract agent count (default: 2) and task description from `$ARGUMENTS`.

2. **Read config**: Load `.claude/.omh/harness.config.json` and extract:
   - `multiAgent.maxAgents` — cap agent count if exceeded (warn user)
   - `multiAgent.useWorktree` — whether to create isolated git worktrees (default: true)
   - `multiAgent.tmuxSession` — tmux session name (default: `omh-agents`)

3. **Confirm with user** using AskUserQuestion before doing anything:
   Show a clear summary of exactly what will happen:
   ```
   About to spawn {N} Claude agents:

     Task        : {task description}
     Tmux session: {tmuxSession}
     Worktrees   : YES — each agent gets branch omh/agent-{i}
                   (or: NO — agents share the main working directory)
     Permissions : --dangerously-skip-permissions (agents run without tool confirmations)

   Proceed? [yes / cancel]
   ```
   If the user says no or cancel, stop immediately. Do not proceed.

4. **Check prerequisites** (fail fast, report clearly):
   - `which tmux` — tmux must be installed
   - `which claude` — claude CLI must be in PATH
   - If `useWorktree` is true: `git rev-parse --git-dir` — must be a git repo
   - Check `.claude/.omh/agents.json` — if it exists with running agents, warn and ask to abort or replace

5. **Create worktrees** (only when `useWorktree` is true):
   For each agent i from 1 to N:
   ```bash
   git worktree add .claude/.omh/worktrees/agent-{i} -b omh/agent-{i}
   ```
   Working directory per agent: `.claude/.omh/worktrees/agent-{i}`.
   When `useWorktree` is false, all agents run from the project root.

6. **Create tmux session**:
   ```bash
   # First pane — agent-1 workdir
   tmux new-session -d -s {tmuxSession} -c {workdir-for-agent-1}
   # Remaining panes
   tmux split-window -t {tmuxSession} -c {workdir-for-agent-i}   # repeat for i=2..N
   tmux select-layout -t {tmuxSession} tiled
   ```

7. **Launch Claude in each pane**:
   ```bash
   tmux send-keys -t {tmuxSession}:0.{i-1} "claude --dangerously-skip-permissions '{task}'" Enter
   ```

8. **Save agent state** to `.claude/.omh/agents.json`:
   ```json
   {
     "session": "{tmuxSession}",
     "spawned_at": "ISO timestamp",
     "task": "task description",
     "useWorktree": true,
     "agents": [
       { "id": 1, "status": "running", "branch": "omh/agent-1", "worktree": ".claude/.omh/worktrees/agent-1" }
     ]
   }
   ```
   When `useWorktree` is false, omit `branch` and `worktree` fields per agent.

9. **Report summary** and next steps:
   ```
   Spawned {N} agents in tmux session '{tmuxSession}'.

   Next steps:
     /agent-status           — check progress (commits, files changed)
     /agent-apply [id|all]   — preview and merge changes  (worktree mode only)
     /agent-stop [id|all]    — stop agents and clean up
     tmux attach -t {tmuxSession}  — watch live output
   ```

## Policies

- **Always ask user first** — never spawn without explicit confirmation
- **useWorktree=true (default)**: each agent is isolated; changes reach main only via `/agent-apply`
- **useWorktree=false**: agents share the working directory; safe only for read-only or non-conflicting tasks
- **--dangerously-skip-permissions**: agents bypass tool confirmation prompts — always disclose this to the user
- **Never exceed maxAgents**: if N > maxAgents, cap and inform the user
