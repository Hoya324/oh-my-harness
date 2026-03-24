#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { hookWarn, hookSilent } from './lib/output.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.dangerousGuard) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const toolName = input.tool_name || input.toolName || '';
  const toolInput = JSON.stringify(input.tool_input || input.toolInput || input.input || '');
  const warnings = [];

  if (toolName === 'Bash') {
    const dangerousPatterns = [
      { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force)/, label: 'rm -rf / rm --force' },
      { pattern: /git\s+push\s+.*--force/, label: 'git push --force' },
      { pattern: /git\s+reset\s+--hard/, label: 'git reset --hard' },
      { pattern: /git\s+clean\s+-[a-zA-Z]*f/, label: 'git clean -f' },
      { pattern: /git\s+checkout\s+--?\s+\./, label: 'git checkout -- .' },
      { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i, label: 'DROP TABLE/DATABASE' },
      { pattern: /TRUNCATE\s+TABLE/i, label: 'TRUNCATE TABLE' },
      { pattern: /DELETE\s+FROM\s+\w+\s*;?\s*$/i, label: 'DELETE FROM (no WHERE)' },
      { pattern: /:\s*>\s*\S+/, label: 'file truncation (:> file)' },
      { pattern: /chmod\s+777/, label: 'chmod 777' },
      { pattern: /curl\s+.*\|\s*(ba)?sh/, label: 'curl | sh (remote execution)' },
      { pattern: /npm\s+publish/, label: 'npm publish' },
      { pattern: /docker\s+system\s+prune/, label: 'docker system prune' },
      { pattern: /\bsudo\s+/, label: 'sudo (elevated privileges)' },
      { pattern: /\bchown\s+/, label: 'chown (ownership change)' },
      { pattern: /\bln\s+(-[a-zA-Z]*s[a-zA-Z]*f|-sf|-fs)\b/, label: 'ln -sf (force symlink)' },
    ];
    for (const { pattern, label } of dangerousPatterns) {
      if (pattern.test(toolInput)) warnings.push(label);
    }
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    const rawInput = input.tool_input || input.toolInput || {};
    const filePath = rawInput.file_path || rawInput.filePath || rawInput.path || '';
    const sensitivePatterns = [
      { pattern: /\.env(?:\.|$)/, label: '.env file' },
      { pattern: /credentials/i, label: 'credentials file' },
      { pattern: /secret/i, label: 'secrets file' },
      { pattern: /id_rsa|\.pem|\.key/, label: 'private key file' },
    ];
    for (const { pattern, label } of sensitivePatterns) {
      if (pattern.test(filePath)) warnings.push(`writing to ${label}`);
    }
  }

  if (warnings.length > 0) {
    console.log(hookWarn('PreToolUse', `[omh:dangerous-guard] WARNING: ${warnings.join(', ')}. Confirm with the user before proceeding.`));
  }
} catch {
  console.log(hookSilent());
}
