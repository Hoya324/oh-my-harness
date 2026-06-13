# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-13

### Added
- **Autonomous Loop** — spec-driven, tiered, self/cross-verifying loop. The Stop hook (`loop-guard.mjs`) is the loop engine: it forces continuation (top-level `decision:block` + exit 0) until the goal is objectively met, and owns termination via a layered checklist.
- `/omh-loop` skill — orchestrates the loop (classify tier → spec gate → confirm → one task per iteration → verify ladder → cross-verify → commit).
- `/omh-spec` skill — authors a machine-checkable `SPEC.md` with EARS-style acceptance criteria mapped to verify commands; refuses vague specs.
- `lib/loop.mjs` — pure, unit-tested loop core: `evaluateLoop`, tier classification, verify-ladder builder, plateau & oscillation detection.
- Tiered effort budgets (`loop.tiers` quick/standard/deep) for iterations, wall-clock, and cross-verify policy.
- Cheap-first verification ladder (deterministic checks → self-review → cross-verify agent) that fails fast and feeds the actual failing output back.
- Cross-verification by a different model against the SPEC and repo state (Chain-of-Verification), with a typed `PASS|FAIL|INCONCLUSIVE` verdict that fails safe to stop.
- Safety guardrails: per-tier iteration & wall-clock caps, cross-tier total cap, no-progress/plateau and oscillation detection, `stop_hook_active` self-loop guard, concurrent-session/worktree isolation, atomic state writes, fail-open on corruption, and a `STOP` kill switch (`/omh-loop stop`).
- `hookStopContinue()` output helper implementing the correct Stop-hook continuation contract.
- `features.autonomousLoop` toggle and a `loop` config block (deep-merged defaults).

### Changed
- Repositioned OMH from "minimal guards" to a **spec-driven autonomous harness with enforceable guardrails**. Docs (EN/KO) refreshed accordingly.
- Removed an accidental empty nested git repo from the project root.

## [0.1.0] - 2026-03-23

### Added
- 8 Claude Code hooks: session-start, pre-prompt, dangerous-guard, post-task, commit-convention, scope-guard, usage-tracker, pre-compact
- 3 model-routed agents: quick (haiku), standard (sonnet), architect (opus)
- 7 slash command skills: harness-setup, set-harness, init-project, agent-spawn, agent-status, agent-apply, agent-stop
- CLI with `init`, `update`, `status`, `usage`, `reset` commands and `--version`/`--help` flags
- Convention auto-detection for Node.js, Python, Go, Rust, Java
- Deep-merge configuration system with feature toggles
- Multi-agent orchestration with tmux and git worktrees
- Test enforcement with configurable minimum test cases
- Auto-plan mode for multi-task detection (Korean/English)
- Ambiguity detection for vague requests (Korean/English)
- Dangerous operation guard (rm -rf, git push --force, .env writes, etc.)
- Commit convention enforcement (Conventional Commits / Gitmoji)
- Scope guard for restricting file modifications
- Usage tracking with per-session statistics
- Context snapshot before compaction
- Plugin mode support via `.claude-plugin/`
- Bilingual documentation (English/Korean)
- GitHub Actions CI for Node 18/20/22
- Debug mode via `OMH_DEBUG` environment variable
