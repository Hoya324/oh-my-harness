#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';
import { detectConventions } from './lib/detect.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configDir = join(projectRoot, '.claude', '.omh');
const configPath = join(configDir, 'harness.config.json');
const cachePath = join(configDir, 'conventions.json');

function readStdin() {
  try { return JSON.parse(readFileSync('/dev/stdin', 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  readStdin();
  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.conventionSetup) { console.log(hookSilent()); process.exit(0); }

  // Use cache if fresh (< 1 hour)
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (cached._timestamp && Date.now() - cached._timestamp < 3600000 && cached.language) {
        const parts = [`[oh-my-harness] Project: ${cached.language}`];
        if (cached.testFramework) parts.push(`test: ${cached.testFramework}`);
        if (cached.linter) parts.push(`lint: ${cached.linter}`);
        if (cached.formatter) parts.push(`fmt: ${cached.formatter}`);
        if (cached.buildTool) parts.push(`build: ${cached.buildTool}`);
        console.log(hookOutput('SessionStart', parts.join(' | ')));
        process.exit(0);
      }
    } catch {}
  }

  const conventions = detectConventions(projectRoot);
  conventions._timestamp = Date.now();
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(conventions, null, 2));

  if (conventions.language) {
    const parts = [`[oh-my-harness] Project: ${conventions.language}`];
    if (conventions.testFramework) parts.push(`test: ${conventions.testFramework}`);
    if (conventions.linter) parts.push(`lint: ${conventions.linter}`);
    if (conventions.formatter) parts.push(`fmt: ${conventions.formatter}`);
    if (conventions.buildTool) parts.push(`build: ${conventions.buildTool}`);
    console.log(hookOutput('SessionStart', parts.join(' | ')));
  }
} catch {
  console.log(hookSilent());
}
