---
name: agent-apply
description: Use when previewing and merging selected OMH agent worktree branches into the current integration branch.
---

# Apply agent work

Read `.claude/.omh/agents.json`. Stop if it is missing, malformed, or has `useWorktree: false`.
Resolve only recorded agent ids and branch names. Never auto-merge.

For every requested agent:

1. Check pane status and warn if it is still running.
2. Determine the recorded base/integration branch and verify the current branch and worktree are
   suitable. Do not assume `main`.
3. Show commits, full diff summary, dirty worktree state, and whether the branch has diverged.
4. Run relevant read-only checks or report that verification is absent.

Present the exact merge targets and commands. Obtain explicit confirmation for the selected agents
before merging. Approval for one agent does not authorize another.

Merge without force and without automatic conflict resolution:

```bash
git merge "<agent-branch>" --no-ff -m "merge: agent-<id> - <task summary>"
```

If a conflict occurs, stop and report conflicted paths; do not auto-resolve, abort, reset, or retry
without direction. On success, atomically set only that agent's status to `applied` in
`.claude/.omh/agents.json`. Preserve the worktree and branch until `/agent-stop` receives separate
cleanup confirmation.
