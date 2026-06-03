# /omh-verify N-라운드 독립검증 구현 계획 (Plan 2 / 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `git diff`를 N회 독립 검증(모델 로테이션)하고 라운드마다 수정하는 `/omh-verify` 루프를 제공한다.

**Architecture:** 순수 헬퍼(`lib/verify.mjs`)와 외부 모델 어댑터(`lib/adapters/{codex,gemini}.mjs`)는 노드 모듈로 단위 테스트하고, 루프 오케스트레이션(라운드 진행·Claude 렌즈·수정 적용)은 `skills/omh-verify/SKILL.md`가 Claude에게 지시한다. 외부 검증자는 읽기 전용으로 호출한다.

**Tech Stack:** Node.js ESM, child_process.spawnSync, node:test, Claude Code skill(markdown).

**전체 스펙:** `docs/specs/2026-06-03-weight-aware-harness-design.md` (§4)

---

## File Structure

- **Create** `lib/verify.mjs` — `isAvailable`, `availableLenses`, `selectLens`, `buildReviewPrompt`, `collectDiff` + CLI(plan/review).
- **Create** `lib/adapters/codex.mjs` — `reviewWithCodex(prompt, opts)`.
- **Create** `lib/adapters/gemini.mjs` — `reviewWithGemini(prompt, opts)`.
- **Create** `skills/omh-verify/SKILL.md` — 루프 오케스트레이션 지시.
- **Create** `test/verify.test.mjs` — 순수 헬퍼 단위 테스트.

---

## Task 1: verify 순수 헬퍼

**Files:**
- Create: `lib/verify.mjs`
- Test: `test/verify.test.mjs`

- [ ] **Step 1: 실패 테스트 작성**

Create `test/verify.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAvailable, availableLenses, selectLens, buildReviewPrompt,
} from '../lib/verify.mjs';

const LENSES = [
  { model: 'claude', via: 'native-subagent', focus: 'correctness' },
  { model: 'gpt', via: 'codex', cmd: 'codex exec', focus: 'convention' },
  { model: 'gemini', via: 'gemini', cmd: 'gemini -p --approval-mode plan', focus: 'regression' },
];

test('isAvailable: real binary true, fake false', () => {
  assert.equal(isAvailable('node'), true);
  assert.equal(isAvailable('nonexistent-cmd-xyz-123'), false);
});

test('selectLens rotates 1-indexed round', () => {
  assert.equal(selectLens(1, LENSES).model, 'claude');
  assert.equal(selectLens(2, LENSES).model, 'gpt');
  assert.equal(selectLens(4, LENSES).model, 'claude');
  assert.equal(selectLens(1, []), null);
});

test('availableLenses always keeps claude, filters missing CLIs', () => {
  const fake = [
    { model: 'claude', via: 'native-subagent' },
    { model: 'ghost', cmd: 'nonexistent-cmd-xyz-123 run' },
  ];
  const got = availableLenses(fake);
  assert.equal(got.length, 1);
  assert.equal(got[0].model, 'claude');
});

test('buildReviewPrompt includes focus, diff, and sentinel', () => {
  const p = buildReviewPrompt({ diff: 'DIFFBODY', spec: 'SPEC', focus: 'convention' });
  assert.match(p, /convention/);
  assert.match(p, /DIFFBODY/);
  assert.match(p, /NO ISSUES FOUND/);
  assert.match(p, /SPEC/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/verify.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현 — lib/verify.mjs**

Create `lib/verify.mjs`:

```js
/**
 * /omh-verify helpers — diff collection, model availability, lens rotation,
 * review-prompt construction. Pure/inspectable so they are unit-testable.
 */
import { spawnSync } from 'child_process';
import { reviewWithCodex } from './adapters/codex.mjs';
import { reviewWithGemini } from './adapters/gemini.mjs';

/** Is `cmd`'s first token an executable on PATH? */
export function isAvailable(cmd) {
  const bin = String(cmd || '').trim().split(/\s+/)[0];
  if (!bin) return false;
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}

/** Keep claude/native lenses always; drop external lenses whose CLI is absent. */
export function availableLenses(lenses = []) {
  return lenses.filter((l) => {
    if (l.model === 'claude' || l.via === 'native-subagent') return true;
    return isAvailable(l.cmd || l.model);
  });
}

/** 1-indexed round → lens (rotation). Returns null if no lenses. */
export function selectLens(round, lenses = []) {
  if (!lenses.length) return null;
  return lenses[(round - 1) % lenses.length];
}

/** Compose an independent-review prompt for a single lens. */
export function buildReviewPrompt({ diff, spec = '', focus = 'correctness' }) {
  return [
    `You are an INDEPENDENT code reviewer. Review focus: ${focus}.`,
    spec ? `Task spec / intent:\n${spec}\n` : '',
    `Review ONLY the diff below. Report concrete, actionable issues as a numbered list (file:line where possible).`,
    `If and only if you find no real issues, respond with exactly: NO ISSUES FOUND.`,
    `\n--- DIFF ---\n${diff}`,
  ].filter(Boolean).join('\n');
}

/** git diff against `base` (default working tree vs HEAD). */
export function collectDiff({ base = 'HEAD', cwd = process.cwd() } = {}) {
  const r = spawnSync('git', ['diff', base], {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : '';
}

/** Run one external lens against a prompt. Returns { ok, output, error }. */
export function runExternalLens(lens, prompt, opts = {}) {
  if (lens.via === 'codex' || lens.model === 'gpt') return reviewWithCodex(prompt, opts);
  if (lens.via === 'gemini' || lens.model === 'gemini') return reviewWithGemini(prompt, opts);
  return { ok: false, output: '', error: `unknown lens: ${lens.model}` };
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'plan') {
    const diff = collectDiff();
    const out = { diffPresent: diff.length > 0, diffBytes: diff.length };
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (cmd === 'review') {
    const get = (flag, def) => {
      const i = argv.indexOf(flag);
      return i >= 0 ? argv[i + 1] : def;
    };
    const model = get('--model', 'gpt');
    const focus = get('--focus', 'correctness');
    const base = get('--base', 'HEAD');
    const diff = collectDiff({ base });
    if (!diff) { console.log('NO DIFF'); return; }
    const prompt = buildReviewPrompt({ diff, focus });
    const lens = { model, via: model === 'gemini' ? 'gemini' : 'codex' };
    const res = runExternalLens(lens, prompt);
    console.log(res.ok ? res.output : `LENS ERROR: ${res.error}`);
    return;
  }
  console.log('usage: verify.mjs <plan|review [--model gpt|gemini] [--focus X] [--base ref]>');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/verify.test.mjs`
Expected: PASS (4 tests). (어댑터 모듈은 Task 2에서 생성하므로, Task 2를 먼저 만들거나 동시에 작성 — 아래 순서 주의)

> **순서 주의:** `lib/verify.mjs`가 어댑터를 import하므로 Task 2(어댑터)를 먼저 생성한 뒤 이 테스트를 실행한다. 본 계획은 Task 2 → Task 1 순으로 실행할 것.

- [ ] **Step 5: 커밋** (Task 2 직후 함께)

---

## Task 2: 외부 모델 어댑터 (먼저 생성)

**Files:**
- Create: `lib/adapters/codex.mjs`
- Create: `lib/adapters/gemini.mjs`
- Test: `test/adapters.test.mjs`

- [ ] **Step 1: 실패 테스트 작성**

Create `test/adapters.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewWithCodex } from '../lib/adapters/codex.mjs';
import { reviewWithGemini } from '../lib/adapters/gemini.mjs';

test('codex adapter returns structured result shape', () => {
  // Use a bogus binary override path by calling with tiny timeout against real CLI is costly;
  // instead assert the function exists and returns the documented shape on error.
  const r = reviewWithCodex('noop', { bin: 'nonexistent-cmd-xyz-123' });
  assert.equal(typeof r.ok, 'boolean');
  assert.equal(r.ok, false);
  assert.equal(typeof r.output, 'string');
  assert.equal(typeof r.error, 'string');
});

test('gemini adapter returns structured result shape', () => {
  const r = reviewWithGemini('noop', { bin: 'nonexistent-cmd-xyz-123' });
  assert.equal(r.ok, false);
  assert.equal(typeof r.output, 'string');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/adapters.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현 — codex.mjs**

Create `lib/adapters/codex.mjs`:

```js
/** GPT (Codex CLI) review adapter — read-only, non-interactive. */
import { spawnSync } from 'child_process';

/**
 * @param {string} prompt
 * @param {{ cwd?: string, timeoutMs?: number, bin?: string }} [opts]
 * @returns {{ ok: boolean, output: string, error: string }}
 */
export function reviewWithCodex(prompt, opts = {}) {
  const { cwd = process.cwd(), timeoutMs = 120000, bin = 'codex' } = opts;
  const r = spawnSync(bin, ['exec', prompt], {
    cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return { ok: false, output: '', error: String(r.error.message || r.error) };
  const output = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, output, error: r.status === 0 ? '' : `exit ${r.status}` };
}
```

- [ ] **Step 4: 구현 — gemini.mjs**

Create `lib/adapters/gemini.mjs`:

```js
/** Gemini CLI review adapter — read-only (plan mode), non-interactive. */
import { spawnSync } from 'child_process';

/**
 * @param {string} prompt
 * @param {{ cwd?: string, timeoutMs?: number, bin?: string }} [opts]
 * @returns {{ ok: boolean, output: string, error: string }}
 */
export function reviewWithGemini(prompt, opts = {}) {
  const { cwd = process.cwd(), timeoutMs = 120000, bin = 'gemini' } = opts;
  const r = spawnSync(bin, ['-p', prompt, '--approval-mode', 'plan'], {
    cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return { ok: false, output: '', error: String(r.error.message || r.error) };
  const output = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, output, error: r.status === 0 ? '' : `exit ${r.status}` };
}
```

- [ ] **Step 5: 통과 확인 (어댑터 + verify)**

Run: `node --test test/adapters.test.mjs test/verify.test.mjs`
Expected: PASS (2 + 4)

- [ ] **Step 6: 커밋**

```bash
git add lib/verify.mjs lib/adapters/codex.mjs lib/adapters/gemini.mjs test/verify.test.mjs test/adapters.test.mjs
git commit -m "feat(verify): N-라운드 헬퍼 + codex/gemini 읽기전용 어댑터"
```

---

## Task 3: /omh-verify 스킬 (오케스트레이션)

**Files:**
- Create: `skills/omh-verify/SKILL.md`
- Test: 수동(스킬 내용 검증)

- [ ] **Step 1: SKILL.md 작성**

Create `skills/omh-verify/SKILL.md` (frontmatter + 절차):

```markdown
---
name: omh-verify
description: Tier 3 작업 완료 전 N-라운드 독립검증·수정 루프. git diff를 모델 로테이션(Claude/GPT/Gemini)으로 라운드마다 독립 검증하고 수정한다.
---

# /omh-verify — N-라운드 독립검증

설정(`.claude/.omh/harness.config.json`)의 `verify`를 따른다: `rounds`, `stopWhenClean`, `autoFix`, `lenses`.

## 절차

1. **준비:** `node "$CLAUDE_PLUGIN_ROOT/lib/verify.mjs" plan` 으로 diff 유무 확인. diff 없으면 "검증 대상 없음" 보고 후 종료.
2. **라운드 루프** (i = 1..rounds):
   - 이번 라운드 렌즈 = `lenses[(i-1) % lenses.length]` (모델 로테이션).
   - **Claude 렌즈**(`model: claude`)면: 네가 직접 `git diff`를 focus(correctness 등) 관점으로 독립 리뷰한다. 가능하면 Task 서브에이전트로 fresh 컨텍스트에서 수행.
   - **외부 렌즈**(gpt/gemini)면:
     `node "$CLAUDE_PLUGIN_ROOT/lib/verify.mjs" review --model <gpt|gemini> --focus <focus>`
     를 실행해 findings를 받는다.
   - findings가 "NO ISSUES FOUND"뿐이고 `stopWhenClean`이면 루프 종료.
   - findings가 있으면: `autoFix`가 true면 수정을 적용하고, false면 사용자에게 수정안을 제시한다.
   - 라운드 결과(모델, 발견, 수정)를 기록한다.
3. **리포트:** 라운드별 발견·수정 요약 + 모델 간 합의/불일치(2개 이상 모델이 같은 지적 = high-confidence)를 표로 출력한다.

## 원칙
- 각 라운드는 **독립**이다: 이전 라운드 결론을 검증자에게 주입하지 말 것(셀프 도장 방지).
- 외부 검증자는 **읽기 전용**이다. 수정은 메인 루프(너)가 적용한다.
- CLI 미설치 모델은 자동 제외된다(Claude 단독으로 graceful degrade).
```

- [ ] **Step 2: 스킬 로드 확인**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync(process.env.HOME+'/.claude/plugins/marketplaces/oh-my-harness/skills/omh-verify/SKILL.md','utf8');if(!/^---/.test(s)||!/name: omh-verify/.test(s))throw new Error('frontmatter');console.log('SKILL ok')"`
Expected: `SKILL ok`

- [ ] **Step 3: 커밋**

```bash
git add skills/omh-verify/SKILL.md
git commit -m "feat(skill): /omh-verify N-라운드 독립검증 오케스트레이션"
```

---

## Task 4: 전체 회귀

- [ ] **Step 1:** Run `node --test test/*.test.mjs` → 전체 PASS, fail 0.

---

## Self-Review

1. **Spec coverage:** §4(N-라운드 루프, 모델 로테이션, 어댑터, 읽기전용 외부, graceful degrade) → Task 1~3 구현.
2. **Placeholder scan:** 없음.
3. **Type consistency:** 어댑터 반환 `{ok, output, error}`가 verify.runExternalLens·테스트에서 일치. `selectLens`/`buildReviewPrompt`/`availableLenses` 시그니처가 테스트와 일치. 어댑터 `opts.bin` 오버라이드가 테스트에서 사용됨 — 구현에 포함됨.
4. **실행 순서:** Task 2(어댑터) → Task 1(verify) 순으로 모듈 생성(verify가 어댑터를 import).
