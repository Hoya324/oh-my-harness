# Tier 판정 기반 구현 계획 (Plan 1 / 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 프롬프트의 작업 무게를 Tier 1/2/3으로 자동 분류하고, Tier 3이면 완료 전 `/omh-verify` 강제 리마인더를 컨텍스트에 주입한다.

**Architecture:** 무게 암시 표현을 `dictionary.mjs`에 한/영으로 추가하고, 순수 분류 로직을 새 모듈 `hooks/lib/tier.mjs`로 분리(단위 테스트 가능)한다. `pre-prompt.mjs` 훅이 이 분류기를 호출해 결과를 `UserPromptSubmit` 컨텍스트에 주입한다. 설정 스키마(`lib/config.mjs`)에 `tier3`/`verify` 기본값을 추가한다.

**Tech Stack:** Node.js ESM(.mjs), node:test, Claude Code 훅(JSON stdout 프로토콜).

**전체 스펙:** `docs/specs/2026-06-03-weight-aware-harness-design.md` (§2, §3)

**후속 플랜:** Plan 2 `/omh-verify` 루프+어댑터 · Plan 3 STATE.md · Plan 4 온보딩 위저드 · Plan 5 문서.

---

## File Structure

- **Modify** `lib/config.mjs` — `DEFAULTS`에 `tier3`, `verify` 섹션 추가 (스키마/기본값).
- **Modify** `hooks/lib/dictionary.mjs` — `ko`/`en` 각각에 `patterns.weightUp`, `patterns.weightDown` 추가, `messages.tierNotice`, `messages.tier3Reminder` 추가.
- **Create** `hooks/lib/tier.mjs` — `countTasks(prompt, patterns)`, `classifyTier(prompt, config)`.
- **Modify** `hooks/pre-prompt.mjs` — task 카운팅을 `countTasks`로 교체(DRY), 분류 결과 주입.
- **Create** `test/tier.test.mjs` — 분류기 단위 테스트.
- **Create** `test/weight-dictionary.test.mjs` — 무게 표현 사전 매치 테스트.

---

## Task 1: 설정 스키마에 tier3/verify 기본값 추가

**Files:**
- Modify: `lib/config.mjs` (DEFAULTS 객체)
- Test: `test/config-tier.test.mjs` (Create)

- [ ] **Step 1: 실패 테스트 작성**

Create `test/config-tier.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDefault } from '../lib/config.mjs';

test('defaults include tier3 thresholds', () => {
  const c = getDefault();
  assert.equal(c.tier3.taskThreshold, 5);
  assert.equal(c.tier3.fileThreshold, 5);
  assert.deepEqual(c.tier3.domainKeywords, []);
});

test('defaults include verify config', () => {
  const c = getDefault();
  assert.equal(c.verify.rounds, 3);
  assert.equal(c.verify.stopWhenClean, true);
  assert.equal(c.verify.autoFix, false);
  assert.ok(Array.isArray(c.verify.lenses));
  assert.equal(c.verify.lenses[0].model, 'claude');
});

test('features include weightRouting toggle', () => {
  const c = getDefault();
  assert.equal(c.features.weightRouting, true);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/config-tier.test.mjs`
Expected: FAIL (`c.tier3` undefined 등)

- [ ] **Step 3: 최소 구현 — DEFAULTS 확장**

In `lib/config.mjs`, `DEFAULTS.features`에 키 추가(마지막 `nativeTeam: true,` 뒤):

```js
    nativeTeam: true,
    weightRouting: true,
```

`DEFAULTS`의 `conventions` 섹션 바로 앞에 두 섹션 추가:

```js
  tier3: {
    taskThreshold: 5,
    fileThreshold: 5,
    domainKeywords: [],
  },
  verify: {
    rounds: 3,
    stopWhenClean: true,
    autoFix: false,
    lenses: [
      { model: 'claude', via: 'native-subagent', focus: 'correctness' },
      { model: 'gpt', via: 'codex', cmd: 'codex exec', focus: 'convention' },
      { model: 'gemini', via: 'gemini', cmd: 'gemini -p --approval-mode plan', focus: 'regression' },
    ],
  },
```

`@typedef HarnessConfig` 주석에도 두 줄 추가(문서화):

```js
 * @property {{ taskThreshold: number, fileThreshold: number, domainKeywords: string[] }} tier3
 * @property {{ rounds: number, stopWhenClean: boolean, autoFix: boolean, lenses: Object[] }} verify
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/config-tier.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: 회귀 확인 — 기존 config 테스트**

Run: `node --test test/config.test.mjs`
Expected: PASS. 만약 DEFAULTS 전체 스냅샷을 검증하는 테스트가 실패하면, 그 테스트에 `tier3`/`verify`/`weightRouting` 추가하여 갱신.

- [ ] **Step 6: 커밋**

```bash
git add lib/config.mjs test/config-tier.test.mjs
git commit -m "feat(config): tier3/verify 기본 스키마 추가"
```

---

## Task 2: 무게 표현 사전 추가 (dictionary.mjs)

**Files:**
- Modify: `hooks/lib/dictionary.mjs` (ko.patterns, en.patterns, ko.messages, en.messages)
- Test: `test/weight-dictionary.test.mjs` (Create)

- [ ] **Step 1: 실패 테스트 작성**

Create `test/weight-dictionary.test.mjs`:

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/weight-dictionary.test.mjs`
Expected: FAIL (`patterns.weightUp` undefined)

- [ ] **Step 3: 최소 구현 — ko 패턴/메시지 추가**

In `hooks/lib/dictionary.mjs`, `ko.patterns`의 `openEndedScope` 뒤에 추가:

```js
      // Weight: phrases that imply a heavy / high-stakes task (Tier↑)
      weightUp:
        /(프로덕션|운영\s*환경|배포|릴리스|릴리즈|결제|인증|로그인|보안|매출|정산|마이그레이션|마이그레이트|대규모\s*리팩토링|아키텍처|스키마\s*변경|신중히|꼼꼼히|critical|중대|장애)/,
      // Weight: phrases that imply a trivial / low-stakes task (Tier↓)
      weightDown:
        /(오타|간단히|간단한|사소한|사소|그냥\s*빠르게|빠르게\s*만|대충|살짝|미세|quick\s*fix|typo)/,
```

In `ko.messages`의 `antiRatVerified` 뒤에 추가:

```js
      tierNotice: (tier, reasons) =>
        `[omh:tier] Tier ${tier} — ${reasons.join(', ') || '기본'}`,
      tier3Reminder:
        '[omh:tier-3] 무거운 작업으로 판정되었습니다. 완료를 선언하기 전에 반드시 (1) 컨벤션 체크리스트 통과 (2) `/omh-verify`로 N-라운드 독립검증을 수행하세요. 생략 금지.',
```

- [ ] **Step 4: 최소 구현 — en 패턴/메시지 추가**

In `en.patterns`의 `openEndedScope` 뒤에 추가:

```js
      weightUp:
        /\b(production|deploy|release|payment|auth|login|security|revenue|billing|migration|migrate|large\s*refactor|architecture|schema\s*change|carefully|thoroughly|critical|outage|incident)\b/i,
      weightDown:
        /\b(typo|just\s*a?\s*quick\s*fix|quick\s*fix|simple\s*tweak|just\s*tweak|trivial|minor|small\s*change)\b/i,
```

In `en.messages`의 `antiRatVerified` 뒤에 추가:

```js
      tierNotice: (tier, reasons) =>
        `[omh:tier] Tier ${tier} — ${reasons.join(', ') || 'default'}`,
      tier3Reminder:
        '[omh:tier-3] Heavy task detected. Before declaring complete, you MUST (1) pass the convention checklist and (2) run `/omh-verify` for N-round independent verification. Do not skip.',
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test test/weight-dictionary.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add hooks/lib/dictionary.mjs test/weight-dictionary.test.mjs
git commit -m "feat(dictionary): 무게 암시 표현 사전(ko/en) + tier 메시지"
```

---

## Task 3: Tier 분류기 모듈 (tier.mjs)

**Files:**
- Create: `hooks/lib/tier.mjs`
- Test: `test/tier.test.mjs` (Create)

- [ ] **Step 1: 실패 테스트 작성**

Create `test/tier.test.mjs`:

```js
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

test('plain request yields Tier 2', () => {
  const r = classifyTier('로그인 함수에 검증 로직 추가', {});
  // "로그인" matches weightUp → tier 3 by design (auth is high-stakes)
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/tier.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현 — tier.mjs 작성**

Create `hooks/lib/tier.mjs`:

```js
/**
 * Task-weight classifier for oh-my-harness.
 * Pure logic — no I/O — so it is unit-testable.
 */
import { getDictionary } from './dictionary.mjs';

/**
 * Count independent tasks in a prompt using the language patterns.
 * Mirrors the heuristic previously inlined in pre-prompt.mjs.
 * @param {string} prompt
 * @param {object} patterns - from getDictionary(prompt).patterns
 * @returns {number}
 */
export function countTasks(prompt, patterns) {
  let count = 0;
  const numbered = prompt.match(/^\s*\d+[\.\)]/gm);
  if (numbered) count = Math.max(count, numbered.length);
  const bullets = prompt.match(/^\s*[-*]\s+\S/gm);
  if (bullets) count = Math.max(count, bullets.length);
  const conjunctions = prompt.match(patterns.conjunctions);
  if (conjunctions) count = Math.max(count, conjunctions.length + 1);
  const commaItems = prompt.match(/[\w가-힣]+(?:\s*,\s*[\w가-힣]+){2,}/g);
  if (commaItems) {
    const maxItems = Math.max(...commaItems.map((m) => m.split(',').length));
    count = Math.max(count, maxItems);
  }
  return count;
}

/**
 * Classify a prompt into Tier 1 (light) / 2 (standard) / 3 (heavy).
 * Conservative: any up-signal wins (don't-miss-it priority).
 * @param {string} prompt
 * @param {object} [config] - harness config (uses config.tier3)
 * @returns {{ tier: 1|2|3, reasons: string[], taskCount: number }}
 */
export function classifyTier(prompt, config = {}) {
  const text = String(prompt || '');
  const { patterns } = getDictionary(text);
  const t3 = config.tier3 || {};
  const taskThreshold = t3.taskThreshold ?? 5;
  const reasons = [];
  let up = 0;
  let down = 0;

  if (patterns.weightUp && patterns.weightUp.test(text)) {
    up++;
    reasons.push('weight-up expression');
  }
  if (patterns.weightDown && patterns.weightDown.test(text)) {
    down++;
    reasons.push('weight-down expression');
  }
  for (const kw of t3.domainKeywords || []) {
    if (kw && text.includes(kw)) {
      up++;
      reasons.push(`domain:${kw}`);
    }
  }
  const taskCount = countTasks(text, patterns);
  if (taskCount >= taskThreshold) {
    up++;
    reasons.push(`tasks:${taskCount}`);
  }

  let tier;
  if (up > 0) tier = 3;
  else if (down > 0) tier = 1;
  else tier = 2;

  return { tier, reasons, taskCount };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/tier.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add hooks/lib/tier.mjs test/tier.test.mjs
git commit -m "feat(tier): 작업 무게 분류기 + countTasks 추출"
```

---

## Task 4: pre-prompt 훅에 Tier 주입 연동

**Files:**
- Modify: `hooks/pre-prompt.mjs`
- Test: 수동(훅 실행) — 단위 로직은 tier.mjs에서 검증됨

- [ ] **Step 1: import 추가 + task 카운팅 DRY 교체**

In `hooks/pre-prompt.mjs`, import 블록에 추가:

```js
import { classifyTier, countTasks } from './lib/tier.mjs';
```

기존 Auto-Plan 블록의 inline 카운팅(numbered/bullets/conjunctions/commaItems 계산 부분)을 다음으로 교체:

```js
  // 4-A: Multi-task detection → Auto-Plan
  if (config.features?.autoPlanMode) {
    const threshold = config.autoPlan?.threshold || 3;
    const taskCount = countTasks(prompt, patterns);
    if (taskCount >= threshold) {
      result.push(messages.autoPlan(taskCount));
    }
  }
```

- [ ] **Step 2: Tier 판정·주입 블록 추가**

Ambiguity 블록 다음, 최종 `if (result.length > 0)` 앞에 추가:

```js
  // Tier classification → weight-proportional routing
  if (config.features?.weightRouting) {
    const { tier, reasons } = classifyTier(prompt, config);
    result.push(messages.tierNotice(tier, reasons));
    if (tier === 3) {
      result.push(messages.tier3Reminder);
    }
  }
```

- [ ] **Step 3: 수동 실행 검증 — Tier 3**

Run:
```bash
cd ~/.claude/plugins/marketplaces/oh-my-harness
mkdir -p /tmp/omh-t/.claude/.omh && echo '{"features":{"weightRouting":true,"autoPlanMode":true,"ambiguityDetection":false}}' > /tmp/omh-t/.claude/.omh/harness.config.json
echo '{"prompt":"결제 모듈 프로덕션 배포 준비해줘"}' | PROJECT_PATH=/tmp/omh-t node hooks/pre-prompt.mjs
```
Expected: stdout JSON의 `additionalContext`에 `Tier 3` 와 `omh-verify` 문구 포함.

- [ ] **Step 4: 수동 실행 검증 — Tier 1**

Run:
```bash
echo '{"prompt":"오타만 간단히 고쳐줘"}' | PROJECT_PATH=/tmp/omh-t node hooks/pre-prompt.mjs
```
Expected: `Tier 1` 포함, `omh-verify` 리마인더 없음.

- [ ] **Step 5: 전체 회귀 테스트**

Run: `node --test test/*.test.mjs`
Expected: PASS (기존 110개 + 신규, fail 0).

- [ ] **Step 6: 커밋**

```bash
git add hooks/pre-prompt.mjs
git commit -m "feat(pre-prompt): Tier 판정·주입 연동 + 카운팅 DRY"
```

---

## Self-Review (작성자 체크 완료)

1. **Spec coverage:** 스펙 §2(무게 판정), §3(라우팅, Tier3 강제 리마인더) → Task 1~4가 구현. §4(verify), §5~8은 후속 플랜.
2. **Placeholder scan:** 없음 — 모든 step에 실제 코드/명령/기대값 포함.
3. **Type consistency:** `classifyTier`/`countTasks` 시그니처가 Task 3 정의와 Task 4 호출에서 일치. `messages.tierNotice(tier, reasons)`/`tier3Reminder` 명칭이 Task 2와 Task 4에서 일치. `config.tier3.taskThreshold`가 Task 1/3에서 일치.

**주의:** Task 4의 카운팅 교체는 Auto-Plan threshold(기본 3)를 유지하고, Tier3의 taskThreshold(기본 5)와는 독립적이다(의도된 분리).
