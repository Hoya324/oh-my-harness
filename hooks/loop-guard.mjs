#!/usr/bin/env node
/**
 * Autonomous Loop guard — the Stop-hook loop engine + safety enforcer.
 *
 * On every Stop event this hook decides whether to FORCE CONTINUATION (the loop
 * has not met its goal and is under all budgets) or ALLOW the session to stop
 * (goal met, or a hard limit / no-progress / oscillation fired). Continuation is
 * emitted via the load-bearing Stop contract: top-level {decision:'block',reason}
 * on stdout + exit 0 (see hooks/lib/output.mjs hookStopContinue; NEVER exit 2).
 *
 * All real decision logic lives in pure lib/loop.mjs::evaluateLoop. This wrapper
 * only gathers impure signals (time, git HEAD/diff, optional cheap verify) and
 * persists state. It is fail-open: any error or corruption -> stay silent / clear
 * state, never trap the user in a wedged session.
 */
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, execFileSync } from 'child_process';
import { hookStopContinue, hookOutput, hookSilent, hookDebug } from './lib/output.mjs';
import { loadConfig } from './lib/hook-config.mjs';
import { evaluateLoop, resolveTier, buildLadder } from '../lib/loop.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const omhDir = join(projectRoot, '.claude', '.omh');
const statePath = join(omhDir, 'loop-state.json');
const stopSentinel = join(omhDir, 'STOP');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}

/** Atomic write: temp file + rename, so a crash can't leave a half-written state. */
function writeStateAtomic(state) {
  mkdirSync(omhDir, { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, statePath);
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return null; }
}

/** Compute the progress signal (diff since the last recorded commit). */
function computeDiff(state) {
  const cur = git(['rev-parse', 'HEAD']);
  if (cur == null) return { headSha: null, diff: null };
  const hist = state.history || [];
  const prev = hist.length ? hist[hist.length - 1].headSha : null;
  if (!prev) return { headSha: cur, diff: null }; // first iteration: unknown baseline
  if (cur === prev) return { headSha: cur, diff: { files: 0, lines: 0 } }; // no new commit
  const stat = git(['diff', '--shortstat', `${prev}..${cur}`]) || '';
  const files = (stat.match(/(\d+) files? changed/) || [])[1];
  const ins = (stat.match(/(\d+) insertions?/) || [])[1];
  const del = (stat.match(/(\d+) deletions?/) || [])[1];
  return { headSha: cur, diff: { files: Number(files || 0), lines: Number(ins || 0) + Number(del || 0) } };
}

/** Optional cheap deterministic gate the hook owns: run quickCheck within timeout. */
function runQuickCheck(loopCfg, conventions) {
  try {
    const ladder = buildLadder(conventions, loopCfg);
    const rung = ladder.find((r) => r.rung === 'quickCheck');
    if (!rung) return null;
    execSync(rung.command, { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: (rung.timeoutSec || 30) * 1000 });
    return { rung: 'quickCheck', status: 'pass' };
  } catch (e) {
    const output = (e && (e.stdout || e.stderr) ? `${e.stdout || ''}${e.stderr || ''}` : String(e && e.message || e)).slice(0, 800);
    const timedOut = e && e.killed;
    return { rung: 'quickCheck', status: timedOut ? 'error' : 'fail', retryable: !timedOut, signature: output.slice(0, 120), output };
  }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  // Project-local config wins, with a ~/.claude/.omh global fallback (same as
  // the other OMH hooks via hook-config.mjs).
  const config = loadConfig(projectRoot);
  if (!config || !config.features?.autonomousLoop) { console.log(hookSilent()); process.exit(0); }

  // No active loop -> stay out of the way (post-task hook still runs separately).
  if (!existsSync(statePath)) { console.log(hookSilent()); process.exit(0); }

  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    // Corrupt state: fail-open by removing it so the loop can't wedge the session.
    try { unlinkSync(statePath); } catch {}
    console.log(hookSilent());
    process.exit(0);
  }

  const input = readStdin();
  const loopCfg = config.loop || {};
  const inputSession = input.session_id || input.sessionId || null;

  // Bind the loop to this session on the first Stop event so concurrent
  // sessions / worktrees in the same project are not cross-blocked.
  if (state.active && !state.sessionId && inputSession) state.sessionId = inputSession;

  // Gather impure signals.
  const { headSha, diff } = computeDiff(state);
  const pending = state.pending || {};
  let ladder = Array.isArray(pending.ladder) ? [...pending.ladder] : [];
  let verifyPassed = pending.verifyPassed === true;

  // Optional independent cheap gate: if the hook can run quickCheck and it fails,
  // the model cannot be "done" while lint/typecheck is red.
  if (loopCfg.verifyInHook && state.active && !input.stop_hook_active) {
    let conventions = {};
    try { conventions = JSON.parse(readFileSync(join(omhDir, 'conventions.json'), 'utf8')); } catch {}
    const qc = runQuickCheck(loopCfg, conventions);
    if (qc) {
      ladder = [qc, ...ladder.filter((r) => r.rung !== 'quickCheck')];
      if (qc.status !== 'pass') verifyPassed = false;
    }
  }

  const signals = {
    stopHookActive: input.stop_hook_active === true,
    sessionId: inputSession,
    stopSentinel: existsSync(stopSentinel),
    nowMs: Date.now(),
    headSha,
    diff,
    ladder: ladder.length ? ladder : null,
    verifyPassed: pending.verifyPassed != null || ladder.length ? verifyPassed : null,
    crossVerifyVerdict: pending.crossVerifyVerdict || null,
    reflection: pending.reflection || null,
    config: loopCfg,
  };

  const result = evaluateLoop(state, signals);

  if (result.action === 'ignore') {
    // stop_hook_active / inactive / session-mismatch: do not touch state.
    console.log(hookSilent());
    process.exit(0);
  }

  // Persist the new state (clear consumed pending signals).
  const next = { ...result.nextState };
  delete next.pending;
  if (result.stopCause) next.stopCause = result.stopCause;
  try { writeStateAtomic(next); } catch (e) { hookDebug('loop-guard:write', e); }

  if (result.action === 'continue') {
    console.log(hookStopContinue(result.reason));
    process.exit(0);
  }

  // action === 'stop': allow the session to end, with a summary the model sees.
  const tierCfg = resolveTier(loopCfg, state.tier);
  const cause = result.stopCause || 'done';
  const summary = cause === 'done'
    ? `[omh:loop] ✅ Loop ended: goal met after ${next.iteration} iteration(s) (tier=${state.tier}). Verify ladder green${tierCfg.crossVerify ? ' + cross-verify PASS' : ''}.`
    : `[omh:loop] ⛔ Loop ended: ${cause} at iteration ${next.iteration}/${tierCfg.maxIterations} (tier=${state.tier}). Summarize what was done, what remains, and why it stopped. Do NOT claim the goal is met unless cross-verify confirmed it.`;
  console.log(hookOutput('Stop', summary));
  process.exit(0);
} catch (e) {
  hookDebug('loop-guard', e);
  console.log(hookSilent());
  process.exit(0);
}
