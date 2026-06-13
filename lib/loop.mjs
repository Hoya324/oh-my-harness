/**
 * oh-my-harness — autonomous loop core (pure, side-effect free).
 *
 * Everything here is a pure function of (state, signals): no fs, no git, no
 * Date.now, no child_process. The Stop hook (hooks/loop-guard.mjs) and the
 * /omh-loop skill gather impure signals (current time, git HEAD, diff stats,
 * verify-ladder results) and feed them in. This keeps the load-bearing
 * termination logic fully unit-testable.
 *
 * Design rationale & citations: docs/superpowers/specs/2026-06-13-autonomous-loop-design.md
 */

export const TIERS = ['quick', 'standard', 'deep'];

/** Built-in tier budgets — overridable via harness.config.json `loop.tiers`. */
export const DEFAULT_TIERS = {
  quick:    { model: 'standard',  maxIterations: 3,  maxWallClockMinutes: 5,  plateauWindow: 2, crossVerify: false, crossVerifyEvery: 0, marginalGainEpsilon: 0.05 },
  standard: { model: 'standard',  maxIterations: 8,  maxWallClockMinutes: 15, plateauWindow: 2, crossVerify: true,  crossVerifyEvery: 0, marginalGainEpsilon: 0.03 },
  deep:     { model: 'architect', maxIterations: 20, maxWallClockMinutes: 45, plateauWindow: 3, crossVerify: true,  crossVerifyEvery: 5, marginalGainEpsilon: 0.02 },
};

/**
 * Create a fresh loop state.
 * @param {{goal:string, specPath?:string, sessionId?:string, tier?:string, nowMs:number}} opts
 */
export function defaultState({ goal, specPath = 'SPEC.md', sessionId = null, tier = 'standard', nowMs }) {
  return {
    active: true,
    stopRequested: false,
    sessionId: sessionId || null,
    tier: TIERS.includes(tier) ? tier : 'standard',
    goal: goal || '',
    specPath,
    iteration: 0,
    totalIterations: 0,
    deepVerifies: 0,
    startedAt: nowMs,
    history: [],
  };
}

/** Resolve a tier's merged budget config (built-in defaults <- config overrides). */
export function resolveTier(config, tier) {
  const t = TIERS.includes(tier) ? tier : 'standard';
  const base = DEFAULT_TIERS[t];
  const override = (config && config.tiers && config.tiers[t]) || {};
  return { ...base, ...override };
}

/**
 * Heuristic tier classifier. Pure: takes text + estimates, returns a tier.
 * Precedence: explicit override > config.classify (when not 'auto') > heuristic.
 * @param {{goal?:string, specText?:string, fileEstimate?:number, criteriaCount?:number, override?:string, config?:object}} opts
 */
export function classifyTier({ goal = '', specText = '', fileEstimate = 0, criteriaCount = 0, override = '', config = {} } = {}) {
  if (TIERS.includes(override)) return override;
  if (config.classify && config.classify !== 'auto' && TIERS.includes(config.classify)) return config.classify;

  const text = `${goal}\n${specText}`.toLowerCase();
  const deepHints = /(architect|refactor|re-?architect|redesign|migrat|distributed|concurren|security|threading|race condition|rewrite|overhaul|cross-cutting|multiple (files|modules|services)|system[- ]wide)/;
  const quickHints = /(typo|rename|comment|one-?liner|single file|format|lint fix|tweak|copy ?edit|wording|bump version)/;

  if (deepHints.test(text) || fileEstimate >= 5 || criteriaCount >= 6) return 'deep';
  if (quickHints.test(text) || (fileEstimate > 0 && fileEstimate <= 1 && criteriaCount <= 1 && text.length < 160)) return 'quick';
  return 'standard';
}

/**
 * Best-effort verify-ladder for a detected stack. Pure: returns ordered rungs
 * with commands + per-rung timeouts; execution happens in the hook/skill.
 * Explicit config commands always win over auto-detection.
 * @param {object} conventions - from lib/detect.mjs (language/testFramework/linter/buildTool)
 * @param {object} config - the resolved `loop` config block
 */
export function buildLadder(conventions = {}, config = {}) {
  const timeouts = config.rungTimeoutSec || { quickCheck: 30, verify: 180 };
  const auto = autoCommands(conventions);
  const quickCheck = config.quickCheckCommand || auto.quickCheck;
  const verify = config.verifyCommand || auto.verify;
  const rungs = [];
  if (quickCheck) rungs.push({ rung: 'quickCheck', command: quickCheck, timeoutSec: timeouts.quickCheck || 30 });
  if (verify) rungs.push({ rung: 'verify', command: verify, timeoutSec: timeouts.verify || 180 });
  return rungs;
}

/** Map detected conventions to default quickCheck / verify commands. */
export function autoCommands(conventions = {}) {
  const { language, testFramework, linter, buildTool } = conventions;
  switch (language) {
    case 'node': {
      const quickCheck = buildTool === 'typescript' ? 'npx tsc --noEmit'
        : linter === 'eslint' ? 'npx eslint .'
        : linter === 'biome' ? 'npx biome check .'
        : '';
      return { quickCheck, verify: testFramework ? 'npm test' : '' };
    }
    case 'python': {
      const quickCheck = linter === 'ruff' ? 'ruff check .'
        : linter === 'flake8' ? 'flake8'
        : buildTool === 'mypy' ? 'mypy .'
        : '';
      return { quickCheck, verify: testFramework === 'pytest' ? 'pytest -q' : '' };
    }
    case 'go':
      return { quickCheck: linter === 'golangci-lint' ? 'golangci-lint run' : 'go vet ./...', verify: 'go test ./...' };
    case 'rust':
      return { quickCheck: 'cargo clippy -q', verify: 'cargo test -q' };
    case 'kotlin':
    case 'java':
      return { quickCheck: '', verify: buildTool === 'maven' ? 'mvn -q test' : './gradlew test' };
    default:
      return { quickCheck: '', verify: '' };
  }
}

/**
 * Stable failure signature from verify-ladder rung results.
 * Same failing rungs + same per-rung signatures => same string (drives
 * oscillation detection). Returns '' when nothing is failing.
 * @param {Array<{rung:string,status:string,signature?:string}>} rungResults
 */
export function failureSignature(rungResults = []) {
  const fails = (rungResults || [])
    .filter((r) => r && (r.status === 'fail' || r.status === 'error'))
    .map((r) => `${r.rung}:${r.status}:${r.signature || ''}`)
    .sort();
  return fails.join('|');
}

/**
 * Plateau: the last `window` recorded iterations all made no new artifact
 * (empty/cosmetic diff) and none passed verify. Needs >= window records.
 */
export function detectPlateau(history = [], window = 2) {
  if (!Array.isArray(history) || history.length < window || window < 1) return false;
  const last = history.slice(-window);
  // No new artifact (empty/cosmetic diff) and still not passing, for `window` iters.
  return last.every((h) => h && h.diffFiles === 0 && h.verifyPassed !== true);
}

/**
 * Oscillation: the same failure signature recurs (3x identical) or alternates
 * A-B-A-B across the last 4 iterations. Signals an architectural problem the
 * loop can't fix by iterating — stop and escalate.
 */
export function detectOscillation(history = []) {
  const sigs = (history || []).map((h) => (h && h.failureSignature) || '').filter((s) => s.length > 0);
  if (sigs.length >= 3) {
    const [a, b, c] = sigs.slice(-3);
    if (a === b && b === c) return true; // identical repeat
  }
  if (sigs.length >= 4) {
    const [a, b, c, d] = sigs.slice(-4);
    if (a === c && b === d && a !== b) return true; // A-B-A-B alternation
  }
  return false;
}

/**
 * The layered termination checklist (the heart of the loop). Pure.
 *
 * @param {object} state - current loop-state.json contents
 * @param {object} signals
 * @param {boolean} signals.stopHookActive - hook input `stop_hook_active`
 * @param {string}  [signals.sessionId]    - hook input `session_id`
 * @param {boolean} [signals.stopSentinel] - STOP kill-switch file present
 * @param {number}  signals.nowMs
 * @param {string}  [signals.headSha]      - current git HEAD
 * @param {{files:number,lines:number}|null} [signals.diff] - diff since last iteration
 * @param {Array|null} [signals.ladder]    - latest verify-ladder rung results
 * @param {boolean|null} [signals.verifyPassed]
 * @param {('PASS'|'FAIL'|'INCONCLUSIVE'|null)} [signals.crossVerifyVerdict]
 * @param {string} [signals.reflection]
 * @param {object} signals.config          - resolved `loop` config block
 * @returns {{action:'ignore'|'continue'|'stop', reason:string, stopCause:string|null, nextState:object}}
 */
export function evaluateLoop(state, signals) {
  const s = signals || {};
  const config = s.config || {};

  // (1) Prevent the hook's own respond->block->respond infinite loop. Not optional.
  if (s.stopHookActive) return { action: 'ignore', reason: '', stopCause: 'stop_hook_active', nextState: state };

  // (4) No active loop -> let normal post-task flow run.
  if (!state || !state.active) return { action: 'ignore', reason: '', stopCause: 'inactive', nextState: state || null };

  // (3) Concurrent-session / worktree isolation: never touch another session's loop.
  if (s.sessionId && state.sessionId && s.sessionId !== state.sessionId) {
    return { action: 'ignore', reason: '', stopCause: 'session_mismatch', nextState: state };
  }

  // (2) Kill switch.
  if (s.stopSentinel || state.stopRequested) {
    return { action: 'stop', reason: '', stopCause: 'kill_switch', nextState: deactivate(state) };
  }

  const tierCfg = resolveTier(config, state.tier);

  // Record the iteration that just completed.
  const prevSha = lastHeadSha(state.history);
  const committed = s.headSha != null && s.headSha !== prevSha;
  const diffFiles = s.diff ? s.diff.files : (committed ? null : 0);
  const record = {
    iteration: state.iteration + 1,
    headSha: s.headSha != null ? s.headSha : prevSha,
    diffFiles: diffFiles == null ? null : diffFiles,
    diffLines: s.diff ? s.diff.lines : null,
    ladder: s.ladder || null,
    verifyPassed: s.verifyPassed === true,
    failureSignature: failureSignature(s.ladder || []),
    crossVerify: s.crossVerifyVerdict || null,
    reflection: s.reflection || null,
    ts: s.nowMs,
  };

  const history = [...(state.history || []), record];
  const iteration = state.iteration + 1;
  const totalIterations = (state.totalIterations || 0) + 1;
  const nextState = { ...state, iteration, totalIterations, history };

  // (12) Infra / non-retryable error in the ladder -> stop and ask (don't burn iters).
  const infra = (s.ladder || []).find((r) => r && r.status === 'error' && r.retryable === false);
  if (infra) return stop(nextState, 'infra_error');

  // (D8) Cross-verify INCONCLUSIVE fails safe to stop-and-report.
  if (s.crossVerifyVerdict === 'INCONCLUSIVE') return stop(nextState, 'cross_verify_inconclusive');

  // (7) Positive done-quorum: verify green AND (cross-verify PASS when the tier requires it).
  const crossOk = !tierCfg.crossVerify || s.crossVerifyVerdict === 'PASS';
  if (record.verifyPassed && crossOk) return stop(nextState, 'done');

  // (5) Hard budget caps.
  if (iteration >= tierCfg.maxIterations) return stop(nextState, 'budget_iterations');
  if (totalIterations >= (config.maxTotalIterations || 30)) return stop(nextState, 'budget_total');

  // (6) Wall-clock timeout (independent axis — catches a hung step under iter caps).
  const elapsedMin = (s.nowMs - state.startedAt) / 60000;
  if (elapsedMin > tierCfg.maxWallClockMinutes) return stop(nextState, 'timeout');

  // (9) Oscillation -> architectural, escalate.
  if (detectOscillation(history)) return stop(nextState, 'oscillation');

  // (8) Plateau / no progress.
  if (config.stopOnNoProgress !== false && detectPlateau(history, tierCfg.plateauWindow)) {
    return stop(nextState, 'plateau');
  }

  // (10) Otherwise continue.
  return { action: 'continue', reason: buildContinueReason(nextState, s, tierCfg), stopCause: null, nextState };
}

function deactivate(state) { return { ...state, active: false }; }
function stop(state, stopCause) { return { action: 'stop', reason: '', stopCause, nextState: deactivate(state) }; }

function lastHeadSha(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  return history[history.length - 1].headSha || null;
}

/**
 * The fixed-shape continuation instruction re-injected each iteration. Keeps a
 * *constant* skeleton (fresh-context discipline) + the current failing output +
 * recent reflections, so the model re-grounds on WHAT/WHY without an accumulating
 * transcript.
 */
export function buildContinueReason(state, signals, tierCfg) {
  const cfg = signals.config || {};
  const lines = [];
  lines.push(`[omh:loop] Iteration ${state.iteration}/${tierCfg.maxIterations} (tier=${state.tier}). Goal NOT yet met — continue.`);
  if (state.goal) lines.push(`Goal: ${state.goal}`);
  lines.push(`Spec anchor: ${state.specPath} — re-read the acceptance criteria; do exactly ONE unit of work this iteration.`);

  const fails = (signals.ladder || []).filter((r) => r && (r.status === 'fail' || r.status === 'error'));
  if (fails.length) {
    lines.push('Failing checks (fix these first):');
    for (const r of fails) lines.push(`  - ${r.rung} [${r.status}]${r.output ? `: ${truncate(r.output, 600)}` : ''}`);
  }

  const reflections = recentReflections(state.history, cfg.reflectionWindow || 3);
  if (reflections.length) {
    lines.push('Recent reflections (avoid repeating these):');
    for (const r of reflections) lines.push(`  - ${truncate(r, 200)}`);
  }

  lines.push('Rules: ripgrep before implementing; NO PLACEHOLDERS (full implementations only); on failure write a Reflexion note (why it failed, root cause, next step) to PROGRESS.md; then run the verify ladder; commit this iteration.');
  return lines.join('\n');
}

function recentReflections(history = [], k = 3) {
  return (history || [])
    .map((h) => h && h.reflection)
    .filter(Boolean)
    .slice(-k);
}

function truncate(str, n) {
  const t = String(str);
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}
