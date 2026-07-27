---
name: team-status
description: Use when reconciling live Codex subagent status with the persisted OMH native-team task plan.
---

# Inspect a Codex native team

Read `.claude/.omh/teams.json`. If it is missing or malformed, report no reliable active-team state
and stop without writing. Preserve canonical task names and agent ids as opaque values.

Call `list_agents` to obtain live Codex status. Merge live entries with persisted teammates and
tasks by exact canonical task or returned agent id. Do not infer identity from display names.
Label missing or contradictory entries `unknown` and explain the discrepancy.

Report:

- team name, creation time, description, and template;
- each teammate's role, canonical task, configured routing preference, and live status;
- every persisted task's owner, status, dependency, and latest evidence;
- totals for completed, working, pending, blocked, failed, and unknown work.

Explicitly list incomplete tasks. When a completed agent has queued dependent work, recommend a
specific `send_message` or confirmed follow-up dispatch; do not spawn automatically. When all tasks
are completed, recommend `/team-stop`. This skill is read-only and must not modify
`.claude/.omh/teams.json` or interrupt agents.
