---
name: team-status
description: Check status of the active native Claude Code team (teammates, tasks, progress)
level: 2
---

Check the status of the active native Claude Code team, including teammate status and task progress.

Usage: /team-status

## Steps

1. **Read team state** from `.claude/.omh/teams.json`.
   If the file doesn't exist or is empty, report "No active team. Use `/team-spawn` to create one." and exit.

2. **Read native team config**: Use the Read tool to read `~/.claude/teams/{teamName}/config.json` to get the current member list from the Claude Code runtime.
   If the file doesn't exist, the team may have been deleted externally. Report this and suggest cleanup.

3. **Get task list**: Call the `TaskList` tool to get all tasks and their current status.

4. **Display team status table**:
   ```
   Team: {teamName}
   Created: {timestamp}
   Task: {description}

   | Teammate   | Role              | Model  | Status |
   |------------|-------------------|--------|--------|
   | frontend   | Frontend dev      | sonnet | idle   |
   | backend    | Backend dev       | sonnet | active |
   | tester     | Test writer       | sonnet | idle   |
   ```

   Map `agentType` to model name for display:
   - `quick` -> `haiku`
   - `standard` -> `sonnet`
   - `architect` -> `opus`

5. **Display task progress table**:
   ```
   | ID | Task                        | Owner    | Status      | Blocked By |
   |----|-----------------------------| ---------|-------------|------------|
   | 1  | Fix frontend TS errors      | frontend | completed   |            |
   | 2  | Fix backend TS errors       | backend  | in_progress |            |
   | 3  | Write tests for fixes       | tester   | pending     | 2          |
   ```

6. **Show progress summary**:
   ```
   Progress: {completed}/{total} completed, {in_progress} in progress, {blocked} blocked
   ```

7. **Suggest next actions** based on status:
   - All tasks completed -> "All tasks done! Run `/team-stop` to shutdown and cleanup."
   - Some tasks in progress -> "Teammates are still working. Messages will arrive automatically."
   - Tasks blocked -> "Task {id} is blocked by {blockerIds}. Consider helping resolve the blockers."
   - Some teammates idle with pending tasks -> "Consider assigning pending tasks to idle teammates."
