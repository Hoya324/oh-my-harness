import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { formatFailureOutput, failureSignature } from '../lib/failure-format.mjs';
import { buildLadder, autoCommands } from '../lib/loop.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(tmpdir(), `omh_contract_rung_test_${process.pid}`);
const OMH = join(TMP, '.claude', '.omh');
const HOOKS_DIR = join(__dirname, '..', 'hooks');

const GRADLE_LOG = [
  'Downloading https://services.gradle.org/distributions/gradle-8.5-bin.zip',
  '> Task :compileKotlin',
  'e: file:///work/src/main/kotlin/shop/OrderService.kt:42:17 Unresolved reference: discountRate',
  '> Task :test FAILED',
  'OrderControllerTest > returns 200() FAILED',
  '    org.opentest4j.AssertionFailedError: expected: <200> but was: <404>',
  '        at app//shop.OrderControllerTest.returns 200(OrderControllerTest.kt:58)',
  '        at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)',
  'BUILD FAILED in 12s',
].join('\n');

describe('formatFailureOutput', () => {
  it('keeps file:line lines and drops download/task noise', () => {
    const out = formatFailureOutput(GRADLE_LOG);
    assert.match(out, /OrderService\.kt:42:17 Unresolved reference/);
    assert.match(out, /OrderControllerTest\.kt:58/);
    assert.doesNotMatch(out, /Downloading|> Task|BUILD FAILED in/);
  });

  it('recognizes tsc, eslint, pytest and go locations', () => {
    const out = formatFailureOutput([
      'src/a.ts(3,5): error TS2322',
      'src/b.ts:10:2  error  no-unused-vars',
      'tests/test_c.py:14: AssertionError',
      './d_test.go:7: want 1 got 2',
    ].join('\n'));
    assert.match(out, /src\/a\.ts\(3,5\)/);
    assert.match(out, /src\/b\.ts:10:2/);
    assert.match(out, /tests\/test_c\.py:14/);
    assert.match(out, /d_test\.go:7/);
  });

  it('falls back to error lines from the TAIL when there is no location', () => {
    const raw = `${'noise line\n'.repeat(200)}FATAL: connection refused\nerror: could not reach database\n`;
    const out = formatFailureOutput(raw);
    assert.match(out, /could not reach database/);
    assert.doesNotMatch(out, /noise line/);
  });

  it('caps length and lines', () => {
    const raw = Array.from({ length: 100 }, (_, i) => `src/f${i}.ts:${i}:1 error`).join('\n');
    const out = formatFailureOutput(raw, { maxLines: 5 });
    assert.equal(out.split('\n').length, 5);
    assert.ok(formatFailureOutput(raw, { maxChars: 50 }).length <= 50);
  });

  it('signature is short and stable for the same failure', () => {
    assert.equal(failureSignature(GRADLE_LOG), failureSignature(`noise\n${GRADLE_LOG}`));
    assert.ok(failureSignature(GRADLE_LOG).length <= 120);
  });
});

describe('ladder with a contract rung', () => {
  it('orders quickCheck → contract → verify', () => {
    const ladder = buildLadder({ language: 'node', testFramework: 'jest', linter: 'eslint' }, {
      contractCommand: 'npx openapi-diff old.yaml new.yaml',
      rungTimeoutSec: { quickCheck: 30, contract: 60, verify: 180 },
    });
    assert.deepEqual(ladder.map((r) => r.rung), ['quickCheck', 'contract', 'verify']);
    assert.equal(ladder[1].timeoutSec, 60);
  });

  it('is never auto-detected', () => {
    assert.deepEqual(buildLadder({ language: 'kotlin', buildTool: 'gradle' }, {}).map((r) => r.rung).includes('contract'), false);
  });

  it('gives Kotlin/Gradle a lint quickCheck when ktlint or detekt is configured', () => {
    assert.equal(autoCommands({ language: 'kotlin', buildTool: 'gradle', linter: 'ktlint' }).quickCheck, './gradlew ktlintCheck');
    assert.equal(autoCommands({ language: 'kotlin', buildTool: 'gradle', linter: 'detekt' }).quickCheck, './gradlew detekt');
    assert.equal(autoCommands({ language: 'kotlin', buildTool: 'gradle' }).quickCheck, '');
    assert.equal(autoCommands({ language: 'java', buildTool: 'maven' }).verify, 'mvn -q test');
  });
});

function env() { return { ...process.env, PROJECT_PATH: TMP, HOME: join(TMP, '__home'), USERPROFILE: join(TMP, '__home') }; }
function runHook(file, stdin) {
  return execFileSync('node', [join(HOOKS_DIR, file)], { input: JSON.stringify(stdin), env: env(), encoding: 'utf8', timeout: 15000 }).trim();
}
function writeFile(rel, content = 'x') { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
function writeConfig(c) { mkdirSync(OMH, { recursive: true }); writeFileSync(join(OMH, 'harness.config.json'), JSON.stringify(c)); }
function git(...args) {
  return execFileSync('git', args, { cwd: TMP, env: { ...env(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }, encoding: 'utf8' });
}

describe('hooks surface contract failures with locations', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    git('init', '-q');
    writeFileSync(join(TMP, '.gitignore'), '.claude/\n.gitignore\n__home/\n');
  });
  afterEach(() => rmSync(TMP, { recursive: true, force: true }));

  it('verify-gate blocks on a red contract rung and quotes file:line', () => {
    const script = join(TMP, 'contract.js');
    writeFileSync(script, "console.error('noise');console.error('api/openapi.yaml:120: breaking change: removed /orders/{id}');process.exit(1)");
    writeConfig({
      features: { verifyGate: true },
      verifyGate: {
        riskThreshold: 2, maxBlocks: 2, runLadder: true, largeFiles: 8, largeLines: 400,
        quickCheckCommand: 'node -e "process.exit(0)"', contractCommand: `node ${script}`, verifyCommand: 'node -e "process.exit(0)"',
        sensitivePaths: ['**/payment/**'],
      },
    });
    writeFile('src/payment/charge.ts', 'export const x = 1');
    const parsed = JSON.parse(runHook('verify-gate.mjs', { session_id: 's1', stop_hook_active: false }));
    assert.equal(parsed.decision, 'block');
    assert.match(parsed.reason, /contract \[fail\]/);
    assert.match(parsed.reason, /openapi\.yaml:120: breaking change/);
    assert.doesNotMatch(parsed.reason, /noise/);
  });

  it('post-task flags code that changed without any test changing in the same diff', () => {
    writeConfig({ features: { testEnforcement: true, stateSync: false }, language: 'en' });
    writeFile('src/order.ts', 'export const a = 1');
    writeFile('test/order.test.ts', 'test');
    git('add', '-A'); git('commit', '-q', '-m', 'init');
    writeFile('src/order.ts', 'export const a = 2');
    const out = runHook('post-task.mjs', {});
    assert.match(out, /no test changed in this diff/);
  });

  it('post-task reports verified when a test changed alongside the code', () => {
    writeConfig({ features: { testEnforcement: true, stateSync: false }, language: 'en' });
    writeFile('src/order.ts', 'export const a = 1');
    writeFile('test/order.test.ts', 'test');
    git('add', '-A'); git('commit', '-q', '-m', 'init');
    writeFile('src/order.ts', 'export const a = 2');
    writeFile('test/order.test.ts', 'test 2');
    const out = runHook('post-task.mjs', {});
    assert.match(out, /have tests\. Run tests/);
  });
});
