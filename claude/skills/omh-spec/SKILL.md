---
name: omh-spec
description: Author a durable, machine-checkable SPEC.md (the anchor for an autonomous loop) with EARS-style acceptance criteria mapped to verify commands
level: 2
---

Create or refine `SPEC.md` — the durable source of truth that anchors an autonomous loop (`/omh-loop`). A vague spec is the #1 predictor of a poor autonomous run, so this skill refuses to emit a spec that still has open questions.

Usage: /omh-spec [goal or path to refine]
Example: /omh-spec add JWT auth to the API with refresh tokens
Example: /omh-spec SPEC.md   (refine an existing one)

## Why a spec

The loop's stop condition is objective: it may end only when every acceptance criterion's verify command passes AND an independent cross-verify agent confirms coverage. That is only possible if criteria are written as **machine-checkable** statements, not prose. The spec is re-injected (as a compact digest) every iteration so each fresh-context turn re-grounds on WHAT and WHY.

## Steps

1. **Read config**: Load `.claude/.omh/harness.config.json`. Note `loop.specPath` (default `SPEC.md`). If `features.autonomousLoop` is false, tell the user the loop is disabled but you can still author a spec.

2. **Gather intent**: From `$ARGUMENTS` (or the existing spec file if a path is given). If the goal is vague or scope-less, use **AskUserQuestion** to clarify — do not guess. Clarify: the concrete outcome, in/out of scope, constraints, and how success is *measured*.

3. **Detect verify commands**: Read `.claude/.omh/conventions.json` (or detect) to suggest `quickCheckCommand` (lint/typecheck) and `verifyCommand` (tests/build) for the stack. Each acceptance criterion should map to a command (or a specific test) that returns exit 0 when satisfied. **Reuse LTM first**: query the `omh-memory` graph with `search_nodes` for commands this project already verified before re-detecting — skip silently if the MCP server is unavailable.

4. **Write the spec** to `loop.specPath` using this structure:
   ```markdown
   # SPEC: <title>

   ## Goal
   <one paragraph: the end state and why it matters>

   ## Acceptance criteria (EARS)
   Each criterion uses Easy Approach to Requirements Syntax and names a check:
   - WHEN <trigger> THE SYSTEM SHALL <response>. — verify: `<command or test>`
   - WHILE <precondition> ... SHALL ... — verify: `<command>`

   ## Out of scope
   - <explicitly excluded items>

   ## Constraints
   - <perf, compat, style, files allowed to touch (ties to scopeGuard.allowedPaths)>

   ## Verify
   - quickCheck: `<lint/typecheck cmd>`
   - verify: `<full test/build cmd>`

   ## Open questions
   - [NEEDS CLARIFICATION] <only if unresolved — the loop will refuse to start while any remain>
   ```

5. **Self-review the spec** before finishing:
   - Every acceptance criterion is testable and has a verify mapping (no "looks good" criteria).
   - No `[NEEDS CLARIFICATION]` markers remain (resolve via AskUserQuestion, or list them and tell the user the loop won't start until resolved).
   - Scope is small enough for an iterative loop; if it spans many independent subsystems, suggest splitting into multiple specs (one feature per spec).

6. **Suggest next step**: `Spec written to <path>. Run /omh-loop to execute it autonomously, or /omh-loop <path>.`

## Policies
- **Never fabricate acceptance criteria** the user didn't ask for — keep scope tight (YAGNI).
- **Machine-checkable or it doesn't count**: a criterion with no verify command is a smell; flag it.
- **One feature per spec**: large multi-subsystem goals should be decomposed.
- **Refuse ambiguity**: unresolved `[NEEDS CLARIFICATION]` markers block the loop by design.
