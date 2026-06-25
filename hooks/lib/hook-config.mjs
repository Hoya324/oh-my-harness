/**
 * Hook config loader with global fallback.
 * Resolution order:
 *   1. <projectRoot>/.claude/.omh/harness.config.json  (project-local, wins)
 *   2. <home>/.claude/.omh/harness.config.json          (user-global fallback)
 * Returns null if neither exists or both are unparseable (hooks then bail silently).
 * A found config is deep-merged over defaults so a partial/stale file (written by
 * an older version) inherits newly-added feature defaults rather than reading as
 * undefined — keeping hook gating in sync with `lib/config.mjs readConfig`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { mergeWithDefaults } from '../../lib/config.mjs';

export function configCandidates(projectRoot, homeDir = homedir()) {
  return [
    join(projectRoot, '.claude', '.omh', 'harness.config.json'),
    join(homeDir, '.claude', '.omh', 'harness.config.json'),
  ];
}

export function loadConfig(projectRoot, opts = {}) {
  const homeDir = opts.homeDir || homedir();
  for (const p of configCandidates(projectRoot, homeDir)) {
    if (existsSync(p)) {
      try { return mergeWithDefaults(JSON.parse(readFileSync(p, 'utf8'))); } catch { /* try next candidate */ }
    }
  }
  return null;
}
