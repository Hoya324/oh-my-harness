---
name: team-stop
description: Shutdown the active native Claude Code team, notify teammates, and cleanup
level: 2
---

Shutdown the active native Claude Code team: notify teammates, cleanup team and task files.

Usage: /team-stop

## Steps

1. **Read team state** from `.claude/.omh/teams.json`.
   If the file doesn't exist or is empty, report "No active team." and exit.

2. **Check task completion**: Call `TaskList` to see if there are incomplete tasks.
   If there are `in_progress` or `pending` tasks, warn the user via AskUserQuestion:
   ```
   Team '{teamName}' has {N} incomplete task(s):
     - [{status}] {subject} ({owner})
     - ...

   What would you like to do?
     continue — let teammates finish their work
     stop     — shutdown now (incomplete tasks will be abandoned)
     cancel   — abort, do nothing
   ```
   - If the user says `continue`, exit without stopping.
   - If the user says `cancel`, exit without stopping.
   - If the user says `stop`, proceed with shutdown.
   - Never silently discard incomplete work.

3. **Send shutdown requests**: Use `SendMessage` to broadcast a shutdown request to all teammates:
   ```json
   { "to": "*", "message": { "type": "shutdown_request", "reason": "Team shutdown requested by user" } }
   ```

4. **Delete team**: Call `TeamDelete` to remove team and task directories.
   - If `TeamDelete` fails because active members still exist, report the issue:
     ```
     Some teammates have not yet shut down. Waiting for shutdown confirmations...
     ```
     Retry `TeamDelete` after a brief wait (send shutdown messages again if needed).

5. **Clean up OMH state**: Delete `.claude/.omh/teams.json` using the Bash tool:
   ```bash
   rm -f .claude/.omh/teams.json
   ```

6. **Report cleanup summary**:
   ```
   Team '{teamName}' has been shut down.

   Tasks completed: {completed}/{total}
   Teammates stopped: {list of names}
   Team files cleaned up.
   ```

## Policies

- **Always warn about incomplete tasks** — never silently discard in-progress work
- **Require explicit user confirmation** before stopping with incomplete tasks
- **Use broadcast SendMessage** for shutdown (more efficient than individual messages)
- **Clean up both native team files and OMH state** — leave no orphaned state
- **If TeamDelete fails**, explain why and suggest remediation
