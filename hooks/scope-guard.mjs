#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';
import { loadConfig } from './lib/hook-config.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); }
  catch { return {}; }
}

function extractApplyPatchTargets(command) {
  return [...String(command || '').matchAll(
    /^\*\*\* (?:Add|Update|Delete) File:[ \t]+(.+?)[ \t]*\r?$/gm
  )].map(([, filePath]) => filePath);
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  config = loadConfig(projectRoot); if (!config) { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.scopeGuard) { console.log(hookSilent()); process.exit(0); }

  const allowedPaths = config.scopeGuard?.allowedPaths || [];
  if (allowedPaths.length === 0) process.exit(0); // empty = no restriction

  const input = readStdin();
  const toolName = input.tool_name || input.toolName || '';

  const toolInput = input.tool_input || input.toolInput || {};
  let filePaths;
  if (['Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
    const filePath = toolInput.file_path || toolInput.filePath || toolInput.path || '';
    filePaths = filePath ? [filePath] : [];
  } else if (toolName === 'apply_patch') {
    filePaths = extractApplyPatchTargets(toolInput.command);
  } else {
    process.exit(0);
  }
  if (filePaths.length === 0) process.exit(0);

  const relPaths = filePaths.map(filePath => {
    const absPath = isAbsolute(filePath) ? filePath : join(projectRoot, filePath);
    return relative(projectRoot, absPath);
  });

  const isAllowed = relPath => allowedPaths.some(allowed => {
    const normalizedAllowed = allowed.replace(/\/$/, '');
    return relPath === normalizedAllowed || relPath.startsWith(normalizedAllowed + '/');
  });
  const outOfScope = relPaths.find(relPath => !isAllowed(relPath));

  if (outOfScope) {
    console.log(hookOutput('PostToolUse',
      `[omh:scope-guard] SCOPE WARNING: "${outOfScope}" is outside the allowed scope [${allowedPaths.join(', ')}]. Confirm with the user that this modification is intended.`
    ));
  }
} catch {
  console.log(hookSilent());
}
