#!/usr/bin/env node
/**
 * Anti-Rationalization Gate — prevents false task-completion declarations.
 *
 * Instead of a generic reminder, this hook actually verifies that test files
 * exist for every changed code file (via git diff).  When tests are missing
 * it emits a strong [omh:anti-rationalization] warning so the agent cannot
 * claim "done" without addressing the gap.
 *
 * Fallback: if git is unavailable it falls back to checking the last tool's
 * file_path from stdin (original behaviour).
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { execSync } from 'child_process';
import { hookOutput, hookSilent } from './lib/output.mjs';
import { getLang } from './lib/dictionary.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

const CODE_EXT = /\.(js|ts|jsx|tsx|py|go|rs|java|kt|rb|php|c|cpp|h|swift|vue|svelte)$/i;
const TEST_FILE = /\.(test|spec)\./i;
const TEST_DIR = /(\/__tests__\/|\/test\/|\/tests\/)/;

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}

/** Return list of changed code files (excluding test files themselves). */
function getChangedCodeFiles() {
  try {
    const run = (cmd) =>
      execSync(cmd, { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        .split('\n').filter(Boolean);
    const files = [...new Set([
      ...run('git diff --name-only'),
      ...run('git diff --cached --name-only'),
      ...run('git ls-files --others --exclude-standard'),
    ])];
    return files.filter(f => CODE_EXT.test(f) && !TEST_FILE.test(f) && !TEST_DIR.test(f));
  } catch {
    return null; // git unavailable
  }
}

/** Fallback: extract file path from stdin tool_input. */
function getStdinCodeFile(input) {
  const toolName = input.tool_name || input.toolName || '';
  const toolInput = input.tool_input || input.toolInput || {};
  const filePath = toolInput.file_path || toolInput.filePath || toolInput.path || '';
  const codeChangeTools = ['Edit', 'Write', 'NotebookEdit'];
  if (codeChangeTools.includes(toolName) && CODE_EXT.test(filePath)) {
    if (!TEST_FILE.test(filePath) && !TEST_DIR.test(filePath)) return [filePath];
  }
  return [];
}

/** Check if a test file exists for the given source file. */
function hasTestFile(file) {
  const dir = dirname(file);
  const ext = extname(file);
  const base = basename(file, ext);
  const candidates = [
    join(dir, `${base}.test${ext}`),
    join(dir, `${base}.spec${ext}`),
    join(dir, '__tests__', `${base}.test${ext}`),
    join(dir, '__tests__', `${base}.spec${ext}`),
    join(dir, '__tests__', `${base}${ext}`),
    join(dirname(dir), 'test', `${base}.test${ext}`),
    join(dirname(dir), 'test', `${base}${ext}`),
    join(dirname(dir), 'tests', `${base}.test${ext}`),
    join(dirname(dir), 'tests', `${base}${ext}`),
    join(dir, `${base}_test${ext}`), // Go convention
  ];
  return candidates.some(c => existsSync(join(projectRoot, c)));
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.testEnforcement) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();

  // Primary: git-based detection.  Fallback: stdin tool_input.
  let codeFiles = getChangedCodeFiles();
  if (codeFiles === null || codeFiles.length === 0) {
    codeFiles = getStdinCodeFile(input);
  }

  if (codeFiles.length === 0) { console.log(hookSilent()); process.exit(0); }

  const lang = config.language || 'ko';
  const dict = getLang(lang);
  const minCases = config.testEnforcement?.minCases || 2;

  const missing = [];
  const verified = [];
  for (const f of codeFiles) {
    (hasTestFile(f) ? verified : missing).push(f);
  }

  const lines = [];

  if (missing.length > 0) {
    lines.push(dict.messages.antiRatHeader(missing.length));
    for (const f of missing) lines.push(dict.messages.antiRatMissing(f));
    lines.push(dict.messages.antiRatFooter(minCases));
  }

  if (verified.length > 0) {
    lines.push(dict.messages.antiRatVerified(verified.length));
  }

  if (lines.length > 0) {
    console.log(hookOutput('Stop', lines.join('\n')));
  }
} catch {
  console.log(hookSilent());
}
