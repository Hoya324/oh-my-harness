Merge changes from agent worktrees back to the main branch.

Usage: /agent-apply [agent-id|all]
Example: /agent-apply 1
Example: /agent-apply all

## Steps

1. **Read agent state** from `.claude/.omh/agents.json`. If no agents exist, report and exit.

2. **Parse arguments**: Determine which agent(s) to apply from `$ARGUMENTS` (default: show all and ask).

3. **For each agent to apply**, show a diff preview:
   ```bash
   git log main..omh/agent-{i} --oneline
   git diff main...omh/agent-{i} --stat
   ```

4. **Ask user confirmation** using AskUserQuestion:
   - Show the diff summary for each agent
   - Options: "Apply all", "Apply selected", "Cancel"

5. **Merge changes** for confirmed agents:
   ```bash
   git merge omh/agent-{i} --no-ff -m "merge: agent-{i} - {task description}"
   ```
   If merge conflicts occur, report them to the user and suggest manual resolution.

6. **Update agent state**: Set merged agents' status to "applied" in `.claude/.omh/agents.json`.

7. **Suggest cleanup**: After applying, suggest `/agent-stop` to clean up worktrees and tmux session.

## Important
- NEVER force-merge or auto-resolve conflicts
- Always show the user what will be merged before proceeding
- If an agent is still running, warn the user before merging incomplete work
