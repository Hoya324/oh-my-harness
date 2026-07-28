---
name: team-spawn
description: Create a native Claude Code team with configured teammates and task assignments
level: 2
---

Create a native Claude Code team using TeamCreate, spawn teammates, and assign tasks.

Usage: /team-spawn [template|N] [task description]
Example: /team-spawn fullstack fix all TypeScript errors in src/
Example: /team-spawn 3 implement user authentication
Example: /team-spawn review refactor the payment module

## Steps

1. **Parse arguments**: Extract template name (or teammate count N) and task description from `$ARGUMENTS`.
   - If the first word matches a template name (`fullstack`, `review`, `research`), use that template.
   - If the first word is a number N, create N generic teammates named `teammate-1` through `teammate-N`, all with `agentType: standard`.
   - If neither, ask the user via AskUserQuestion which template to use (show available templates with their descriptions and members) or let them describe custom composition.

2. **Read config**: Load `.claude/.omh/harness.config.json` and extract:
   - `features.nativeTeam` — if disabled, inform the user and exit
   - `nativeTeam.maxTeammates` — cap teammate count if exceeded (warn user)
   - `nativeTeam.defaultTeamName` — team name to use (default: `omh-team`)
   - `nativeTeam.templates` — available team templates
   - `modelRouting` — for mapping agentType to model tiers

3. **Determine team composition**:
   - If a template name is provided (e.g., `fullstack`), use that template's members.
   - If a number N is provided, create N generic teammates named `teammate-1` through `teammate-N`, all with `agentType: standard`.
   - If neither, ask the user via AskUserQuestion which template to use or let them describe custom composition.
   - Validate: total teammates must not exceed `maxTeammates`.

4. **Validate team name**: The team name must match `^[a-zA-Z0-9_-]+$`. If not, sanitize by stripping invalid characters. Fall back to `omh-team` if empty.

5. **Confirm with user** using AskUserQuestion before doing anything:
   ```
   About to create team '{teamName}':

     Task       : {task description}
     Template   : {template name or "custom"}
     Teammates  :
       - {name} ({role}) — [omh:model-routing -> {model}]
       - ...

   Proceed? [yes / cancel]
   ```
   If the user says no or cancel, stop immediately. Do not proceed.

6. **Check for existing team**: Read `.claude/.omh/teams.json`. If it exists with an active team, warn:
   ```
   A team '{existingTeam}' is already active.
   Stop it first with /team-stop, or choose a different team name.
   ```
   Stop and do not proceed.

7. **Create team**: Call the `TeamCreate` tool:
   ```json
   { "team_name": "{teamName}", "description": "{task description}" }
   ```

8. **Decompose and create tasks**: Analyze the task description and break it into subtasks appropriate for the team composition. Call `TaskCreate` for each subtask.
   - If the task is simple or the user gave a single task, create one task per teammate.
   - If the task is complex, decompose intelligently and set up dependencies using `TaskUpdate` with `addBlockedBy`.
   - Each task should have a clear, actionable subject and description.

9. **Spawn teammates**: For each teammate in the composition, use the `Agent` tool:
   - Set `team_name` to the team name
   - Set `name` to the teammate name (e.g., `frontend`, `backend`, `tester`)
   - Set `subagent_type` based on `agentType`:
     - `quick` -> `oh-my-harness:quick`
     - `standard` -> `oh-my-harness:standard`
     - `architect` -> `oh-my-harness:architect`
   - Announce `[omh:model-routing -> {model}]` for each teammate spawned
   - Give each teammate initial instructions to check TaskList and begin work on their assigned tasks

10. **Assign tasks**: Use `TaskUpdate` to set `owner` on tasks that map to specific teammates.

11. **Save team state** to `.claude/.omh/teams.json`:
    ```json
    {
      "teamName": "{teamName}",
      "createdAt": "ISO timestamp",
      "description": "{task description}",
      "template": "{template name or 'custom'}",
      "teammates": [
        { "name": "frontend", "role": "Frontend developer", "agentType": "standard" }
      ]
    }
    ```

12. **Report summary** and next steps:
    ```
    Team '{teamName}' created with {N} teammates.

    Teammates:
      - {name} ({model}) — {role}
      - ...

    Tasks created: {M}
    Messages from teammates will appear automatically.

    Next steps:
      /team-status   — check teammate progress and task list
      /team-stop     — shutdown team and cleanup
    ```

## Policies

- **Always ask user first** — never create a team without explicit confirmation
- **Never exceed maxTeammates**: if N > maxTeammates, cap and inform the user
- **Announce model routing**: prefix with `[omh:model-routing -> {model}]` when spawning each teammate
- **Team name validation**: must match `^[a-zA-Z0-9_-]+$`
- **One team at a time**: check for existing active team before creating a new one
- **Task decomposition**: break complex tasks into meaningful subtasks with proper dependencies
