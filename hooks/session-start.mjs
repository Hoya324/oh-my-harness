#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configDir = join(projectRoot, '.claude', '.omh');
const configPath = join(configDir, 'harness.config.json');
const cachePath = join(configDir, 'conventions.json');

function readStdin() {
  try { return JSON.parse(readFileSync('/dev/stdin', 'utf8')); }
  catch { return {}; }
}

function detectConventions(root) {
  const result = { language: null, testFramework: null, linter: null, formatter: null, buildTool: null };
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    result.language = 'node';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.vitest) result.testFramework = 'vitest';
      else if (deps.jest) result.testFramework = 'jest';
      else if (deps.mocha) result.testFramework = 'mocha';
      if (deps.biome || deps['@biomejs/biome']) { result.linter = 'biome'; result.formatter = 'biome'; }
      else { if (deps.eslint) result.linter = 'eslint'; if (deps.prettier) result.formatter = 'prettier'; }
      if (deps.typescript) result.buildTool = 'typescript';
    } catch {}
    return result;
  }
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'setup.py'))) {
    result.language = 'python';
    try {
      const c = readFileSync(join(root, 'pyproject.toml'), 'utf8');
      if (c.includes('pytest')) result.testFramework = 'pytest';
      if (c.includes('ruff')) { result.linter = 'ruff'; result.formatter = 'ruff'; }
      else { if (c.includes('flake8')) result.linter = 'flake8'; if (c.includes('black')) result.formatter = 'black'; }
    } catch {}
    return result;
  }
  if (existsSync(join(root, 'go.mod'))) {
    result.language = 'go'; result.testFramework = 'go test';
    if (existsSync(join(root, '.golangci.yml')) || existsSync(join(root, '.golangci.yaml'))) result.linter = 'golangci-lint';
    return result;
  }
  if (existsSync(join(root, 'Cargo.toml'))) {
    result.language = 'rust'; result.testFramework = 'cargo test'; result.linter = 'clippy'; result.formatter = 'rustfmt';
    return result;
  }
  if (existsSync(join(root, 'build.gradle')) || existsSync(join(root, 'build.gradle.kts'))) {
    result.language = 'java'; result.testFramework = 'junit'; result.buildTool = 'gradle'; return result;
  }
  if (existsSync(join(root, 'pom.xml'))) {
    result.language = 'java'; result.testFramework = 'junit'; result.buildTool = 'maven'; return result;
  }
  return result;
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
