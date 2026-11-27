#!/usr/bin/env node
/**
 * Regenerate the OMH harness block in this repo's own CLAUDE.md files from the
 * same generator `oh-my-harness init` uses, with every default feature on.
 *
 * Hand-maintained copies drift (this repo shipped a stale 0.3.1 block next to a
 * 0.5.0 package). test/claude-md-sync.test.mjs fails when they diverge; run
 * `npm run sync:claude-md` to fix.
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { buildClaudeMdContent } from '../lib/claude-md.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TARGETS = ['CLAUDE.md', join('.claude', 'CLAUDE.md')];
const BLOCK = /<!-- HARNESS:START -->[\s\S]*?<!-- HARNESS:END -->/;

export function expectedBlock() {
  const config = JSON.parse(readFileSync(join(root, 'templates', 'harness.config.json.tmpl'), 'utf8'));
  // Empty state root: no conventions cache, so the block is repo-independent.
  const empty = mkdtempSync(join(tmpdir(), 'omh-claude-md-'));
  try { return buildClaudeMdContent(empty, config).trim(); }
  finally { rmSync(empty, { recursive: true, force: true }); }
}

export function currentBlock(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return null;
  const m = readFileSync(path, 'utf8').match(BLOCK);
  return m ? m[0].trim() : null;
}

function sync() {
  const block = expectedBlock();
  for (const rel of TARGETS) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    const next = BLOCK.test(text) ? text.replace(BLOCK, block) : `${text.trimEnd()}\n\n${block}\n`;
    writeFileSync(path, next.endsWith('\n') ? next : `${next}\n`);
    console.log(`synced ${rel}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) sync();
