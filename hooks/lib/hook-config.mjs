/**
 * Hook config loader with global fallback.
 * Resolution order:
 *   1. <projectRoot>/.claude/.omh/harness.config.json  (project-local, wins)
 *   2. <home>/.claude/.omh/harness.config.json          (user-global fallback)
 * Returns null if neither exists or both are unparseable (hooks then bail silently).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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
      try { return JSON.parse(readFileSync(p, 'utf8')); } catch { /* try next candidate */ }
    }
  }
  return null;
}
