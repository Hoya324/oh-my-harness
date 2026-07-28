import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'fs';
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

test('CI installs locked runtime dependencies before running tests', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /- run: npm ci/);
  assert.ok(
    workflow.indexOf('- run: npm ci') < workflow.indexOf('- run: node --test test\/*.test\.mjs'),
    'CI must install dependencies before invoking the test suite',
  );
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

test('landing page alone gives an actionable localized install journey', () => {
  const html = read('docs/index.html');
  const i18n = read('docs/i18n.js');
  const keys = [
    'index.codex.marketplaceNote',
    'index.codex.desktopNote',
    'index.cta.codexSource',
    'index.cta.codexInstall',
    'index.cta.codexActivate',
  ];

  assert.ok(html.includes('href="#codex"'), 'hero Get Started must lead to actionable install section');
  for (const key of keys) {
    assert.ok(html.includes(`data-i18n="${key}"`), `landing missing ${key}`);
    const occurrences = i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}'\\s*:`, 'g')) || [];
    assert.equal(occurrences.length, 2, `${key} must be localized in English and Korean`);
  }
  for (const fact of ['/plugins', 'Personal', 'new session']) {
    assert.ok(html.includes(fact) || i18n.includes(fact), `landing install journey missing ${fact}`);
  }
  assert.ok(!html.includes('<span class="stat-num">9</span>'), 'landing stale hook count');
  assert.ok(!html.includes('claude plugin install oh-my-harness@oh-my-harness</code>\n          </div>\n        </div>\n        <div class="cta-step">'), 'final CTA must not be Claude-only');
});

test('rendered docs localizes dual-runtime additions and rejects stale runtime copy', () => {
  const html = read('docs/docs.html');
  const i18n = read('docs/i18n.js');
  const localizedVisibleKeys = [
    'docs.installation.codexCli',
    'docs.installation.codexDesktop',
    'docs.installation.trust',
    'docs.installation.memory',
    'docs.uninstall.preservation',
    'docs.requirements.node',
    'docs.requirements.runtime',
    'docs.requirements.tmux',
    'docs.requirements.git',
    'docs.installation.code.localProject',
    'docs.cliCommands.scopeNote',
    'docs.uninstall.code.codex',
    'docs.teamTemplates.runtimeNote',
  ];
  for (const key of localizedVisibleKeys) {
    assert.ok(html.includes(`data-i18n-html="${key}"`) || html.includes(`data-i18n="${key}"`), `docs page missing localized ${key}`);
    const occurrences = i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}'\\s*:`, 'g')) || [];
    assert.equal(occurrences.length, 2, `${key} must exist in en and ko`);
  }
  for (const stale of [
    '9 thin fail-open wrappers',
    '12 user-invoked slash-command workflows',
    "OMH hooks into Claude Code's lifecycle",
    'Spawn N parallel Claude agents in tmux',
    'Spawn parallel Claude Code instances in tmux panes',
    'Use Claude Code’s built-in team orchestration',
    'frontend (sonnet)',
    'reviewer (opus)',
    'researcher (haiku)',
  ]) {
    assert.ok(!html.includes(stale), `docs HTML stale: ${stale}`);
    assert.ok(!i18n.includes(stale), `i18n stale: ${stale}`);
  }
  assert.ok(
    html.includes('data-i18n-html="docs.multiAgent.intro"'),
    'multi-agent runtime markup must survive language switching',
  );
  assert.ok(html.includes('oh-my-harness init --runtime codex --scope user'));
});

test('memory commands point only to installed paths or MCP tools', () => {
  const files = [
    'README.md',
    'README.ko.md',
    'docs/features.md',
    'docs/features.ko.md',
    'docs/docs.html',
    'claude/skills/omh-spec/SKILL.md',
    'claude/skills/omh-loop/SKILL.md',
    'claude/skills/omh-verify/SKILL.md',
  ];
  for (const file of files) {
    const body = read(file);
    assert.ok(!body.includes('~/.omh/lib/memory.mjs'), `${file}: nonexistent global memory helper`);
    assert.ok(!body.includes('~/.omh/bin/seed-from-claude-memory.mjs'), `${file}: nonexistent seed helper`);
  }
  for (const file of ['README.md', 'README.ko.md']) {
    const body = read(file);
    assert.ok(body.includes('node .claude/.omh/runtime/lib/memory.mjs'), `${file}: project-scope command`);
    assert.ok(body.includes('node ~/.claude/.omh/runtime/lib/memory.mjs'), `${file}: user-scope command`);
    assert.ok(body.includes('MCP'), `${file}: plugin-safe MCP guidance`);
  }
  assert.match(read('docs/features.md'), /search <query>.*add-learning <project> <text\.\.\.>/s);
  assert.match(read('docs/features.ko.md'), /--runtime codex --scope user/);
  assert.ok(existsSync(join(root, 'lib/memory.mjs')), 'documented memory helper source exists');
  assert.ok(existsSync(join(root, 'bin/omh-memory.sh')), 'documented memory launcher source exists');
  assert.ok(!existsSync(join(root, 'bin/seed-from-claude-memory.mjs')), 'removed workflow really is unsupported');
});

test('root collaboration docs match selectable tmux and native runtime contracts', () => {
  for (const file of ['README.md', 'README.ko.md']) {
    const body = read(file);
    for (const fact of [
      'multiAgent.runtime',
      'claude --permission-mode bypassPermissions -p "Read TASK.md and complete its instructions."',
      'codex exec --sandbox workspace-write --cd "<worktree>" "Read TASK.md and complete its instructions."',
      'TeamCreate',
      'TaskCreate',
      'Agent',
      'spawn_agent',
      'list_agents',
      'send_message',
      'interrupt_agent',
    ]) {
      assert.ok(body.includes(fact), `${file}: collaboration contract missing ${fact}`);
    }
    assert.ok(!body.includes('Check prerequisites: tmux, claude, git'), `${file}: Claude-only tmux prerequisite`);
    assert.ok(!body.includes('Launch claude in each pane'), `${file}: Claude-only tmux launch`);
    assert.doesNotMatch(body, /all sonnet|모두 sonnet/);
  }
  for (const file of ['docs/features.md', 'docs/features.ko.md', 'docs/multi-agent.md', 'docs/multi-agent.ko.md']) {
    const body = read(file);
    assert.doesNotMatch(body, /frontend \(sonnet\)|reviewer \(opus\)|researcher \(haiku\)/);
    assert.match(body, /available-profile preferences|프로필 선호도/);
  }
});

test('rendered skills table is complete against both installed skill directories', () => {
  const html = read('docs/docs.html');
  const table = html.match(/<h2 id="skills"[\s\S]*?<\/table>/)?.[0] || '';
  const installed = (dir) => new Set(
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, dir, entry.name, 'SKILL.md')))
      .map((entry) => entry.name),
  );
  const claude = installed('claude/skills');
  const codex = installed('codex/skills');
  const documented = new Map(
    [...table.matchAll(/<tr data-skill="([^"]+)" data-runtimes="([^"]+)">/g)]
      .map((match) => [match[1], new Set(match[2].split(' '))]),
  );

  assert.deepEqual([...documented.keys()].sort(), [...new Set([...claude, ...codex])].sort());
  for (const skill of claude) assert.ok(documented.get(skill)?.has('claude'), `${skill}: Claude availability`);
  for (const skill of codex) assert.ok(documented.get(skill)?.has('codex'), `${skill}: Codex availability`);
  assert.deepEqual(documented.get('omh-status'), new Set(['codex']));
});

test('rendered agents table matches Claude definitions and Codex profile preferences', () => {
  const html = read('docs/docs.html');
  const table = html.match(/<h2 id="agents"[\s\S]*?<\/table>/)?.[0] || '';
  const claudeRoles = new Map(
    readdirSync(join(root, 'agents'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => {
        const body = read(`agents/${name}`);
        return [name.replace(/\.md$/, ''), body.match(/^model:\s*(\S+)/m)?.[1]];
      }),
  );
  const codexRoles = new Map(
    readdirSync(join(root, 'codex/agents'))
      .filter((name) => name.endsWith('.toml'))
      .map((name) => {
        const body = read(`codex/agents/${name}`);
        return [name.replace(/\.toml$/, ''), {
          model: body.match(/^model = "([^"]+)"/m)?.[1],
          effort: body.match(/^model_reasoning_effort = "([^"]+)"/m)?.[1],
        }];
      }),
  );
  const rows = new Map(
    [...table.matchAll(/<tr data-role="([^"]+)">([\s\S]*?)<\/tr>/g)]
      .map((match) => [match[1], match[2]]),
  );

  assert.deepEqual([...rows.keys()].sort(), [...claudeRoles.keys()].sort());
  assert.deepEqual([...rows.keys()].sort(), [...codexRoles.keys()].sort());
  for (const [role, model] of claudeRoles) {
    assert.match(rows.get(role), new RegExp(`harness:${role}`));
    assert.match(rows.get(role), new RegExp(model, 'i'));
  }
  for (const [role, profile] of codexRoles) {
    assert.match(rows.get(role), new RegExp(profile.model.replaceAll('.', '\\.')));
    assert.match(rows.get(role), new RegExp(profile.effort));
  }
});

test('marketplace delivery docs separate bundled surfaces from explicit Codex registration', () => {
  const packageJson = JSON.parse(read('package.json'));
  const claudePlugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  for (const [label, description] of [
    ['package', packageJson.description],
    ['Claude plugin', claudePlugin.description],
    ['marketplace', marketplace.description],
    ['marketplace entry', marketplace.plugins[0].description],
  ]) {
    assert.match(description, /Claude Code.*Codex|Codex.*Claude Code/i, `${label}: dual-runtime description`);
    assert.doesNotMatch(description, /zero[- ](?:config|setup)/i, `${label}: no overbroad zero-setup claim`);
  }
  assert.ok(packageJson.keywords.includes('codex'));

  for (const file of ['README.md', 'README.ko.md']) {
    const body = read(file);
    for (const fact of ['hooks', 'skills', 'MCP', '/harness-setup', 'oh-my-harness init --runtime codex', 'AGENTS.md', 'quick/standard/architect']) {
      assert.ok(body.includes(fact), `${file}: delivery contract missing ${fact}`);
    }
    assert.doesNotMatch(body, /Zero setup is required|별도 설정이 필요 없습니다/);
    assert.doesNotMatch(body, /harness-setup.*optional|harness-setup.*선택 사항/i);
  }

  const site = read('docs/index.html') + read('docs/docs.html');
  const i18n = read('docs/i18n.js');
  for (const key of ['index.codex.delivery', 'docs.installation.delivery']) {
    assert.ok(site.includes(`data-i18n-html="${key}"`) || site.includes(`data-i18n="${key}"`));
    assert.equal((i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}'\\s*:`, 'g')) || []).length, 2);
  }
});

test('hook architecture documents sequential orchestration and mixed failure policy', () => {
  for (const file of ['README.md', 'README.ko.md', 'docs/architecture.md', 'docs/architecture.ko.md', 'CHANGELOG.md']) {
    const body = read(file);
    for (const fact of ['one orchestrator', 'sequential', 'concurrent', 'fail closed', 'advisory']) {
      assert.ok(body.toLowerCase().includes(fact), `${file}: hook contract missing ${fact}`);
    }
    assert.doesNotMatch(body, /Thin \*\*fail-open\*\* wrappers|얇은 \*\*fail-open\*\* 래퍼/);
  }
  const html = read('docs/docs.html');
  const i18n = read('docs/i18n.js');
  for (const key of ['docs.hooks.orchestration', 'docs.hooks.failurePolicy']) {
    assert.ok(html.includes(`data-i18n="${key}"`) || html.includes(`data-i18n-html="${key}"`));
    assert.equal((i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}'\\s*:`, 'g')) || []).length, 2);
  }
});

test('guard docs distinguish Codex pre-tool scope enforcement from Claude post-tool reporting', () => {
  for (const file of [
    'README.md', 'README.ko.md',
    'docs/features.md', 'docs/features.ko.md',
    'docs/architecture.md', 'docs/architecture.ko.md',
  ]) {
    const body = read(file);
    assert.ok(body.includes('Codex PreToolUse'), `${file}: missing Codex scope event`);
    assert.ok(body.includes('Claude PostToolUse'), `${file}: missing Claude scope event`);
    assert.doesNotMatch(body, /Warning only.*does not block|경고만.*차단하지 않/s);
  }

  const html = read('docs/docs.html');
  const i18n = read('docs/i18n.js');
  assert.ok(html.includes('data-i18n-html="docs.hooks.scopeEvents"'));
  assert.equal((i18n.match(/'docs\.hooks\.scopeEvents'\s*:/g) || []).length, 2);
  for (const stale of ['Guide with warnings, never block', 'Warning only — does not block execution']) {
    assert.ok(!html.includes(stale), `docs HTML stale guard claim: ${stale}`);
    assert.ok(!i18n.includes(stale), `i18n stale guard claim: ${stale}`);
  }
});

test('plan-gate docs distinguish Codex update_plan from Claude ExitPlanMode', () => {
  for (const file of [
    'README.md', 'README.ko.md',
    'docs/features.md', 'docs/features.ko.md',
    'docs/configuration.md', 'docs/configuration.ko.md',
    'docs/architecture.md', 'docs/architecture.ko.md',
    'CHANGELOG.md',
  ]) {
    const body = read(file);
    for (const fact of ['apply_patch', 'update_plan', 'ExitPlanMode']) {
      assert.ok(body.includes(fact), `${file}: plan-gate runtime mapping missing ${fact}`);
    }
  }
  const html = read('docs/docs.html');
  const i18n = read('docs/i18n.js');
  assert.ok(html.includes('data-i18n-html="docs.planGate.runtimeMapping"'));
  assert.equal((i18n.match(/'docs\.planGate\.runtimeMapping'\s*:/g) || []).length, 2);
});

test('memory docs describe the pinned offline-first launcher and platform boundary', () => {
  const files = [
    'README.md', 'README.ko.md',
    'docs/features.md', 'docs/features.ko.md',
    'docs/architecture.md', 'docs/architecture.ko.md',
    'CHANGELOG.md',
  ];
  for (const file of files) {
    const body = read(file);
    for (const fact of [
      '@modelcontextprotocol/server-memory@2026.7.4',
      '--prefer-offline',
      'registry',
      'plugin root',
      'Bash',
      'commandWindows',
      'macOS',
    ]) {
      assert.ok(body.includes(fact), `${file}: memory/platform contract missing ${fact}`);
    }
  }
  const html = read('docs/docs.html');
  const i18n = read('docs/i18n.js');
  assert.ok(html.includes('data-i18n-html="docs.installation.memoryLaunch"'));
  assert.equal((i18n.match(/'docs\.installation\.memoryLaunch'\s*:/g) || []).length, 2);
});

test('lifecycle docs cover status fallback, explicit scopes, and atomic preflight failures', () => {
  for (const file of ['README.md', 'README.ko.md', 'docs/configuration.md', 'docs/configuration.ko.md', 'CHANGELOG.md']) {
    const body = read(file);
    for (const fact of ['omh-status', 'user-global fallback', '--scope project', '--scope user', 'malformed', 'before mutation']) {
      assert.ok(body.includes(fact), `${file}: lifecycle contract missing ${fact}`);
    }
    assert.match(body, /Claude.*(?:isolated|\uaca9\ub9ac)/s, `${file}: Claude scope isolation`);
  }
  const html = read('docs/docs.html');
  const i18n = read('docs/i18n.js');
  assert.ok(html.includes('data-i18n-html="docs.lifecycle.scopeSafety"'));
  assert.equal((i18n.match(/'docs\.lifecycle\.scopeSafety'\s*:/g) || []).length, 2);
});
