import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectConventions } from '../lib/detect.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '__tmp_detect');

beforeEach(() => { mkdirSync(TMP, { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

describe('detectConventions', () => {
  it('detects Node.js with vitest + eslint + prettier', () => {
    writeFileSync(join(TMP, 'package.json'), JSON.stringify({
      devDependencies: { vitest: '^1.0.0', eslint: '^8.0.0', prettier: '^3.0.0', typescript: '^5.0.0' },
    }));
    const result = detectConventions(TMP);
    assert.equal(result.language, 'node');
    assert.equal(result.testFramework, 'vitest');
    assert.equal(result.linter, 'eslint');
    assert.equal(result.formatter, 'prettier');
    assert.equal(result.buildTool, 'typescript');
  });

  it('detects Node.js with jest + biome', () => {
    writeFileSync(join(TMP, 'package.json'), JSON.stringify({
      devDependencies: { jest: '^29.0.0', '@biomejs/biome': '^1.0.0' },
    }));
    const result = detectConventions(TMP);
    assert.equal(result.language, 'node');
    assert.equal(result.testFramework, 'jest');
    assert.equal(result.linter, 'biome');
    assert.equal(result.formatter, 'biome');
  });

  it('detects Python with pytest + ruff', () => {
    writeFileSync(join(TMP, 'pyproject.toml'), `
[tool.pytest.ini_options]
testpaths = ["tests"]
[tool.ruff]
line-length = 100
`);
    const result = detectConventions(TMP);
    assert.equal(result.language, 'python');
    assert.equal(result.testFramework, 'pytest');
    assert.equal(result.linter, 'ruff');
    assert.equal(result.formatter, 'ruff');
  });

  it('detects Go project', () => {
    writeFileSync(join(TMP, 'go.mod'), 'module example.com/foo\ngo 1.21\n');
    writeFileSync(join(TMP, '.golangci.yml'), 'linters:\n  enable:\n    - govet\n');
    const result = detectConventions(TMP);
    assert.equal(result.language, 'go');
    assert.equal(result.testFramework, 'go test');
    assert.equal(result.linter, 'golangci-lint');
  });

  it('detects Rust project', () => {
    writeFileSync(join(TMP, 'Cargo.toml'), '[package]\nname = "foo"\n');
    const result = detectConventions(TMP);
    assert.equal(result.language, 'rust');
    assert.equal(result.testFramework, 'cargo test');
    assert.equal(result.linter, 'clippy');
    assert.equal(result.formatter, 'rustfmt');
  });

  it('detects Kotlin project via build.gradle.kts', () => {
    writeFileSync(join(TMP, 'build.gradle.kts'), 'plugins { kotlin("jvm") version "1.9.0" }\n');
    const result = detectConventions(TMP);
    assert.equal(result.language, 'kotlin');
    assert.equal(result.testFramework, 'junit5');
    assert.equal(result.buildTool, 'gradle');
  });

  it('detects Kotlin project with kotest and ktlint via build.gradle.kts', () => {
    writeFileSync(join(TMP, 'build.gradle.kts'), `
plugins { kotlin("jvm") version "1.9.0" }
dependencies {
  testImplementation("io.kotest:kotest-runner-junit5:5.7.0")
}
plugins { id("org.jlleitschuh.gradle.ktlint") version "11.6.0" }
`);
    const result = detectConventions(TMP);
    assert.equal(result.language, 'kotlin');
    assert.equal(result.testFramework, 'kotest');
    assert.equal(result.linter, 'ktlint');
    assert.equal(result.buildTool, 'gradle');
  });

  it('detects Kotlin project via build.gradle with kotlin plugin', () => {
    writeFileSync(join(TMP, 'build.gradle'), 'apply plugin: "kotlin"\n');
    const result = detectConventions(TMP);
    assert.equal(result.language, 'kotlin');
    assert.equal(result.buildTool, 'gradle');
  });

  it('detects Java Gradle project (plain build.gradle without kotlin)', () => {
    writeFileSync(join(TMP, 'build.gradle'), 'plugins { id "java" }\n');
    const result = detectConventions(TMP);
    assert.equal(result.language, 'java');
    assert.equal(result.testFramework, 'junit');
    assert.equal(result.buildTool, 'gradle');
  });

  it('detects Java Maven project', () => {
    writeFileSync(join(TMP, 'pom.xml'), '<project></project>');
    const result = detectConventions(TMP);
    assert.equal(result.language, 'java');
    assert.equal(result.testFramework, 'junit');
    assert.equal(result.buildTool, 'maven');
  });

  it('returns nulls for unknown project', () => {
    const result = detectConventions(TMP);
    assert.equal(result.language, null);
    assert.equal(result.testFramework, null);
  });
});
