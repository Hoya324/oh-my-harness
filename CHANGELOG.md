# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.3] - 2026-06-25

### Added
- The landing-page hook-pipeline replay now cycles through multiple scenarios — adding a feature (Tier-3 guard path), a one-line fix (Tier-1 light path), and a dedicated verify-gate loop that shows the block → verify → allow behaviour (claim done → gate blocks → run the verify ladder → gate allows the stop). The scenario title rotates in the replay bar. Bilingual (EN/KO), light/dark, `prefers-reduced-motion` aware.

### Fixed
- Test-enforcement (`hooks/post-task.mjs` `hasTestFile`) now recognizes cross-file coverage. Previously it only matched a test whose basename and extension mirrored the source (`<base>.test<ext>`), so a `.js` file exercised by an `.mjs` test, or a parity/integration test that references the file by name, read as "no tests" and triggered a false `[omh:anti-rationalization]` warning. A `referencedByTest` fallback now scans the project's test directories for a test file that references the source by filename (matched on a path/quote/space boundary so `a.js` does not match inside `data.js`).

### Docs
- Synced every version surface (package/plugin/marketplace, README badges EN/KO, docs hero + sidebar) to 0.4.3.

## [0.4.2] - 2026-06-25

### Fixed
- Plan Gate no longer blocks writes to the native plan-mode plan file (`~/.claude/plans/*.md`). Entering plan mode for Tier-3 work previously triggered spurious "editing blocked" denials before the plan could even be written, relying on the `maxDenials` fail-open to get through. `evaluatePlanGate` now takes an `isPlanFile` signal (allow, no denial increment), and `hooks/plan-gate.mjs` resolves the tool's target path against `~/.claude/plans/` to set it.

### Added
- Interactive hook-pipeline replay on the landing page — an animated chat-style demo of what each hook emits as a request flows through the four lifecycle stages. Bilingual (EN/KO), light/dark themed, and `prefers-reduced-motion` aware.

### Docs
- Synced the docs version badge (landing hero + docs sidebar) to the released version, and adopted the rule that release notes and docs versions stay in lockstep.

### Internal
- Added `test/i18n-parity.test.mjs` — asserts en/ko translation key parity and that every `data-i18n` key referenced in the HTML exists in both languages.

## [0.4.1] - 2026-06-25

### Fixed
- Hook config loader (`hooks/lib/hook-config.mjs` `loadConfig`) now deep-merges a found config over the built-in defaults, mirroring `lib/config.mjs` `readConfig`. A partial or stale config written by an older version (missing `features.autonomousLoop`, `features.verifyGate`, `features.planGate`, etc.) previously read those keys as `undefined`, silently disabling the autonomous loop in `loop-guard.mjs` even though the documented default is ON. Missing keys now inherit their documented defaults; explicit values still win; an uninitialized project still yields `null` so hooks stay silent.

### Internal
- Extracted a reusable `mergeWithDefaults(raw)` export in `lib/config.mjs` — a single source of truth for default-merging across the CLI (`readConfig`) and hook (`loadConfig`) config readers. It clones the defaults base so a consumer mutating the returned config can never pollute the shared module-level `DEFAULTS`.

## [0.4.0] - 2026-06-23

### Added
- **Risk-Gated Verify Gate** — a Stop hook (`verify-gate.mjs`) that enforces verification in PLAIN sessions (no active `/omh-loop`). It judges each turn's risk from the actual working-tree diff (sensitive paths, diff size, source-without-test), floored by the prompt's tier, and — when the risk warrants it — runs the deterministic verify ladder itself. Red → forces continuation (top-level `decision:block` + exit 0); green or low-risk → allows the stop. Cross-model `/omh-verify` is recommended (not forced) for sensitive/large changes.
- `lib/risk.mjs` — pure, unit-tested gate core: `computeRisk`, `evaluateGate`, `globMatch`, `classifyFiles`, `diffSignature`, `tierFloor`. Mirrors the pure-core/impure-wrapper split of `lib/loop.mjs`.
- `features.verifyGate` (default ON) + `verifyGate` config block (`riskThreshold`, `maxBlocks`, `runLadder`, `recommendCrossVerify`, `largeFiles`/`largeLines`, `ladderTimeoutSec`, `quickCheckCommand`/`verifyCommand`, `sensitivePaths`).
- `hooks/pre-prompt.mjs` now persists the classified tier to `.claude/.omh/last-prompt.json` so the gate can use it as a risk floor.
- **Plan Gate** — a PreToolUse hook (`plan-gate.mjs`) that enforces planning on heavy work. A Tier-3 prompt arms a per-prompt marker (via `pre-prompt.mjs`) + injects a plan directive; the hook then **denies** mutating tools (Edit/Write/NotebookEdit/MultiEdit) until the model enters plan mode and `ExitPlanMode` clears it. Read-only tools always pass. Pure core `lib/plan-gate.mjs`.
- `features.planGate` (default ON) + `planGate` config block (`minTier`, `maxDenials`, `gatedTools`).

### Safety
- The Verify Gate **cannot wedge a session**: a per-diff `maxBlocks` cap guarantees it eventually allows the stop, with a `stop_hook_active` re-entry guard, already-verified skip, defer-to-active-loop, empty-ladder/git-missing pass-through, off switches (`features.verifyGate`, `DISABLE_HARNESS`, `STOP`), and fail-open on any error.
- The Plan Gate **cannot wedge a session** either: a per-prompt `maxDenials` cap eventually allows the edit, read-only tools are never gated, and it fails open on a corrupt marker or with `features.planGate:false` / `DISABLE_HARNESS`.

### Tests
- 246 pass (added `risk` 33, `verify-gate` 10, `plan-gate` 9 + hook 6, `config` 1).

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
