/**
 * Context budget: what OMH injects into the model's context must stay small.
 * Small skills have clear trigger conditions and predictable results; large
 * ones become black boxes. These budgets are self-imposed, not a Claude Code
 * limit.
 *
 * Oversized files are listed in LEGACY_OVER_BUDGET with their current size as
 * a ceiling: they may shrink, never grow, and should be split and removed
 * from the list one at a time.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { buildClaudeMdContent } from '../lib/claude-md.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const BUDGET = {
  skillBytes: 4096,
  claudeMdBlockBytes: 2560,
};

// path -> ceiling in bytes. Remove an entry once the skill is split.
const LEGACY_OVER_BUDGET = {
  'claude/skills/agent-spawn/SKILL.md': 6157,
  'claude/skills/team-spawn/SKILL.md': 5122,
  'codex/skills/agent-spawn/SKILL.md': 4797,
};

function skillFiles() {
  const out = [];
  for (const base of ['claude/skills', 'codex/skills']) {
    const dir = join(ROOT, base);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const file = join(dir, name, 'SKILL.md');
      if (existsSync(file)) out.push(file);
    }
  }
  return out;
}

describe('context budget', () => {
  for (const file of skillFiles()) {
    const rel = relative(ROOT, file).split('\\').join('/');
    const ceiling = LEGACY_OVER_BUDGET[rel] ?? BUDGET.skillBytes;
    it(`${rel} <= ${ceiling} bytes`, () => {
      const size = statSync(file).size;
      assert.ok(size <= ceiling, `${rel} is ${size} bytes; move detail into references/ and keep SKILL.md to when-to-use + first steps`);
    });
  }

  it('legacy allowlist only names files that still exist and are still over budget', () => {
    for (const [rel, ceiling] of Object.entries(LEGACY_OVER_BUDGET)) {
      const file = join(ROOT, rel);
      assert.ok(existsSync(file), `${rel} no longer exists; drop it from LEGACY_OVER_BUDGET`);
      assert.ok(statSync(file).size > BUDGET.skillBytes, `${rel} now fits the budget; drop it from LEGACY_OVER_BUDGET`);
      assert.ok(ceiling > BUDGET.skillBytes);
    }
  });

  it(`generated CLAUDE.md block with every feature on <= ${BUDGET.claudeMdBlockBytes} bytes`, () => {
    const config = JSON.parse(readFileSync(join(ROOT, 'templates', 'harness.config.json.tmpl'), 'utf8'));
    for (const key of Object.keys(config.features)) config.features[key] = true;
    const empty = mkdtempSync(join(tmpdir(), 'omh-budget-'));
    try {
      const block = buildClaudeMdContent(empty, config);
      assert.ok(Buffer.byteLength(block) <= BUDGET.claudeMdBlockBytes, `block is ${Buffer.byteLength(block)} bytes`);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('every skill references file it points to exists', () => {
    for (const file of skillFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/`(references\/[\w./-]+\.md)`/g)) {
        assert.ok(existsSync(join(dirname(file), m[1])), `${relative(ROOT, file)} points to missing ${m[1]}`);
      }
    }
  });
});
