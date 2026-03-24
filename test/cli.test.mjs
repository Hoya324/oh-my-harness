import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '__tmp_cli');
const CLI = join(__dirname, '..', 'bin', 'cli.mjs');

function runCli(...args) {
  return execFileSync('node', [CLI, ...args], {
    cwd: TMP,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, OMH_SKIP_GLOBAL: '1' },
  });
}

beforeEach(() => { mkdirSync(TMP, { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

describe('cli init', () => {
  it('creates all expected files including new hooks', () => {
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
    assert.ok(existsSync(join(TMP, '.claude', 'commands', 'set-harness.md')));
    assert.ok(existsSync(join(TMP, '.claude', 'commands', 'init-project.md')));
    assert.ok(existsSync(join(TMP, '.claude', 'settings.local.json')));
    assert.ok(existsSync(join(TMP, '.claude', 'CLAUDE.md')));
  });

  it('registers all hook events in settings.local.json', () => {
    runCli('init');
    const settings = JSON.parse(readFileSync(join(TMP, '.claude', 'settings.local.json'), 'utf8'));
    assert.ok(settings.hooks.SessionStart);
    assert.ok(settings.hooks.UserPromptSubmit);
    assert.ok(settings.hooks.PreToolUse);
    assert.ok(settings.hooks.PostToolUse);
    assert.ok(settings.hooks.PreCompact);
    assert.ok(settings.hooks.Stop);
    // PreToolUse has dangerous-guard
    assert.ok(settings.hooks.PreToolUse[0].hooks[0].command.includes('dangerous-guard.mjs'));
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

  it('adds HARNESS block to CLAUDE.md with new sections', () => {
    runCli('init');
    const md = readFileSync(join(TMP, '.claude', 'CLAUDE.md'), 'utf8');
    assert.ok(md.includes('<!-- HARNESS:START -->'));
    assert.ok(md.includes('<!-- HARNESS:END -->'));
    assert.ok(md.includes('Test Enforcement'));
    assert.ok(md.includes('Ambiguity Guard'));
    assert.ok(md.includes('Dangerous Operation Guard'));
    assert.ok(md.includes('Commit Convention'));
    assert.ok(md.includes('Scope Guard'));
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
  });
});
