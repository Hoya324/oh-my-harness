# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
