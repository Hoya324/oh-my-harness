/**
 * Docs must describe the code that ships. Hand-maintained references drift;
 * these checks make the drift a CI failure instead of a reader's surprise.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const template = JSON.parse(read('templates/harness.config.json.tmpl'));
const skillCount = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, dir, e.name, 'SKILL.md'))).length;

describe('docs match the shipped config and skills', () => {
  for (const doc of ['docs/configuration.md', 'docs/configuration.ko.md']) {
    it(`${doc} documents every template feature flag`, () => {
      const text = read(doc);
      for (const key of Object.keys(template.features)) {
        assert.ok(text.includes(`\`features.${key}\``), `${doc} is missing features.${key}`);
      }
    });

    it(`${doc} default config block equals the template`, () => {
      const block = read(doc).match(/```json\n(\{\n  "version": 1,[\s\S]*?\n\})\n```/);
      assert.ok(block, 'default config block present');
      const features = JSON.parse(block[1].match(/"features": (\{[\s\S]*?\})/)[1]);
      assert.deepEqual(features, template.features);
    });
  }

  it('README and architecture docs state the real skill counts', () => {
    const claude = skillCount('claude/skills');
    const codex = skillCount('codex/skills');
    for (const doc of ['README.md', 'docs/architecture.md']) {
      assert.match(read(doc), new RegExp(`${claude} Claude`), `${doc}: ${claude} Claude skills`);
      assert.match(read(doc), new RegExp(`${codex} Codex`), `${doc}: ${codex} Codex skills`);
    }
    for (const doc of ['README.ko.md', 'docs/architecture.ko.md']) {
      assert.match(read(doc), new RegExp(`Claude[^\\n]*${claude}개`), `${doc}: Claude ${claude}개`);
      assert.match(read(doc), new RegExp(`Codex[^\\n]*${codex}개`), `${doc}: Codex ${codex}개`);
    }
    assert.match(read('docs/i18n.js'), new RegExp(`${claude} Claude Code skills and ${codex} Codex skills`));
  });

  it('every CLI command in --help is documented in both configuration docs', () => {
    for (const cmd of ['init', 'update', 'status', 'reset', 'why', 'handoff', 'docs-sync']) {
      for (const doc of ['docs/configuration.md', 'docs/configuration.ko.md']) {
        assert.ok(read(doc).includes(`oh-my-harness ${cmd}`), `${doc}: oh-my-harness ${cmd}`);
      }
    }
  });
});
