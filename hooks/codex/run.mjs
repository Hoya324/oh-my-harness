#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { translateHookOutput } from './adapter.mjs';

const ALLOWED = new Set([
  'session-start.mjs', 'pre-prompt.mjs', 'dangerous-guard.mjs',
  'plan-gate.mjs', 'commit-convention.mjs', 'scope-guard.mjs',
  'usage-tracker.mjs', 'pre-compact.mjs', 'loop-guard.mjs',
  'verify-gate.mjs', 'post-task.mjs',
]);

const hookName = process.argv[2];
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stdin = readFileSync(0, 'utf8');

if (!ALLOWED.has(hookName)) {
  process.exitCode = 1;
} else {
  try {
    const child = spawnSync(process.execPath, [join(pluginRoot, 'hooks', hookName)], {
      input: stdin,
      encoding: 'utf8',
      env: process.env,
    });
    if (!child.error && child.status === 0) {
      const output = translateHookOutput(hookName, child.stdout);
      if (output) process.stdout.write(`${output}\n`);
    }
  } catch {
    // Hooks must not block Codex when the underlying executable cannot run.
  }
}
