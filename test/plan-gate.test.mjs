import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlanGate, isGatedTool, isClearTool, DEFAULT_GATED } from '../lib/plan-gate.mjs';

function base(over = {}) {
  return { toolName: 'Edit', gatedTools: DEFAULT_GATED, maxDenials: 3, featureOff: false, disabled: false, ...over };
}
const armed = (over = {}) => ({ required: true, satisfied: false, denials: 0, tier: 3, ...over });

describe('helpers', () => {
  it('DEFAULT_GATED covers the mutating tools', () => {
    for (const t of ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']) assert.ok(isGatedTool(t, DEFAULT_GATED));
    assert.ok(!isGatedTool('Read', DEFAULT_GATED));
  });
  it('isClearTool is ExitPlanMode only', () => {
    assert.ok(isClearTool('ExitPlanMode'));
    assert.ok(!isClearTool('EnterPlanMode'));
  });
});

describe('evaluatePlanGate', () => {
  it('allows when no marker / not required', () => {
    assert.equal(evaluatePlanGate(null, base()).action, 'allow');
    assert.equal(evaluatePlanGate({ required: false }, base()).action, 'allow');
  });
  it('denies a gated tool when armed and unsatisfied (denials++)', () => {
    const r = evaluatePlanGate(armed(), base({ toolName: 'Write' }));
    assert.equal(r.action, 'deny');
    assert.match(r.reason, /\[omh:plan-gate\]/);
    assert.match(r.reason, /EnterPlanMode/);
    assert.equal(r.nextState.denials, 1);
  });
  it('allows read-only / ungated tools even when armed', () => {
    assert.equal(evaluatePlanGate(armed(), base({ toolName: 'Read' })).action, 'allow');
    assert.equal(evaluatePlanGate(armed(), base({ toolName: 'Grep' })).action, 'allow');
    assert.equal(evaluatePlanGate(armed(), base({ toolName: 'EnterPlanMode' })).action, 'allow');
  });
  it('ExitPlanMode clears the requirement (satisfied)', () => {
    const r = evaluatePlanGate(armed(), base({ toolName: 'ExitPlanMode' }));
    assert.equal(r.action, 'clear');
    assert.equal(r.nextState.satisfied, true);
  });
  it('allows once satisfied', () => {
    assert.equal(evaluatePlanGate(armed({ satisfied: true }), base()).action, 'allow');
  });
  it('NEVER WEDGE: allows after maxDenials and marks satisfied', () => {
    const r = evaluatePlanGate(armed({ denials: 3 }), base({ maxDenials: 3 }));
    assert.equal(r.action, 'allow');
    assert.equal(r.stopCause, 'max_denials');
    assert.equal(r.nextState.satisfied, true);
  });
  it('off / disabled -> allow', () => {
    assert.equal(evaluatePlanGate(armed(), base({ featureOff: true })).action, 'allow');
  });
  it('allows a gated tool that writes the native plan file (no denial increment)', () => {
    const r = evaluatePlanGate(armed(), base({ toolName: 'Write', isPlanFile: true }));
    assert.equal(r.action, 'allow');
    assert.equal(r.stopCause, 'plan_file');
    assert.equal(r.nextState.denials, 0); // writing the plan must never count against the cap
  });
  it('still denies a gated tool for a non-plan file', () => {
    const r = evaluatePlanGate(armed(), base({ toolName: 'Write', isPlanFile: false }));
    assert.equal(r.action, 'deny');
  });
});
