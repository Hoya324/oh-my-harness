import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
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
  });

  it('installs both runtime registrations while sharing state', () => {
    runCli('init', '--runtime', 'both', '--scope', 'project');

    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
    assert.ok(existsSync(join(TMP, '.claude', 'CLAUDE.md')));
    assert.ok(existsSync(join(TMP, '.codex', 'hooks.json')));
    assert.ok(existsSync(join(TMP, 'AGENTS.md')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh', 'harness.config.json')));
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
      .find(handler => handler.command.includes('dangerous-guard.mjs'));
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

  it('reset both at user scope removes user and project shared state', () => {
    runCli('init', '--runtime', 'both', '--scope', 'user');
    assert.ok(existsSync(join(TEST_HOME, '.claude', '.omh')));
    assert.ok(existsSync(join(TMP, '.claude', '.omh')));

    runCli('reset', '--runtime', 'both', '--scope', 'user');

    assert.ok(!existsSync(join(TEST_HOME, '.claude', '.omh')));
    assert.ok(!existsSync(join(TMP, '.claude', '.omh')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'hooks.json')));
    assert.ok(!existsSync(join(TEST_HOME, '.codex', 'agents', 'quick.toml')));
    assert.ok(!existsSync(join(TEST_HOME, '.agents', 'skills', 'omh-loop')));
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
  });
});
