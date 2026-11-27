# Long-term memory (LTM)

omh persists cross-session learnings to the **`omh-memory` MCP server** — a knowledge graph at `~/.omh/memory/graph.jsonl`, **shared with Codex** (one store, both runtimes). Use the MCP tools when connected; **skip silently if the server is unavailable** (LTM must never block the loop).

- **Read (before pulling work):** retrieve prior learnings, verified build/test commands, and known pitfalls for this project/goal and fold them into the plan / PROGRESS.md.
  - MCP: `search_nodes({query: "<project> <goal keywords>"})`
- **Write (on outcome):**
  - failure/Reflexion → a `Learning` entity ("attempt N failed because X; root cause Y; next Z"), related `about` → the `Project`. MCP: `create_entities` + `create_relations`
  - verify pass → append the verified `quickCheck` / `verify` commands and durable facts to the `Project` entity. MCP: `add_observations`
- Prefer MCP tools for live in-session writes (the server owns the file). Avoid heavy concurrent writes from both runtimes at once.
