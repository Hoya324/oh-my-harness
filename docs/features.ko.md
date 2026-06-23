# 기능

## 상태 표시줄 (HUD)

OMH는 Claude Code의 기본 상태 표시줄을 실시간 대시보드로 대체합니다:

```
[OMH] | 5h:14%(3h51m) | wk:7%(6d5h) | session:29m | ctx:39% | 🔧53 | agents:2 | opus-4-6
```

| 항목 | 의미 |
|------|------|
| `5h:14%(3h51m)` | 5시간 사용량 14%, 3시간 51분 후 리셋 |
| `wk:7%(6d5h)` | 주간 사용량 7%, 6일 5시간 후 리셋 |
| `session:29m` | 현재 세션 지속 시간 |
| `ctx:39%` | 컨텍스트 윈도우 사용률 (초록 → 70%에서 노랑 → 85%에서 빨강) |
| `🔧53` | 이 세션의 총 도구 호출 수 |
| `agents:2` | 현재 실행 중인 서브에이전트 수 |
| `opus-4-6` | 사용 중인 모델 |

> 사용량 데이터는 Anthropic OAuth API에서 가져오며 90초 동안 캐시됩니다.

---

## 스마트 기본값 — OMH가 자동으로 하는 것들

OMH는 Claude Code의 생명주기에 훅으로 연결되어 자동으로 동작합니다. 수동 설정이 필요 없습니다.

```
┌─────────────────────────────────────────────────────────────────┐
│  프롬프트 입력                                                    │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ 🔍 모호성 가드        │   │ 📋 자동 Plan 모드     │            │
│  │ 모호한 요청?          │   │ 3개 이상 작업 감지?    │            │
│  │ → 범위를 먼저 질문     │   │ → 계획 수립 제안      │            │
│  └──────────────────────┘   └──────────────────────┘            │
│                                                                 │
│  Claude 작업 시작                                                │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ 🛡️ 위험 명령 가드     │   │ 📁 스코프 가드        │            │
│  │ rm -rf / force push? │   │ 허용 경로 밖 수정?     │            │
│  │ → 경고 + 확인         │   │ → 경고               │            │
│  └──────────────────────┘   └──────────────────────┘            │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ 🤖 모델 라우팅        │   │ 📝 커밋 컨벤션        │            │
│  │ 작업 복잡도에 따라     │   │ git commit 감지?      │            │
│  │ 적절한 모델로 위임:    │   │ → 형식 안내           │            │
│  │ haiku/sonnet/opus    │   │                       │            │
│  └──────────────────────┘   └──────────────────────┘            │
│                                                                 │
│  작업 완료                                                       │
│                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐            │
│  │ ✅ 테스트 강제         │   │ 💾 컨텍스트 스냅샷     │            │
│  │ 코드 변경됨?          │   │ 컨텍스트 압축 예정?    │            │
│  │ → 테스트 존재 확인     │   │ → 상태 먼저 저장      │            │
│  └──────────────────────┘   └──────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### 모델 라우팅 상세

Claude가 서브에이전트에 작업을 위임할 때, OMH가 자동으로 적절한 모델을 선택합니다:

| 에이전트 계층 | 모델 | 사용 시점 | 예시 |
|:----------:|:-----:|-----------|------|
| `harness:quick` | **Haiku** | 단순 조회, 탐색 | "TODO 코멘트 찾아줘", "이 파일 뭐야?" |
| `harness:standard` | **Sonnet** | 구현, 수정 | "이 버그 수정해줘", "유효성 검사 추가", "테스트 작성" |
| `harness:architect` | **Opus** | 설계, 분석 | "인증 시스템 설계해줘", "보안 리뷰", "복잡한 리팩토링" |

현재 사용 중인 모델은 항상 HUD 상태 표시줄에서 확인할 수 있습니다.

### 기능 태그 — `[omh:*]`

모든 OMH 동작에는 태그가 붙어서, 어떤 기능이 발동했는지 항상 알 수 있습니다:

```
[omh:ambiguity-guard]    → 모호한 요청에 대해 명확화 질문
[omh:auto-plan]          → 3개 이상 작업 감지, plan 모드 제안
[omh:dangerous-guard]    → 파괴적 명령 전 경고
[omh:model-routing → sonnet] → 구현 작업을 sonnet에 위임
[omh:test-enforcement]   → 코드 변경 후 테스트 확인 리마인드
[omh:commit-convention]  → git commit 후 커밋 형식 안내
[omh:scope-guard]        → 허용 경로 밖 수정 경고
[omh:convention-detect]  → 세션 시작 시 프로젝트 컨벤션 감지
[omh:context-snapshot]   → 컨텍스트 압축 전 상태 저장
[omh:loop]               → 자율 루프의 강제 계속 / 중단 결정
[omh:cross-verify]       → 교차 검증 판정 (PASS / FAIL / INCONCLUSIVE)
[omh:spec]               → 스펙 작성 / 수용 기준 검사
```

세션 출력 예시:
```
⏺ [omh:convention-detect] Project: node | test: vitest | lint: eslint
  ...
⏺ [omh:ambiguity-guard] 요청이 모호합니다. 구체적 범위를 확인합니다.
  ...
⏺ [omh:model-routing → haiku] TODO 코멘트를 찾고 있습니다...
  ...
⏺ [omh:model-routing → sonnet] 인증 미들웨어를 구현합니다...
  ...
⏺ [omh:dangerous-guard] WARNING: rm -rf 감지. 사용자 확인 필요.
  ...
⏺ [omh:test-enforcement] 코드 변경 감지. 테스트 존재 여부 확인.
```

---

## 기능 맵

아래 기능들은 세 계층으로 묶입니다 — [README](../README.ko.md#기능-목록)와 동일한 그룹입니다:

**A. 자동 가드 & 라우팅** — 모든 세션에서 묻지 않고 동작:
[컨벤션 자동 감지](#1-컨벤션-자동-감지) · [테스트 강제](#2-테스트-강제) · [자동 Plan 모드](#4-자동-plan-모드) · [모호성 가드](#5-모호성-가드) · [위험 명령 가드](#6-위험-명령-가드) · [컨텍스트 스냅샷](#7-컨텍스트-스냅샷) · [커밋 컨벤션](#8-커밋-컨벤션) · [스코프 가드](#9-스코프-가드) · [사용량 추적](#10-사용량-추적) · [무게 라우팅](#15-무게-라우팅-tier-123) · [Living State](#17-living-state-statemd) · [검증 게이트](#검증-게이트) · [플랜 게이트](#플랜-게이트)

**B. 자율 실행** — 직접 호출하는 워크플로우:
[네이티브 팀](#11-네이티브-팀) · [자율 루프](#13-자율-루프-autonomous-loop) · [스펙 작성](#14-스펙-작성-spec-authoring) · [N-라운드 검증](#16-n-라운드-독립-검증-omh-verify)

**C. 라우팅·스캐폴딩·관측** — 가로지르는 기능:
[상태 표시줄 (HUD)](#상태-표시줄-hud) · [모델 라우팅](#3-모델-라우팅) · [스킬 스캐폴딩](features.md#11-skill-scaffolding)

---

## 기능 상세

### 1. 컨벤션 자동 감지

세션 시작 시 프로젝트 루트를 스캔하고 감지된 컨벤션을 컨텍스트로 주입합니다. 결과는 1시간 동안 캐시됩니다.

| 프로젝트 파일 | 언어 | 감지 도구 |
|-------------|------|----------|
| `package.json` | Node.js | jest / vitest / mocha, eslint / biome, prettier, typescript / vite / webpack |
| `pyproject.toml` | Python | pytest, ruff / flake8, black, mypy |
| `go.mod` | Go | go test, golangci-lint |
| `Cargo.toml` | Rust | cargo test, clippy, rustfmt |
| `build.gradle` | Java | junit, gradle |
| `pom.xml` | Java | junit, maven |

> 세션 시작 메시지 예시: `[oh-my-harness] Project: node | test: vitest | lint: eslint | fmt: prettier`

### 2. 테스트 강제

코드 변경(Edit / Write / NotebookEdit) 후 세션 종료 시 리마인더를 주입합니다:

- 변경된 코드에 대한 테스트 파일 존재 확인
- 각 테스트 파일에 최소 **N**개의 테스트 케이스 확인 (설정 가능, 기본값: 2)
- 테스트가 없으면 추가 제안

> 테스트는 최소한 **정상 경로**, **엣지 케이스**, **에러 케이스**를 커버해야 합니다.

### 3. 모델 라우팅

비용 효율적인 서브에이전트 위임을 위한 3단계 에이전트 계층:

| 에이전트 | 모델 | 용도 |
|---------|------|------|
| `harness:quick` | haiku | 파일 조회, 간단한 질문, 탐색 |
| `harness:standard` | sonnet | 구현, 버그 수정, 디버깅 |
| `harness:architect` | opus | 아키텍처, 복잡한 분석, 보안 리뷰 |

CLAUDE.md가 작업 복잡도에 따라 적절한 계층으로 자동 위임하도록 Claude에게 지시합니다.

### 4. 자동 Plan 모드

단일 메시지에서 3개 이상의 독립적인 작업을 감지합니다:

- 번호 목록 (`1. 2. 3.`)
- 불릿 포인트 (`-`, `*`)
- 한국어 접속사 (`그리고`, `또한`, `추가로`, `아울러`, `더불어`)

Plan 모드를 제안합니다 — 강제하지 않습니다.

### 5. 모호성 가드

점수 기반 시스템으로 모호한 요청을 감지합니다 (임계값: 2):

| 신호 | 점수 | 예시 |
|------|:----:|------|
| 모호한 지시어 | +1 | "이거 수정해줘", "그거 고쳐" |
| 범위 없는 동사 | +1 | "리팩토링해줘" (파일/함수 대상 없음) |
| 열린 선택지 | +1 | "~하거나", "~든지" |
| 매우 짧은 메시지 | +1 | 15자 미만, 특정 식별자 없음 |
| 영문 범위 없음 | +1 | "fix it", "clean up" (대상 없음) |

점수 >= 임계값일 때, Claude는 작업 시작 전에 **반드시** 명확화 질문을 해야 합니다.

### 6. 위험 명령 가드

잠재적으로 파괴적인 작업 전에 경고합니다:

**Bash 도구 패턴:**

| 패턴 | 경고 |
|------|------|
| `rm -rf`, `rm --force` | 파일 삭제 |
| `git push --force` | 강제 푸시 |
| `git reset --hard` | 하드 리셋 |
| `git clean -f` | Git 정리 |
| `DROP TABLE / DATABASE` | 데이터베이스 파괴 |
| `TRUNCATE TABLE` | 테이블 잘라내기 |
| `DELETE FROM` (WHERE 없음) | 대량 삭제 |
| `chmod 777` | 안전하지 않은 권한 |
| `curl \| sh` | 원격 실행 |
| `npm publish` | 패키지 배포 |
| `docker system prune` | 컨테이너 정리 |

**Write/Edit 도구 패턴:**

| 패턴 | 경고 |
|------|------|
| `.env` 파일 | 환경 변수 시크릿 |
| `credentials` | 인증 정보 파일 |
| `secret` | 시크릿 파일 |
| `id_rsa`, `.pem`, `.key` | 개인 키 파일 |

> 경고만 표시합니다 — 실행을 차단하지 않습니다. Claude에게 사용자 확인을 요청합니다.

### 7. 컨텍스트 스냅샷

컨텍스트 압축(`PreCompact`) 전에 현재 상태를 `.claude/.omh/context-snapshot.md`에 저장합니다:

- 세션 요약
- 활성 작업
- 압축 후 스냅샷 검토 리마인더

### 8. 커밋 컨벤션

`git commit`이 감지되면 커밋 형식을 안내합니다.

**자동 감지 우선순위:**
1. commitlint 설정 파일 -> Conventional Commits
2. `package.json`의 gitmoji 의존성 -> Gitmoji
3. `package.json`의 commitizen -> Conventional Commits
4. 기본값 -> Conventional Commits

```
# Conventional Commits
<type>(<scope>): <description>
# Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore

# Gitmoji
<emoji> <description>
```

### 9. 스코프 가드

`allowedPaths`와 함께 활성화하면, Edit/Write가 허용된 디렉토리 외부 파일을 대상으로 할 때 경고합니다.

```json
{
  "features": { "scopeGuard": true },
  "scopeGuard": { "allowedPaths": ["src/auth", "src/utils"] }
}
```

> 기본적으로 OFF입니다. Claude의 쓰기 범위를 제한하고 싶을 때 활성화하세요.

### 10. 사용량 추적

모든 도구 호출을 `.claude/.omh/usage.json`에 조용히 기록합니다:

```json
{
  "sessions": {
    "session-id": {
      "tool_counts": { "Edit": 5, "Bash": 3, "Read": 12 },
      "total_calls": 20,
      "started_at": "2026-03-23T10:00:00Z",
      "last_tool": "Edit"
    }
  }
}
```

### 11. 네이티브 팀

Claude Code의 내장 팀 시스템을 사용하여 병렬 작업을 오케스트레이션합니다 — tmux나 worktree 의존성이 필요 없습니다.

**템플릿:**

| 템플릿 | 구성원 | 모델 라우팅 |
|--------|--------|------------|
| `fullstack` | frontend + backend + tester | 모두 sonnet |
| `review` | reviewer + tester | opus + sonnet |
| `research` | researcher + implementer + architect | haiku + sonnet + opus |

**명령어:**

| 명령어 | 설명 |
|--------|------|
| `/team-spawn [template\|N] [task]` | 팀 생성, 작업 분해, 팀원 생성 |
| `/team-status` | 팀원 상태 및 작업 진행률 표시 |
| `/team-stop` | 미완료 작업 경고와 함께 팀 종료 |

**동작 방식:**

1. `/team-spawn fullstack 인증 시스템 구축` 실행
2. OMH가 TeamCreate로 네이티브 팀 생성
3. 작업이 분해되어 팀원에게 할당
4. 팀원이 SendMessage로 소통하며 병렬 작업
5. `/team-status`로 진행률 확인
6. 완료 후 `/team-stop`으로 종료

**설정:**
```json
{
  "features": { "nativeTeam": true },
  "nativeTeam": {
    "maxTeammates": 4,
    "defaultTeamName": "omh-team"
  }
}
```

> 커스텀 템플릿은 설정의 `nativeTeam.templates`로 추가할 수 있습니다.

### 13. 자율 루프 (Autonomous Loop)

0.3.0의 핵심 기능입니다. `SPEC.md`에 목표를 한 번 정의하면, OMH가 스펙이 객관적으로 충족될 때까지 *루프*를 돕니다 — 구현하고, 스스로 검증하고, 교차 검증하면서. 여기서의 철학은 OMH의 평소 "벽 대신 경고"와 정반대입니다: **계속할지 멈출지를 하네스가 소유**하며, 모델의 자기 평가에 맡기지 않습니다.

**트리거:** Stop 훅 `hooks/loop-guard.mjs`가 곧 루프 엔진이자 안전 집행자입니다. `/omh-loop`이 활성 상태를 기록하면, 모든 Stop 이벤트마다 훅이 다시 진입합니다. 계속하려면 stdout에 **최상위** `{"decision":"block","reason":...}`를 출력하고 exit 0으로 종료합니다(exit 2 사용 금지, `hookSpecificOutput` 아래 중첩 금지). 목표가 충족되거나 가드레일이 발동하면 세션이 멈추도록 둡니다. 순수하고 단위 테스트된 코어는 `lib/loop.mjs`에 있습니다(`evaluateLoop`, `classifyTier`, `buildLadder`, `detectPlateau`, `detectOscillation`).

**명령어:**

| 명령어 | 설명 |
|--------|------|
| `/omh-loop "<목표>"` 또는 `/omh-loop SPEC.md` | 티어 분류, 스펙 게이트, 확인 후 한 번에 하나의 작업씩 반복 |
| `/omh-loop stop` | 킬 스위치 — 루프 중단 (`.claude/.omh/STOP` 파일 생성과 동일) |

**저렴한 것 우선 검증 사다리** — 가장 저렴한 검사를 먼저 돌리고 빠르게 실패하는, 엄격하게 순서가 정해진 단계들입니다. 첫 실패 시 *실제* 실패 출력을 다음 반복의 지시로 되먹임하여, 구조적으로 깨진 코드에 비싼 판정 모델을 낭비하지 않습니다. 각 단계는 자체 서브프로세스 타임아웃을 가집니다.

```
quickCheck (lint / typecheck)  →  verify (테스트 / 빌드)  →  self-review  →  cross-verify
   30초, 결정론적                  180초, 결정론적            동일 모델       다른 모델
```

**교차 검증(Cross-verification)** — 생성기와 *다른* 모델(opus, 모델 라우팅 경유)이 LLM-as-judge 역할로 **각** SPEC 수용 기준을 근거와 함께 `PASS` / `FAIL`로 채점합니다. 에이전트의 "내가 X 했다"는 자기 보고를 다시 읽는 것이 아니라, 테스트를 실행하고 diff를 grep하여 **저장소 상태에 대해 독립적으로** 검증합니다. 또한 revert-and-rerun 변형 검사(변경을 되돌리면 새 테스트가 되돌린 코드에서 FAIL해야 함)를 실행하여, 에이전트가 빈껍데기 테스트로 자기 게이트를 통과하지 못하게 합니다. 판정은 `PASS | FAIL | INCONCLUSIVE` 타입이며, **INCONCLUSIVE는 안전하게 중단-및-보고로 폴백**합니다.

**티어(Tiers)** — 가장 저렴한 티어에서 시작하고, 관찰된 신호(검증 실패, 큰 diff, 반복 실패)에 따라서만 승급합니다:

| 티어 | 반복 | 벽시계 시간 | 교차 검증 |
|------|:----:|:----------:|----------|
| `quick` | ≤ 3 | 5분 | 없음 |
| `standard` | ≤ 8 | 15분 | 완료 시 |
| `deep` | ≤ 20 | 45분 | 5회마다 + 완료 시 |

> 티어 교차 상한: `maxTotalIterations` = 30. 기본 티어는 `quick`이며, `standard` / `deep`은 승급 상태입니다.

**가드레일 (진짜 벽)** — 모든 Stop 이벤트에서 계층화된 체크리스트로 평가됩니다:

- `stop_hook_active`를 **가장 먼저** 검사하여 훅 자신의 응답 → block → 응답 무한 루프를 방지
- `sessionId`를 통한 동시 세션 / worktree 격리 (불일치 시 손대지 않고 통과)
- `STOP` 킬 스위치 (`.claude/.omh/STOP` 또는 `/omh-loop stop`)
- 티어별 및 티어 교차 반복 예산, 그리고 독립적인 벽시계 타임아웃
- 진전 없음 / 정체 감지 (티어의 `plateauWindow` 동안 빈 또는 미미한 커밋 diff)
- 진동(oscillation) 감지 (반복되는 실패 시그니처 / A-B-A-B → 중단 + "반복이 아니라 구조적 문제"로 에스컬레이션)
- 원자적(atomic) 상태 쓰기와 손상 시 **fail-open** — 깨진 상태 파일은 스스로 삭제하고 exit 0하여 사용자를 가두지 않음

**상태 & 로그:** 머신 상태는 `.claude/.omh/loop-state.json`, 사람이 읽는 계획 + 로그는 `PROGRESS.md`, 캐시된 빌드/테스트 호출은 `.claude/.omh/loop-learnings.md`에 저장됩니다.

**태그:** 훅은 강제 계속 / 중단 결정마다 `[omh:loop]`를, 판정 결과(루브릭 표 포함)에 `[omh:cross-verify]`를 출력합니다.

**기법:** Ralph Wiggum 루프, Reflexion, Self-Refine, Chain-of-Verification(CoVe), LLM-as-judge, FrugalGPT 캐스케이드, Agreement-Based Cascading, Spec-Driven Development.

**설정:**
```json
{
  "features": { "autonomousLoop": true },
  "loop": {
    "defaultTier": "quick",
    "requireSpec": true,
    "specPath": "SPEC.md",
    "logFile": "PROGRESS.md",
    "maxTotalIterations": 30,
    "crossVerify": true,
    "crossVerifyModel": "architect",
    "rungTimeoutSec": { "quickCheck": 30, "verify": 180 }
  }
}
```

> 기본적으로 ON이지만 `/omh-loop`이 활성 상태를 기록하기 전까지는 **비활성**입니다 — 루프가 아닌 세션에는 오버헤드가 없습니다. 전체 설정 블록과 설계 근거는 [자율 루프 가이드](loop.ko.md)를 참고하세요.

### 14. 스펙 작성 (Spec Authoring)

`/omh-spec`은 루프의 기준이 되는 기계 검증 가능한 `SPEC.md`를 작성합니다. 수용 기준은 **EARS 표기법** — `WHEN <트리거> THE SYSTEM SHALL <응답>` — 을 사용하며, 각 기준은 루프가 충족으로 간주하려면 exit 0이어야 하는 **검증 명령(verify command)**에 매핑됩니다. 의도 표류(drift)를 막기 위해 스펙의 간결하고 고정된 다이제스트가 매 반복마다 다시 주입됩니다.

요청이 모호하면 `/omh-spec`은 `[NEEDS CLARIFICATION]` 마커를 삽입하고, 그것이 남아 있는 동안 **루프 시작을 거부**합니다 — 추측하는 대신 OMH의 기존 모호성 가드로 폴백합니다.

```json
{
  "features": { "autonomousLoop": true },
  "loop": { "requireSpec": true, "specPath": "SPEC.md" }
}
```

> `[omh:spec]`를 출력합니다. EARS 템플릿과 작성 워크플로우는 [자율 루프 가이드](loop.ko.md)를 참고하세요.

---

### 15. 무게 라우팅 (Tier 1/2/3)

**훅:** `UserPromptSubmit` · **기본값:** ON (`features.weightRouting`)

각 프롬프트를 무게 Tier로 분류해 가드 강도를 비례 적용합니다. 작은 작업은 가볍게, 무거운 작업은 빠짐없이.

- **신호:** 태스크 수 휴리스틱 + 한/영 무게 암시 표현(`dictionary.mjs` `weightUp`/`weightDown`) + 설정형 도메인 키워드. 상향 신호가 하나라도 있으면 상향(보수적, 놓치지 않기 우선).
- **Tier 1(가벼움):** 컨벤션 리마인더만.
- **Tier 2(보통):** 컨벤션 체크리스트 + 테스트 + 셀프리뷰.
- **Tier 3(무거움):** 완료 선언 전 `/omh-verify` 실행을 강제 주입.

**설정:**
```json
{
  "features": { "weightRouting": true },
  "tier3": { "taskThreshold": 5, "fileThreshold": 5, "domainKeywords": ["결제", "매출"] }
}
```

### 16. N-라운드 독립 검증 (`/omh-verify`)

**커맨드:** `/omh-verify` · **기본값:** Tier 3에서 트리거

현재 `git diff`를 N회 독립 검증+수정하며, 매 라운드 모델을 로테이션해 자기 판단 셀프 도장을 방지합니다.

- **모델 로테이션:** Claude(네이티브 서브에이전트) → GPT(`codex exec`) → Gemini(`gemini -p --approval-mode plan`).
- **독립성:** 매 라운드 fresh 컨텍스트, 이전 결론을 다음 검증자에 주입하지 않음.
- **외부 읽기 전용:** 외부 검증자는 진단만, 수정은 메인 루프가 적용.
- **Graceful degrade:** 미설치 CLI는 자동 제외(Claude 단독 폴백).
- **합의 신호:** 2개 이상 모델이 지적하면 high-confidence.

### 17. Living State (STATE.md)

**훅:** `SessionStart`(주입) / `PreCompact`(통합) · **기본값:** ON

`.claude/.omh/STATE.md`에 목표·현재 phase·핵심 결정·진행을 보관합니다. 세션 시작 시 재주입되고 압축 전 스냅샷에서 참조되어, 세션 경계와 compaction을 넘어 작업 컨텍스트가 유지됩니다 — context rot 직접 방어.

### 검증 게이트

**훅:** `Stop` (`verify-gate.mjs`) · **기본값:** ON

자율 루프는 `/omh-loop` *안에서만* 검증을 강제합니다. 검증 게이트는 동일한 하네스 소유 강제를 **평범한 세션**으로 가져옵니다. 매 Stop마다 모델의 자기판단이 아니라 **실제 working-tree diff**로 위험도를 점수화합니다:

| 신호 | 효과 |
|------|------|
| 민감 경로 (`**/auth/**`, `**/payment/**`, `*migration*`, `.env*`, …) | 최고 위험도로 격상 |
| 대규모 diff (`largeFiles`/`largeLines` 초과) | 격상 |
| 소스가 바뀌었는데 매칭 테스트 없음 | 사다리 실행 |
| 프롬프트 티어(1/2/3) | **하한**으로 작용 — `level = max(diffRisk, tierFloor)` |

위험도가 충분하면 훅이 **verify 사다리를 직접 실행**(중간 위험은 cheap quickCheck, 민감/대규모는 전체 사다리)하고:
- **red** → 실제 실패 출력과 함께 계속을 강제 (최상위 `{"decision":"block"}` + exit 0);
- **green / 저위험** → stop 허용. 민감/대규모 변경엔 `/omh-verify` 교차모델 권고도 붙습니다.

**세션을 절대 가두지 않습니다.** 변경당 `maxBlocks` 상한이 (기존에 red인 베이스라인에 대해서도) 결국 stop을 허용하도록 보장하고, `stop_hook_active` 재진입 가드·already-verified 스킵·활성 루프 비켜남·빈 사다리/git 부재 통과·off 스위치(`features.verifyGate`, `DISABLE_HARNESS`, `STOP`)·모든 오류에 fail-open이 더해집니다. 판단 로직은 순수·단위테스트된 `lib/risk.mjs`입니다.

> `[omh:verify-gate]`를 방출합니다. [설정](configuration.ko.md)의 `verifyGate` 블록을 참고하세요.

### 플랜 게이트

**훅:** `PreToolUse` (`plan-gate.mjs`) · **기본값:** ON

검증 게이트가 턴 *이후* 검증을 강제한다면, 플랜 게이트는 턴 *이전* 계획을 강제합니다. **Tier 3 프롬프트**(기존 프롬프트 무게 분류기 — 아키텍처·보안·마이그레이션·5+ 작업·도메인 키워드)면 `pre-prompt.mjs`가 프롬프트 단위 마커를 켜고 계획 지시를 주입합니다. 그러면 PreToolUse 훅이 계획 전까지 편집 도구를 **차단**합니다:

| 도구 | armed 상태에서의 동작 |
|------|---------------------|
| `Edit` / `Write` / `NotebookEdit` / `MultiEdit` | 계획 지시와 함께 **차단** (해제 전까지) |
| `Read` / `Grep` / `Glob` / `EnterPlanMode` / … | 항상 허용 (계획하려면 조사해야 하니까) |
| `ExitPlanMode` | 요구사항 **해제** → 이후 편집 허용 |

즉 무거운 프롬프트는 모델이 `EnterPlanMode`를 호출해 **Context · 접근 · 변경 파일 · 검증** 구조로 구현 플랜을 작성·제시·승인받은 뒤에야 편집할 수 있게 만듭니다. (훅은 Claude를 plan모드로 직접 전환할 수 없습니다 — 모델이나 사용자만 가능 — 그래서 편집을 막아 간접적으로 강제합니다.)

**세션을 절대 가두지 않습니다.** 프롬프트당 `maxDenials` 상한(기본 3)이 결국 경고와 함께 편집을 허용하고, 읽기 도구는 절대 안 막으며, 마커는 프롬프트 단위(Tier 1/2 프롬프트가 해제)입니다. off 스위치는 `features.planGate` / `DISABLE_HARNESS`이고, 손상된 마커엔 fail-open 합니다. 판단 로직은 순수·단위테스트된 `lib/plan-gate.mjs`입니다.

> **한계(v1):** Edit/Write/NotebookEdit/MultiEdit만 막습니다. `Bash` 파일 쓰기(`echo > file`)는 우회 가능합니다. Bash까지 막으면 조사용 명령도 막혀 v1 제외입니다.

> `[omh:plan-gate]`를 방출합니다. [설정](configuration.ko.md)의 `planGate` 블록을 참고하세요.
