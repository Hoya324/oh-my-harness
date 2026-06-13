import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTier, countTasks } from '../hooks/lib/tier.mjs';
import { getDictionary } from '../hooks/lib/dictionary.mjs';

test('countTasks counts numbered list items', () => {
  const { patterns } = getDictionary('1. a\n2. b\n3. c');
  assert.equal(countTasks('1. a\n2. b\n3. c', patterns), 3);
});

test('weightUp expression forces Tier 3', () => {
  const r = classifyTier('결제 모듈 프로덕션 배포 준비', {});
  assert.equal(r.tier, 3);
});

test('weightDown expression yields Tier 1', () => {
  const r = classifyTier('오타만 간단히 고쳐줘', {});
  assert.equal(r.tier, 1);
});

test('auth keyword (로그인) is high-stakes → Tier 3', () => {
  const r = classifyTier('로그인 함수에 검증 로직 추가', {});
  assert.equal(r.tier, 3);
});

test('neutral request yields Tier 2', () => {
  const r = classifyTier('헤더 컴포넌트 색상 바꿔줘', {});
  assert.equal(r.tier, 2);
});

test('task count over threshold forces Tier 3', () => {
  const prompt = '1. a\n2. b\n3. c\n4. d\n5. e';
  const r = classifyTier(prompt, { tier3: { taskThreshold: 5 } });
  assert.equal(r.tier, 3);
});

test('domain keyword from config forces Tier 3', () => {
  const r = classifyTier('비타민 추천 로직 수정', { tier3: { domainKeywords: ['비타민'] } });
  assert.equal(r.tier, 3);
  assert.ok(r.reasons.some((x) => x.includes('비타민')));
});

test('conflict resolves conservatively upward (up beats down)', () => {
  const r = classifyTier('프로덕션 배포인데 그냥 빠르게', {});
  assert.equal(r.tier, 3);
});
