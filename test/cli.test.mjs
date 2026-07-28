import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
} from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '__tmp_cli');
const TEST_HOME = join(TMP, 'home');
const CLI = join(__dirname, '..', 'bin', 'cli.mjs');

function cliEnv() {
  return {
    ...process.env,
    HOME: TEST_HOME,
    USERPROFILE: TEST_HOME,
    NODE_TEST_CONTEXT: '',
    OMH_SKIP_GLOBAL: '',
  };
}

function runCliIn(cwd, ...args) {
  return execFileSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10000,
    env: cliEnv(),
  });
}

function runCli(...args) {
  return runCliIn(TMP, ...args);
}

function runCliResult(args, cwd = TMP) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10000,
    env: cliEnv(),
  });
}

function fileState(path) {
  return existsSync(path)
    ? { exists: true, content: readFileSync(path, 'utf8') }
    : { exists: false };
}

function runInstalledClaudeDangerousHook(project) {
  const settings = JSON.parse(
    readFileSync(join(TEST_HOME, '.claude', 'settings.json'), 'utf8'),
  );
  const command = settings.hooks.PreToolUse[0].hooks[0].command;
  return spawnSync('sh', ['-c', command], {
    cwd: project,
    input: JSON.stringify({
      session_id: 'user-scope-hook-test',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf build' },
    }),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...cliEnv(), PROJECT_PATH: project },
  });
}

function assertInstalledDangerousHookDenies(installRoot, cwd = TMP) {
  const installedHooks = JSON.parse(
    readFileSync(join(installRoot, '.codex', 'hooks.json'), 'utf8'),
  );
  const dangerousHandler = installedHooks.hooks.PreToolUse
    .flatMap(group => group.hooks)
    .find(handler =>
      handler.command.includes('dangerous-guard.mjs')
      || handler.statusMessage?.includes('checking safety'));
  assert.ok(dangerousHandler, 'dangerous guard hook should be installed');

  const hookRun = spawnSync('sh', ['-c', dangerousHandler.command], {
    cwd,
    input: JSON.stringify({
      session_id: 'reverse-lifecycle-test',
      turn_id: 'turn-1',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf build' },
    }),
    encoding: 'utf8',
    timeout: 10000,
    env: cliEnv(),
  });
  assert.equal(hookRun.status, 0, hookRun.stderr);
  const response = JSON.parse(hookRun.stdout);
  assert.equal(response.hookSpecificOutput.permissionDecision, 'deny');
}

function assertCodexMemoryInstalled(installRoot, stateRoot = installRoot) {
  const launcher = join(
    stateRoot,
    '.claude',
    '.omh',
    'runtime',
    'bin',
    'omh-memory.sh',
  );
  const memoryLib = join(
    stateRoot,
    '.claude',
    '.omh',
    'runtime',
    'lib',
    'memory.mjs',
  );
  assert.ok(existsSync(launcher), 'memory launcher should exist');
  assert.ok(statSync(launcher).mode & 0o111, 'memory launcher should be executable');
  assert.equal(
    readFileSync(launcher, 'utf8'),
    readFileSync(join(__dirname, '..', 'bin', 'omh-memory.sh'), 'utf8'),
  );
  assert.ok(existsSync(memoryLib), 'memory helper should exist');
  assert.equal(
    readFileSync(memoryLib, 'utf8'),
    readFileSync(join(__dirname, '..', 'lib', 'memory.mjs'), 'utf8'),
  );

  const syntax = spawnSync('bash', ['-n', launcher], {
    encoding: 'utf8',
    timeout: 10000,
    env: cliEnv(),
  });
  assert.equal(syntax.status, 0, syntax.stderr);

  const config = readFileSync(join(installRoot, '.codex', 'config.toml'), 'utf8');
  assert.equal((config.match(/^\[mcp_servers\.omh-memory\]$/gm) || []).length, 1);
  assert.match(config, /^\s*command = "bash"\s*$/m);
  assert.ok(
    config.includes(`args = [${JSON.stringify(launcher)}]`),
    'memory MCP args should contain the exact installed launcher path',
  );
}

function assertCodexSkillReferencesInstalled(installRoot) {
  const setupSkill = join(
    installRoot,
    '.agents',
    'skills',
    'harness-setup',
    'SKILL.md',
  );
  const teamSkill = join(
    installRoot,
    '.agents',
    'skills',
    'team-spawn',
    'SKILL.md',
  );
  const runtimeMapFromSetup = resolve(dirname(setupSkill), '../../references/runtime-map.md');
  const runtimeMapFromTeam = resolve(dirname(teamSkill), '../../references/runtime-map.md');
  const templateFromSetup = resolve(
    dirname(setupSkill),
    '../../../templates/harness.config.json.tmpl',
  );

  assert.ok(existsSync(runtimeMapFromSetup), runtimeMapFromSetup);
  assert.equal(runtimeMapFromTeam, runtimeMapFromSetup);
  assert.equal(
    readFileSync(runtimeMapFromSetup, 'utf8'),
    readFileSync(join(__dirname, '..', 'codex', 'references', 'runtime-map.md'), 'utf8'),
  );
  assert.ok(existsSync(templateFromSetup), templateFromSetup);
  assert.equal(
    readFileSync(templateFromSetup, 'utf8'),
    readFileSync(join(__dirname, '..', 'templates', 'harness.config.json.tmpl'), 'utf8'),
  );
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(TEST_HOME, { recursive: true });
});
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

describe('cli init', () => {
  it('creates all expected files including new hooks and gate', () => {
    runCli('init');
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'harness.config.json')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'lib', 'output.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'session-start.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'pre-prompt.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'post-task.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'dangerous-guard.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'pre-compact.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'commit-convention.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'scope-guard.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'usage-tracker.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'hooks', 'hook-gate.sh')));
    assert.ok(existsSync(join(TMP, '.claude', 'commands', 'set-harness.md')));
    assert.ok(existsSync(join(TMP, '.claude', 'commands', 'init-project.md')));
    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
    assert.ok(existsSync(join(TMP, '.claude', 'CLAUDE.md')));
  });

  it('registers all hook events with 2-stage gate in settings.local.json', () => {
    runCli('init');
    const settings = JSON.parse(readFileSync(join(TMP, '.claude', 'settings.local.json'), 'utf8'));
    assert.ok(settings.hooks.SessionStart);
    assert.ok(settings.hooks.UserPromptSubmit);
    assert.ok(settings.hooks.PreToolUse);
    assert.ok(settings.hooks.PostToolUse);
    assert.ok(settings.hooks.PreCompact);
    assert.ok(settings.hooks.Stop);
    // PreToolUse uses hook-gate.sh with dangerous-guard
    const preToolCmd = settings.hooks.PreToolUse[0].hooks[0].command;
    assert.ok(preToolCmd.includes('hook-gate.sh'), 'should use 2-stage gate');
    assert.ok(preToolCmd.includes('dangerous-guard.mjs'), 'should reference hook');
    assert.ok(preToolCmd.includes('dangerousGuard'), 'should pass feature key');
    // PostToolUse has 3 hooks
    assert.equal(settings.hooks.PostToolUse[0].hooks.length, 3);
  });

  it('registers agents in settings.local.json', () => {
    runCli('init');
    const settings = JSON.parse(readFileSync(join(TMP, '.claude', 'settings.local.json'), 'utf8'));
    assert.ok(settings.agents);
    assert.equal(settings.agents['harness:quick'].model, 'haiku');
    assert.equal(settings.agents['harness:standard'].model, 'sonnet');
    assert.equal(settings.agents['harness:architect'].model, 'opus');
  });

  it('adds HARNESS block to CLAUDE.md with enabled sections only', () => {
    runCli('init');
    const md = readFileSync(join(TMP, '.claude', 'CLAUDE.md'), 'utf8');
    assert.ok(md.includes('<!-- HARNESS:START -->'));
    assert.ok(md.includes('<!-- HARNESS:END -->'));
    // Enabled by default
    assert.ok(md.includes('Test Enforcement'));
    assert.ok(md.includes('Ambiguity Guard'));
    assert.ok(md.includes('Dangerous Operation Guard'));
    assert.ok(md.includes('Commit Convention'));
    assert.ok(md.includes('Model Routing'));
    assert.ok(md.includes('Multi-Agent'));
    // scopeGuard is disabled by default → should NOT appear
    assert.ok(!md.includes('Scope Guard'), 'Scope Guard should not appear when disabled');
  });

  it('is idempotent — running twice does not duplicate', () => {
    runCli('init');
    runCli('init');
    const md = readFileSync(join(TMP, '.claude', 'CLAUDE.md'), 'utf8');
    const starts = md.match(/<!-- HARNESS:START -->/g);
    assert.equal(starts.length, 1);
  });

  it('creates .gitignore with .claude/.omh/ entry', () => {
    runCli('init');
    const gi = readFileSync(join(TMP, '.gitignore'), 'utf8');
    assert.ok(gi.includes('.claude/.omh/'));
  });

  it('does not duplicate .gitignore entry on re-init', () => {
    runCli('init');
    runCli('init');
    const gi = readFileSync(join(TMP, '.gitignore'), 'utf8');
    const matches = gi.match(/\.claude\/\.omh\//g);
    assert.equal(matches.length, 1);
  });

  it('accepts --scope project flag', () => {
    runCli('init', '--scope', 'project');
    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
    const settings = JSON.parse(readFileSync(join(TMP, '.claude', 'settings.local.json'), 'utf8'));
    assert.ok(settings.hooks?.SessionStart);
  });

  it('defaults to project scope in non-interactive mode', () => {
    runCli('init');
    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
  });

  it('shows scope info in init output', () => {
    const output = runCli('init', '--scope', 'project');
    assert.ok(output.includes('Project'));
  });

  it('keeps the default runtime Claude-only', () => {
    runCli('init');
    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TMP, 'AGENTS.md')));
  });

  it('rejects corrupt harness config before init changes either runtime', () => {
    for (const runtime of ['claude', 'codex', 'both']) {
      const project = join(TMP, `corrupt-init-config-${runtime}`);
      const configPath = join(project, '.claude', '.omh', 'harness.config.json');
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, '{ invalid\n');

      const result = runCliResult(
        ['init', '--runtime', runtime, '--scope', 'project'],
        project,
      );

      assert.notEqual(result.status, 0, runtime);
      assert.match(result.stdout + result.stderr, /invalid.*harness\.config|harness\.config.*invalid/i);
      assert.equal(readFileSync(configPath, 'utf8'), '{ invalid\n');
      assert.deepEqual(
        [
          join(project, '.claude', '.omh', 'hooks'),
          join(project, '.claude', '.omh', 'runtime'),
          join(project, '.claude', '.omh', 'codex-ownership.json'),
          join(project, '.claude', 'commands'),
          join(project, '.claude', 'settings.local.json'),
          join(project, '.claude', 'CLAUDE.md'),
          join(project, '.codex'),
          join(project, '.agents'),
          join(project, 'AGENTS.md'),
          join(project, '.gitignore'),
        ].map(path => existsSync(path)),
        [false, false, false, false, false, false, false, false, false, false],
        `${runtime}: no registration payload is created`,
      );
    }
  });

  it('installs explicit user-scoped Claude files only under the user home', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');

    for (const path of [
      join(TEST_HOME, '.claude', '.omh', 'harness.config.json'),
      join(TEST_HOME, '.claude', '.omh', 'hooks', 'dangerous-guard.mjs'),
      join(TEST_HOME, '.claude', 'commands', 'set-harness.md'),
      join(TEST_HOME, '.claude', 'CLAUDE.md'),
      join(TEST_HOME, '.claude', 'settings.json'),
    ]) assert.ok(existsSync(path), path);
    assert.ok(!existsSync(join(TMP, '.claude')));
    assert.ok(!existsSync(join(TMP, '.gitignore')));

    const settings = JSON.parse(
      readFileSync(join(TEST_HOME, '.claude', 'settings.json'), 'utf8'),
    );
    const commands = JSON.stringify(settings.hooks);
    assert.ok(commands.includes(join(TEST_HOME, '.claude', '.omh', 'hooks')));
    assert.ok(!commands.includes('bash .claude/.omh/hooks'));
  });

  it('runs user-scoped Claude guards from a clean project through global config fallback', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const cleanProject = join(TMP, 'clean-project');
    mkdirSync(cleanProject, { recursive: true });

    const result = runInstalledClaudeDangerousHook(cleanProject);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /rm -rf/);
  });

  it('inherits default-on dangerousGuard from an empty project config', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const project = join(TMP, 'empty-project-config');
    const configPath = join(project, '.claude', '.omh', 'harness.config.json');
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{}\n');

    const result = runInstalledClaudeDangerousHook(project);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /rm -rf/);
  });

  it('falls back to valid user-global hook config when project config is null', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const project = join(TMP, 'null-project-config');
    const configPath = join(project, '.claude', '.omh', 'harness.config.json');
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, 'null\n');

    const result = runInstalledClaudeDangerousHook(project);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /rm -rf/);
  });

  it('keeps project feature flags ahead of the user-global hook config', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const project = join(TMP, 'project-precedence');
    const configPath = join(project, '.claude', '.omh', 'harness.config.json');
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ features: { dangerousGuard: false } }));

    const result = runInstalledClaudeDangerousHook(project);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      continue: true,
      suppressOutput: true,
    });
  });

  it('falls back to valid user-global hook config when project config is corrupt', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const project = join(TMP, 'corrupt-project-config');
    const configPath = join(project, '.claude', '.omh', 'harness.config.json');
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{ invalid\n');

    const result = runInstalledClaudeDangerousHook(project);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /rm -rf/);
  });

  it('runs the dangerous guard when the only available config is corrupt', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    writeFileSync(
      join(TEST_HOME, '.claude', '.omh', 'harness.config.json'),
      '{ invalid\n',
    );
    const project = join(TMP, 'corrupt-global-only');
    mkdirSync(project, { recursive: true });

    const result = runInstalledClaudeDangerousHook(project);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /rm -rf/);
  });

  it('runs the dangerous guard when the installed feature gate is missing', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    rmSync(join(
      TEST_HOME,
      '.claude',
      '.omh',
      'hooks',
      'lib',
      'feature-gate.mjs',
    ));
    const project = join(TMP, 'missing-feature-gate');
    mkdirSync(project, { recursive: true });

    const result = runInstalledClaudeDangerousHook(project);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /rm -rf/);
  });

  it('preflights existing Claude settings before init creates any payload', () => {
    const settingsPath = join(TMP, '.claude', 'settings.local.json');
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, '{ invalid\n');

    const result = runCliResult(
      ['init', '--runtime', 'claude', '--scope', 'project'],
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /invalid.*settings/i);
    assert.equal(readFileSync(settingsPath, 'utf8'), '{ invalid\n');
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.claude', 'commands')));
    assert.ok(!existsSync(join(TMP, '.claude', 'CLAUDE.md')));
    assert.ok(!existsSync(join(TMP, '.gitignore')));
  });
});

describe('cli runtime matrix', () => {
  it('installs Codex project hooks, runtime, roles, skills, and guidance only', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'project');

    assert.ok(existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(existsSync(join(TMP, '.codex', 'config.toml')));
    assert.ok(existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.ok(existsSync(join(TMP, 'AGENTS.md')));
    assert.ok(existsSync(join(TMP, '.agents', 'skills', 'omh-loop', 'SKILL.md')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'runtime', 'hooks', 'lib', 'hook-config.mjs')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'runtime', 'lib', 'loop.mjs')));
    assert.ok(!existsSync(join(TMP, '.claude', 'CLAUDE.md')));
    assert.ok(!existsSync(join(TMP, '.claude', 'settings.local.json')));

    const hooks = readFileSync(join(TMP, '.codex', 'hooks.json'), 'utf8');
    assert.ok(!hooks.includes('${PLUGIN_ROOT}'));
    assert.ok(hooks.includes(join(TMP, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs')));

    const config = readFileSync(join(TMP, '.codex', 'config.toml'), 'utf8');
    assert.ok(config.includes('[agents.quick]'));
    assert.ok(config.includes('[agents.standard]'));
    assert.ok(config.includes('[agents.architect]'));
    assertCodexMemoryInstalled(TMP);
    assertCodexSkillReferencesInstalled(TMP);
  });

  it('installs both runtime registrations while sharing state', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');

    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
    assert.ok(existsSync(join(TMP, '.claude', 'CLAUDE.md')));
    assert.ok(existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(existsSync(join(TMP, 'AGENTS.md')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'harness.config.json')));
    assertCodexMemoryInstalled(TMP);
  });

  it('preserves unrelated Codex files and shared config across idempotent init', () => {
    const agents = '# Team guidance\nKeep this line exactly.\n';
    const hooks = {
      description: 'custom hooks',
      custom: { keep: true },
      hooks: {
        PreToolUse: [{
          matcher: 'CustomTool',
          hooks: [{ type: 'command', command: 'echo custom-hook' }],
        }],
      },
    };
    const sharedConfig = { custom: { keep: true }, features: { skillScaffolding: false } };
    const customSkill = '---\nname: custom\n---\nKeep me.\n';
    const customToml = 'model = "custom"\n\n[mcp_servers.custom]\ncommand = "custom-server"\n';

    writeFileSync(join(TMP, 'AGENTS.md'), agents);
    mkdirSync(join(TMP, '.codex'), { recursive: true });
    writeFileSync(join(TMP, '.codex', 'hooks.json'), JSON.stringify(hooks, null, 2) + '\n');
    writeFileSync(join(TMP, '.codex', 'config.toml'), customToml);
    mkdirSync(join(TMP, '.agents', 'skills', 'custom'), { recursive: true });
    writeFileSync(join(TMP, '.agents', 'skills', 'custom', 'SKILL.md'), customSkill);
    mkdirSync(join(TMP, '.claude', '.omh'), { recursive: true });
    writeFileSync(
      join(TMP, '.claude', '.omh', 'harness.config.json'),
      JSON.stringify(sharedConfig, null, 2) + '\n',
    );

    runCli('init', '--runtime', 'codex', '--scope', 'project');
    runCli('init', '--runtime', 'codex', '--scope', 'project');

    const mergedAgents = readFileSync(join(TMP, 'AGENTS.md'), 'utf8');
    assert.ok(mergedAgents.startsWith(agents));
    assert.equal((mergedAgents.match(/<!-- HARNESS:START -->/g) || []).length, 1);
    assert.ok(mergedAgents.includes('Codex quick'));

    const mergedHooks = JSON.parse(readFileSync(join(TMP, '.codex', 'hooks.json'), 'utf8'));
    assert.deepEqual(mergedHooks.custom, { keep: true });
    assert.ok(JSON.stringify(mergedHooks).includes('echo custom-hook'));
    assert.ok(JSON.stringify(mergedHooks).includes('.omh/runtime/hooks/codex/run.mjs'));

    assert.equal(
      readFileSync(join(TMP, '.agents', 'skills', 'custom', 'SKILL.md'), 'utf8'),
      customSkill,
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(TMP, '.claude', '.omh', 'harness.config.json'), 'utf8')),
      sharedConfig,
    );

    const mergedToml = readFileSync(join(TMP, '.codex', 'config.toml'), 'utf8');
    assert.ok(mergedToml.startsWith(customToml));
    assert.equal((mergedToml.match(/# OH-MY-HARNESS:START/g) || []).length, 1);
  });

  it('installs user-scoped Codex registrations without touching project Codex files', () => {
    const customToml = 'model = "custom"\n\n[mcp_servers.custom]\ncommand = "custom-server"\n';
    mkdirSync(join(TEST_HOME, '.codex'), { recursive: true });
    writeFileSync(join(TEST_HOME, '.codex', 'config.toml'), customToml);

    runCli('init', '--runtime', 'codex', '--scope', 'user');

    assert.ok(existsSync(join(TEST_HOME, '.codex', 'hooks.json')));
    assert.ok(existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(existsSync(join(TEST_HOME, '.codex', 'AGENTS.md')));
    assert.ok(existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop', 'SKILL.md')));
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TMP, 'AGENTS.md')));
    assert.ok(existsSync(join(TEST_HOME, '.claude', '.omh', 'harness.config.json')));
    assert.ok(existsSync(join(TEST_HOME, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs')));
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));

    const mergedToml = readFileSync(join(TEST_HOME, '.codex', 'config.toml'), 'utf8');
    assert.ok(mergedToml.startsWith(customToml));
    assert.ok(mergedToml.includes('[agents.quick]'));

    const hooks = readFileSync(join(TEST_HOME, '.codex', 'hooks.json'), 'utf8');
    assert.ok(hooks.includes(join(TEST_HOME, '.claude', '.omh', 'runtime')));
    assertCodexMemoryInstalled(TEST_HOME);
    assertCodexSkillReferencesInstalled(TEST_HOME);
  });

  it('installs user-scoped Codex memory when both runtimes are requested', () => {
    runCli('init', '--runtime', 'both', '--scope', 'user');

    assertCodexMemoryInstalled(TEST_HOME);
  });

  it('quotes installed hook paths as literal shell data', () => {
    const project = join(
      TMP,
      "literal $(touch DOLLAR_EXECUTED) `touch BACKTICK_EXECUTED` $HOME ' path",
    );
    mkdirSync(project, { recursive: true });

    runCliIn(project, 'init', '--runtime', 'codex', '--scope', 'project');

    const installedHooks = JSON.parse(
      readFileSync(join(project, '.codex', 'hooks.json'), 'utf8'),
    );
    const dangerousHandler = installedHooks.hooks.PreToolUse
      .flatMap(group => group.hooks)
      .find(handler =>
        handler.command.includes('dangerous-guard.mjs')
        || handler.statusMessage?.includes('checking safety'));
    assert.ok(dangerousHandler, 'dangerous guard hook should be installed');

    const hookRun = spawnSync('sh', ['-c', dangerousHandler.command], {
      cwd: project,
      input: JSON.stringify({
        session_id: 'shell-path-test',
        turn_id: 'turn-1',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf build' },
      }),
      encoding: 'utf8',
      timeout: 10000,
      env: cliEnv(),
    });

    assert.equal(hookRun.status, 0, hookRun.stderr);
    const response = JSON.parse(hookRun.stdout);
    assert.equal(response.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(!existsSync(join(project, 'DOLLAR_EXECUTED')));
    assert.ok(!existsSync(join(project, 'BACKTICK_EXECUTED')));
    assertCodexMemoryInstalled(project);
  });

  it('preserves same-name user roles and skills through init, update, and reset', () => {
    const quick = 'model = "user-quick"\n';
    const loop = '---\nname: user-omh-loop\n---\nUser-owned skill.\n';
    const quickPath = join(TMP, '.codex', 'agents', 'quick.toml');
    const loopPath = join(TMP, '.agents', 'skills', 'omh-loop', 'SKILL.md');
    mkdirSync(dirname(quickPath), { recursive: true });
    mkdirSync(dirname(loopPath), { recursive: true });
    writeFileSync(quickPath, quick);
    writeFileSync(loopPath, loop);

    runCli('init', '--runtime', 'codex', '--scope', 'project');
    assert.equal(readFileSync(quickPath, 'utf8'), quick);
    assert.equal(readFileSync(loopPath, 'utf8'), loop);
    assert.ok(existsSync(join(TMP, '.codex', 'agents', 'standard.toml')));
    assert.ok(existsSync(join(TMP, '.agents', 'skills', 'omh-spec', 'SKILL.md')));
    const ownership = JSON.parse(
      readFileSync(join(TMP, '.claude', '.omh', 'codex-ownership.json'), 'utf8'),
    );
    assert.ok(!ownership.roles.includes('quick'));
    assert.ok(ownership.roles.includes('standard'));
    assert.ok(!ownership.skills.includes('omh-loop'));
    assert.ok(ownership.skills.includes('omh-spec'));
    const config = readFileSync(join(TMP, '.codex', 'config.toml'), 'utf8');
    assert.ok(!config.includes('[agents.quick]'));
    assert.ok(config.includes('[agents.standard]'));

    runCli('update', '--runtime', 'codex', '--scope', 'project');
    assert.equal(readFileSync(quickPath, 'utf8'), quick);
    assert.equal(readFileSync(loopPath, 'utf8'), loop);

    runCli('reset', '--runtime', 'codex', '--scope', 'project');
    assert.equal(readFileSync(quickPath, 'utf8'), quick);
    assert.equal(readFileSync(loopPath, 'utf8'), loop);
    assert.ok(!existsSync(join(TMP, '.codex', 'agents', 'standard.toml')));
    assert.ok(!existsSync(join(TMP, '.agents', 'skills', 'omh-spec')));
  });

  it('preserves a pre-existing user omh-memory registration through init, update, and reset', () => {
    const customConfig = [
      '[mcp_servers.omh-memory]',
      'command = "custom-memory"',
      'args = ["--custom-store"]',
      '',
    ].join('\n');
    const configPath = join(TMP, '.codex', 'config.toml');
    const launcher = join(TMP, '.claude', '.omh', 'runtime', 'bin', 'omh-memory.sh');
    const graphPath = join(TEST_HOME, '.omh', 'memory', 'graph.jsonl');
    mkdirSync(dirname(configPath), { recursive: true });
    mkdirSync(dirname(graphPath), { recursive: true });
    writeFileSync(configPath, customConfig);
    writeFileSync(graphPath, 'user-memory-sentinel\n');

    runCli('init', '--runtime', 'codex', '--scope', 'project');
    let config = readFileSync(configPath, 'utf8');
    assert.equal((config.match(/^\[mcp_servers\.omh-memory\]$/gm) || []).length, 1);
    assert.ok(config.includes('command = "custom-memory"'));
    assert.ok(config.includes('args = ["--custom-store"]'));
    assert.ok(existsSync(launcher));
    assert.equal(readFileSync(graphPath, 'utf8'), 'user-memory-sentinel\n');

    writeFileSync(launcher, 'drifted launcher\n');
    runCli('update', '--runtime', 'codex', '--scope', 'project');
    config = readFileSync(configPath, 'utf8');
    assert.equal((config.match(/^\[mcp_servers\.omh-memory\]$/gm) || []).length, 1);
    assert.ok(config.includes('command = "custom-memory"'));
    assert.ok(config.includes('args = ["--custom-store"]'));
    assert.equal(
      readFileSync(launcher, 'utf8'),
      readFileSync(join(__dirname, '..', 'bin', 'omh-memory.sh'), 'utf8'),
    );
    assert.equal(readFileSync(graphPath, 'utf8'), 'user-memory-sentinel\n');

    runCli('reset', '--runtime', 'codex', '--scope', 'project');
    assert.equal(readFileSync(configPath, 'utf8'), customConfig);
    assert.ok(!existsSync(launcher));
    assert.equal(readFileSync(graphPath, 'utf8'), 'user-memory-sentinel\n');
  });

  it('recognizes quoted, dotted, table-local, and inline user TOML registrations semantically', () => {
    const fixtures = [
      {
        name: 'quoted-tables',
        config: [
          'model = "custom"',
          '[custom.keep]',
          'value = true',
          '[agents."quick"]',
          'description = "custom quick"',
          'config_file = "custom-quick.toml"',
          '[mcp_servers."omh-memory"]',
          'command = "custom-memory"',
          '',
        ].join('\n'),
        forbidden: ['[agents.quick]', '[mcp_servers.omh-memory]'],
        required: ['[agents.standard]', '[agents.architect]'],
      },
      {
        name: 'dotted-assignments',
        config: [
          'model = "custom"',
          'agents.quick = { description = "custom quick", config_file = "custom-quick.toml" }',
          'mcp_servers."omh-memory" = { command = "custom-memory", args = ["--custom"] }',
          '',
        ].join('\n'),
        forbidden: ['[agents.quick]', '[mcp_servers.omh-memory]'],
        required: ['[agents.standard]', '[agents.architect]'],
      },
      {
        name: 'table-local-inline',
        config: [
          'model = "custom"',
          '[agents]',
          '"quick" = { description = "custom quick", config_file = "custom-quick.toml" }',
          '[mcp_servers]',
          '"omh-memory" = { command = "custom-memory", args = ["--custom"] }',
          '',
        ].join('\n'),
        forbidden: ['[agents.quick]', '[mcp_servers.omh-memory]'],
        required: ['[agents.standard]', '[agents.architect]'],
      },
      {
        name: 'sealed-parent-inline',
        config: [
          'model = "custom"',
          'agents = { quick = { description = "custom quick" } }',
          'mcp_servers = { "omh-memory" = { command = "custom-memory" } }',
          '',
        ].join('\n'),
        forbidden: [
          '[agents.quick]',
          '[agents.standard]',
          '[agents.architect]',
          '[mcp_servers.omh-memory]',
        ],
        required: [],
      },
    ];

    for (const fixture of fixtures) {
      const project = join(TMP, fixture.name);
      const configPath = join(project, '.codex', 'config.toml');
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, fixture.config);

      runCliIn(project, 'init', '--runtime', 'codex', '--scope', 'project');
      const merged = readFileSync(configPath, 'utf8');

      assert.ok(merged.startsWith(fixture.config), `${fixture.name}: preserves unrelated bytes`);
      for (const declaration of fixture.forbidden) {
        assert.ok(!merged.includes(declaration), `${fixture.name}: omits ${declaration}`);
      }
      for (const declaration of fixture.required) {
        assert.ok(merged.includes(declaration), `${fixture.name}: keeps ${declaration}`);
      }

      runCliIn(project, 'update', '--runtime', 'codex', '--scope', 'project');
      assert.equal(
        (readFileSync(configPath, 'utf8').match(/# OH-MY-HARNESS:START/g) || []).length,
        1,
        `${fixture.name}: update stays idempotent`,
      );
    }
  });

  it('rejects invalid or semantically conflicting user TOML before creating any Codex files', () => {
    const fixtures = [
      'model = "unterminated\n',
      [
        '[agents.quick]',
        'description = "first"',
        '[agents."quick"]',
        'description = "duplicate"',
        '',
      ].join('\n'),
      [
        '[[custom]]',
        'value = 1',
        'value = 2',
        '',
      ].join('\n'),
      'custom = { value = 1, value.child = 2 }\n',
      'custom = -0x1\n',
    ];

    for (const [index, original] of fixtures.entries()) {
      const project = join(TMP, `invalid-toml-${index}`);
      const configPath = join(project, '.codex', 'config.toml');
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, original);

      const result = runCliResult(
        ['init', '--runtime', 'codex', '--scope', 'project'],
        project,
      );

      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /TOML/i);
      assert.equal(readFileSync(configPath, 'utf8'), original);
      assert.ok(!existsSync(join(project, '.codex', 'hooks.json')));
      assert.ok(!existsSync(join(project, '.codex', 'agents')));
      assert.ok(!existsSync(join(project, '.agents')));
      assert.ok(!existsSync(join(project, 'AGENTS.md')));
      assert.ok(!existsSync(join(project, '.claude')));
    }
  });

  it('accepts distinct array-table entries, nested inline keys, and valid numeric signs', () => {
    const original = [
      '[[custom]]',
      'value = 1',
      '[[custom]]',
      'value = 2',
      'nested = { value.child = 2, sibling = 1 }',
      'hex = 0x1',
      'negative = -1',
      'positive = +1',
      '[[products]]',
      'name = "first"',
      '[products.details]',
      'color = "red"',
      '[[products]]',
      'name = "second"',
      '[products.details]',
      'color = "blue"',
      '',
    ].join('\n');
    const project = join(TMP, 'valid-toml-counterexamples');
    const configPath = join(project, '.codex', 'config.toml');
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, original);

    runCliIn(project, 'init', '--runtime', 'codex', '--scope', 'project');

    assert.ok(readFileSync(configPath, 'utf8').startsWith(original));
    assert.ok(existsSync(join(project, '.codex', 'hooks.json')));
  });

  it('refreshes and resets only owned Codex skill reference assets', () => {
    const runtimeMap = join(TMP, '.agents', 'references', 'runtime-map.md');
    const configTemplate = join(TMP, 'templates', 'harness.config.json.tmpl');
    runCli('init', '--runtime', 'codex', '--scope', 'project');
    const ownershipPath = join(TMP, '.claude', '.omh', 'codex-ownership.json');
    let ownership = JSON.parse(readFileSync(ownershipPath, 'utf8'));
    assert.deepEqual(
      ownership.assets,
      [
        '.agents/references/runtime-map.md',
        'templates/harness.config.json.tmpl',
      ],
    );

    writeFileSync(runtimeMap, 'drifted-runtime-map\n');
    writeFileSync(configTemplate, 'drifted-template\n');
    runCli('update', '--runtime', 'codex', '--scope', 'project');
    assertCodexSkillReferencesInstalled(TMP);

    runCli('reset', '--runtime', 'codex', '--scope', 'project');
    assert.ok(!existsSync(runtimeMap));
    assert.ok(!existsSync(configTemplate));

    const project = join(TMP, 'preexisting-assets');
    const customRuntimeMap = join(project, '.agents', 'references', 'runtime-map.md');
    const customTemplate = join(project, 'templates', 'harness.config.json.tmpl');
    mkdirSync(dirname(customRuntimeMap), { recursive: true });
    mkdirSync(dirname(customTemplate), { recursive: true });
    writeFileSync(customRuntimeMap, 'user runtime map\n');
    writeFileSync(customTemplate, 'user template\n');

    runCliIn(project, 'init', '--runtime', 'codex', '--scope', 'project');
    ownership = JSON.parse(
      readFileSync(join(project, '.claude', '.omh', 'codex-ownership.json'), 'utf8'),
    );
    assert.ok(!ownership.assets.includes('.agents/references/runtime-map.md'));
    assert.ok(!ownership.assets.includes('templates/harness.config.json.tmpl'));
    runCliIn(project, 'update', '--runtime', 'codex', '--scope', 'project');
    runCliIn(project, 'reset', '--runtime', 'codex', '--scope', 'project');
    assert.equal(readFileSync(customRuntimeMap, 'utf8'), 'user runtime map\n');
    assert.equal(readFileSync(customTemplate, 'utf8'), 'user template\n');
  });
});

describe('cli reset', () => {
  it('removes all harness files', () => {
    runCli('init');
    runCli('reset');
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.claude', 'commands', 'set-harness.md')));
    assert.ok(!existsSync(join(TMP, '.claude', 'commands', 'init-project.md')));
  });

  it('cleans CLAUDE.md harness block', () => {
    runCli('init');
    runCli('reset');
    const md = readFileSync(join(TMP, '.claude', 'CLAUDE.md'), 'utf8');
    assert.ok(!md.includes('<!-- HARNESS:START -->'));
  });

  it('cleans all hook events from settings.local.json', () => {
    runCli('init');
    runCli('reset');
    const settings = JSON.parse(readFileSync(join(TMP, '.claude', 'settings.local.json'), 'utf8'));
    assert.ok(!settings.hooks);
    assert.ok(!settings.agents);
  });

  it('cleans .gitignore entry', () => {
    runCli('init');
    runCli('reset');
    const gi = readFileSync(join(TMP, '.gitignore'), 'utf8');
    assert.ok(!gi.includes('.claude/.omh/'));
  });

  it('removes only managed Codex files and preserves shared state when Claude remains', () => {
    const agents = '# Existing guidance\n';
    const customSkill = 'custom skill\n';
    const customRole = 'model = "custom"\n';
    const customToml = 'model = "custom"\n';
    const hooks = {
      hooks: {
        PreToolUse: [{
          matcher: 'CustomTool',
          hooks: [{ type: 'command', command: 'echo custom-hook' }],
        }],
      },
    };

    writeFileSync(join(TMP, 'AGENTS.md'), agents);
    mkdirSync(join(TMP, '.codex', 'agents'), { recursive: true });
    writeFileSync(join(TMP, '.codex', 'hooks.json'), JSON.stringify(hooks, null, 2) + '\n');
    writeFileSync(join(TMP, '.codex', 'config.toml'), customToml);
    writeFileSync(join(TMP, '.codex', 'agents', 'custom.toml'), customRole);
    mkdirSync(join(TMP, '.agents', 'skills', 'custom'), { recursive: true });
    writeFileSync(join(TMP, '.agents', 'skills', 'custom', 'SKILL.md'), customSkill);

    runCli('init', '--runtime', 'both');
    runCli('reset', '--runtime', 'codex');

    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'harness.config.json')));
    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
    assert.ok(!existsSync(join(TMP, '.claude', '.omh', 'runtime')));
    assert.ok(!existsSync(join(TMP, '.agents', 'skills', 'omh-loop')));
    assert.equal(
      readFileSync(join(TMP, '.agents', 'skills', 'custom', 'SKILL.md'), 'utf8'),
      customSkill,
    );
    assert.ok(!existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.equal(readFileSync(join(TMP, '.codex', 'agents', 'custom.toml'), 'utf8'), customRole);
    assert.equal(readFileSync(join(TMP, 'AGENTS.md'), 'utf8'), agents);
    assert.equal(readFileSync(join(TMP, '.codex', 'config.toml'), 'utf8'), customToml);

    const cleanedHooks = readFileSync(join(TMP, '.codex', 'hooks.json'), 'utf8');
    assert.ok(cleanedHooks.includes('echo custom-hook'));
    assert.ok(!cleanedHooks.includes('.omh/runtime/hooks/codex/run.mjs'));
  });

  it('reset both removes both registrations and shared state non-interactively', () => {
    runCli('init', '--runtime', 'both');
    assert.ok(existsSync(join(TMP, 'AGENTS.md')));
    runCli('reset', '--runtime', 'both');

    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.claude', 'commands', 'set-harness.md')));
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TMP, '.agents', 'skills', 'omh-loop')));
    assert.ok(
      !existsSync(join(TMP, 'AGENTS.md'))
      || !readFileSync(join(TMP, 'AGENTS.md'), 'utf8').includes('<!-- HARNESS:START -->'),
    );
  });

  it('reset both at user scope removes only user-scoped shared state', () => {
    runCli('init', '--runtime', 'both', '--scope', 'user');
    assert.ok(existsSync(join(TEST_HOME, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));

    runCli('reset', '--runtime', 'both', '--scope', 'user');

    assert.ok(!existsSync(join(TEST_HOME, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop')));
  });

  it('reset both at user scope preserves an independent project Codex lifecycle', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'project');
    runCli('init', '--runtime', 'both', '--scope', 'user');

    runCli('reset', '--runtime', 'both', '--scope', 'user');

    const projectSharedRoot = join(TMP, '.claude', '.omh');
    assert.ok(!existsSync(join(TEST_HOME, '.claude', '.omh')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop')));
    assert.ok(existsSync(join(projectSharedRoot, 'harness.config.json')));
    assert.ok(existsSync(join(projectSharedRoot, 'runtime', 'hooks', 'codex', 'run.mjs')));
    assert.ok(existsSync(join(projectSharedRoot, 'codex-ownership.json')));
    assert.ok(existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.ok(existsSync(join(TMP, '.agents', 'skills', 'omh-loop', 'SKILL.md')));
    assert.ok(readFileSync(join(TMP, '.gitignore'), 'utf8').includes('.claude/.omh/'));
    assertCodexMemoryInstalled(TMP);
    assertInstalledDangerousHookDenies(TMP);

    runCli('update', '--runtime', 'codex', '--scope', 'project');
    assertCodexMemoryInstalled(TMP);
    assertInstalledDangerousHookDenies(TMP);
    runCli('reset', '--runtime', 'codex', '--scope', 'project');

    assert.ok(!existsSync(projectSharedRoot));
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TMP, '.agents', 'skills', 'omh-loop')));
  });

  it('reset both at project scope preserves an independent user Codex lifecycle', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'user');
    runCli('init', '--runtime', 'both', '--scope', 'project');

    runCli('reset', '--runtime', 'both', '--scope', 'project');

    const userSharedRoot = join(TEST_HOME, '.claude', '.omh');
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TMP, '.agents', 'skills', 'omh-loop')));
    assert.ok(existsSync(join(userSharedRoot, 'harness.config.json')));
    assert.ok(existsSync(join(userSharedRoot, 'runtime', 'hooks', 'codex', 'run.mjs')));
    assert.ok(existsSync(join(userSharedRoot, 'codex-ownership.json')));
    assert.ok(existsSync(join(TEST_HOME, '.codex', 'hooks.json')));
    assert.ok(existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop', 'SKILL.md')));
    assertCodexMemoryInstalled(TEST_HOME);
    assertInstalledDangerousHookDenies(TEST_HOME);

    runCli('update', '--runtime', 'codex', '--scope', 'user');
    assertCodexMemoryInstalled(TEST_HOME);
    assertInstalledDangerousHookDenies(TEST_HOME);
    runCli('reset', '--runtime', 'codex', '--scope', 'user');

    assert.ok(!existsSync(userSharedRoot));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop')));
  });

  it('reset Claude preserves project Codex state until Codex is reset', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');

    runCli('reset', '--runtime', 'claude', '--scope', 'project');

    const sharedRoot = join(TMP, '.claude', '.omh');
    assert.ok(existsSync(join(sharedRoot, 'harness.config.json')));
    assert.ok(existsSync(join(sharedRoot, 'runtime', 'hooks', 'codex', 'run.mjs')));
    assert.ok(existsSync(join(sharedRoot, 'codex-ownership.json')));
    assert.ok(existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.ok(existsSync(join(TMP, '.agents', 'skills', 'omh-loop', 'SKILL.md')));
    assert.ok(readFileSync(join(TMP, '.gitignore'), 'utf8').includes('.claude/.omh/'));

    const settings = JSON.parse(
      readFileSync(join(TMP, '.claude', 'settings.local.json'), 'utf8'),
    );
    assert.ok(!settings.hooks);
    assert.ok(!settings.agents);
    assert.ok(!readFileSync(join(TMP, '.claude', 'CLAUDE.md'), 'utf8')
      .includes('<!-- HARNESS:START -->'));
    assert.ok(!existsSync(join(TMP, '.claude', 'commands', 'set-harness.md')));
    assertCodexMemoryInstalled(TMP);
    assertInstalledDangerousHookDenies(TMP);

    runCli('update', '--runtime', 'codex', '--scope', 'project');
    assertCodexMemoryInstalled(TMP);
    assertInstalledDangerousHookDenies(TMP);
    runCli('reset', '--runtime', 'codex', '--scope', 'project');

    assert.ok(!existsSync(sharedRoot));
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TMP, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TMP, '.agents', 'skills', 'omh-loop')));
    assert.ok(!readFileSync(join(TMP, '.gitignore'), 'utf8').includes('.claude/.omh/'));
  });

  it('reset Claude leaves user-scoped Codex lifecycle operational', () => {
    runCli('init', '--runtime', 'both', '--scope', 'user');

    runCli('reset', '--runtime', 'claude', '--scope', 'user');

    const sharedRoot = join(TEST_HOME, '.claude', '.omh');
    assert.ok(existsSync(join(sharedRoot, 'harness.config.json')));
    assert.ok(existsSync(join(sharedRoot, 'runtime', 'hooks', 'codex', 'run.mjs')));
    assert.ok(existsSync(join(sharedRoot, 'codex-ownership.json')));
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop', 'SKILL.md')));
    assertCodexMemoryInstalled(TEST_HOME);
    assertInstalledDangerousHookDenies(TEST_HOME);

    runCli('update', '--runtime', 'codex', '--scope', 'user');
    assertCodexMemoryInstalled(TEST_HOME);
    assertInstalledDangerousHookDenies(TEST_HOME);
    runCli('reset', '--runtime', 'codex', '--scope', 'user');

    assert.ok(!existsSync(sharedRoot));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop')));
  });

  it('aborts Codex reset without changing any bytes when cleanup inputs are ambiguous', () => {
    const fixtures = [
      {
        name: 'invalid-hooks',
        mutate(project) {
          writeFileSync(join(project, '.codex', 'hooks.json'), '{ invalid\n');
        },
      },
      {
        name: 'incomplete-agents',
        mutate(project) {
          writeFileSync(
            join(project, 'AGENTS.md'),
            '# custom\n<!-- HARNESS:START -->\nunterminated\n',
          );
        },
      },
      {
        name: 'incomplete-toml',
        mutate(project) {
          writeFileSync(
            join(project, '.codex', 'config.toml'),
            'model = "custom"\n# OH-MY-HARNESS:START\nunterminated\n',
          );
        },
      },
      {
        name: 'invalid-ownership',
        mutate(project) {
          writeFileSync(
            join(project, '.claude', '.omh', 'codex-ownership.json'),
            '{ invalid\n',
          );
        },
      },
    ];

    for (const fixture of fixtures) {
      const project = join(TMP, `reset-preflight-${fixture.name}`);
      mkdirSync(project, { recursive: true });
      runCliIn(project, 'init', '--runtime', 'codex', '--scope', 'project');
      fixture.mutate(project);

      const protectedPaths = [
        join(project, '.codex', 'hooks.json'),
        join(project, '.codex', 'config.toml'),
        join(project, 'AGENTS.md'),
        join(project, '.codex', 'agents', 'quick.toml'),
        join(project, '.agents', 'skills', 'omh-loop', 'SKILL.md'),
        join(project, '.claude', '.omh', 'codex-ownership.json'),
        join(project, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs'),
        join(project, '.claude', '.omh', 'harness.config.json'),
        join(project, '.gitignore'),
      ];
      const before = protectedPaths.map(fileState);

      const result = runCliResult(
        ['reset', '--runtime', 'codex', '--scope', 'project'],
        project,
      );

      assert.notEqual(result.status, 0, fixture.name);
      assert.match(result.stdout + result.stderr, /cannot|invalid|incomplete/i);
      assert.deepEqual(
        protectedPaths.map(fileState),
        before,
        `${fixture.name}: reset preserves every protected byte`,
      );
    }
  });

  it('preflights both runtimes before reset mutates either registration', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');
    writeFileSync(join(TMP, '.codex', 'hooks.json'), '{ invalid\n');
    const protectedPaths = [
      join(TMP, '.codex', 'hooks.json'),
      join(TMP, '.codex', 'config.toml'),
      join(TMP, 'AGENTS.md'),
      join(TMP, '.codex', 'agents', 'quick.toml'),
      join(TMP, '.agents', 'skills', 'omh-loop', 'SKILL.md'),
      join(TMP, '.claude', '.omh', 'codex-ownership.json'),
      join(TMP, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs'),
      join(TMP, '.claude', '.omh', 'harness.config.json'),
      join(TMP, '.claude', 'settings.local.json'),
      join(TMP, '.claude', 'CLAUDE.md'),
      join(TMP, '.claude', 'commands', 'set-harness.md'),
      join(TMP, '.gitignore'),
    ];
    const before = protectedPaths.map(fileState);

    const result = runCliResult(
      ['reset', '--runtime', 'both', '--scope', 'project'],
    );

    assert.notEqual(result.status, 0);
    assert.deepEqual(protectedPaths.map(fileState), before);
  });

  it('aborts Claude reset on malformed managed guidance or settings without cross-file cleanup', () => {
    const fixtures = [
      {
        name: 'settings',
        mutate(project) {
          writeFileSync(join(project, '.claude', 'settings.local.json'), '{ invalid\n');
        },
      },
      {
        name: 'guidance',
        mutate(project) {
          writeFileSync(
            join(project, '.claude', 'CLAUDE.md'),
            '# custom\n<!-- HARNESS:START -->\nunterminated\n',
          );
        },
      },
    ];

    for (const fixture of fixtures) {
      const project = join(TMP, `claude-reset-preflight-${fixture.name}`);
      mkdirSync(project, { recursive: true });
      runCliIn(project, 'init', '--runtime', 'claude', '--scope', 'project');
      fixture.mutate(project);
      const protectedPaths = [
        join(project, '.claude', '.omh', 'harness.config.json'),
        join(project, '.claude', '.omh', 'hooks', 'dangerous-guard.mjs'),
        join(project, '.claude', 'settings.local.json'),
        join(project, '.claude', 'CLAUDE.md'),
        join(project, '.claude', 'commands', 'set-harness.md'),
        join(project, '.gitignore'),
      ];
      const before = protectedPaths.map(fileState);

      const result = runCliResult(
        ['reset', '--runtime', 'claude', '--scope', 'project'],
        project,
      );

      assert.notEqual(result.status, 0, fixture.name);
      assert.deepEqual(protectedPaths.map(fileState), before);
    }
  });

  it('rejects a non-string HUD command before reset changes any bytes', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'project');
    const userSettingsPath = join(TEST_HOME, '.claude', 'settings.json');
    const userSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));
    userSettings.statusLine.command = 42;
    writeFileSync(userSettingsPath, JSON.stringify(userSettings, null, 2) + '\n');

    const protectedPaths = [
      userSettingsPath,
      join(TMP, '.claude', '.omh', 'harness.config.json'),
      join(TMP, '.claude', '.omh', 'hooks', 'dangerous-guard.mjs'),
      join(TMP, '.claude', 'settings.local.json'),
      join(TMP, '.claude', 'CLAUDE.md'),
      join(TMP, '.claude', 'commands', 'set-harness.md'),
      join(TMP, '.gitignore'),
    ];
    const before = protectedPaths.map(fileState);

    const result = runCliResult(
      ['reset', '--runtime', 'claude', '--scope', 'project'],
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /HUD|statusLine|settings/i);
    assert.deepEqual(protectedPaths.map(fileState), before);
  });

  it('explicit project reset preserves an independent user-scoped Claude lifecycle', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'project');
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const userPaths = [
      join(TEST_HOME, '.claude', '.omh', 'harness.config.json'),
      join(TEST_HOME, '.claude', '.omh', 'hooks', 'dangerous-guard.mjs'),
      join(TEST_HOME, '.claude', 'commands', 'set-harness.md'),
      join(TEST_HOME, '.claude', 'CLAUDE.md'),
      join(TEST_HOME, '.claude', 'settings.json'),
    ];
    const userBefore = userPaths.map(fileState);

    runCli('reset', '--runtime', 'claude', '--scope', 'project');

    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.claude', 'commands', 'set-harness.md')));
    assert.deepEqual(userPaths.map(fileState), userBefore);

    runCli('update', '--runtime', 'claude', '--scope', 'user');
    runCli('reset', '--runtime', 'claude', '--scope', 'user');
    assert.ok(!existsSync(join(TEST_HOME, '.claude', '.omh')));
    assert.ok(!existsSync(join(TEST_HOME, '.claude', 'commands', 'set-harness.md')));
  });

  it('removes only the selected Claude HUD registration', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'project');
    const userSettingsPath = join(TEST_HOME, '.claude', 'settings.json');
    let userSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));
    assert.ok(userSettings.statusLine.command.includes(join(TMP, '.claude', '.omh')));

    runCli('reset', '--runtime', 'claude', '--scope', 'project');
    userSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));
    assert.ok(!userSettings.statusLine);

    runCli('init', '--runtime', 'claude', '--scope', 'user');
    userSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));
    assert.ok(userSettings.statusLine.command.includes(join(TEST_HOME, '.claude', '.omh')));
    runCli('reset', '--runtime', 'claude', '--scope', 'user');
    userSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8'));
    assert.ok(!userSettings.statusLine);
    assert.ok(!userSettings.hooks);
    assert.ok(!userSettings.agents);
  });
});

describe('cli status', () => {
  it('shows status including new features after init', () => {
    runCli('init');
    const output = runCli('status');
    assert.ok(output.includes('conventionSetup'));
    assert.ok(output.includes('dangerousGuard'));
    assert.ok(output.includes('ON'));
    assert.ok(output.includes('haiku'));
  });

  it('shows not initialized message when no config', () => {
    const output = runCli('status');
    assert.ok(output.includes('not initialized'));
  });

  it('shows separate runtime lines and shared features for both', () => {
    runCli('init', '--runtime', 'both');
    const output = runCli('status', '--runtime', 'both');
    assert.match(output, /Claude\s*:.*installed/i);
    assert.match(output, /Codex\s*:.*installed/i);
    assert.ok(output.includes('Shared Features'));
    assert.ok(output.includes('testEnforcement'));
  });

  it('reads user shared config for explicit user-scoped Codex status', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'user');
    const userConfig = join(TEST_HOME, '.claude', '.omh', 'harness.config.json');
    writeFileSync(userConfig, JSON.stringify({ features: { userScopeFeature: true } }, null, 2));
    mkdirSync(join(TMP, '.claude', '.omh'), { recursive: true });
    writeFileSync(
      join(TMP, '.claude', '.omh', 'harness.config.json'),
      JSON.stringify({ features: { projectScopeFeature: true } }, null, 2),
    );

    const output = runCli('status', '--runtime', 'codex', '--scope', 'user');
    assert.ok(output.includes('userScopeFeature'));
    assert.ok(!output.includes('projectScopeFeature'));
  });

  it('reads only the explicitly selected Claude scope', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'project');
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    writeFileSync(
      join(TMP, '.claude', '.omh', 'harness.config.json'),
      JSON.stringify({ features: { projectScopeFeature: true } }, null, 2),
    );
    writeFileSync(
      join(TEST_HOME, '.claude', '.omh', 'harness.config.json'),
      JSON.stringify({ features: { userScopeFeature: true } }, null, 2),
    );

    const projectOutput = runCli('status', '--runtime', 'claude', '--scope', 'project');
    assert.ok(projectOutput.includes('projectScopeFeature'));
    assert.ok(!projectOutput.includes('userScopeFeature'));

    const userOutput = runCli('status', '--runtime', 'claude', '--scope', 'user');
    assert.ok(userOutput.includes('userScopeFeature'));
    assert.ok(!userOutput.includes('projectScopeFeature'));
  });
});

describe('cli update', () => {
  it('regenerates settings from existing config', () => {
    runCli('init');
    // Modify settings to simulate drift
    const settingsPath = join(TMP, '.claude', 'settings.local.json');
    writeFileSync(settingsPath, JSON.stringify({}));
    runCli('update');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.ok(settings.hooks?.SessionStart);
    assert.ok(settings.hooks?.Stop);
  });

  it('fails when not initialized', () => {
    assert.throws(() => runCli('update'), /not initialized/);
  });

  it('refreshes managed Codex files while preserving custom files', () => {
    runCli('init', '--runtime', 'codex');
    const customSkillPath = join(TMP, '.agents', 'skills', 'custom', 'SKILL.md');
    const managedSkillPath = join(TMP, '.agents', 'skills', 'omh-loop', 'SKILL.md');
    assert.ok(existsSync(managedSkillPath));
    mkdirSync(dirname(customSkillPath), { recursive: true });
    writeFileSync(customSkillPath, 'custom\n');
    writeFileSync(managedSkillPath, 'drifted\n');
    writeFileSync(join(TMP, 'AGENTS.md'), '# Custom\n\n<!-- HARNESS:START -->\ndrifted\n<!-- HARNESS:END -->\n');

    runCli('update', '--runtime', 'codex');

    assert.equal(readFileSync(customSkillPath, 'utf8'), 'custom\n');
    assert.notEqual(readFileSync(managedSkillPath, 'utf8'), 'drifted\n');
    const agents = readFileSync(join(TMP, 'AGENTS.md'), 'utf8');
    assert.ok(agents.startsWith('# Custom\n'));
    assert.ok(agents.includes('Codex quick'));
    assert.equal((agents.match(/<!-- HARNESS:START -->/g) || []).length, 1);
  });

  it('refreshes and removes the owned memory launcher and MCP registration without touching graph data', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'project');
    const launcher = join(TMP, '.claude', '.omh', 'runtime', 'bin', 'omh-memory.sh');
    const configPath = join(TMP, '.codex', 'config.toml');
    const graphPath = join(TEST_HOME, '.omh', 'memory', 'graph.jsonl');
    mkdirSync(dirname(graphPath), { recursive: true });
    writeFileSync(graphPath, 'long-term-graph-sentinel\n');
    assert.ok(existsSync(launcher));
    writeFileSync(launcher, 'drifted launcher\n');
    const driftedConfig = readFileSync(configPath, 'utf8')
      .replace(JSON.stringify(launcher), JSON.stringify('/drifted/omh-memory.sh'));
    writeFileSync(configPath, driftedConfig);

    runCli('update', '--runtime', 'codex', '--scope', 'project');

    assertCodexMemoryInstalled(TMP);
    assert.equal(readFileSync(graphPath, 'utf8'), 'long-term-graph-sentinel\n');

    runCli('reset', '--runtime', 'codex', '--scope', 'project');

    assert.ok(!existsSync(launcher));
    assert.ok(
      !existsSync(configPath)
      || !readFileSync(configPath, 'utf8').includes('[mcp_servers.omh-memory]'),
    );
    assert.equal(readFileSync(graphPath, 'utf8'), 'long-term-graph-sentinel\n');
  });

  it('does not install Codex from Claude shared config alone', () => {
    runCli('init');

    const result = runCliResult(['update', '--runtime', 'codex', '--scope', 'project']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Codex.*not installed/i);
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TMP, 'AGENTS.md')));
  });

  it('does not reinstall Codex after Codex reset while Claude remains', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');
    runCli('reset', '--runtime', 'codex', '--scope', 'project');
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'harness.config.json')));

    const result = runCliResult(['update', '--runtime', 'codex', '--scope', 'project']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Codex.*not installed/i);
    assert.ok(!existsSync(join(TMP, '.codex', 'hooks.json')));
  });

  it('fails before changing files when Codex hooks JSON is invalid', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'project');
    const hooksPath = join(TMP, '.codex', 'hooks.json');
    const rolePath = join(TMP, '.codex', 'agents', 'standard.toml');
    writeFileSync(hooksPath, '{ invalid\n');
    writeFileSync(rolePath, 'drifted\n');

    const result = runCliResult(['update', '--runtime', 'codex', '--scope', 'project']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /invalid.*hooks.*JSON|hooks.*invalid.*JSON/i);
    assert.ok(!(result.stdout + result.stderr).includes('runtime updated'));
    assert.equal(readFileSync(hooksPath, 'utf8'), '{ invalid\n');
    assert.equal(readFileSync(rolePath, 'utf8'), 'drifted\n');
  });

  it('fails before changing files when AGENTS managed markers are incomplete', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'project');
    const agentsPath = join(TMP, 'AGENTS.md');
    const rolePath = join(TMP, '.codex', 'agents', 'standard.toml');
    const malformed = '# Custom\n<!-- HARNESS:START -->\nunterminated\n';
    writeFileSync(agentsPath, malformed);
    writeFileSync(rolePath, 'drifted\n');

    const result = runCliResult(['update', '--runtime', 'codex', '--scope', 'project']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /incomplete.*markers/i);
    assert.ok(!(result.stdout + result.stderr).includes('runtime updated'));
    assert.equal(readFileSync(agentsPath, 'utf8'), malformed);
    assert.equal(readFileSync(rolePath, 'utf8'), 'drifted\n');
  });

  it('fails before changing files when config TOML managed markers are incomplete', () => {
    runCli('init', '--runtime', 'codex', '--scope', 'project');
    const configPath = join(TMP, '.codex', 'config.toml');
    const rolePath = join(TMP, '.codex', 'agents', 'standard.toml');
    const malformed = 'model = "custom"\n# OH-MY-HARNESS:START\nunterminated\n';
    writeFileSync(configPath, malformed);
    writeFileSync(rolePath, 'drifted\n');

    const result = runCliResult(['update', '--runtime', 'codex', '--scope', 'project']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /incomplete.*markers/i);
    assert.ok(!(result.stdout + result.stderr).includes('runtime updated'));
    assert.equal(readFileSync(configPath, 'utf8'), malformed);
    assert.equal(readFileSync(rolePath, 'utf8'), 'drifted\n');
  });

  it('rejects corrupt harness config before updating either runtime', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');
    const configPath = join(TMP, '.claude', '.omh', 'harness.config.json');
    const settingsPath = join(TMP, '.claude', 'settings.local.json');
    const rolePath = join(TMP, '.codex', 'agents', 'standard.toml');
    writeFileSync(configPath, '{ invalid\n');
    writeFileSync(settingsPath, '{"custom":"project-settings"}\n');
    writeFileSync(rolePath, 'drifted-role\n');
    const protectedPaths = [
      configPath,
      settingsPath,
      rolePath,
      join(TMP, '.claude', 'CLAUDE.md'),
      join(TMP, '.codex', 'hooks.json'),
      join(TMP, '.codex', 'config.toml'),
      join(TMP, 'AGENTS.md'),
      join(TMP, '.claude', '.omh', 'codex-ownership.json'),
      join(TMP, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs'),
    ];
    const before = protectedPaths.map(fileState);

    const result = runCliResult(
      ['update', '--runtime', 'both', '--scope', 'project'],
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /invalid.*harness\.config|harness\.config.*invalid/i);
    assert.deepEqual(protectedPaths.map(fileState), before);
  });

  it('repairs an absent config from the safe template before refreshing installed runtimes', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');
    const configPath = join(TMP, '.claude', '.omh', 'harness.config.json');
    const settingsPath = join(TMP, '.claude', 'settings.local.json');
    const rolePath = join(TMP, '.codex', 'agents', 'standard.toml');
    rmSync(configPath);
    writeFileSync(settingsPath, '{}\n');
    writeFileSync(rolePath, 'drifted-role\n');

    runCli('update', '--runtime', 'both', '--scope', 'project');

    assert.equal(
      readFileSync(configPath, 'utf8'),
      readFileSync(join(__dirname, '..', 'templates', 'harness.config.json.tmpl'), 'utf8'),
    );
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.ok(settings.hooks?.SessionStart);
    assert.notEqual(readFileSync(rolePath, 'utf8'), 'drifted-role\n');
  });

  it('updates only the explicitly selected Claude scope', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'project');
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const projectSettings = join(TMP, '.claude', 'settings.local.json');
    const userSettings = join(TEST_HOME, '.claude', 'settings.json');
    const projectGuidance = join(TMP, '.claude', 'CLAUDE.md');
    writeFileSync(projectSettings, '{"project":"drifted"}\n');
    writeFileSync(userSettings, '{"user":"drifted"}\n');
    const projectGuidanceBefore = readFileSync(projectGuidance, 'utf8');

    runCli('update', '--runtime', 'claude', '--scope', 'user');

    assert.equal(readFileSync(projectSettings, 'utf8'), '{"project":"drifted"}\n');
    assert.equal(readFileSync(projectGuidance, 'utf8'), projectGuidanceBefore);
    const refreshedUserSettings = JSON.parse(readFileSync(userSettings, 'utf8'));
    assert.equal(refreshedUserSettings.user, 'drifted');
    assert.ok(refreshedUserSettings.hooks?.SessionStart);
  });

  it('repairs the full user-scoped Claude hook dependency closure on update', () => {
    runCli('init', '--runtime', 'claude', '--scope', 'user');
    const dependencyPairs = [
      [
        join(TEST_HOME, '.claude', '.omh', 'hooks', 'lib', 'hook-config.mjs'),
        join(__dirname, '..', 'hooks', 'lib', 'hook-config.mjs'),
      ],
      [
        join(TEST_HOME, '.claude', '.omh', 'hooks', 'lib', 'feature-gate.mjs'),
        join(__dirname, '..', 'hooks', 'lib', 'feature-gate.mjs'),
      ],
      [
        join(TEST_HOME, '.claude', '.omh', 'hooks', 'lib', 'shell-command.mjs'),
        join(__dirname, '..', 'hooks', 'lib', 'shell-command.mjs'),
      ],
      [
        join(TEST_HOME, '.claude', '.omh', 'hooks', 'lib', 'tier.mjs'),
        join(__dirname, '..', 'hooks', 'lib', 'tier.mjs'),
      ],
      [
        join(TEST_HOME, '.claude', '.omh', 'lib', 'config.mjs'),
        join(__dirname, '..', 'lib', 'config.mjs'),
      ],
      [
        join(TEST_HOME, '.claude', '.omh', 'lib', 'state.mjs'),
        join(__dirname, '..', 'lib', 'state.mjs'),
      ],
    ];
    for (const [installed] of dependencyPairs) rmSync(installed);

    runCli('update', '--runtime', 'claude', '--scope', 'user');

    for (const [installed, source] of dependencyPairs) {
      assert.equal(readFileSync(installed, 'utf8'), readFileSync(source, 'utf8'));
    }
    const cleanProject = join(TMP, 'updated-user-hook-project');
    mkdirSync(cleanProject, { recursive: true });
    const result = runInstalledClaudeDangerousHook(cleanProject);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
      'deny',
    );
  });

  it('preflights Claude guidance before a both-runtime update mutates Codex', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');
    const guidancePath = join(TMP, '.claude', 'CLAUDE.md');
    const rolePath = join(TMP, '.codex', 'agents', 'standard.toml');
    writeFileSync(
      guidancePath,
      '# custom\n<!-- HARNESS:START -->\nunterminated\n',
    );
    writeFileSync(rolePath, 'drifted-role\n');
    const protectedPaths = [
      guidancePath,
      rolePath,
      join(TMP, '.claude', 'settings.local.json'),
      join(TMP, '.codex', 'hooks.json'),
      join(TMP, '.codex', 'config.toml'),
      join(TMP, 'AGENTS.md'),
      join(TMP, '.claude', '.omh', 'codex-ownership.json'),
      join(TMP, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs'),
    ];
    const before = protectedPaths.map(fileState);

    const result = runCliResult(
      ['update', '--runtime', 'both', '--scope', 'project'],
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /incomplete.*markers/i);
    assert.deepEqual(protectedPaths.map(fileState), before);
  });
});

describe('cli scope validation', () => {
  it('rejects missing, invalid, duplicate, and conflicting scope selectors before reset mutation', () => {
    const invalidArguments = [
      ['--scope'],
      ['--scope', 'banana'],
      ['--scope=project'],
      ['--scope', 'project', '--scope', 'project'],
      ['--scope', 'project', '--global'],
    ];

    for (const [index, scopeArguments] of invalidArguments.entries()) {
      const project = join(TMP, `invalid-scope-${index}`);
      mkdirSync(project, { recursive: true });
      runCliIn(project, 'init', '--runtime', 'codex', '--scope', 'project');

      const protectedPaths = [
        join(project, '.codex', 'hooks.json'),
        join(project, '.codex', 'config.toml'),
        join(project, 'AGENTS.md'),
        join(project, '.codex', 'agents', 'quick.toml'),
        join(project, '.agents', 'skills', 'omh-loop', 'SKILL.md'),
        join(project, '.claude', '.omh', 'codex-ownership.json'),
        join(project, '.claude', '.omh', 'runtime', 'hooks', 'codex', 'run.mjs'),
        join(project, '.claude', '.omh', 'harness.config.json'),
      ];
      const before = protectedPaths.map(path => readFileSync(path, 'utf8'));

      const result = runCliResult(
        ['reset', '--runtime', 'codex', ...scopeArguments],
        project,
      );

      assert.notEqual(result.status, 0, scopeArguments.join(' '));
      assert.match(result.stdout + result.stderr, /scope/i);
      assert.deepEqual(
        protectedPaths.map(path => readFileSync(path, 'utf8')),
        before,
        `reset must preserve bytes for ${scopeArguments.join(' ')}`,
      );
    }
  });
});

describe('cli --version', () => {
  it('prints version number', () => {
    const output = runCli('--version');
    assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('prints version with -v flag', () => {
    const output = runCli('-v');
    assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
  });
});

describe('cli unknown command', () => {
  it('shows error for unknown command', () => {
    assert.throws(() => runCli('foobar'), /Unknown command/);
  });

  it('shows help with --help flag', () => {
    const output = runCli('--help');
    assert.ok(output.includes('oh-my-harness'));
    assert.ok(output.includes('init'));
    assert.ok(output.includes('usage'));
    assert.ok(output.includes('--runtime claude|codex|both'));
    assert.match(output, /default.*claude/i);
    for (const lifecycle of ['init', 'update', 'status', 'reset']) {
      assert.match(
        output,
        new RegExp(`${lifecycle}[^\\n]+--scope project\\|user`),
        `${lifecycle} documents explicit scope`,
      );
    }
  });
});
