import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { installPrePush, uninstallPrePush, prePushScript, MARKER } from '../lib/docs-sync.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'cli.mjs');
const TMP = join(tmpdir(), `omh_docs_sync_test_${process.pid}`);
const BIN = join(TMP, '__bin');
const HOOK = join(TMP, '.git', 'hooks', 'pre-push');

const gitEnv = () => ({
  ...process.env, HOME: join(TMP, '__home'),
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
});
const git = (...a) => execFileSync('git', a, { cwd: TMP, env: gitEnv(), encoding: 'utf8' });
function write(rel, text) { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }

/** A repo on branch `work` tracking local branch `base`, with one code change. */
function repoWithChange() {
  git('init', '-q', '-b', 'base');
  write('.gitignore', '__bin/\n__home/\n');
  write('docs/guide.md', '# Guide\n');
  write('src/a.js', 'export const a = 1;\n');
  git('add', '-A'); git('commit', '-q', '-m', 'init');
  git('checkout', '-q', '-b', 'work');
  git('branch', '-q', '-u', 'base');
  write('src/a.js', 'export const a = 2;\n');
  git('commit', '-qam', 'change');
}

/** Fake `claude` on PATH: records its prompt and optionally edits a doc. */
function fakeClaude({ editDoc = false, fail = false } = {}) {
  mkdirSync(BIN, { recursive: true });
  const body = [
    '#!/bin/sh',
    `printf '%s' "$2" > "${join(TMP, '__bin', 'prompt.txt')}"`,
    `printf '%s' "$*" > "${join(TMP, '__bin', 'args.txt')}"`,
    editDoc ? `echo "updated" >> "${join(TMP, 'docs', 'guide.md')}"` : '',
    fail ? 'exit 3' : 'exit 0',
  ].join('\n');
  writeFileSync(join(BIN, 'claude'), body);
  chmodSync(join(BIN, 'claude'), 0o755);
}
function runPrePush(extraEnv = {}, pathPrefix = BIN) {
  return spawnSync('sh', [HOOK], {
    cwd: TMP, encoding: 'utf8',
    env: { ...gitEnv(), PATH: `${pathPrefix}:/usr/bin:/bin`, ...extraEnv },
  });
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('docs-sync install', () => {
  it('installs an executable, marked pre-push hook', () => {
    repoWithChange();
    const r = installPrePush(TMP);
    assert.equal(r.ok, true);
    assert.ok(readFileSync(HOOK, 'utf8').includes(MARKER));
  });

  it('refuses to replace a foreign pre-push hook unless forced, and never uninstalls one', () => {
    repoWithChange();
    write('.git/hooks/pre-push', '#!/bin/sh\necho mine\n');
    assert.equal(installPrePush(TMP).ok, false);
    assert.equal(uninstallPrePush(TMP).ok, false);
    assert.match(readFileSync(HOOK, 'utf8'), /echo mine/);
    assert.equal(installPrePush(TMP, { force: true }).ok, true);
    assert.equal(uninstallPrePush(TMP).ok, true);
    assert.equal(existsSync(HOOK), false);
  });

  it('reports a non-git directory', () => {
    assert.equal(installPrePush(TMP).ok, false);
  });

  it('CLI --install / --print', () => {
    repoWithChange();
    execFileSync('node', [CLI, 'docs-sync', '--install'], { cwd: TMP, env: gitEnv(), encoding: 'utf8' });
    assert.ok(existsSync(HOOK));
    const printed = execFileSync('node', [CLI, 'docs-sync', '--print'], { cwd: TMP, env: gitEnv(), encoding: 'utf8' });
    assert.equal(printed, prePushScript());
  });
});

describe('pre-push behavior', () => {
  beforeEach(() => { repoWithChange(); installPrePush(TMP); });

  it('passes the changed code files (not docs) to /omh-docs-sync with read/edit tools only', () => {
    fakeClaude();
    const r = runPrePush();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const prompt = readFileSync(join(BIN, 'prompt.txt'), 'utf8');
    assert.ok(prompt.startsWith('/omh-docs-sync'));
    assert.match(prompt, /src\/a\.js/);
    assert.match(readFileSync(join(BIN, 'args.txt'), 'utf8'), /--allowedTools Read,Grep,Glob,Edit/);
  });

  it('stops the push when docs were edited, so they get committed with the code', () => {
    fakeClaude({ editDoc: true });
    const r = runPrePush();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /docs were updated/);
  });

  it('never blocks the push when claude is missing, fails, or is skipped', () => {
    assert.equal(runPrePush({}, join(TMP, '__nothing')).status, 0, 'no claude on PATH');
    fakeClaude({ fail: true });
    assert.equal(runPrePush().status, 0, 'claude failed');
    fakeClaude({ editDoc: true });
    assert.equal(runPrePush({ OMH_DOCS_SYNC: '0' }).status, 0, 'skipped');
  });
});
