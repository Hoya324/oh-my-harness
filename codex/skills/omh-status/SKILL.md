---
name: omh-status
description: Read and concisely report the current shared Oh My Harness runtime, loop, verification, usage, and memory status without modifying state.
---

# OMH status

Resolve shared state exactly like the hooks: try the project
`.claude/.omh/harness.config.json` first, then the user-global
`~/.claude/.omh/harness.config.json`; the project wins. Use the first parseable candidate. Read
`.claude/.omh/loop-state.json` and `.claude/.omh/usage.json` from that same selected state root
(under `~/` for the user-global candidate), never by mixing project and global state. Tolerate
missing files and malformed optional fields. You must not modify state.

Treat the loop as inactive unless `loop-state.json` has `active: true` and the config does not explicitly disable `features.autonomousLoop`. For an active loop, use its `tier`, `iteration`, and `stopCause` (`pending` when absent). Report `Tier` as that active tier, otherwise `inactive`.

Map verification from the active loop's `pending`: `verifyPassed: true` with no `FAIL` or `INCONCLUSIVE` cross-verdict is `pass`; `verifyPassed: false`, `FAIL`, or `INCONCLUSIVE` is `fail`; an existing pending record without a verdict is `pending`; missing loop or pending data is `unknown`. For usage, sum only finite, non-negative numeric `sessions[*].total_calls`; malformed or missing entries count as zero. The session count is the number of object-valued session records (0 when absent).

Inspect the current MCP tool/server availability without probing or writing. Report memory as `connected` only when `omh-memory` is available to this task; report `unavailable` otherwise. A local memory-store file or MCP configuration alone does not prove a live connection.

Return exactly this shape, substituting the derived values and no table:

```text
OMH status
- Runtime: Codex
- Tier: <tier or inactive>
- Loop: <inactive|iteration N, tier T, stop cause>
- Verify: <pending|pass|fail|unknown>
- Usage: <total calls and session count>
- Memory: <connected|unavailable>
```
