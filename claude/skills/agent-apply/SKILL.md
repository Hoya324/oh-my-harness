---
name: agent-apply
description: Merge changes from agent worktrees back to the main branch with diff preview
level: 2
---

Merge changes from agent worktrees back to the main branch.

Usage: /agent-apply [agent-id|all]
Example: /agent-apply 1
Example: /agent-apply all

## Steps

1. **Read agent state** from `.claude/.omh/agents.json`. If no agents exist, report and exit.

2. **Check useWorktree**: If `useWorktree` is false, report "Agent apply is only available in worktree mode." and exit.

3. **Parse arguments**: Determine which agent(s) to apply from `$ARGUMENTS` (default: show all and ask).

4. **For each agent to apply**, show a diff preview:
   ```bash
   git log "main..omh/agent-{i}" --oneline
   git diff "main...omh/agent-{i}" --stat
   ```

5. **Ask user confirmation** using AskUserQuestion:
   - Show the diff summary for each agent
   - Options: "Apply all", "Apply selected", "Cancel"

6. **Merge changes** for confirmed agents:
   ```bash
   git merge "omh/agent-{i}" --no-ff -m "merge: agent-{i} - {task description}"
   ```
   If merge conflicts occur, report them to the user and suggest manual resolution.

7. **Update agent state**: Set merged agents' status to "applied" in `.claude/.omh/agents.json`.

8. **Suggest cleanup**: After applying, suggest `/agent-stop` to clean up worktrees and tmux session.

## Policies

- **NEVER force-merge or auto-resolve conflicts** — report conflicts and let user decide
- **Always show diff before merging** — user must see what will change
- **Warn if agent is still running** — merging incomplete work may cause issues
- **Only available in worktree mode** — shared-directory agents have no branches to merge
