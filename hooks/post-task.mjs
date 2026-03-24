#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';
import { getLang } from './lib/dictionary.mjs';

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
  if (!config.features?.testEnforcement) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const transcript = JSON.stringify(input);
  const codeChangeTools = ['Edit', 'Write', 'NotebookEdit'];
  const hasCodeChanges = codeChangeTools.some(tool =>
    transcript.includes(`"${tool}"`) || transcript.includes(`tool_name":"${tool}`)
  );
  const codeExtPattern = /\.(js|ts|jsx|tsx|py|go|rs|java|kt|rb|php|c|cpp|h|swift|vue|svelte)["'\s]/i;
  const hasCodeFiles = codeExtPattern.test(transcript);

  if (hasCodeChanges || hasCodeFiles) {
    const lang = config.language || 'ko';
    const dict = getLang(lang);
    const minCases = config.testEnforcement?.minCases || 2;
    const lines = dict.messages.testEnforcement(minCases);
    if (config.testEnforcement?.promptOnMissing) {
      lines.push(dict.messages.testEnforcementPrompt);
    }
    console.log(hookOutput('Stop', lines.join('\n')));
  }
} catch {
  console.log(hookSilent());
}
