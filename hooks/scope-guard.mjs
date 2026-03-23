#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync('/dev/stdin', 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.scopeGuard) { console.log(hookSilent()); process.exit(0); }

  const allowedPaths = config.scopeGuard?.allowedPaths || [];
  if (allowedPaths.length === 0) process.exit(0); // empty = no restriction

  const input = readStdin();
  const toolName = input.tool_name || input.toolName || '';

  // Only check file-modifying tools
  if (!['Edit', 'Write', 'NotebookEdit'].includes(toolName)) process.exit(0);

  const toolInput = input.tool_input || input.toolInput || {};
  const filePath = toolInput.file_path || toolInput.filePath || toolInput.path || '';
  if (!filePath) process.exit(0);

  // Resolve to relative path from project root
  const absPath = isAbsolute(filePath) ? filePath : join(projectRoot, filePath);
  const relPath = relative(projectRoot, absPath);

  // Check if file is within any allowed path
  const isAllowed = allowedPaths.some(allowed => {
    const normalizedAllowed = allowed.replace(/\/$/, '');
    return relPath === normalizedAllowed || relPath.startsWith(normalizedAllowed + '/');
  });

  if (!isAllowed) {
    console.log(hookOutput('PostToolUse',
      `[oh-my-harness] SCOPE WARNING: "${relPath}" is outside the allowed scope [${allowedPaths.join(', ')}]. Confirm with the user that this modification is intended.`
    ));
  }
} catch {
  console.log(hookSilent());
}
