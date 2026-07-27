import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

const docPairs = [
  ['docs/features.md', 'docs/features.ko.md'],
  ['docs/architecture.md', 'docs/architecture.ko.md'],
  ['docs/configuration.md', 'docs/configuration.ko.md'],
  ['docs/loop.md', 'docs/loop.ko.md'],
  ['docs/verify.md', 'docs/verify.ko.md'],
  ['docs/multi-agent.md', 'docs/multi-agent.ko.md'],
];

const exactOnboarding = [
  'claude plugin marketplace add Hoya324/oh-my-harness',
  'claude plugin install oh-my-harness@oh-my-harness',
  'codex plugin marketplace add Hoya324/oh-my-harness',
  'oh-my-harness init --runtime codex',
  'oh-my-harness init --runtime both',
];

test('both root READMEs document Codex onboarding and trust', () => {
  for (const file of ['README.md', 'README.ko.md']) {
    const body = read(file);
    for (const command of exactOnboarding) {
      assert.ok(body.includes(command), `${file}: missing ${command}`);
    }
    for (const fact of ['--runtime codex', '--runtime both', '.codex-plugin', '/hooks', 'omh-status']) {
      assert.ok(body.includes(fact), `${file}: missing ${fact}`);
    }
    assert.ok(body.includes('npm link'), `${file}: missing local CLI prerequisite`);
    assert.ok(body.includes('~/.omh/memory/graph.jsonl'), `${file}: missing reset-safe memory path`);
    assert.ok(!body.includes('codex plugin install '), `${file}: unsupported Codex install command`);
  }
});

test('every detailed English/Korean pair has a Codex section and its required facts', () => {
  const requiredByPair = new Map([
    ['docs/features.md', ['Codex', 'omh-status', 'HUD']],
    ['docs/architecture.md', ['Codex', '.codex-plugin', '.claude/.omh/']],
    ['docs/configuration.md', ['Codex', '--runtime codex', 'gpt-5.6-luna']],
    ['docs/loop.md', ['Codex', 'decision', 'block']],
    ['docs/verify.md', ['Codex', 'independent', 'read-only']],
    ['docs/multi-agent.md', ['Codex', 'spawn_agent', 'codex exec --sandbox workspace-write']],
  ]);

  for (const [english, korean] of docPairs) {
    for (const file of [english, korean]) {
      const body = read(file);
      assert.match(body, /^## Codex\b/m, `${file}: missing a level-two Codex section`);
      for (const fact of requiredByPair.get(english)) {
        assert.ok(body.includes(fact), `${file}: missing ${fact}`);
      }
    }
  }
});

test('the documentation site exposes localized Codex install, parity, trust, and HUD copy', () => {
  const html = read('docs/index.html');
  const i18n = read('docs/i18n.js');
  const keys = [
    'index.codex.badge',
    'index.codex.title',
    'index.codex.desc',
    'index.codex.installClaude',
    'index.codex.installCodex',
    'index.codex.installLocal',
    'index.codex.marketplaceNote',
    'index.codex.localPrereq',
    'index.codex.parity.title',
    'index.codex.trust',
    'index.codex.hud',
  ];

  for (const key of keys) {
    assert.ok(html.includes(`data-i18n="${key}"`), `docs/index.html: missing ${key}`);
    const occurrences = i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}'\\s*:`, 'g')) || [];
    assert.equal(occurrences.length, 2, `docs/i18n.js: ${key} must exist in en and ko`);
  }
  assert.ok(html.includes('codex plugin marketplace add Hoya324/oh-my-harness'));
  assert.ok(html.includes('oh-my-harness init --runtime both'));
  assert.ok(html.includes('/hooks'));
  assert.ok(html.includes('npm link'));
  assert.ok(!html.includes('codex plugin install '));
});

test('the rendered docs page is a current dual-runtime 0.5.0 guide', () => {
  const html = read('docs/docs.html');
  const i18n = read('docs/i18n.js');

  for (const fact of [
    'v0.5.0',
    'Codex CLI',
    'Codex desktop',
    '/plugins',
    'oh-my-harness init --runtime codex',
    'oh-my-harness init --runtime both',
    'oh-my-harness reset --runtime codex',
    'oh-my-harness reset --runtime both',
    'omh-status',
    'https://developers.openai.com/codex/plugins',
  ]) {
    assert.ok(html.includes(fact), `docs/docs.html: missing ${fact}`);
  }

  for (const stale of ['v0.4.5', '12 built-in slash commands', 'Lightweight Claude Code harness']) {
    assert.ok(!html.includes(stale), `docs/docs.html: stale copy ${stale}`);
    assert.ok(!i18n.includes(stale), `docs/i18n.js: stale copy ${stale}`);
  }
  assert.ok(!html.includes('codex plugin install '), 'unsupported Codex install command');
});

test('install, memory, update, and removal claims match the supported runtime contracts', () => {
  const installDocs = ['README.md', 'README.ko.md'];
  for (const file of installDocs) {
    const body = read(file);
    assert.ok(body.includes('https://developers.openai.com/codex/plugins'), `${file}: official Codex plugin guide`);
    assert.ok(body.includes('/plugins'), `${file}: CLI marketplace flow`);
    assert.ok(body.includes('new session') || body.includes('새 세션'), `${file}: new-session activation`);
    assert.ok(body.includes('Plugins'), `${file}: desktop Plugins flow`);
    assert.ok(body.includes('.claude/.omh/runtime/bin/omh-memory.sh'), `${file}: managed Codex memory launcher`);
    assert.ok(body.includes('[mcp_servers.omh-memory]'), `${file}: managed Codex MCP registration`);
    assert.ok(body.includes('.mcp.json'), `${file}: Claude plugin MCP registration`);
  }

  for (const file of ['docs/configuration.md', 'docs/configuration.ko.md']) {
    const body = read(file);
    for (const command of [
      'oh-my-harness reset --runtime claude',
      'oh-my-harness reset --runtime codex',
      'oh-my-harness reset --runtime both',
    ]) {
      assert.ok(body.includes(command), `${file}: missing ${command}`);
    }
  }
});

test('English and Korean guides preserve meaningful structural and fact parity', () => {
  for (const file of ['README.md', 'README.ko.md']) {
    const body = read(file);
    for (const fact of ['Tier 1', 'Tier 2', 'Tier 3', '/omh-verify', 'STATE.md']) {
      assert.ok(body.includes(fact), `${file}: Weight-Aware section missing ${fact}`);
    }
  }

  for (const file of ['docs/loop.md', 'docs/loop.ko.md']) {
    const body = read(file);
    const ordered = ['/omh-spec', '/omh-loop SPEC.md', '/omh-loop stop', 'quickCheck', 'PASS | FAIL | INCONCLUSIVE', 'maxTotalIterations', 'SPEC.md', 'PROGRESS.md'];
    let cursor = -1;
    for (const fact of ordered) {
      const next = body.indexOf(fact, cursor + 1);
      assert.ok(next > cursor, `${file}: missing or out-of-order ${fact}`);
      cursor = next;
    }
  }

  for (const file of ['docs/features.md', 'docs/features.ko.md']) {
    const body = read(file);
    for (const fact of [
      '.claude/skills/',
      '.agents/skills/',
      '--runtime both',
      'code-review',
      'test-write',
      'lint-fix',
      'Node.js',
      'Python',
      'Go',
      'Rust',
      'Java',
      'Kotlin',
      '[omh:skill-hint]',
      'features.skillScaffolding',
    ]) {
      assert.ok(body.includes(fact), `${file}: skill scaffolding missing ${fact}`);
    }
  }
});

test('architecture describes shared scripts and Codex bridge without one-hook contradiction', () => {
  for (const file of ['docs/architecture.md', 'docs/architecture.ko.md']) {
    const body = read(file);
    assert.ok(body.includes('adapter.mjs'), `${file}: missing adapter bridge`);
    assert.ok(body.includes('run.mjs'), `${file}: missing bridge runner`);
    assert.ok(!body.includes('exactly one hook'), `${file}: stale one-hook claim`);
  }
});
