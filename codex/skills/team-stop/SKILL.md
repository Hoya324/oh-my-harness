---
name: team-stop
description: Use when interrupting a Codex native subagent team or cleaning its shared OMH state.
---

# Stop a Codex native team

Read `.claude/.omh/teams.json` and call `list_agents`. If state is missing, report no recorded team;
do not guess targets. Reconcile by exact canonical task and opaque agent id.

List every live agent and every incomplete, pending, blocked, failed, or unknown task. Show which
work may be abandoned and the exact `.claude/.omh/teams.json` state change. Obtain explicit confirmation
before calling `interrupt_agent`, sending shutdown coordination, or deleting/changing state. A
previous spawn approval is not shutdown approval.

Offer explicit choices:

- `continue`: leave agents and state unchanged;
- `stop and preserve`: interrupt confirmed targets and retain their task/state records;
- `stop and clean`: interrupt confirmed targets, then remove state only after all targets are
  terminal;
- `cancel`: do nothing.

Require a second clear acknowledgement when incomplete work would be abandoned. Never silently
discard incomplete tasks.

For each confirmed live target, call `interrupt_agent` using its persisted canonical task or agent
id. Treat failures as partial shutdown; retain state and report the unresolved agent. Do not
describe an agent as stopped until `list_agents` or the interrupt result establishes a terminal
status.

After all confirmed targets are terminal, atomically mark preserved entries stopped. Delete
`.claude/.omh/teams.json` only for the explicitly confirmed clean option and only when no live
target remains. Report agents stopped, incomplete work preserved or abandoned, state retained or
removed, and recovery limits.
