# Codex runtime map

Use this mapping when a Codex OMH skill ports behavior from another runtime. Preserve the shared
`.claude/.omh/` config and state formats; replace only runtime surfaces.

| Intent | Codex operation |
|---|---|
| Ask for missing scope or approval | Ask the necessary question directly in chat and wait for the answer. |
| `TeamCreate` or `Agent` orchestration | Call `spawn_agent` once per confirmed, bounded assignment. |
| `TaskList` or live team state | Call `list_agents`, then reconcile it with `.claude/.omh/teams.json`. |
| `SendMessage` coordination | Call `send_message` with the canonical task name or agent id. |
| Teammate shutdown | Call `interrupt_agent` for each confirmed target. |
| Project-local skills | Store them under `.agents/skills`. |
| Durable project guidance | Put it in `AGENTS.md`. |
| External GPT verification | Run `codex exec -s read-only` and treat it as external only when its model/runtime is demonstrably distinct from the generator. |

## Safety boundaries

- Obtain explicit user confirmation before spawning, merging, stopping or cleaning up agents,
  bypassing permissions, applying destructive verifier fixes, or making destructive state changes.
- Never spawn an agent during installation, setup, or skill discovery.
- Treat `spawn_agent`, `list_agents`, `send_message`, and `interrupt_agent` as semantic
  operations. Do not invent unavailable tool names or filesystem-backed substitutes.
- Persist canonical task names and returned agent ids. Treat them as opaque; never derive ids.
- Keep external verification read-only. If no distinct model/runtime can be established, report
  reduced coverage and do not label the pass independent.
- Preserve `.claude/.omh/harness.config.json`, `agents.json`, `teams.json`, `loop-state.json`,
  `STATE.md`, and related state so Claude and Codex can share one harness.
