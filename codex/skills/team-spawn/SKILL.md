---
name: team-spawn
description: Use when creating a confirmed Codex native subagent team for bounded parallel work.
---

# Spawn a Codex native team

Read `../../references/runtime-map.md`. Never spawn agents during installation, setup, discovery,
or merely because this skill loaded.

## Resolve the team

Parse a template name (`fullstack`, `review`, `research`), positive teammate count, or custom
composition plus a concrete task. Read `.claude/.omh/harness.config.json`:

- stop when `features.nativeTeam` is false;
- enforce `nativeTeam.maxTeammates`;
- use `nativeTeam.defaultTeamName` and configured templates;
- treat `modelRouting` and agent profiles as preferences, not availability guarantees.

Require the team name to match `^[a-zA-Z0-9_-]+$`; ask for another name instead of silently
changing user input. Treat any existing `.claude/.omh/teams.json` as protected, including
`starting`, active, partial, malformed, failed, stopped-but-unclean, or otherwise unresolved state.
Call `list_agents` and reconcile exact persisted canonical tasks and opaque agent ids when parsing
is possible. Preserve malformed raw state for recovery.

Present cleanup and resume choices and require an explicit decision before any replacement:

- `resume`: preserve the file and recovery ids, then continue only the reconciled existing team;
- `cleanup`: use `/team-stop` behavior and wait for observed terminal agents before changing state;
- `cancel`: change nothing.

Never overwrite recovery ids. Replacement requires explicit confirmation after cleanup is observed
complete; a malformed or partial file is not permission to initialize a new team.

Ask necessary questions directly in chat when “review,” “fix,” or another goal lacks files,
acceptance criteria, or compatibility boundaries. Decompose the task into concrete, bounded
assignments with explicit deliverables, paths, verification, and dependencies. Spawn only
assignments that can run now; retain blocked work in state for later dispatch. Avoid multiple
agents editing the same files unless the user accepts the collision plan.

## Confirmation gate

Show team name, task, template, every agent name/role, exact assignment, dependency, proposed model
when known, and state path. Explain that each approval creates a live Codex subagent. Obtain
explicit confirmation before any state write or `spawn_agent` call. Cancel without side effects on
any answer other than clear approval.

## Spawn and persist

After confirmation, create `.claude/.omh/teams.json` atomically with `status: "starting"` and the
confirmed task records. Call `spawn_agent` once per ready assignment using a stable unique task
name. Do not invent or normalize returned identifiers. After each success, atomically persist the
returned canonical task name and agent id so partial failure is recoverable:

```json
{
  "teamName": "omh-team",
  "createdAt": "ISO timestamp",
  "description": "confirmed task",
  "template": "review",
  "status": "active",
  "teammates": [
    {
      "name": "reviewer",
      "role": "Code reviewer",
      "agentType": "architect",
      "canonicalTask": "/root/reviewer",
      "agentId": "opaque returned id",
      "assignment": "bounded assignment",
      "status": "working"
    }
  ],
  "tasks": [
    {
      "name": "reviewer",
      "subject": "Review payment refactor",
      "status": "in_progress",
      "blockedBy": []
    }
  ]
}
```

If a spawn fails, stop dispatching, retain confirmed state and successful ids, and report the
partial team. Use `send_message` only with a persisted canonical task or agent target when
coordination is needed. Never claim a requested profile proves a particular model. Report
`/team-status` and `/team-stop` as next actions.
