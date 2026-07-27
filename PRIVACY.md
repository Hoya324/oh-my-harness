# Privacy Policy

Oh My Harness stores project configuration, loop state, usage counters, snapshots,
and learnings locally in `.claude/.omh/`. Claude Code and Codex use the same local
directory; Codex support does not create a second state store. Long-term memory is
also local and shared at `~/.omh/memory/graph.jsonl`.

OMH adds no telemetry, analytics, or new remote reporting for Codex. The optional
Claude Code HUD queries the Anthropic API usage endpoint with your existing OAuth
token to display rate-limit information. Codex does not render that HUD.

When you explicitly invoke an external verification lens, the selected third-party
CLI receives the verification prompt according to that CLI's own configuration.
The local `omh-memory` MCP server does not require an API key and is not telemetry.

Last updated: 2026-07-28
