import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function detectConventions(projectRoot) {
  const result = { language: null, testFramework: null, linter: null, formatter: null, buildTool: null };

  // Node.js
  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    result.language = 'node';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      // Test framework
      if (allDeps.vitest) result.testFramework = 'vitest';
      else if (allDeps.jest) result.testFramework = 'jest';
      else if (allDeps.mocha) result.testFramework = 'mocha';
      // Linter
      if (allDeps.biome || allDeps['@biomejs/biome']) result.linter = 'biome';
      else if (allDeps.eslint) result.linter = 'eslint';
      // Formatter
      if (allDeps.prettier) result.formatter = 'prettier';
      else if (allDeps.biome || allDeps['@biomejs/biome']) result.formatter = 'biome';
      // Build
      if (allDeps.typescript) result.buildTool = 'typescript';
      if (allDeps.vite) result.buildTool = 'vite';
      else if (allDeps.webpack) result.buildTool = 'webpack';
      else if (allDeps.esbuild) result.buildTool = 'esbuild';
    } catch { /* ignore parse errors */ }
    return result;
  }

  // Python
  const pyprojectPath = join(projectRoot, 'pyproject.toml');
  const setupPath = join(projectRoot, 'setup.py');
  if (existsSync(pyprojectPath) || existsSync(setupPath)) {
    result.language = 'python';
    if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, 'utf8');
        if (content.includes('pytest')) result.testFramework = 'pytest';
        if (content.includes('ruff')) result.linter = 'ruff';
        else if (content.includes('flake8')) result.linter = 'flake8';
        if (content.includes('black')) result.formatter = 'black';
        else if (content.includes('ruff')) result.formatter = 'ruff';
        if (content.includes('mypy')) result.buildTool = 'mypy';
      } catch { /* ignore */ }
    }
    return result;
  }

  // Go
  if (existsSync(join(projectRoot, 'go.mod'))) {
    result.language = 'go';
    result.testFramework = 'go test';
    if (existsSync(join(projectRoot, '.golangci.yml')) || existsSync(join(projectRoot, '.golangci.yaml'))) {
      result.linter = 'golangci-lint';
    }
    return result;
  }

  // Rust
  if (existsSync(join(projectRoot, 'Cargo.toml'))) {
    result.language = 'rust';
    result.testFramework = 'cargo test';
    result.linter = 'clippy';
    result.formatter = 'rustfmt';
    return result;
  }

  // Java - Gradle
  if (existsSync(join(projectRoot, 'build.gradle')) || existsSync(join(projectRoot, 'build.gradle.kts'))) {
    result.language = 'java';
    result.testFramework = 'junit';
    result.buildTool = 'gradle';
    return result;
  }

  // Java - Maven
  if (existsSync(join(projectRoot, 'pom.xml'))) {
    result.language = 'java';
    result.testFramework = 'junit';
    result.buildTool = 'maven';
    return result;
  }

  return result;
}
