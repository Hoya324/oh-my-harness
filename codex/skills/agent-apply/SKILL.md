---
name: agent-apply
description: Use when previewing and merging selected OMH agent worktree branches into the current integration branch.
---

# Apply agent work

Read `.claude/.omh/agents.json`. Stop if it is missing, malformed, or has `useWorktree: false`.
Resolve only recorded agent ids and branch names. Never auto-merge.

For every requested agent:

1. Check pane status and warn if it is still running.
2. If state records a protected `TASK.md` backup, restore its exact bytes before diff preview or
   merge and verify the recorded hash. On missing backup or mismatch, stop, retain state, and do
   not merge.
3. Independently inspect the target branch and agent branch tree entries for repository-root
   `TASK.md`, then compare those exact trees with a path-limited diff. Worktree restoration alone
   is not sufficient because it does not change a committed agent-branch tree:

   ```bash
   git ls-tree "<target-branch>" -- TASK.md
   git ls-tree "<agent-branch>" -- TASK.md
   git diff --exit-code "<target-branch>" "<agent-branch>" -- TASK.md
   ```

   Apply this fail-closed rule:

   - If the target branch already contains `TASK.md` and the agent branch has modified or deleted
     it, hard-block that agent before merge.
   - If the target branch has no `TASK.md` and the agent branch adds `TASK.md`, hard-block that
     agent before merge.

   Any other presence, mode, object-id, or content mismatch also blocks. This guarantees the
   temporary assignment file cannot be introduced into or alter the target branch. Retain the
   agent state and report that the agent must remove or restore `TASK.md` in its branch and commit
   that correction before a fresh apply preview.
4. Determine the recorded base/integration branch and verify the current branch and worktree are
   suitable. Do not assume `main`.
5. Show commits, full diff summary, dirty worktree state, and whether the branch has diverged.
6. Run relevant read-only checks or report that verification is absent.

Present the exact merge targets and commands. Obtain explicit confirmation for the selected agents
before merging. Approval for one agent does not authorize another.

Immediately before merge, resolve both refs again and repeat the tree/diff gate. If either ref moved
or any `TASK.md` mismatch appears after the preview, stop and require a fresh preview and approval.

Merge without force and without automatic conflict resolution:

```bash
git merge "<agent-branch>" --no-ff -m "merge: agent-<id> - <task summary>"
```

If a conflict occurs, stop and report conflicted paths; do not auto-resolve, abort, reset, or retry
without direction. On success, atomically set only that agent's status to `applied` in
`.claude/.omh/agents.json`. Preserve the worktree and branch until `/agent-stop` receives separate
cleanup confirmation.
