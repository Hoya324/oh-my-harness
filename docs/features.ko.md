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
