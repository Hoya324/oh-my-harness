import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scaffoldProjectSkills, renderTemplate } from '../lib/scaffold-skills.mjs';

const TMP = join(import.meta.dirname, '.tmp-scaffold');

describe('scaffold-skills', () => {
  beforeEach(() => { mkdirSync(TMP, { recursive: true }); });
  afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

  describe('scaffoldProjectSkills', () => {
    it('should scaffold 3 skills for Node project', () => {
      const conventions = { language: 'node', testFramework: 'vitest', linter: 'eslint', formatter: 'prettier', buildTool: 'vite' };
      const result = scaffoldProjectSkills(TMP, conventions);
      assert.equal(result.created.length, 3);
      assert.ok(existsSync(join(TMP, '.claude', 'skills', 'code-review', 'SKILL.md')));
      assert.ok(existsSync(join(TMP, '.claude', 'skills', 'test-write', 'SKILL.md')));
      assert.ok(existsSync(join(TMP, '.claude', 'skills', 'lint-fix', 'SKILL.md')));
    });

    it('should scaffold for Python project', () => {
      const conventions = { language: 'python', testFramework: 'pytest', linter: 'ruff', formatter: 'black', buildTool: null };
      const result = scaffoldProjectSkills(TMP, conventions);
      assert.equal(result.created.length, 3);
      const content = readFileSync(join(TMP, '.claude', 'skills', 'test-write', 'SKILL.md'), 'utf8');
      assert.ok(content.includes('pytest'));
    });

    it('should scaffold for Go project', () => {
      const conventions = { language: 'go', testFramework: 'go test', linter: 'golangci-lint', formatter: null, buildTool: null };
      const result = scaffoldProjectSkills(TMP, conventions);
      assert.equal(result.created.length, 3);
    });

    it('should scaffold for Rust project', () => {
      const conventions = { language: 'rust', testFramework: 'cargo test', linter: 'clippy', formatter: 'rustfmt', buildTool: null };
      const result = scaffoldProjectSkills(TMP, conventions);
      assert.equal(result.created.length, 3);
    });

    it('should scaffold for Java project', () => {
      const conventions = { language: 'java', testFramework: 'junit', linter: null, formatter: null, buildTool: 'gradle' };
      const result = scaffoldProjectSkills(TMP, conventions);
      assert.equal(result.created.length, 3);
    });

    it('should scaffold for Kotlin project', () => {
      const conventions = { language: 'kotlin', testFramework: 'junit5', linter: 'ktlint', formatter: null, buildTool: 'gradle' };
      const result = scaffoldProjectSkills(TMP, conventions);
      assert.equal(result.created.length, 3);
      const content = readFileSync(join(TMP, '.claude', 'skills', 'code-review', 'SKILL.md'), 'utf8');
      assert.ok(content.includes('kotlin') || content.includes('Kotlin'));
    });

    it('should use _shared templates for unknown language', () => {
      const conventions = { language: null, testFramework: null, linter: null, formatter: null, buildTool: null };
      const result = scaffoldProjectSkills(TMP, conventions);
      assert.equal(result.created.length, 3);
    });

    it('should not overwrite existing skill files', () => {
      // Create existing skill
      const skillDir = join(TMP, '.claude', 'skills', 'code-review');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), 'custom content');

      const conventions = { language: 'node', testFramework: 'vitest', linter: 'eslint', formatter: null, buildTool: null };
      const result = scaffoldProjectSkills(TMP, conventions);

      assert.equal(result.skipped.length, 1);
      assert.ok(result.skipped.includes('code-review'));
      assert.equal(result.created.length, 2);
      // Verify custom content preserved
      assert.equal(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'), 'custom content');
    });

    it('should overwrite with force option', () => {
      const skillDir = join(TMP, '.claude', 'skills', 'code-review');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), 'old content');

      const conventions = { language: 'node', testFramework: 'vitest', linter: 'eslint', formatter: null, buildTool: null };
      const result = scaffoldProjectSkills(TMP, conventions, { force: true });

      assert.equal(result.created.length, 3);
      assert.equal(result.skipped.length, 0);
      assert.notEqual(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'), 'old content');
    });
  });

  describe('renderTemplate', () => {
    it('should replace all placeholders', () => {
      const template = 'Using {{testFramework}} with {{linter}} in {{language}}';
      const conventions = { language: 'node', testFramework: 'vitest', linter: 'eslint' };
      const result = renderTemplate(template, conventions);
      assert.equal(result, 'Using vitest with eslint in node');
    });

    it('should use defaults for null values', () => {
      const template = 'Using {{testFramework}} and {{formatter}}';
      const conventions = { testFramework: null, formatter: null };
      const result = renderTemplate(template, conventions);
      assert.ok(!result.includes('{{'));
      assert.ok(!result.includes('null'));
    });
  });
});
