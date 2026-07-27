---
name: agent-spawn
description: Use when launching parallel tmux agents with optional isolated Git worktrees under Oh My Harness.
---

# Spawn tmux agents

Launch external CLI agents only after validating and confirming the complete plan. This workflow
does not use Codex native collaboration; use `/team-spawn` for that.

## Resolve inputs

Parse a positive integer count (default 2) and a concrete task. Ask necessary scope questions
directly in chat before decomposition. Read `.claude/.omh/harness.config.json`:

- `multiAgent.maxAgents`: reject or explicitly cap a larger request.
- `multiAgent.useWorktree`: default true.
- `multiAgent.tmuxSession`: default `omh-agents`; require `^[a-zA-Z0-9_-]+$`.
- `multiAgent.runtime`: accept only `claude` or `codex`; default `codex` in Codex setup.

Reject an invalid count or empty assignment. Read `.claude/.omh/agents.json`; if it records live or
unapplied agents, stop and ask the user to keep, apply, or explicitly clean them up.

Check `tmux`, the selected runtime executable, and Git when worktrees are enabled. Check the base
branch, existing branches, worktree paths, tmux session, and dirty working tree without changing
them. Do not reuse conflicting names.

## Confirmation gate

Show every assignment, selected runtime, exact count, tmux session, base branch, worktree/branch
paths, shared-directory collision risk, launch command, and cleanup/merge boundaries. For the
`claude` runtime, disclose `--permission-mode bypassPermissions` as permission bypass. Obtain
explicit confirmation before creating worktrees, writing task files, starting tmux, or bypassing
permissions. Cancel without side effects on any answer other than a clear approval.

## Isolate and write tasks

With worktrees enabled, create:

```text
.claude/.omh/worktrees/agent-1  branch omh/agent-1
.claude/.omh/worktrees/agent-2  branch omh/agent-2
```

Create each worktree from the recorded base branch. More than one agent with
`useWorktree: false` must be rejected because every launch would share the checkout and root
`TASK.md`. Permit a single shared checkout agent only for an explicitly non-conflicting assignment.

Write the complete task text to `{worktree}/TASK.md` with a file-writing operation. Never interpolate
task text, newlines, quotes, substitutions, backticks, or shell metacharacters into a command. The
fixed prompt may name `TASK.md`; the task itself must appear only in `TASK.md`. Do not use shell
redirection, heredocs, or command substitution to create it.

## Launch

Create a detached tmux session, add one pane per agent in its working directory, and tile the panes.
Use one of these fixed commands:

```bash
codex exec --sandbox workspace-write --cd "<worktree>" "Read TASK.md and complete its instructions."
claude --permission-mode bypassPermissions -p "Read TASK.md and complete its instructions."
```

Send only the selected fixed command to each pane. Quote the validated worktree path as data and
never append task text. Opening a terminal application is a separate external action; ask before
doing it, otherwise print `tmux attach -t "<session>"`.

After confirmation, initialize `.claude/.omh/agents.json` before any worktree, tmux session, or
launch with each target in `status: "planned"`. After each successful resource creation and launch,
atomically persist its worktree, branch, pane, and status before proceeding to the next agent:

```json
{
  "session": "omh-agents",
  "spawned_at": "ISO timestamp",
  "task": "summary",
  "runtime": "codex",
  "baseBranch": "main",
  "useWorktree": true,
  "agents": [
    {
      "id": 1,
      "status": "running",
      "branch": "omh/agent-1",
      "worktree": ".claude/.omh/worktrees/agent-1"
    }
  ]
}
```

If launch partially fails, atomically mark the failed target and retain every successfully persisted
resource so `/agent-status`, `/agent-apply`, and `/agent-stop` can recover it. Report created
resources and request explicit cleanup instructions; never silently destroy them. Never merge
automatically. Report `/agent-status`, `/agent-apply`, and `/agent-stop` as next actions.
