import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const expectedCodexSkills = [
  'agent-apply', 'agent-spawn', 'agent-status', 'agent-stop',
  'harness-setup', 'init-project', 'omh-loop', 'omh-spec',
  'omh-status', 'omh-verify', 'set-harness',
  'team-spawn', 'team-status', 'team-stop',
];

test('Codex plugin package declares its installable runtime surfaces', () => {
  const packageManifest = readJson('package.json');
  const claudeManifest = readJson('.claude-plugin/plugin.json');
  const manifest = readJson('.codex-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');
  const mcp = readJson('.mcp.json');

  assert.equal(manifest.name, 'oh-my-harness');
  assert.deepEqual(
    [
      packageManifest.version,
      claudeManifest.version,
      marketplace.version,
      marketplace.plugins[0].version,
      manifest.version,
    ],
    ['0.5.0', '0.5.0', '0.5.0', '0.5.0', '0.5.0'],
    'all package and plugin version surfaces are aligned',
  );
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

  assert.deepEqual(
    skillDirectories.map((directory) => directory.split('/').at(-1)).sort(),
    expectedCodexSkills,
    'the complete Codex-native skill set is bundled',
  );

  for (const directory of skillDirectories) {
    const skill = readFileSync(join(directory, 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\nname: [^\n]+\ndescription: [^\n]+\n---\n/m, `${directory} frontmatter`);
    for (const forbidden of ['TeamCreate', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion']) {
      assert.ok(!skill.includes(forbidden), `${directory}: ${forbidden}`);
    }
  }
});

test('Codex runtime mapping documents real operations and shared state', () => {
  const mapping = readFileSync(join(root, 'codex/references/runtime-map.md'), 'utf8');

  for (const term of [
    'directly in chat',
    'spawn_agent',
    'list_agents',
    'send_message',
    'interrupt_agent',
    '.claude/.omh/teams.json',
    '.agents/skills',
    'AGENTS.md',
    'codex exec -s read-only',
  ]) assert.ok(mapping.includes(term), `runtime mapping contains ${term}`);
  assert.match(
    mapping,
    /destructive verifier fixes/i,
    'runtime mapping gates destructive fixes without disabling configured autoFix',
  );
});

test('Codex multi-agent skills preserve confirmation, isolation, and state gates', () => {
  const readSkill = (name) => readFileSync(join(root, `codex/skills/${name}/SKILL.md`), 'utf8');
  const agentSpawn = readSkill('agent-spawn');
  const agentApply = readSkill('agent-apply');
  const agentStop = readSkill('agent-stop');
  const teamSpawn = readSkill('team-spawn');
  const teamStatus = readSkill('team-status');
  const teamStop = readSkill('team-stop');

  for (const term of [
    'multiAgent.runtime',
    '`claude`',
    '`codex`',
    '^[a-zA-Z0-9_-]+$',
    'TASK.md',
    'codex exec --sandbox workspace-write --cd "<worktree>" "Read TASK.md and complete its instructions."',
    '.claude/.omh/agents.json',
  ]) assert.ok(agentSpawn.includes(term), `agent-spawn contains ${term}`);
  assert.match(agentSpawn, /explicit confirmation/i);
  assert.match(
    agentSpawn,
    /more than one agent.*useWorktree: false.*reject/is,
    'shared checkout launches reject multiple agents to prevent TASK.md races',
  );
  assert.match(
    agentSpawn,
    /initialize.*agents\.json.*before.*launch/is,
    'agent state exists before external resources can become live',
  );
  assert.match(
    agentSpawn,
    /after each successful.*atomically persist/is,
    'partial launches remain recoverable',
  );
  assert.match(agentApply, /explicit confirmation/i);
  assert.match(agentApply, /never auto-merge/i);
  assert.match(agentStop, /explicit confirmation/i);
  assert.match(agentStop, /unmerged/i);

  for (const [body, operation] of [
    [teamSpawn, 'spawn_agent'],
    [teamStatus, 'list_agents'],
    [teamStop, 'interrupt_agent'],
  ]) assert.ok(body.includes(operation), `native team skill contains ${operation}`);
  assert.ok(teamSpawn.includes('.claude/.omh/teams.json'));
  assert.ok(teamStatus.includes('.claude/.omh/teams.json'));
  assert.ok(teamStop.includes('.claude/.omh/teams.json'));
  assert.match(teamSpawn, /explicit confirmation/i);
  assert.match(teamStop, /explicit confirmation/i);
  assert.match(teamStop, /incomplete/i);
});

test('Codex loop and verification skills preserve objective safety contracts', () => {
  const readSkill = (name) => readFileSync(join(root, `codex/skills/${name}/SKILL.md`), 'utf8');
  const spec = readSkill('omh-spec');
  const loop = readSkill('omh-loop');
  const verify = readSkill('omh-verify');

  for (const heading of [
    '## Goal',
    '## Acceptance criteria (EARS)',
    '## Out of scope',
    '## Constraints',
    '## Verify',
    '## Open questions',
  ]) assert.ok(spec.includes(heading), `omh-spec contains ${heading}`);
  assert.ok(spec.includes('[NEEDS CLARIFICATION]'));

  for (const term of [
    '.claude/.omh/loop-state.json',
    'PROGRESS.md',
    'quickCheckCommand',
    'verifyCommand',
    'maxIterations',
    'maxWallClockMinutes',
    'maxDeepVerifiesPerTask',
    'explicit confirmation',
    '--tier',
    'loop.logFile',
    'loop.learningsFile',
  ]) assert.ok(loop.includes(term), `omh-loop contains ${term}`);

  for (const term of [
    'verify.rounds',
    'verify.stopWhenClean',
    'verify.autoFix',
    'verify.lenses',
    'read-only',
    'independent',
    'reduced coverage',
    '.claude/.omh/STATE.md',
  ]) assert.ok(verify.includes(term), `omh-verify contains ${term}`);
  assert.match(verify, /same model|same runtime/i);
  assert.match(verify, /explicit confirmation/i);
  assert.match(
    verify,
    /verify\.autoFix.*ordinary in-scope, reversible fixes/is,
    'autoFix preserves automatic ordinary fixes while destructive changes remain gated',
  );
});

test('harness setup resolves the bundled defaults from the installed skill location', () => {
  const setup = readFileSync(join(root, 'codex/skills/harness-setup/SKILL.md'), 'utf8');
  assert.ok(
    setup.includes('../../../templates/harness.config.json.tmpl'),
    'harness-setup uses a skill-relative path to the repository template',
  );
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
  assert.match(skill, /sum only finite, non-negative numeric `sessions\[\*\]\.total_calls`/i);
  assert.match(skill, /malformed or missing entries count as zero/i);
  assert.match(skill, /session count is the number of object-valued session records/i);
});
