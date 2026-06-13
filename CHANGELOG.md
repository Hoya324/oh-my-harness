# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-06-13

### Fixed
- Docs: removed the npm/npx install instructions (`npm install -g oh-my-harness`, `npx oh-my-harness@latest`). The `oh-my-harness` name on npm belongs to an unrelated package, so those commands installed the wrong thing. Installation is now plugin-marketplace only; the local CLI (`node bin/cli.mjs init` from a cloned repo) is documented for contributors. Affects README (EN/KO), docs site, and i18n.

## [0.3.0] - 2026-06-13

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
- Repositioned OMH to a **spec-driven autonomous harness with enforceable guardrails**, complementing the weight-aware routing & multi-model verification added in 0.2.x. Docs (EN/KO) refreshed accordingly.
- Removed an accidental empty nested git repo from the project root.

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
