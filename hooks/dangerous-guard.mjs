#!/usr/bin/env node
import { readFileSync } from 'fs';
import { hookPreToolDeny, hookSilent, hookDebug } from './lib/output.mjs';
import { loadConfig } from './lib/hook-config.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();

function readStdin() {
  const raw = readFileSync(0, 'utf8');
  try { return { ok: true, value: JSON.parse(raw) }; }
  catch { return { ok: false, value: null }; }
}

function commandSegments(command, executable) {
  const escaped = executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[;&|]\\s*)${escaped}\\s+([^;&|\\n]*)`, 'gi');
  return [...String(command || '').matchAll(re)].map((match) => match[1]);
}

function hasForcedRemove(command) {
  return commandSegments(command, 'rm').some((segment) => {
    const tokens = segment.match(/"[^"]*"|'[^']*'|\\.|[^\s]+/g) || [];
    return tokens.some((token) =>
      token === '--force' ||
      (/^-[^-]+$/.test(token) && token.slice(1).includes('f')));
  });
}

function extractPatchTargets(command) {
  return [...String(command || '').matchAll(
    /^\*\*\* (?:Add|Update|Delete) File:[ \t]+(.+?)[ \t]*\r?$|^\*\*\* Move to:[ \t]+(.+?)[ \t]*\r?$/gm,
  )].map((match) => match[1] || match[2]);
}

function sensitivePathWarnings(filePaths) {
  const sensitivePatterns = [
    { pattern: /(^|[/\\])\.env(?:[./\\]|$)/i, label: '.env file' },
    { pattern: /credentials/i, label: 'credentials file' },
    { pattern: /secret/i, label: 'secrets file' },
    { pattern: /(?:^|[/\\])id_rsa(?:$|[/\\])|\.pem$|\.key$/i, label: 'private key file' },
  ];
  const warnings = [];
  for (const filePath of filePaths) {
    for (const { pattern, label } of sensitivePatterns) {
      if (pattern.test(String(filePath || ''))) warnings.push(`writing to ${label}`);
    }
  }
  return warnings;
}

function deny(reason) {
  console.log(hookPreToolDeny(`[omh:dangerous-guard] ${reason}`));
}

try {
  if (process.env.DISABLE_HARNESS) {
    console.log(hookSilent());
    process.exit(0);
  }

  // Missing or unreadable configuration must not disable the destructive-action
  // boundary. An explicit `false` remains the user-controlled opt-out.
  const config = loadConfig(projectRoot);
  if (config?.features?.dangerousGuard === false) {
    console.log(hookSilent());
    process.exit(0);
  }

  const parsedInput = readStdin();
  if (!parsedInput.ok) {
    deny('Denied because malformed input prevented command safety from being established.');
    process.exit(0);
  }

  const input = parsedInput.value || {};
  const toolName = input.tool_name || input.toolName || '';
  const rawInput = input.tool_input || input.toolInput || input.input || {};
  const warnings = [];

  if (toolName === 'Bash') {
    const command = typeof rawInput === 'string' ? rawInput : String(rawInput.command || '');
    const dangerousPatterns = [
      { pattern: /git\s+push\b[^\n;&|]*\s--force(?:-with-lease)?\b/i, label: 'git push --force' },
      { pattern: /git\s+reset\s+--hard\b/i, label: 'git reset --hard' },
      { pattern: /git\s+clean\s+-[a-zA-Z]*f/i, label: 'git clean -f' },
      { pattern: /git\s+checkout\s+--?\s+\./i, label: 'git checkout -- .' },
      { pattern: /DROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i, label: 'DROP TABLE/DATABASE' },
      { pattern: /TRUNCATE\s+TABLE\b/i, label: 'TRUNCATE TABLE' },
      { pattern: /DELETE\s+FROM\s+\w+\s*;?\s*$/i, label: 'DELETE FROM (no WHERE)' },
      { pattern: /:\s*>\s*\S+/, label: 'file truncation (:> file)' },
      { pattern: /\bchmod\s+777\b/i, label: 'chmod 777' },
      { pattern: /\bcurl\b[^\n|]*\|\s*(?:ba)?sh\b/i, label: 'curl | sh (remote execution)' },
      { pattern: /\bnpm\s+publish\b/i, label: 'npm publish' },
      { pattern: /\bdocker\s+system\s+prune\b/i, label: 'docker system prune' },
      { pattern: /(?:^|[;&|]\s*)sudo\s+/i, label: 'sudo (elevated privileges)' },
      { pattern: /(?:^|[;&|]\s*)chown\s+/i, label: 'chown (ownership change)' },
      { pattern: /\bln\s+(?:-[a-zA-Z]*s[a-zA-Z]*f|-sf|-fs)\b/i, label: 'ln -sf (force symlink)' },
    ];
    if (hasForcedRemove(command)) warnings.push('rm -rf / rm --force');
    for (const { pattern, label } of dangerousPatterns) {
      if (pattern.test(command)) warnings.push(label);
    }
  }

  let targetPaths = [];
  if (['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(toolName)) {
    const path = rawInput.file_path || rawInput.filePath || rawInput.path;
    if (path) targetPaths.push(path);
    if (Array.isArray(rawInput.edits)) {
      targetPaths.push(...rawInput.edits
        .map((edit) => edit?.file_path || edit?.filePath || edit?.path)
        .filter(Boolean));
    }
  } else if (toolName === 'apply_patch') {
    targetPaths = extractPatchTargets(rawInput.command);
  }
  warnings.push(...sensitivePathWarnings(targetPaths));

  if (warnings.length > 0) {
    deny(`WARNING: ${[...new Set(warnings)].join(', ')}. Confirm with the user before proceeding.`);
  }
} catch (error) {
  hookDebug('dangerous-guard', error);
  deny('Denied because the safety check failed unexpectedly. Inspect the hook debug log and retry.');
}
