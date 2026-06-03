#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { hookCompact, hookSilent } from './lib/output.mjs';
import { loadConfig } from './lib/hook-config.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');
const snapshotPath = join(projectRoot, '.claude', '.omh', 'context-snapshot.md');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  config = loadConfig(projectRoot); if (!config) { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.contextSnapshot) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();

  const lines = [
    `# Context Snapshot`,
    `_Saved at ${new Date().toISOString()} before context compaction_`,
    '',
  ];
  if (input.summary) { lines.push(`## Session Summary`, input.summary, ''); }
  if (input.active_tasks) { lines.push(`## Active Tasks`, input.active_tasks, ''); }
  lines.push(`## Reminder`);
  lines.push(`Context was compacted. Review .claude/.omh/STATE.md, .claude/.omh/context-snapshot.md, and .claude/.omh/conventions.json to restore working context.`);

  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, lines.join('\n'));

  console.log(hookCompact(
    `[omh:context-snapshot] Context compaction imminent. State saved to .claude/.omh/context-snapshot.md. Summarize current task progress and key decisions before continuing.`
  ));
} catch {
  console.log(hookSilent());
}
