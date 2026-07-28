import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { diffSignature } from '../lib/risk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Sandbox is a real git repo OUTSIDE the repo tree so the hook's working-tree
// probe returns known files without picking up this repo's own state.
const TMP = join(tmpdir(), `omh_verify_gate_test_${process.pid}`);
const HOOKS_DIR = join(__dirname, '..', 'hooks');
const OMH = join(TMP, '.claude', '.omh');

function runHook(stdinData, env = {}) {
  const input = typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData);
  return execFileSync('node', [join(HOOKS_DIR, 'verify-gate.mjs')], {
    input,
    env: { ...process.env, PROJECT_PATH: TMP, HOME: join(TMP, '__home'), USERPROFILE: join(TMP, '__home'), ...env },
    encoding: 'utf8',
    timeout: 15000,
  }).trim();
}

function parse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function writeConfig(config) {
  mkdirSync(OMH, { recursive: true });
  writeFileSync(join(OMH, 'harness.config.json'), JSON.stringify(config));
}

function writeFile(rel, content = 'x') {
  const p = join(TMP, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

function gateConfig(over = {}) {
  return {
    features: { verifyGate: true },
    verifyGate: {
      riskThreshold: 2, maxBlocks: 2, runLadder: true, recommendCrossVerify: true,
      largeFiles: 8, largeLines: 400, ladderTimeoutSec: { quickCheck: 30, verify: 180 },
      quickCheckCommand: '', verifyCommand: '',
      sensitivePaths: ['**/auth/**', '*migration*', '.env*'],
      ...over,
    },
  };
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: TMP });
  // Hide OMH state + the gitignore itself so the working-tree probe only sees real changes.
  writeFileSync(join(TMP, '.gitignore'), '.claude/\n.gitignore\n__home/\n');
});
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

describe('verify-gate hook', () => {
  it('stays silent on a docs-only change (low risk)', () => {
    writeConfig(gateConfig());
    writeFile('notes.md', '# hi');
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('blocks (top-level decision:block) when a risky change fails the ladder', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(1)"' }));
    writeFile('src/feature.ts', 'export const x = 1');
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
    assert.equal(parsed.decision, 'block', 'must use TOP-LEVEL decision:block');
    assert.ok(!parsed.hookSpecificOutput, 'must NOT nest under hookSpecificOutput for Stop');
    assert.match(parsed.reason, /\[omh:verify-gate\]/);
    assert.match(parsed.reason, /RED/);
  });

  it('fails open on repeated denials when the denial count cannot be persisted', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(1)"' }));
    writeFile('src/feature.ts', 'export const x = 1');
    chmodSync(OMH, 0o555);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
        assert.notEqual(parsed?.decision, 'block');
        assert.match(parsed?.hookSpecificOutput?.additionalContext || '', /persistence failed.*allowing/i);
      }
    } finally {
      chmodSync(OMH, 0o755);
    }
  });

  it('allows the stop when the ladder is green', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(0)"' }));
    writeFile('src/feature.ts', 'export const x = 1');
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
    assert.notEqual(parsed && parsed.decision, 'block');
    assert.match(parsed.hookSpecificOutput.additionalContext, /verify-gate/);
  });

  it('NEVER WEDGES: allows once the maxBlocks cap is reached, even on red', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(1)"', maxBlocks: 2 }));
    writeFile('src/feature.ts', 'export const x = 1');
    const sig = diffSignature(['src/feature.ts'], { files: 1, lines: 0 });
    mkdirSync(OMH, { recursive: true });
    writeFileSync(join(OMH, 'verify-gate-state.json'), JSON.stringify({ sessionId: 's1', signature: sig, blockCount: 2, lastVerifiedSignature: null }));
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
    assert.notEqual(parsed && parsed.decision, 'block', 'must not block past the cap');
    assert.match(parsed.hookSpecificOutput.additionalContext, /still RED|pre-existing|Allowing stop/);
  });

  it('defers to an active loop (silent)', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(1)"' }));
    writeFile('src/feature.ts', 'export const x = 1');
    mkdirSync(OMH, { recursive: true });
    writeFileSync(join(OMH, 'loop-state.json'), JSON.stringify({ active: true, sessionId: 's1' }));
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('stays silent when the feature is disabled', () => {
    writeConfig({ features: { verifyGate: false }, verifyGate: { quickCheckCommand: 'node -e "process.exit(1)"' } });
    writeFile('src/feature.ts', 'export const x = 1');
    const parsed = parse(runHook({ session_id: 's1' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('stays silent when DISABLE_HARNESS is set', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(1)"' }));
    writeFile('src/feature.ts', 'export const x = 1');
    const parsed = parse(runHook({ session_id: 's1' }, { DISABLE_HARNESS: '1' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('does not run the ladder / block when stop_hook_active (re-entry guard)', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(1)"' }));
    writeFile('src/feature.ts', 'export const x = 1');
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: true }));
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('fail-opens on a corrupt state file (removes it, stays silent on low risk)', () => {
    writeConfig(gateConfig());
    writeFile('notes.md', '# hi');
    mkdirSync(OMH, { recursive: true });
    writeFileSync(join(OMH, 'verify-gate-state.json'), 'not json!!!');
    const parsed = parse(runHook({ session_id: 's1' }));
    assert.ok(!parsed || parsed.suppressOutput === true);
    assert.ok(!existsSync(join(OMH, 'verify-gate-state.json')), 'corrupt state should be removed');
  });

  it('uses the persisted tier as a floor (tier 3 + sensitive change blocks on red)', () => {
    writeConfig(gateConfig({ quickCheckCommand: 'node -e "process.exit(1)"' }));
    writeFile('src/auth/login.ts', 'export const login = 1');
    mkdirSync(OMH, { recursive: true });
    writeFileSync(join(OMH, 'last-prompt.json'), JSON.stringify({ tier: 3, sessionId: 's1', ts: 1 }));
    const parsed = parse(runHook({ session_id: 's1', stop_hook_active: false }));
    assert.equal(parsed.decision, 'block');
    assert.match(parsed.reason, /omh-verify/); // risk 3 recommends cross-verify
  });
});
