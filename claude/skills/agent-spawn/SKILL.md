---
name: agent-spawn
description: Spawn multiple Claude Code agents in parallel tmux panes with optional git worktrees
level: 2
---

Spawn multiple Claude Code agents in parallel tmux panes, each with optional isolated git worktrees.

Usage: /agent-spawn [count] [task description]
Example: /agent-spawn 3 fix all TypeScript errors in src/

## Steps

1. **Parse arguments**: Extract agent count (default: 2) and task description from `$ARGUMENTS`.

2. **Read config**: Load `.claude/.omh/harness.config.json` and extract:
   - `multiAgent.maxAgents` — cap agent count if exceeded (warn user)
   - `multiAgent.useWorktree` — whether to create isolated git worktrees (default: true)
   - `multiAgent.tmuxSession` — tmux session name (default: `omh-agents`)

   **Validate inputs** before proceeding:
   - `tmuxSession` must match `^[a-zA-Z0-9_-]+$` — if not, reject with error: "Invalid tmux session name. Only alphanumeric, dash, underscore allowed."
   - Agent count `N` must be a positive integer ≤ maxAgents

3. **Confirm with user** using AskUserQuestion before doing anything:
   Show a clear summary of exactly what will happen:
   ```
   About to spawn {N} Claude agents:

     Task        : {task description}
     Tmux session: {tmuxSession}
     Worktrees   : YES — each agent gets branch omh/agent-{i}
                   (or: NO — agents share the main working directory)
     Permissions : --dangerously-skip-permissions (agents run without tool confirmations)
     Auto-view   : A new terminal window will open showing all agent panes

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
   tmux new-session -d -s "{tmuxSession}" -c {workdir-for-agent-1}
   # Remaining panes
   tmux split-window -t "{tmuxSession}" -c {workdir-for-agent-i}   # repeat for i=2..N
   tmux select-layout -t "{tmuxSession}" tiled
   ```

7. **Prepare task descriptions**:
   Task descriptions may contain newlines, quotes, or special characters that break shell quoting.
   **Always write each agent's task to a file** and reference it in the command:
   ```bash
   # Write task file per agent (inside the agent's working directory)
   # File: {workdir}/TASK.md
   ```
   Use the Write tool to create `TASK.md` in each agent's worktree/working directory.
   This avoids all shell escaping issues with multiline or complex task descriptions.

8. **Launch Claude in each pane**:
   Use `--permission-mode bypassPermissions` instead of `--dangerously-skip-permissions` to avoid the interactive consent prompt:
   ```bash
   tmux send-keys -t "{tmuxSession}:0.{i-1}" "claude --permission-mode bypassPermissions -p 'TASK.md 파일을 읽고 그 안의 지시사항대로 작업해줘.'" Enter
   ```
   **Important**:
   - The `-p` (print) flag skips the workspace trust dialog and runs non-interactively.
   - The task content is in `TASK.md`, NOT inline — this prevents shell injection and quoting issues.
   - If different agents have different tasks, each agent's `TASK.md` contains its own task.

9. **Auto-open terminal with tmux session** (macOS):
   Immediately after launching agents, open a new terminal window attached to the tmux session so the user can watch live:
   ```bash
   # Detect terminal emulator and open accordingly
   if [[ "$TERM_PROGRAM" == "iTerm.app" ]] || pgrep -q iTerm2; then
     osascript -e 'tell application "iTerm2" to create window with default profile command "tmux attach -t \"{tmuxSession}\""'
   elif [[ "$TERM_PROGRAM" == "WarpTerminal" ]] || pgrep -q Warp; then
     open -a "Warp" --args -e "tmux attach -t \"{tmuxSession}\""
   else
     osascript -e 'tell application "Terminal" to do script "tmux attach -t \"{tmuxSession}\""'
   fi
   ```
   On Linux (non-macOS):
   ```bash
   # Fallback: suggest manual attach
   echo "Run: tmux attach -t \"{tmuxSession}\""
   ```

10. **Save agent state** to `.claude/.omh/agents.json`:
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

11. **Report summary** and next steps:
   ```
   Spawned {N} agents in tmux session '{tmuxSession}'.
   A terminal window has been opened — you can watch agents live.

   Next steps:
     /agent-status           — check progress (commits, files changed)
     /agent-apply [id|all]   — preview and merge changes  (worktree mode only)
     /agent-stop [id|all]    — stop agents and clean up
   ```

## Policies

- **Always ask user first** — never spawn without explicit confirmation
- **useWorktree=true (default)**: each agent is isolated; changes reach main only via `/agent-apply`
- **useWorktree=false**: agents share the working directory; safe only for read-only or non-conflicting tasks
- **--permission-mode bypassPermissions -p**: agents run non-interactively without consent prompts — always disclose this to the user
- **Never exceed maxAgents**: if N > maxAgents, cap and inform the user
- **Auto-view**: always open a new terminal window showing the tmux session after spawning
- **Shell injection prevention**: task descriptions are written to TASK.md files, never passed inline to shell commands
