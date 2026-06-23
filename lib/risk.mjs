/**
 * oh-my-harness — risk-gated verify gate core (pure, side-effect free).
 *
 * Everything here is a pure function of (state, signals): no fs, no git, no
 * Date.now, no child_process. The Stop hook (hooks/verify-gate.mjs) gathers the
 * impure signals (working-tree diff, persisted tier floor, verify-ladder
 * results) and feeds them in. This keeps the load-bearing gate logic — the part
 * that decides whether to FORCE the model to keep verifying — fully unit-testable.
 *
 * Companion to lib/loop.mjs: same pure-core / impure-wrapper split. The gate is
 * "loop-guard lite" — a single risk-triggered verification gate for plain
 * sessions (no active /omh-loop), engineered to NEVER wedge the user.
 */

/** Risk levels. SILENT=ignore, SOFT=reminder only, LADDER=run quick check,
 *  LADDER_PLUS=run full ladder + recommend cross-verify. */
export const RISK = { SILENT: 0, SOFT: 1, LADDER: 2, LADDER_PLUS: 3 };

/** File-classification regexes — shared shape with hooks/post-task.mjs. */
const CODE_EXT = /\.(js|ts|jsx|tsx|mjs|cjs|py|go|rs|java|kt|rb|php|c|cpp|h|swift|vue|svelte)$/i;
const TEST_FILE = /\.(test|spec)\./i;
const TEST_DIR = /(\/__tests__\/|\/test\/|\/tests\/|\/test-[a-z-]+\/)/;
const DOCS_EXT = /\.(md|mdx|txt|rst|adoc)$/i;
const DOCS_NAME = /(^|\/)(LICENSE|CHANGELOG|README|CONTRIBUTING|NOTICE)(\.|$)/i;

/** Map a prompt tier (1|2|3) to a risk FLOOR. Tier 3 never goes silent. */
export const TIER_FLOOR = { 1: 0, 2: 1, 3: 2 };
export function tierFloor(tier) {
  return TIER_FLOOR[tier] ?? 0;
}

/**
 * Compile a glob (supporting `**`, `*`, `?`) to an anchored RegExp.
 * `**` / matches zero or more path segments; `*` matches within a segment;
 * `?` matches a single non-slash char. (scope-guard's matcher is prefix-only and
 * cannot express these — hence a dedicated matcher here.)
 */
export function globToRegExp(glob) {
  let re = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 3; }   // **/ => zero or more dirs
        else { re += '.*'; i += 2; }                              // **  => anything incl /
      } else { re += '[^/]*'; i += 1; }                           // *   => within a segment
    } else if (c === '?') {
      re += '[^/]'; i += 1;
    } else if ('.+^${}()|[]\\/'.includes(c)) {
      re += '\\' + c; i += 1;                                     // escape regex metachar
    } else {
      re += c; i += 1;
    }
  }
  return new RegExp(re + '$');
}

/** True if `relPath` matches the glob `pattern`. */
export function globMatch(pattern, relPath) {
  try { return globToRegExp(pattern).test(String(relPath).replace(/\\/g, '/')); }
  catch { return false; }
}

/** True if the file is a test file (by name or directory). */
function isTest(f) { return TEST_FILE.test(f) || TEST_DIR.test(f); }
/** True if the file is documentation. */
function isDocs(f) { return DOCS_EXT.test(f) || DOCS_NAME.test(f); }

/**
 * Bucket changed files. A file may be `sensitive` regardless of whether it is
 * code (e.g. `.env` is sensitive but not code).
 * @param {string[]} files
 * @param {string[]} sensitivePaths - glob patterns
 * @returns {{code:string[],docs:string[],tests:string[],sensitive:string[],testDelta:boolean}}
 */
export function classifyFiles(files = [], sensitivePaths = []) {
  const code = [], docs = [], tests = [], sensitive = [];
  for (const f of files || []) {
    if (!f) continue;
    if (isTest(f)) tests.push(f);
    else if (CODE_EXT.test(f)) code.push(f);
    else if (isDocs(f)) docs.push(f);
    if ((sensitivePaths || []).some((p) => globMatch(p, f))) sensitive.push(f);
  }
  const testDelta = code.length > 0 && tests.length === 0;
  return { code, docs, tests, sensitive, testDelta };
}

/**
 * Compute the risk level for a turn's changes. Diff-risk is primary; the prompt
 * tier acts as a floor (level = max(diffRisk, tierFloor)).
 * @param {{files:string[], diff:{files:number,lines:number}|null, tier:number|null,
 *          sensitivePaths:string[], thresholds:{largeFiles:number,largeLines:number}}} signals
 * @returns {{level:number, factors:string[], sensitiveHits:string[]}}
 */
export function computeRisk(signals = {}) {
  const files = signals.files || [];
  const b = classifyFiles(files, signals.sensitivePaths || []);
  const factors = [];
  const nFiles = signals.diff ? signals.diff.files : files.length;
  const nLines = signals.diff ? signals.diff.lines : 0;
  const largeFiles = signals.thresholds?.largeFiles ?? 8;
  const largeLines = signals.thresholds?.largeLines ?? 400;

  const hasCode = b.code.length > 0;
  const hasSensitive = b.sensitive.length > 0;

  let diffRisk = RISK.SILENT;
  if (hasCode || hasSensitive) {
    const large = nFiles >= largeFiles || nLines >= largeLines;
    const moderate = nFiles >= Math.ceil(largeFiles / 2) || nLines >= Math.ceil(largeLines / 2);
    if (hasSensitive || large) {
      diffRisk = RISK.LADDER_PLUS;
      for (const f of b.sensitive) factors.push(`sensitive:${f}`);
      if (large) factors.push(`large:${nFiles}f/${nLines}l`);
    } else if (b.testDelta || moderate) {
      diffRisk = RISK.LADDER;
      if (b.testDelta) factors.push('test-delta');
      if (moderate) factors.push(`moderate:${nFiles}f/${nLines}l`);
    } else {
      diffRisk = RISK.SOFT;
      factors.push('code-with-tests');
    }
  }

  const floor = tierFloor(signals.tier);
  const level = Math.max(diffRisk, floor);
  if (floor > diffRisk) factors.push(`tier-floor:${signals.tier}`);

  return { level, factors, sensitiveHits: b.sensitive };
}

/**
 * Stable signature of the current uncommitted change. Same change => same string
 * (drives the maxBlocks cap and the already-verified skip). Mirrors
 * lib/loop.mjs::failureSignature.
 */
export function diffSignature(files = [], diff = null) {
  const sorted = [...(files || [])].sort();
  const fc = diff ? diff.files : (files || []).length;
  const lc = diff ? diff.lines : 0;
  return `${sorted.join(',')}|f${fc}l${lc}`;
}

function ignore(stopCause, state) {
  return { action: 'silent', level: RISK.SILENT, reason: '', factors: [], stopCause, nextState: state || null };
}

function truncate(str, n) {
  const t = String(str);
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function buildBlockReason(risk, hardFails, signals) {
  const lines = [`[omh:verify-gate] ⛔ Risk-${risk.level} change — verification is RED. Fix these before stopping:`];
  for (const r of hardFails) {
    lines.push(`  - ${r.rung} [${r.status}]${r.output ? `: ${truncate(r.output, 600)}` : ''}`);
  }
  if (risk.level >= RISK.LADDER_PLUS && signals.recommendCrossVerify !== false) {
    lines.push('Sensitive/large change: once this is green, strongly consider /omh-verify for an independent cross-model review before declaring done.');
  }
  lines.push('Rules: fix the root cause (no skips/placeholders), then the gate re-runs the ladder.');
  return lines.join('\n');
}

/**
 * The risk-gated verification decision (the heart of the gate). Pure.
 *
 * Two-phase: when risk warrants it and no ladder results are present yet, returns
 * `run-ladder` so the hook executes the (impure) ladder and re-enters with results.
 *
 * @param {object|null} state - verify-gate-state.json contents
 * @param {object} signals
 * @param {boolean} signals.stopHookActive
 * @param {string}  [signals.sessionId]
 * @param {boolean} [signals.loopActive]   - an /omh-loop is active (defer to it)
 * @param {boolean} [signals.stopSentinel]
 * @param {boolean} [signals.disabled]
 * @param {boolean} [signals.featureOff]
 * @param {string[]} signals.files
 * @param {{files:number,lines:number}|null} signals.diff
 * @param {number|null} [signals.tier]
 * @param {string[]} signals.sensitivePaths
 * @param {{largeFiles:number,largeLines:number}} signals.thresholds
 * @param {Array|null} signals.ladderResults  - null until the hook runs the ladder
 * @param {number} [signals.riskThreshold]
 * @param {number} [signals.maxBlocks]
 * @param {boolean} [signals.recommendCrossVerify]
 * @param {number} signals.nowMs
 * @returns {{action:'silent'|'soft'|'run-ladder'|'block'|'allow', level:number, reason:string, factors:string[], stopCause?:string, nextState:object|null}}
 */
export function evaluateGate(state, signals) {
  const s = signals || {};

  // (1) Re-entry guard FIRST — never block our own hook-induced continuation.
  if (s.stopHookActive) return ignore('stop_hook_active', state);
  // (2) Off switches.
  if (s.featureOff || s.disabled) return ignore('disabled', state);
  if (s.stopSentinel) return ignore('stop_sentinel', state);
  // (3) An active loop owns verification — never double-gate.
  if (s.loopActive) return ignore('defer_to_loop', state);
  // (4) Concurrent-session / worktree isolation.
  if (s.sessionId && state && state.sessionId && s.sessionId !== state.sessionId) {
    return ignore('session_mismatch', state);
  }

  const risk = computeRisk(s);
  const threshold = s.riskThreshold ?? RISK.LADDER;
  const maxBlocks = s.maxBlocks ?? 2;
  const sig = diffSignature(s.files || [], s.diff);

  const prevSig = state && state.signature;
  const prevBlocks = state && prevSig === sig ? state.blockCount || 0 : 0;
  const baseNext = {
    sessionId: s.sessionId || (state && state.sessionId) || null,
    signature: sig,
    blockCount: prevBlocks,
    lastVerifiedSignature: (state && state.lastVerifiedSignature) || null,
    ts: s.nowMs,
  };

  // (5) Below the action threshold -> soft reminder (risk 1) or silent (risk 0).
  if (risk.level < threshold) {
    if (risk.level === RISK.SOFT) {
      return { action: 'soft', level: risk.level, reason: '', factors: risk.factors, stopCause: 'soft', nextState: baseNext };
    }
    return { action: 'silent', level: risk.level, reason: '', factors: risk.factors, stopCause: 'low_risk', nextState: baseNext };
  }

  // (6) Already verified this exact change -> don't re-gate.
  if (state && state.lastVerifiedSignature === sig) {
    return { action: 'silent', level: risk.level, reason: '', factors: risk.factors, stopCause: 'already_verified', nextState: baseNext };
  }

  // (7) NEVER WEDGE: after maxBlocks blocks on the same change, allow with a note.
  if (prevBlocks >= maxBlocks) {
    return {
      action: 'allow', level: risk.level,
      reason: `[omh:verify-gate] ⚠️ Verification still RED after ${prevBlocks} attempt(s) — likely a pre-existing failure unrelated to this change. Allowing stop; review the failing checks manually.`,
      factors: risk.factors, stopCause: 'max_blocks',
      nextState: { ...baseNext, lastVerifiedSignature: sig },
    };
  }

  // (8) Need verification but the hook hasn't run the ladder yet.
  if (s.ladderResults == null) {
    return { action: 'run-ladder', level: risk.level, reason: '', factors: risk.factors, stopCause: 'run_ladder', nextState: baseNext };
  }

  // (9) Decide on ladder results. 'error' (timeout/infra) is non-blocking.
  const fails = (s.ladderResults || []).filter((r) => r && (r.status === 'fail' || r.status === 'error'));
  const hardFails = fails.filter((r) => r.status === 'fail');
  if (hardFails.length === 0) {
    const note = fails.length > 0
      ? '[omh:verify-gate] ✅ Verify ladder passed (some checks were skipped/timed out).'
      : '[omh:verify-gate] ✅ Verify ladder green for this change.';
    return { action: 'allow', level: risk.level, reason: note, factors: risk.factors, stopCause: 'verified', nextState: { ...baseNext, lastVerifiedSignature: sig } };
  }

  return {
    action: 'block', level: risk.level, reason: buildBlockReason(risk, hardFails, s),
    factors: risk.factors, stopCause: 'verify_red',
    nextState: { ...baseNext, blockCount: prevBlocks + 1 },
  };
}
