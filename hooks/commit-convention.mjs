#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); }
  catch { return {}; }
}

function detectConvention(root) {
  const commitlintFiles = [
    'commitlint.config.js', 'commitlint.config.cjs', 'commitlint.config.mjs',
    '.commitlintrc', '.commitlintrc.json', '.commitlintrc.yml',
  ];
  for (const f of commitlintFiles) {
    if (existsSync(join(root, f))) return 'conventional';
  }
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['gitmoji-cli'] || deps['gitmoji-changelog']) return 'gitmoji';
    if (deps.commitizen || deps['cz-conventional-changelog']) return 'conventional';
    if (pkg.config?.commitizen) return 'conventional';
  } catch {}
  return 'conventional';
}

const messages = {
  conventional: [
    `[omh:commit-convention] Commit convention: Conventional Commits`,
    `Format: <type>(<scope>): <description>`,
    `Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore`,
    `Example: feat(auth): add OAuth2 login flow`,
  ],
  gitmoji: [
    `[omh:commit-convention] Commit convention: Gitmoji`,
    `Format: <emoji> <description>`,
    `Common: feat, fix, docs, refactor, test, config`,
    `Example: feat: Add OAuth2 login flow`,
  ],
};

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.commitConvention) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const toolName = input.tool_name || input.toolName || '';
  const toolInput = JSON.stringify(input.tool_input || input.toolInput || input.input || '');

  if (toolName !== 'Bash' || !/git\s+(-C\s+\S+\s+)?commit/.test(toolInput)) process.exit(0);

  const convention = config.commitConvention?.style === 'auto'
    ? detectConvention(projectRoot)
    : (config.commitConvention?.style || 'conventional');

  const output = messages[convention] || messages.conventional;
  if (output.length > 0) {
    console.log(hookOutput('PostToolUse', output.join('\n')));
  }
} catch {
  console.log(hookSilent());
}
