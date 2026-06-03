# 설계: 무게 비례 N-라운드 독립검증 하네스

- **상태:** 설계 (구현 전)
- **작성일:** 2026-06-03
- **대상 버전:** OMH 0.2.0 (예정)
- **목표 한 줄:** 작업의 무게에 비례해서 ① N-라운드 독립 검증·수정 ② 컨벤션 준수 ③ 반복 가드를 **놓치지 않게 자동화**하되, 가벼운 작업은 가볍게 유지한다.

---

## 1. 배경과 동기

OMH는 이미 네이티브 훅 기반의 경량 하네스다. 다만 사용자의 실제 니즈는 다음과 같다:

> "AI를 쓰면서 N번의 독립 검증 + 수정, 컨벤션 준수 같은 중복 가드 작업이 많은데 놓치지 않게, 다만 작업의 무게에 따라 구분하고 싶다."

기존 OMH가 가진 것(무게 감지 원시기능: auto-plan 임계치, model routing)을 재사용하고, **부족한 조각만** 추가한다. 외부 프레임워크(GSD/gstack)는 설치하지 않는다 — 오케스트레이션 레이어가 superpowers·네이티브와 삼중 중복되고 어텐션을 분산시키기 때문. 단 GSD의 "디스크 앵커 living state" 아이디어 1개만 차용한다(§8).

### 설계 원칙
**OMH = "무게 판정 + 라우팅" (the *when*).** 실행기는 재발명하지 않고 기존 자산(네이티브 Task/Workflow, superpowers, 외부 모델 CLI)에 위임한다 (the *what*). 레이어 최소화 = 어텐션 보존.

---

## 2. 무게 판정 (Tier 1/2/3)

`hooks/pre-prompt.mjs` + `hooks/lib/dictionary.mjs` 확장.

세 신호를 합산해 Tier 산출:

1. **휴리스틱** — 태스크 수(번호·불릿·접속사 카운트, 기존 로직 재사용), 변경/언급 파일 수.
2. **표현 사전 (한/영)** — `dictionary.mjs`에 무게 암시 표현 추가:
   - **Tier↑:** 프로덕션, 배포, 릴리스, 결제, 인증, 매출, 마이그레이션, 리팩토링(대규모), 신중히, 꼼꼼히, critical, production, migrate, refactor
   - **Tier↓:** 오타, 그냥 빠르게, 대충, 간단히, 사소한, quick fix, just tweak, typo
   - 도메인 키워드(예: NanumVitamin 매출 직결 도메인)는 설정으로 Tier↑ 등록 가능.
3. **명시 오버라이드** — 위 표현이 곧 오버라이드. 단일 매직 키워드 강제가 아니라 자연스러운 문장에서 추론.

**판정 규칙(초안):**
- Tier 3: 표현 사전 Tier↑ 매치 ≥1 또는 태스크 수 ≥ `tier3.taskThreshold`(기본 5) 또는 변경 파일 ≥ `tier3.fileThreshold`(기본 5).
- Tier 1: 표현 사전 Tier↓ 매치 ≥1 이고 Tier↑ 신호 없음.
- Tier 2: 그 외 기본값.
- 충돌 시 보수적으로 높은 Tier 채택(놓치지 않기 우선).

판정 결과는 `UserPromptSubmit` 컨텍스트에 주입(`[omh:tier] Tier N — <근거>`).

---

## 3. Tier 라우팅 (강제 리마인더 방식)

| Tier | 주입되는 강제 단계 | 위임 실행기 |
|------|--------------------|-------------|
| **1 가벼움** | 컨벤션 한 줄 리마인더만 | — |
| **2 보통** | 컨벤션 체크리스트 + 테스트 + 셀프리뷰 | superpowers (TDD/디버깅) |
| **3 무거움** | **완료 선언 전 `/omh-verify` 필수** + STATE.md 갱신 | `/omh-verify` (multi-model), superpowers subagent-driven 실행 |

**강제 리마인더:** 자동 실행이 아니라, 훅이 "이건 Tier 3이니 완료 선언 전 `/omh-verify`를 반드시 수행" 지시를 컨텍스트에 주입한다. 실제 실행은 메인 루프 안에서 눈으로 보며 진행 → 비용/통제 균형(사용자 결정).

---

## 4. `/omh-verify` — N-라운드 독립검증·수정 루프 (핵심 신규)

병렬 교차검증이 아니라 **순차 N회 독립 검증 + 수정** 루프.

```
입력: git diff (또는 지정 범위) + 작업 스펙/STATE.md
for i in 1..N:
    verifier = models[(i-1) % len(models)]      # Claude → GPT → Gemini → 로테이션
    findings = verifier.review(diff, spec, focus=rotate[정합성|컨벤션|회귀])
        # 독립성: 매 라운드 fresh 컨텍스트 + 이전 라운드와 다른 모델
    if findings.empty:
        break                                    # 깨끗 → 조기 종료 (stopWhenClean)
    if autoFix:
        apply_fixes(findings)                     # 메인 루프 또는 fix 서브에이전트
    record(round=i, model, findings, fixes)
출력: 라운드별 발견·수정 리포트 + 모델 합의/불일치 요약
```

### 독립성 보장
- 매 라운드 **fresh 컨텍스트**(서브에이전트/CLI 신규 호출) — 누적 오염 없음.
- **모델 로테이션** — 같은 모델이 자기 직전 판단을 셀프 도장 찍는 것 방지.

### 모델 어댑터 (설정 주도)
`harness.config.json`:
```jsonc
"verify": {
  "rounds": 3,
  "stopWhenClean": true,
  "autoFix": false,
  "lenses": [
    { "model": "claude", "via": "native-subagent", "focus": "correctness" },
    { "model": "gpt",    "via": "codex",  "cmd": "codex exec",                 "focus": "convention" },
    { "model": "gemini", "via": "gemini", "cmd": "gemini -p --approval-mode plan", "focus": "regression" }
  ]
}
```
- **자동 감지:** `which codex` / `which gemini` 성공 시 해당 렌즈 자동 활성. 없으면 Claude 단독으로 graceful degrade.
- 외부 검증자는 **읽기 전용**으로 호출(gemini `--approval-mode plan`, codex `exec`/`review`는 진단만) → 검증자가 코드를 임의 수정하지 않음. 수정은 메인 루프가 findings를 받아 적용.
- 모델 추가/교체 = `lenses[]` 한 줄. ("유저가 쉽게 GPT/Gemini 연동" 충족)

### 구성요소
- `skills/omh-verify/SKILL.md` — 슬래시 커맨드 진입점, 루프 절차 기술.
- `lib/verify.mjs` — diff 수집, 어댑터 호출, 라운드 집계, 리포트 렌더.
- 어댑터: `lib/adapters/claude.mjs`, `codex.mjs`, `gemini.mjs` (동일 인터페이스 `review(ctx) → findings[]`).

---

## 5. 컨벤션 강화

기존 `convention-detect`(SessionStart)가 뽑은 스택 규칙 + 팀 규칙을 Tier 2/3에서 **수동 주입 → 검증된 체크리스트**로 격상. 완료 선언 전 체크리스트 통과 여부를 명시 확인하도록 리마인더 강화. `commit-convention.mjs`(기존)와 연계.

---

## 6. 첫 설치자 out-of-box 적용

- 합리적 기본 `templates/harness.config.json` 동봉 → `/harness-setup` 안 돌려도 기본값으로 동작.
- 기본값: `verify.rounds=3`, `autoFix=false`, Claude 단독 렌즈. codex/gemini 감지되면 자동 합류.
- 설정 없는 프로젝트에서 SessionStart는 친절한 1줄 안내("`/harness-setup`로 1분 설정") 주입(기존 skill-hint 패턴 확장).

---

## 7. 친절한 시각적 온보딩 (`/harness-setup` 개편)

- **질문형 위저드** — AskUserQuestion 스타일로 하나씩 친절하게:
  1. 어떤 프로젝트인가(스택 자동 감지 결과 확인)
  2. Tier 임계치(기본값 제안 + 조정)
  3. 켤 기능 선택(테스트 강제/스코프 가드/usage 추적 등)
  4. `verify.rounds`(N) + autoFix on/off
  5. 커밋 컨벤션 스타일(Conventional / Gitmoji)
  6. **설치된 모델 CLI 자동 감지 후 "GPT/Gemini도 검증에 넣을까요?" 제안**
- **시각적 요약** — 설정 완료 후 최종 `harness.config.json` 미리보기 + Tier별 동작 표 출력.
- 구현: `skills/harness-setup/SKILL.md`를 위저드 절차로 재작성(질문 순서·기본값·요약 렌더).

---

## 8. 디스크 앵커 living state (GSD에서 차용)

GSD의 유일하게 추가 가치 있는 메커니즘. 기존 `.claude/.omh/`(이미 `context-snapshot.md`, `conventions.json` 보유)에 **living `STATE.md`** 추가:

- 내용: 목표(goal), 현재 phase, 핵심 결정(decisions), 진행 상황(progress/done·todo).
- 갱신: Tier 2/3 작업 중 주요 분기·완료 시 갱신.
- 재주입: `SessionStart`(있으면 요약 주입), `PreCompact`(기존 snapshot과 통합).
- 효과: 세션 경계·compaction을 넘어 컨텍스트 유지 → context rot 방어.
- GSD 설치 없이 OMH 네이티브 훅으로 구현. `STATE.md`/`CONTEXT.md` 명칭·포맷은 GSD 관례 참고.

---

## 9. 정리(이번 범위 밖, 후속)

- 네이티브 Agent/Team으로 대체된 tmux `/agent-spawn`(#12)은 deprecate 후보로 표시만. 별도 PR.

---

## 10. 영향받는 파일 (구현 계획에서 상세화)

- `hooks/pre-prompt.mjs` — Tier 판정 로직 추가
- `hooks/lib/dictionary.mjs` — 무게 암시 표현 사전
- `hooks/session-start.mjs`, `hooks/pre-compact.mjs` — STATE.md 통합
- `lib/verify.mjs` + `lib/adapters/{claude,codex,gemini}.mjs` — 신규
- `skills/omh-verify/SKILL.md` — 신규
- `skills/harness-setup/SKILL.md` — 위저드 재작성
- `lib/config.mjs`, `templates/harness.config.json` — verify/tier 기본값 스키마
- `docs/features*.md`, `docs/multi-agent*.md`, `README*.md` — 문서 반영
- `test/*.test.mjs` — Tier 판정·dictionary·verify 어댑터·config 테스트 추가

---

## 11. 테스트 전략

- `dictionary` 표현 사전: Tier↑/↓ 매치 단위 테스트(한/영).
- `tier` 판정: 휴리스틱+사전+오버라이드 조합 케이스, 충돌 시 보수적 상향.
- `verify` 어댑터: CLI 부재 시 graceful degrade, findings 파싱, 라운드 종료 조건.
- `config`: 기본값 deep-merge, verify 스키마 검증.
- 기존 110개 테스트 회귀 없음 유지.

---

## 12. 비목표 (YAGNI)

- GSD/gstack 설치 — 안 함.
- 자체 멀티에이전트 tmux 재구현 — 안 함(네이티브/외부 위임).
- Tier 3 완전 자동 실행 — 안 함(강제 리마인더 채택).
