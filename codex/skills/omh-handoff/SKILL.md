---
name: omh-handoff
description: Use when a Codex session has grown long, was compacted, or Oh My Harness emits [omh:handoff], to write a handoff file and continue in a fresh session.
---

# Handoff to a fresh session

One session should hold one context. When a session runs long, hand off instead of pushing through.

1. Create the skeleton:
   - If `oh-my-harness` is on PATH, run `oh-my-harness handoff`. It refreshes the generated snapshot
     in `.claude/.omh/STATE.md` and writes `.claude/.omh/HANDOFF.md`.
   - Otherwise write `.claude/.omh/HANDOFF.md` with the sections `## Tried`, `## Worked`,
     `## Failed (and why)`, `## Next steps`, then copy the Goal and Key Decisions from
     `.claude/.omh/STATE.md` and its `OMH:AUTO` block verbatim.
2. Fill only those four sections from this session's work: a few bullets each, naming files and
   commands, and each failure with its cause. Do not restate the snapshot.
3. Record any new decision under `## Key Decisions` in STATE.md. Never edit the generated block.
4. Tell the user to open a new session and give it `.claude/.omh/HANDOFF.md` as starting context.

`.claude/.omh/` is shared with Claude Code and gitignored; never commit the handoff file.
