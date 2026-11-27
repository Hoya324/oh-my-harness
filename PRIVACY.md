# Privacy Policy

Oh My Harness stores project configuration, loop state, usage counters, snapshots,
and learnings locally in `.claude/.omh/`.

The Decision Log (`.claude/.omh/decisions.jsonl`) records each hook decision: the
time, hook, event, decision, `[omh:*]` tags, prompt tier and its reasons, any
`!t1` / `!t3` / `!noplan` override, and the session id. It never stores prompt
text or file contents, is trimmed to about 500 lines, and is disabled with
`OMH_DECISION_LOG=0`. `session-health.json` stores only per-session prompt and
compaction counts. The generated block in `STATE.md` and `HANDOFF.md` contain
the branch name, recent commit subjects, and uncommitted file names from your
own repository. All of these files stay local, and `.claude/.omh/` is added to
`.gitignore` by default. Claude Code and Codex use the same local
directory; Codex support does not create a second state store. Long-term memory is
also local and shared at `~/.omh/memory/graph.jsonl`.

OMH adds no telemetry, analytics, or new remote reporting for Codex. The optional
Claude Code HUD queries the Anthropic API usage endpoint with your existing OAuth
token to display rate-limit information. Codex does not render that HUD.

When you explicitly invoke an external verification lens, the selected third-party
CLI receives the verification prompt according to that CLI's own configuration.
The local `omh-memory` MCP server does not require an API key and is not telemetry.

The docs-sync `pre-push` hook is installed only when you run
`oh-my-harness docs-sync --install`. On push it passes your branch's changed file
names to your local `claude` CLI, which then reads those files under your own
Claude Code configuration.

Last updated: 2026-11-27
