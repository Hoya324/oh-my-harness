#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { hookSilent } from './lib/output.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');
const usagePath = join(projectRoot, '.claude', '.omh', 'usage.json');

function readStdin() {
  try { return JSON.parse(readFileSync('/dev/stdin', 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) process.exit(0);

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { process.exit(0); }
  if (!config.features?.usageTracking) process.exit(0);

  const input = readStdin();
  const toolName = input.tool_name || input.toolName || 'unknown';
  const sessionId = input.session_id || input.sessionId || 'default';

  // Load existing usage data
  let usage;
  try { usage = JSON.parse(readFileSync(usagePath, 'utf8')); } catch { usage = { sessions: {} }; }

  if (!usage.sessions[sessionId]) {
    usage.sessions[sessionId] = {
      tool_counts: {},
      total_calls: 0,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const session = usage.sessions[sessionId];
  session.tool_counts[toolName] = (session.tool_counts[toolName] || 0) + 1;
  session.total_calls++;
  session.updated_at = new Date().toISOString();
  session.last_tool = toolName;

  mkdirSync(dirname(usagePath), { recursive: true });
  writeFileSync(usagePath, JSON.stringify(usage, null, 2));

  // Silent — usage tracker never outputs to Claude
} catch {
  // Never fail
}
