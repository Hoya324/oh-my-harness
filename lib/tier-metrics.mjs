/**
 * Classifier quality metrics over a labelled prompt corpus.
 * Pure: takes rows + a classify function, returns a confusion matrix and
 * per-tier precision/recall so regressions are measured, not guessed.
 */
export function evaluateTierCorpus(rows, classify) {
  const tiers = [1, 2, 3];
  const confusion = {};
  for (const e of tiers) { confusion[e] = { 1: 0, 2: 0, 3: 0 }; }
  const misses = [];
  for (const row of rows) {
    const got = classify(row.prompt);
    confusion[row.expectedTier][got] += 1;
    if (got !== row.expectedTier) misses.push({ prompt: row.prompt, expected: row.expectedTier, got });
  }
  const perTier = {};
  for (const t of tiers) {
    const tp = confusion[t][t];
    const predicted = tiers.reduce((n, e) => n + confusion[e][t], 0);
    const actual = tiers.reduce((n, g) => n + confusion[t][g], 0);
    perTier[t] = {
      precision: predicted ? tp / predicted : null,
      recall: actual ? tp / actual : null,
      support: actual,
    };
  }
  const correct = tiers.reduce((n, t) => n + confusion[t][t], 0);
  return { total: rows.length, accuracy: rows.length ? correct / rows.length : null, confusion, perTier, misses };
}
