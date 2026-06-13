import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDictionary } from '../hooks/lib/dictionary.mjs';

test('ko: weightUp matches production/critical phrasing', () => {
  const { patterns } = getDictionary('결제 모듈 프로덕션 배포 전에 신중히 봐줘');
  assert.match('결제 모듈 프로덕션 배포 전에 신중히 봐줘', patterns.weightUp);
});

test('ko: weightDown matches trivial phrasing', () => {
  const { patterns } = getDictionary('오타만 간단히 고쳐줘');
  assert.match('오타만 간단히 고쳐줘', patterns.weightDown);
});

test('en: weightUp matches production phrasing', () => {
  const { patterns } = getDictionary('refactor the payment migration carefully before production');
  assert.match('refactor the payment migration carefully before production', patterns.weightUp);
});

test('en: weightDown matches trivial phrasing', () => {
  const { patterns } = getDictionary('just a quick fix for a typo');
  assert.match('just a quick fix for a typo', patterns.weightDown);
});

test('tierNotice and tier3Reminder messages exist', () => {
  const { messages } = getDictionary('아무 텍스트');
  assert.match(messages.tierNotice(3, ['domain:결제']), /Tier 3/);
  assert.match(messages.tier3Reminder, /omh-verify/);
});
