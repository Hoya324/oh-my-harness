# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-06-03

### Added
- 전역 config fallback: 훅이 프로젝트 로컬(`<project>/.claude/.omh/`) 다음으로 `~/.claude/.omh/harness.config.json`을 읽음(`hooks/lib/hook-config.mjs`). "User (Global)" 설정이 실제로 모든 프로젝트에 적용됨.

### Fixed
- `/omh-verify` codex 어댑터가 `codex exec -s read-only`로 동작 — 외부 검증자가 워크스페이스를 수정하지 못하도록 강제.
- 렌즈 실패 시 CLI output을 버리지 않고 표면화해 진단 가능.

## [0.2.0] - 2026-06-03

### Added
- Weight Routing: prompt 무게(Tier 1/2/3) 자동 분류(`hooks/lib/tier.mjs`) + 한/영 무게 표현 사전 + 도메인 키워드. Tier 3은 완료 전 검증 강제.
- `/omh-verify`: N-라운드 독립 검증+수정 루프. Claude/GPT(codex)/Gemini 모델 로테이션, 외부 검증자 읽기 전용, CLI 미설치 시 graceful degrade.
- 모델 어댑터: `lib/adapters/codex.mjs`, `lib/adapters/gemini.mjs`.
- Living State: 디스크 앵커 `STATE.md`(`lib/state.mjs`) — SessionStart 재주입 + PreCompact 통합으로 context rot 방어.
- `harness-setup` 위저드: 무게 라우팅/verify 질문 + codex/gemini 자동 감지 후 검증 렌즈 제안.
- 설정 스키마 `tier3`/`verify` + `features.weightRouting`, 기본 템플릿 out-of-box 반영.

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
