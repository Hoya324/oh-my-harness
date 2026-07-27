import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

test('Codex plugin package declares its installable runtime surfaces', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');
  const mcp = readJson('.mcp.json');

  assert.equal(manifest.name, 'oh-my-harness');
  assert.equal(manifest.version, '0.5.0');
  assert.equal(manifest.skills, './codex/skills/');
  assert.equal(manifest.hooks, './hooks/codex/hooks.json');
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.equal(marketplace.plugins[0].source, './');
  assert.equal(marketplace.plugins[0].name, 'oh-my-harness');
  assert.equal(marketplace.version, '0.5.0');
  assert.equal(marketplace.plugins[0].version, '0.5.0');
  assert.equal(mcp.mcpServers['omh-memory'].args[0].includes('${CLAUDE_PLUGIN_ROOT}'), true);

  for (const path of [manifest.skills, manifest.hooks, manifest.mcpServers]) {
    assert.equal(existsSync(join(root, path)), true, `manifest path exists: ${path}`);
  }
});

test('every bundled Codex skill has valid required frontmatter', () => {
  const skillsDir = join(root, 'codex/skills');
  const skillDirectories = readdirSync(skillsDir)
    .map((entry) => join(skillsDir, entry))
    .filter((path) => statSync(path).isDirectory());

  assert.ok(skillDirectories.length > 0, 'at least one Codex skill is bundled');
  for (const directory of skillDirectories) {
    const skill = readFileSync(join(directory, 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\nname: [^\n]+\ndescription: [^\n]+\n---\n/m, `${directory} frontmatter`);
  }
});

test('omh-status reads shared state without mutating it and emits the exact status contract', () => {
  const skill = readFileSync(join(root, 'codex/skills/omh-status/SKILL.md'), 'utf8');

  for (const path of [
    '.claude/.omh/harness.config.json',
    '.claude/.omh/loop-state.json',
    '.claude/.omh/usage.json',
  ]) assert.match(skill, new RegExp(path.replace(/[.]/g, '\\.')));

  for (const line of [
    'OMH status',
    '- Runtime: Codex',
    '- Tier: <tier or inactive>',
    '- Loop: <inactive|iteration N, tier T, stop cause>',
    '- Verify: <pending|pass|fail|unknown>',
    '- Usage: <total calls and session count>',
    '- Memory: <connected|unavailable>',
  ]) assert.ok(skill.includes(line), `status contract contains ${line}`);

  assert.match(skill, /missing files/i);
  assert.match(skill, /must not modify state/i);
});
