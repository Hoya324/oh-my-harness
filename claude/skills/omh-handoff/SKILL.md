---
name: omh-handoff
description: Write a handoff file so work continues in a fresh session — use when a session has grown long, was compacted, or OMH emits [omh:handoff]
---

# /omh-handoff

One session should hold one context. When a session runs long, hand off instead of pushing through.

1. Create the skeleton:
   - If `oh-my-harness` is on PATH, run `oh-my-harness handoff`. It refreshes the generated snapshot in `.claude/.omh/STATE.md` and writes `.claude/.omh/HANDOFF.md`.
   - Otherwise write `.claude/.omh/HANDOFF.md` yourself with the sections `## Tried`, `## Worked`, `## Failed (and why)`, `## Next steps`, then copy the Goal and Key Decisions from `.claude/.omh/STATE.md` and its `OMH:AUTO` block verbatim.
2. Fill only the four sections, from this session's work. Keep each to a few bullets. Name files and commands; state each failure with its cause. Do not restate the snapshot.
3. If a decision was made in this session, add it to `## Key Decisions` in STATE.md (the generated block is maintained by hooks; never edit it).
4. Tell the user: start a new session and reference `.claude/.omh/HANDOFF.md` as the first message's context.

Never commit HANDOFF.md; `.claude/.omh/` is gitignored.
