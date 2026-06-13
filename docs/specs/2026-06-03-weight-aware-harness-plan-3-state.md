# 디스크 앵커 STATE.md 구현 계획 (Plan 3 / 5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** 세션 경계·compaction을 넘어 유지되는 living `STATE.md`(목표/phase/결정/진행)를 만들고, SessionStart에 재주입, PreCompact 스냅샷에 통합한다.

**Architecture:** `lib/state.mjs`가 렌더/읽기/쓰기(순수+fs)를 담당하고, `session-start.mjs`가 요약을 주입, `pre-compact.mjs`가 스냅샷에 STATE.md 참조를 포함한다.

**Tech Stack:** Node.js ESM, node:test.

**전체 스펙:** design.md §8.

---

## Task 1: lib/state.mjs + 테스트

**Files:** Create `lib/state.mjs`, `test/state.test.mjs`

- [ ] **Step 1: 실패 테스트**

Create `test/state.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { renderState, writeState, readState, stateSummary } from '../lib/state.mjs';

test('renderState includes provided fields', () => {
  const md = renderState({ goal: 'G', phase: 'P', decisions: ['D1'], todo: ['T1'], done: ['X1'] });
  assert.match(md, /## Goal\nG/);
  assert.match(md, /## Current Phase\nP/);
  assert.match(md, /- D1/);
  assert.match(md, /- \[ \] T1/);
  assert.match(md, /- \[x\] X1/);
});

test('writeState then readState roundtrips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omh-state-'));
  try {
    writeState(dir, { goal: 'roundtrip goal' });
    assert.match(readState(dir), /roundtrip goal/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readState/stateSummary null when absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omh-state-'));
  try {
    assert.equal(readState(dir), null);
    assert.equal(stateSummary(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: 실패 확인** — `node --test test/state.test.mjs` → FAIL

- [ ] **Step 3: 구현 — lib/state.mjs**

```js
/** Disk-anchored living project state (.claude/.omh/STATE.md). */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export function statePath(root) {
  return join(root, '.claude', '.omh', 'STATE.md');
}

export function renderState({ goal = '', phase = '', decisions = [], todo = [], done = [] } = {}) {
  const lines = ['# Project State', ''];
  if (goal) lines.push('## Goal', goal, '');
  if (phase) lines.push('## Current Phase', phase, '');
  if (decisions.length) { lines.push('## Key Decisions'); decisions.forEach((d) => lines.push(`- ${d}`)); lines.push(''); }
  if (done.length) { lines.push('## Done'); done.forEach((d) => lines.push(`- [x] ${d}`)); lines.push(''); }
  if (todo.length) { lines.push('## Todo'); todo.forEach((d) => lines.push(`- [ ] ${d}`)); lines.push(''); }
  return lines.join('\n').trimEnd() + '\n';
}

export function readState(root) {
  const p = statePath(root);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

export function writeState(root, fields) {
  const p = statePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, renderState(fields));
  return p;
}

export function stateSummary(root, maxLines = 10) {
  const s = readState(root);
  if (!s) return null;
  return s.split('\n').slice(0, maxLines).join('\n').trim();
}
```

- [ ] **Step 4: 통과 확인** — `node --test test/state.test.mjs` → PASS (3)

- [ ] **Step 5: 커밋**
```bash
git add lib/state.mjs test/state.test.mjs
git commit -m "feat(state): 디스크 앵커 STATE.md 헬퍼"
```

---

## Task 2: SessionStart 주입 + PreCompact 통합

**Files:** Modify `hooks/session-start.mjs`, `hooks/pre-compact.mjs`

- [ ] **Step 1: session-start.mjs — STATE 요약 주입**

import 추가:
```js
import { stateSummary } from '../lib/state.mjs';
```
> 주의: 훅은 `hooks/`에 있고 state.mjs는 `lib/`에 있으므로 상대경로는 `../lib/state.mjs`.

`conventions` 주입 블록과 skill-hint 사이에 추가:
```js
  // Inject living project state if present
  const summary = stateSummary(projectRoot);
  if (summary) {
    console.log(hookOutput('SessionStart', `[omh:state] 이전 세션 상태:\n${summary}`));
  }
```

- [ ] **Step 2: pre-compact.mjs — 스냅샷에 STATE 참조**

`Review .claude/.omh/context-snapshot.md and .claude/.omh/conventions.json to restore working context.` 문구를 다음으로 교체:
```js
  lines.push(`Context was compacted. Review .claude/.omh/STATE.md, .claude/.omh/context-snapshot.md, and .claude/.omh/conventions.json to restore working context.`);
```

- [ ] **Step 3: 수동 검증**
```bash
cd ~/.claude/plugins/marketplaces/oh-my-harness
T=$(mktemp -d); mkdir -p "$T/.claude/.omh"
echo '{"features":{"conventionSetup":true}}' > "$T/.claude/.omh/harness.config.json"
node -e "import('./lib/state.mjs').then(m=>m.writeState('$T',{goal:'테스트 목표'}))"
echo '{}' | PROJECT_PATH="$T" node hooks/session-start.mjs
rm -rf "$T"
```
Expected: stdout에 `[omh:state]` 와 `테스트 목표` 포함.

- [ ] **Step 4: 전체 회귀** — `node --test test/*.test.mjs` → PASS

- [ ] **Step 5: 커밋**
```bash
git add hooks/session-start.mjs hooks/pre-compact.mjs
git commit -m "feat(state): SessionStart 주입 + PreCompact 통합"
```

---

## Self-Review
1. Spec §8 → Task 1·2 구현(렌더/읽기/쓰기, SessionStart 주입, PreCompact 통합).
2. Placeholder 없음.
3. `stateSummary`/`writeState`/`readState` 시그니처 테스트와 일치. import 경로 `../lib/state.mjs` 일관.
