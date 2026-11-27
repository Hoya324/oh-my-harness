import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classifyTier } from '../hooks/lib/tier.mjs';
import { evaluateTierCorpus } from '../lib/tier-metrics.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(__dirname, 'fixtures', 'prompts.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const baseline = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'prompts.baseline.json'), 'utf8'));
const report = evaluateTierCorpus(rows, (p) => classifyTier(p, {}).tier);

describe('tier classifier corpus', () => {
  it('corpus is labelled and covers every tier', () => {
    assert.ok(rows.length >= 90);
    for (const t of [1, 2, 3]) assert.ok(report.perTier[t].support >= 15, `tier ${t} needs >= 15 examples`);
    for (const r of rows) assert.ok([1, 2, 3].includes(r.expectedTier), r.prompt);
  });

  it(`accuracy does not regress below ${baseline.accuracy}`, () => {
    assert.ok(report.accuracy >= baseline.accuracy, `accuracy ${report.accuracy.toFixed(3)}; misses:\n${report.misses.map((m) => `  ${m.expected}→${m.got} ${m.prompt}`).join('\n')}`);
  });

  it(`Tier-3 recall does not regress below ${baseline.tier3Recall} (missing a risky task is the costly error)`, () => {
    assert.ok(report.perTier[3].recall >= baseline.tier3Recall, `tier-3 recall ${report.perTier[3].recall.toFixed(3)}`);
  });

  it(`Tier-1 precision stays above ${baseline.tier1Precision} (never downgrade risky work)`, () => {
    assert.ok(report.perTier[1].precision >= baseline.tier1Precision, `tier-1 precision ${report.perTier[1].precision.toFixed(3)}`);
  });

  it('evaluateTierCorpus computes a confusion matrix', () => {
    const r = evaluateTierCorpus(
      [{ prompt: 'a', expectedTier: 1 }, { prompt: 'b', expectedTier: 3 }, { prompt: 'c', expectedTier: 3 }],
      (p) => (p === 'a' ? 1 : p === 'b' ? 3 : 2),
    );
    assert.equal(r.confusion[3][2], 1);
    assert.equal(r.perTier[3].recall, 0.5);
    assert.equal(r.perTier[1].precision, 1);
    assert.equal(r.misses.length, 1);
  });
});
