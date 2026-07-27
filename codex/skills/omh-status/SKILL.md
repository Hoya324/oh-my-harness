---
name: omh-status
description: Read and concisely report the current shared Oh My Harness runtime, loop, verification, usage, and memory status without modifying state.
---

# OMH status

Read `.claude/.omh/harness.config.json`, `.claude/.omh/loop-state.json`, and `.claude/.omh/usage.json`. Tolerate missing files and malformed optional fields. You must not modify state.

Treat the loop as inactive unless `loop-state.json` has `active: true` and the config does not explicitly disable `features.autonomousLoop`. For an active loop, use its `tier`, `iteration`, and `stopCause` (`pending` when absent). Report `Tier` as that active tier, otherwise `inactive`.

Map verification from the active loop's `pending`: `verifyPassed: true` with no `FAIL` or `INCONCLUSIVE` cross-verdict is `pass`; `verifyPassed: false`, `FAIL`, or `INCONCLUSIVE` is `fail`; an existing pending record without a verdict is `pending`; missing loop or pending data is `unknown`. Report usage as `total_calls` (0 when the file is absent) and the number of `sessions` keys (0 when absent).

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
