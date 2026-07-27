import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { skillRoots } from './runtime.mjs';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKILL_NAMES = ['code-review', 'test-write', 'lint-fix'];

const DEFAULTS = {
  language: 'your language',
  testFramework: 'your test framework',
  linter: 'your linter',
  formatter: 'your formatter',
  buildTool: 'your build tool',
};

/**
 * Replace {{key}} placeholders in template content with convention values.
 * Falls back to sensible defaults when a value is null.
 * @param {string} templateContent - Raw template string
 * @param {Object} conventions - Convention values (language, testFramework, etc.)
 * @returns {string} Rendered content
 */
export function renderTemplate(templateContent, conventions) {
  return templateContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = conventions[key];
    if (value !== null && value !== undefined) return value;
    return DEFAULTS[key] ?? key;
  });
}

/**
 * Scaffold project skill files for the requested runtime destinations.
 * @param {string} projectRoot - Absolute path to the project root
 * @param {Object} conventions - Detected conventions (language, testFramework, linter, formatter, buildTool)
 * @param {{ force?: boolean, runtime?: 'claude'|'codex'|'both' }} [options={}]
 * @returns {{ created: string[], skipped: string[] }}
 */
export function scaffoldProjectSkills(projectRoot, conventions, options = {}) {
  const { force = false, runtime = 'claude' } = options;
  const created = [];
  const skipped = [];

  const language = conventions.language ?? null;

  // Resolve template directory: prefer language-specific, fall back to _shared
  const langTemplateDir = language
    ? join(PKG_ROOT, 'templates', 'skills', language)
    : null;
  const sharedTemplateDir = join(PKG_ROOT, 'templates', 'skills', '_shared');

  for (const skillRoot of skillRoots(projectRoot, runtime)) {
    const target = skillRoot === join(projectRoot, '.claude', 'skills') ? 'claude' : 'codex';

    for (const skillName of SKILL_NAMES) {
      const templateFile = `${skillName}.md`;
      const destDir = join(skillRoot, skillName);
      const destFile = join(destDir, 'SKILL.md');
      const reportName = runtime === 'both' ? `${target}:${skillName}` : skillName;

      // Skip if exists and not forcing
      if (existsSync(destFile) && !force) {
        skipped.push(reportName);
        continue;
      }

      // Find template: language-specific first, then shared
      let templatePath = null;
      if (langTemplateDir && existsSync(join(langTemplateDir, templateFile))) {
        templatePath = join(langTemplateDir, templateFile);
      } else if (existsSync(join(sharedTemplateDir, templateFile))) {
        templatePath = join(sharedTemplateDir, templateFile);
      }

      if (!templatePath) {
        // No template available for this skill — skip silently
        skipped.push(reportName);
        continue;
      }

      const raw = readFileSync(templatePath, 'utf8');
      const rendered = renderTemplate(raw, conventions);

      mkdirSync(destDir, { recursive: true });
      writeFileSync(destFile, rendered, 'utf8');
      created.push(reportName);
    }
  }

  return { created, skipped };
}
