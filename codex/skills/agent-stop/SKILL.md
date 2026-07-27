---
name: agent-stop
description: Use when stopping OMH tmux agents or cleaning their worktrees and branches safely.
---

# Stop and clean up agents

Read and validate `.claude/.omh/agents.json`. Resolve the requested recorded ids (default all), tmux
session, worktrees, branches, base branch, and `useWorktree`.

Inspect pane liveness, uncommitted files, and unmerged commits for every target. Show exactly what
would be interrupted, which worktree/branch would be removed, and what work would become
unreachable. Obtain explicit confirmation before shutdown or cleanup even when no unmerged work is
detected.

When unmerged or uncommitted work exists, require one explicit choice per target:

- `apply`: stop and invoke `/agent-apply` behavior before later cleanup;
- `keep`: stop the process but preserve branch, worktree, and state;
- `discard`: authorize the named unmerged commits/files and exact cleanup targets;
- `cancel`: do nothing.

Never infer discard from a generic “stop.” Interrupt only the confirmed panes. Kill the tmux
session only when all recorded panes in it are confirmed stopped.

With `useWorktree: true`, remove only validated, recorded worktree paths. Use forced removal or
branch deletion only after the explicit `discard` authorization named that target. With
`useWorktree: false`, do not run branch or worktree cleanup.

Atomically update `.claude/.omh/agents.json`: preserve kept resources and partial-stop entries; set
stopped status when resources remain. Remove the state file only after all agents are stopped and
all recorded resources are either cleaned with confirmation or deliberately preserved elsewhere.
Report what was stopped, kept, removed, and whether removed work can be recovered.
