import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '__tmp_hooks');
const HOOKS_DIR = join(__dirname, '..', 'hooks');

function runHook(hookFile, stdinData, env = {}) {
  const input = typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData);
  const result = execFileSync('node', [join(HOOKS_DIR, hookFile)], {
    input,
    env: { ...process.env, PROJECT_PATH: TMP, ...env },
    encoding: 'utf8',
    timeout: 10000,
  });
  return result.trim();
}

function parseHookOutput(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function getContext(raw) {
  const parsed = parseHookOutput(raw);
  if (!parsed || typeof parsed === 'string') return '';
  return parsed.hookSpecificOutput?.additionalContext || parsed.systemMessage || '';
}

function writeConfig(config) {
  const dir = join(TMP, '.claude', '.omh');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'harness.config.json'), JSON.stringify(config));
}

beforeEach(() => { mkdirSync(TMP, { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

// --- pre-prompt ---
describe('pre-prompt hook', () => {
  it('detects multi-task numbered list', () => {
    writeConfig({
      features: { autoPlanMode: true, ambiguityDetection: false },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: '1. 로그인 기능 추가\n2. 테스트 작성\n3. API 문서 업데이트\n4. 배포 스크립트 수정',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('4개의 독립 작업'));
    assert.ok(ctx.includes('plan 모드'));
  });

  it('stays silent for simple single task', () => {
    writeConfig({
      features: { autoPlanMode: true, ambiguityDetection: false },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: 'UserService.ts 파일에서 getUser 함수의 에러 핸들링을 수정해줘',
    });
    assert.equal(raw, '');
  });

  it('detects ambiguous request', () => {
    writeConfig({
      features: { autoPlanMode: false, ambiguityDetection: true },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: '이거 리팩토링해줘',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('모호합니다'));
  });

  it('does not flag specific request as ambiguous', () => {
    writeConfig({
      features: { autoPlanMode: false, ambiguityDetection: true },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: 'src/utils/date.ts 파일의 formatDate 함수를 dayjs로 리팩토링해줘',
    });
    assert.equal(raw, '');
  });

  it('is silent when DISABLE_HARNESS is set', () => {
    writeConfig({
      features: { autoPlanMode: true, ambiguityDetection: true },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: '1. a\n2. b\n3. c',
    }, { DISABLE_HARNESS: '1' });
    const parsed = parseHookOutput(raw);
    assert.ok(!parsed || parsed.suppressOutput === true);
  });

  it('detects English ambiguous request', () => {
    writeConfig({
      features: { autoPlanMode: false, ambiguityDetection: true },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: 'fix it',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('모호합니다') || ctx.includes('ambiguous') || ctx.length > 0);
  });

  it('detects English multi-task list', () => {
    writeConfig({
      features: { autoPlanMode: true, ambiguityDetection: false },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: '1. Add login feature\n2. Write tests\n3. Update docs\n4. Fix deploy script',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('4'));
  });

  it('detects comma-separated tasks (Korean)', () => {
    writeConfig({
      features: { autoPlanMode: true, ambiguityDetection: false },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: '기능, 성능, 컨벤션을 확인해줘',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('3개의 독립 작업') || ctx.includes('3'));
  });

  it('detects comma-separated tasks (English)', () => {
    writeConfig({
      features: { autoPlanMode: true, ambiguityDetection: false },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: 'Check features, performance, conventions in the current branch',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('3'));
  });

  it('detects open-ended scope with 등 as ambiguous', () => {
    writeConfig({
      features: { autoPlanMode: false, ambiguityDetection: true },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: '기능, 성능, 등을 확인해서 리뷰해줘',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('모호합니다'));
  });

  it('fires both auto-plan and ambiguity for complex vague request', () => {
    writeConfig({
      features: { autoPlanMode: true, ambiguityDetection: true },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: '현재 브랜치에 있는 기능, 성능, 컨벤션, 등을 확인해서 리뷰해줘',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('auto-plan'), 'should detect multi-task');
    assert.ok(ctx.includes('ambiguity-guard'), 'should detect ambiguity');
  });

  it('uses English messages for English prompts', () => {
    writeConfig({
      features: { autoPlanMode: false, ambiguityDetection: true },
      autoPlan: { threshold: 3 },
      ambiguityDetection: { threshold: 2 },
    });
    const raw = runHook('pre-prompt.mjs', {
      prompt: 'review it etc.',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('ambiguous') || ctx.includes('AskUserQuestion'));
  });
});

// --- post-task ---
describe('post-task hook', () => {
  it('reminds about tests when code changes detected', () => {
    writeConfig({
      features: { testEnforcement: true },
      testEnforcement: { minCases: 3, promptOnMissing: true },
    });
    const raw = runHook('post-task.mjs', {
      tool_name: 'Edit',
      transcript: 'Modified src/service.ts',
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('코드 변경이 감지'));
    assert.ok(ctx.includes('3개'));
  });

  it('stays silent when no code changes', () => {
    writeConfig({
      features: { testEnforcement: true },
      testEnforcement: { minCases: 2, promptOnMissing: true },
    });
    const raw = runHook('post-task.mjs', {
      tool_name: 'Read',
      transcript: 'Read some files',
    });
    assert.equal(raw, '');
  });

  it('stays silent when testEnforcement disabled', () => {
    writeConfig({
      features: { testEnforcement: false },
      testEnforcement: { minCases: 2 },
    });
    const raw = runHook('post-task.mjs', { tool_name: 'Edit' });
    const parsed = parseHookOutput(raw);
    assert.ok(!parsed || parsed.suppressOutput === true);
  });
});

// --- session-start ---
describe('session-start hook', () => {
  it('detects Node.js conventions', () => {
    writeConfig({ features: { conventionSetup: true } });
    writeFileSync(join(TMP, 'package.json'), JSON.stringify({
      devDependencies: { jest: '^29.0.0', eslint: '^8.0.0' },
    }));
    const raw = runHook('session-start.mjs', {});
    const ctx = getContext(raw);
    assert.ok(ctx.includes('node'));
    assert.ok(ctx.includes('jest'));
  });

  it('is silent for unknown project type', () => {
    writeConfig({ features: { conventionSetup: true } });
    const raw = runHook('session-start.mjs', {});
    assert.equal(raw, '');
  });
});

// --- dangerous-guard ---
describe('dangerous-guard hook', () => {
  it('warns on rm -rf', () => {
    writeConfig({ features: { dangerousGuard: true } });
    const raw = runHook('dangerous-guard.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/important' },
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('WARNING'));
    assert.ok(ctx.includes('rm -rf'));
  });

  it('warns on git push --force', () => {
    writeConfig({ features: { dangerousGuard: true } });
    const raw = runHook('dangerous-guard.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main --force' },
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('git push --force'));
  });

  it('warns on writing .env file', () => {
    writeConfig({ features: { dangerousGuard: true } });
    const raw = runHook('dangerous-guard.mjs', {
      tool_name: 'Write',
      tool_input: { file_path: '/project/.env.production' },
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('.env'));
  });

  it('stays silent for safe commands', () => {
    writeConfig({ features: { dangerousGuard: true } });
    const raw = runHook('dangerous-guard.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
    });
    assert.equal(raw, '');
  });

  it('stays silent when disabled', () => {
    writeConfig({ features: { dangerousGuard: false } });
    const raw = runHook('dangerous-guard.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });
    const parsed = parseHookOutput(raw);
    assert.ok(!parsed || parsed.suppressOutput === true);
  });
});

// --- commit-convention ---
describe('commit-convention hook', () => {
  it('outputs convention on git commit', () => {
    writeConfig({
      features: { commitConvention: true },
      commitConvention: { style: 'auto' },
    });
    const raw = runHook('commit-convention.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "test"' },
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('Conventional Commits'));
  });

  it('stays silent for non-commit commands', () => {
    writeConfig({
      features: { commitConvention: true },
      commitConvention: { style: 'auto' },
    });
    const raw = runHook('commit-convention.mjs', {
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
    });
    assert.equal(raw, '');
  });
});

// --- scope-guard ---
describe('scope-guard hook', () => {
  it('warns when file is outside allowed scope', () => {
    writeConfig({
      features: { scopeGuard: true },
      scopeGuard: { allowedPaths: ['src/auth'] },
    });
    const raw = runHook('scope-guard.mjs', {
      tool_name: 'Edit',
      tool_input: { file_path: join(TMP, 'src', 'billing', 'payment.ts') },
    });
    const ctx = getContext(raw);
    assert.ok(ctx.includes('SCOPE WARNING'));
    assert.ok(ctx.includes('src/billing'));
  });

  it('stays silent when file is in allowed scope', () => {
    writeConfig({
      features: { scopeGuard: true },
      scopeGuard: { allowedPaths: ['src/auth'] },
    });
    const raw = runHook('scope-guard.mjs', {
      tool_name: 'Edit',
      tool_input: { file_path: join(TMP, 'src', 'auth', 'login.ts') },
    });
    assert.equal(raw, '');
  });

  it('stays silent when allowedPaths is empty (no restriction)', () => {
    writeConfig({
      features: { scopeGuard: true },
      scopeGuard: { allowedPaths: [] },
    });
    const raw = runHook('scope-guard.mjs', {
      tool_name: 'Edit',
      tool_input: { file_path: join(TMP, 'anywhere', 'file.ts') },
    });
    assert.equal(raw, '');
  });
});

// --- usage-tracker ---
describe('usage-tracker hook', () => {
  it('records tool usage to usage.json', () => {
    writeConfig({ features: { usageTracking: true } });
    runHook('usage-tracker.mjs', {
      tool_name: 'Edit',
      session_id: 'test-session',
    });
    const usagePath = join(TMP, '.claude', '.omh', 'usage.json');
    assert.ok(existsSync(usagePath));
    const usage = JSON.parse(readFileSync(usagePath, 'utf8'));
    assert.equal(usage.sessions['test-session'].tool_counts.Edit, 1);
    assert.equal(usage.sessions['test-session'].total_calls, 1);
  });

  it('increments on repeated calls', () => {
    writeConfig({ features: { usageTracking: true } });
    runHook('usage-tracker.mjs', { tool_name: 'Edit', session_id: 's1' });
    runHook('usage-tracker.mjs', { tool_name: 'Edit', session_id: 's1' });
    runHook('usage-tracker.mjs', { tool_name: 'Bash', session_id: 's1' });
    const usage = JSON.parse(readFileSync(join(TMP, '.claude', '.omh', 'usage.json'), 'utf8'));
    assert.equal(usage.sessions.s1.tool_counts.Edit, 2);
    assert.equal(usage.sessions.s1.tool_counts.Bash, 1);
    assert.equal(usage.sessions.s1.total_calls, 3);
  });

  it('is silent when DISABLE_HARNESS is set', () => {
    writeConfig({ features: { usageTracking: true } });
    const raw = runHook('usage-tracker.mjs', {
      tool_name: 'Edit', session_id: 'disabled-session',
    }, { DISABLE_HARNESS: '1' });
    const parsed = parseHookOutput(raw);
    assert.ok(!parsed || parsed.suppressOutput === true);
    const usagePath = join(TMP, '.claude', '.omh', 'usage.json');
    assert.ok(!existsSync(usagePath));
  });
});

// --- pre-compact ---
describe('pre-compact hook', () => {
  it('saves context snapshot and outputs systemMessage', () => {
    writeConfig({ features: { contextSnapshot: true } });
    const raw = runHook('pre-compact.mjs', { summary: 'Working on auth module' });
    const parsed = parseHookOutput(raw);
    assert.ok(parsed.systemMessage.includes('omh'));
    const snapshotPath = join(TMP, '.claude', '.omh', 'context-snapshot.md');
    assert.ok(existsSync(snapshotPath));
    const snapshot = readFileSync(snapshotPath, 'utf8');
    assert.ok(snapshot.includes('auth module'));
  });
});
