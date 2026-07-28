#!/usr/bin/env node
/**
 * Risk-Gated Verify Gate — a Stop-hook that enforces verification in PLAIN
 * sessions (no active /omh-loop). On every Stop it judges the turn's risk from
 * the actual working-tree diff (+ the prompt's tier as a floor) and, when the
 * risk warrants it, runs the deterministic verify ladder itself. Red → FORCE
 * continuation (top-level {decision:'block'} + exit 0, never exit 2). Green or
 * low-risk → allow the session to stop.
 *
 * All decision logic lives in the pure, unit-tested lib/risk.mjs::evaluateGate.
 * This wrapper only gathers impure signals (git diff, persisted tier, ladder
 * results) and emits the result. It is fail-open and CANNOT wedge a session:
 * a per-diff maxBlocks cap guarantees it eventually allows the stop.
 */
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync, execFileSync } from 'child_process';
import { hookStopContinue, hookOutput, hookSilent, hookDebug } from './lib/output.mjs';
import { loadConfig } from './lib/hook-config.mjs';
import { evaluateGate, RISK } from '../lib/risk.mjs';
import { buildLadder } from '../lib/loop.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const omhDir = join(projectRoot, '.claude', '.omh');
const gateStatePath = join(omhDir, 'verify-gate-state.json');
const loopStatePath = join(omhDir, 'loop-state.json');
const lastPromptPath = join(omhDir, 'last-prompt.json');
const conventionsPath = join(omhDir, 'conventions.json');
const stopSentinel = join(omhDir, 'STOP');

const DEFAULT_SENSITIVE = ['**/auth/**', '**/payment/**', '**/security/**', '*migration*', '**/*migration*', '.env*', '**/.env*', '**/secrets/**', '**/*.sql'];

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}

function writeStateAtomic(state) {
  mkdirSync(omhDir, { recursive: true });
  const tmp = `${gateStatePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
    renameSync(tmp, gateStatePath);
  } catch (error) {
    try { unlinkSync(tmp); } catch {}
    throw error;
  }
}

function git(args) {
  try { return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
}

/** Union of working-tree changed files (tracked unstaged/staged + untracked). Null if git is unavailable. */
function changedFiles() {
  const run = (args) => { const o = git(args); return o == null ? null : o.split('\n').filter(Boolean); };
  const a = run(['diff', '--name-only']);
  const b = run(['diff', '--cached', '--name-only']);
  const c = run(['ls-files', '--others', '--exclude-standard']);
  if (a == null && b == null && c == null) return null;
  return [...new Set([...(a || []), ...(b || []), ...(c || [])])];
}

/** Approximate magnitude: file count from the union, line count from shortstat-vs-HEAD. */
function changeMagnitude(files) {
  const stat = git(['diff', '--shortstat', 'HEAD']) || '';
  const ins = Number((stat.match(/(\d+) insertions?/) || [])[1] || 0);
  const del = Number((stat.match(/(\d+) deletions?/) || [])[1] || 0);
  return { files: files.length, lines: ins + del };
}

/** Run a single ladder rung within its timeout. Mirrors loop-guard's runQuickCheck. */
function runRung(rung) {
  try {
    execSync(rung.command, { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: (rung.timeoutSec || 30) * 1000 });
    return { rung: rung.rung, status: 'pass' };
  } catch (e) {
    const output = (e && (e.stdout || e.stderr) ? `${e.stdout || ''}${e.stderr || ''}` : String((e && e.message) || e)).slice(0, 800);
    const timedOut = e && e.killed;
    return { rung: rung.rung, status: timedOut ? 'error' : 'fail', retryable: !timedOut, signature: output.slice(0, 120), output };
  }
}

/**
 * Run the appropriate rungs for the risk level. Risk 2 = quickCheck only (cheap);
 * Risk 3 = full ladder (stop at first hard red). Returns null when there is no
 * appropriate rung to run (so the hook never blocks what it cannot verify).
 */
function runLadder(gateCfg, conventions, level) {
  const ladder = buildLadder(conventions, {
    quickCheckCommand: gateCfg.quickCheckCommand || '',
    verifyCommand: gateCfg.verifyCommand || '',
    rungTimeoutSec: gateCfg.ladderTimeoutSec || { quickCheck: 30, verify: 180 },
  });
  if (!ladder.length) return null;
  const rungs = level >= RISK.LADDER_PLUS ? ladder : ladder.filter((r) => r.rung === 'quickCheck');
  if (!rungs.length) return null;
  const results = [];
  for (const rung of rungs) {
    const res = runRung(rung);
    results.push(res);
    if (res.status === 'fail') break;
  }
  return results;
}

function softMessage(factors) {
  const why = factors && factors.length ? ` (${factors.join(', ')})` : '';
  return `[omh:verify-gate] Code changed${why}. Consider running tests/verification before stopping.`;
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  const config = loadConfig(projectRoot);
  if (!config) { console.log(hookSilent()); process.exit(0); }
  // On by default: only disabled when explicitly set false.
  if (config.features?.verifyGate === false) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  // Re-entry guard FIRST, before any git work.
  if (input.stop_hook_active === true) { console.log(hookSilent()); process.exit(0); }

  // Defer to an active loop — it owns verification.
  if (existsSync(loopStatePath)) {
    try { if (JSON.parse(readFileSync(loopStatePath, 'utf8')).active === true) { console.log(hookSilent()); process.exit(0); } }
    catch { /* unreadable loop state: continue as a plain session */ }
  }

  // Read gate state (fail-open on corruption).
  let state = null;
  if (existsSync(gateStatePath)) {
    try { state = JSON.parse(readFileSync(gateStatePath, 'utf8')); }
    catch { try { unlinkSync(gateStatePath); } catch {} state = null; }
  }

  const sessionId = input.session_id || input.sessionId || null;

  // Tier floor from the persisted prompt classification (ignore if from another session).
  let tier = null;
  try {
    const lp = JSON.parse(readFileSync(lastPromptPath, 'utf8'));
    if (!lp.sessionId || !sessionId || lp.sessionId === sessionId) tier = lp.tier ?? null;
  } catch { /* no floor */ }

  const files = changedFiles();
  if (files == null) { console.log(hookSilent()); process.exit(0); } // git unavailable

  const gateCfg = config.verifyGate || {};
  const signals = {
    stopHookActive: false,
    sessionId,
    loopActive: false,
    stopSentinel: existsSync(stopSentinel),
    disabled: false,
    featureOff: false,
    files,
    diff: changeMagnitude(files),
    tier,
    sensitivePaths: gateCfg.sensitivePaths || DEFAULT_SENSITIVE,
    thresholds: { largeFiles: gateCfg.largeFiles ?? 8, largeLines: gateCfg.largeLines ?? 400 },
    ladderResults: null,
    riskThreshold: gateCfg.riskThreshold ?? RISK.LADDER,
    maxBlocks: gateCfg.maxBlocks ?? 2,
    recommendCrossVerify: gateCfg.recommendCrossVerify !== false,
    nowMs: Date.now(),
  };

  let result = evaluateGate(state, signals);

  // Two-phase: run the (impure) ladder, then re-decide with results.
  if (result.action === 'run-ladder') {
    let ladderResults = null;
    if (gateCfg.runLadder !== false) {
      let conventions = {};
      try { conventions = JSON.parse(readFileSync(conventionsPath, 'utf8')); } catch {}
      ladderResults = runLadder(gateCfg, conventions, result.level);
    }
    if (ladderResults == null) {
      // No deterministic check available (or laddering disabled) — never block; soft nudge.
      console.log(hookOutput('Stop', softMessage(result.factors)));
      process.exit(0);
    }
    result = evaluateGate(state, { ...signals, ladderResults });
  }

  if (result.action === 'silent') { console.log(hookSilent()); process.exit(0); }
  if (result.action === 'soft') { console.log(hookOutput('Stop', softMessage(result.factors))); process.exit(0); }

  // allow / block both persist state.
  try {
    writeStateAtomic(result.nextState);
  } catch (e) {
    hookDebug('verify-gate:write', e);
    console.log(hookOutput(
      'Stop',
      '[omh:verify-gate] State persistence failed; allowing stop to avoid repeated verification blocks. Check write access to .claude/.omh.',
    ));
    process.exit(0);
  }

  if (result.action === 'block') {
    console.log(hookStopContinue(result.reason));
    process.exit(0);
  }
  // allow
  console.log(hookOutput('Stop', result.reason || '[omh:verify-gate] ✅ verified.'));
  process.exit(0);
} catch (e) {
  hookDebug('verify-gate', e);
  console.log(hookSilent());
  process.exit(0);
}
