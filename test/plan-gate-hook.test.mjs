import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(tmpdir(), `omh_plan_gate_test_${process.pid}`);
const HOOKS_DIR = join(__dirname, '..', 'hooks');
const OMH = join(TMP, '.claude', '.omh');

function runHook(stdin, env = {}) {
  return execFileSync('node', [join(HOOKS_DIR, 'plan-gate.mjs')], {
    input: JSON.stringify(stdin),
    env: { ...process.env, PROJECT_PATH: TMP, HOME: join(TMP, '__home'), USERPROFILE: join(TMP, '__home'), ...env },
    encoding: 'utf8', timeout: 10000,
  }).trim();
}
function parse(raw) { if (!raw) return null; try { return JSON.parse(raw); } catch { return raw; } }
function writeConfig(c) { mkdirSync(OMH, { recursive: true }); writeFileSync(join(OMH, 'harness.config.json'), JSON.stringify(c)); }
function writeMarker(m) { mkdirSync(OMH, { recursive: true }); writeFileSync(join(OMH, 'plan-gate.json'), JSON.stringify(m)); }
const cfg = { features: { planGate: true }, planGate: { minTier: 3, maxDenials: 3, gatedTools: ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'] } };

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('plan-gate hook', () => {
  it('denies an Edit when armed and unsatisfied', () => {
    writeConfig(cfg);
    writeMarker({ required: true, satisfied: false, denials: 0, tier: 3 });
    const p = parse(runHook({ tool_name: 'Edit', tool_input: { file_path: 'a.ts' }, session_id: 's1' }));
    assert.equal(p.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(p.hookSpecificOutput.permissionDecisionReason, /\[omh:plan-gate\]/);
  });
  it('allows a Read even when armed', () => {
    writeConfig(cfg);
    writeMarker({ required: true, satisfied: false, denials: 0, tier: 3 });
    const p = parse(runHook({ tool_name: 'Read', tool_input: { file_path: 'a.ts' }, session_id: 's1' }));
    assert.notEqual(p?.hookSpecificOutput?.permissionDecision, 'deny');
  });
  it('ExitPlanMode clears the marker, then Edit is allowed', () => {
    writeConfig(cfg);
    writeMarker({ required: true, satisfied: false, denials: 0, tier: 3 });
    runHook({ tool_name: 'ExitPlanMode', tool_input: {}, session_id: 's1' });
    const p = parse(runHook({ tool_name: 'Edit', tool_input: { file_path: 'a.ts' }, session_id: 's1' }));
    assert.notEqual(p?.hookSpecificOutput?.permissionDecision, 'deny');
  });
  it('NEVER WEDGE: allows the Edit once maxDenials reached', () => {
    writeConfig(cfg);
    writeMarker({ required: true, satisfied: false, denials: 3, tier: 3 });
    const p = parse(runHook({ tool_name: 'Edit', tool_input: { file_path: 'a.ts' }, session_id: 's1' }));
    assert.notEqual(p?.hookSpecificOutput?.permissionDecision, 'deny');
  });
  it('feature off -> allow', () => {
    writeConfig({ features: { planGate: false } });
    writeMarker({ required: true, satisfied: false, denials: 0, tier: 3 });
    const p = parse(runHook({ tool_name: 'Edit', tool_input: { file_path: 'a.ts' }, session_id: 's1' }));
    assert.notEqual(p?.hookSpecificOutput?.permissionDecision, 'deny');
  });
  it('fail-opens on a corrupt marker', () => {
    writeConfig(cfg);
    mkdirSync(OMH, { recursive: true });
    writeFileSync(join(OMH, 'plan-gate.json'), 'not json!!!');
    const p = parse(runHook({ tool_name: 'Edit', tool_input: { file_path: 'a.ts' }, session_id: 's1' }));
    assert.notEqual(p?.hookSpecificOutput?.permissionDecision, 'deny');
  });
});
