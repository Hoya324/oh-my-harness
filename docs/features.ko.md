# 기능

## Codex 지원

Claude Code판과 Codex판은 동일한 기능 코어, 설정, `.claude/.omh/` 프로젝트 상태, `~/.omh/memory/graph.jsonl` 메모리 저장소를 공유합니다. Codex는 네이티브 수명주기 훅, 동일한 공개 워크플로우 이름, `.agents/skills/` 스캐폴딩, quick/standard/architect 역할, 네이티브 협업 작업, 선택 가능한 Codex tmux 워커를 제공합니다.

표현 방식만 다르고 기반 상태는 같습니다. Claude Code는 커스텀 상태 표시줄 HUD를 유지합니다. Codex에는 동등한 커스텀 상태 표시줄 확장이 없으므로 가드 전환은 훅 메시지로 표시되고, 읽기 전용 `omh-status` 스킬이 티어, 루프, 검증, 사용량, 메모리 연결 상태를 보고합니다. 설치된 Codex 훅은 `/hooks`에서 검토하세요. OMH는 네이티브 신뢰 절차를 우회하지 않습니다.

| 기능 | Claude Code | Codex |
|---|---|---|
| 훅 | 네이티브 Claude 훅 페이로드 | 공유 코어 브리지를 통한 네이티브 Codex 페이로드 |
| 워크플로우 | `/omh-spec`, `/omh-loop`, `/omh-verify` | 동일한 공개 이름 |
| 프로젝트 스킬 | `.claude/skills/` | `.agents/skills/` |
| 상태 | 커스텀 HUD | 훅 메시지 + `omh-status` |

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

런타임 등록 후 OMH는 Claude Code 또는 Codex 생명주기에 훅으로 연결되어 자동으로 동작합니다. Codex 프로필과 지속 지침은 `/harness-setup` 또는 CLI init이 필요합니다.

아래 중 무엇이 동작하는지는 프로필에 따라 다릅니다. 새 설정은 `minimal`(위험 명령 가드, 검증 게이트, 컨벤션 감지, 커밋 컨벤션, 자동 `.gitignore`, 자동 생성 상태)로 시작하고, `standard`와 `full`이 기능을 더합니다. [프로필](#프로필)을 참고하고, 실제로 무엇이 발동했는지는 `oh-my-harness why`로 확인하세요.

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
│  │ → 안전할 때까지 차단   │   │ Codex? → 실행 전 차단 │            │
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
[omh:dangerous-guard]    → 파괴적 또는 malformed 요청 차단
[omh:model-routing → sonnet] → 구현 작업을 sonnet에 위임
[omh:test-enforcement]   → 코드 변경 후 테스트 확인 리마인드
[omh:commit-convention]  → git commit 후 커밋 형식 안내
[omh:scope-guard]        → 범위 밖 편집에 대한 Codex 차단 / Claude 보고
[omh:convention-detect]  → 세션 시작 시 프로젝트 컨벤션 감지
[omh:context-snapshot]   → 컨텍스트 압축 전 상태 저장
[omh:loop]               → 자율 루프의 강제 계속 / 중단 결정
[omh:cross-verify]       → 교차 검증 판정 (PASS / FAIL / INCONCLUSIVE)
[omh:spec]               → 스펙 작성 / 수용 기준 검사
[omh:tier]               → 프롬프트 무게 티어와 그 사유
[omh:override]           → 프롬프트 앞의 !t1 / !t3 / !noplan 적용
[omh:verify-gate]        → Stop 시점 검증 결과 (red면 차단)
[omh:plan-gate]          → Tier 3 플랜을 제시할 때까지 편집 차단
[omh:state]              → 세션 시작 시 STATE.md 재주입
[omh:handoff]            → 긴 세션: /omh-handoff와 새 세션 제안
```

모델 라우팅을 제외한 위 태그는 모두 `.claude/.omh/decisions.jsonl`에도 기록됩니다. [Decision Log](#decision-log)를 참고하세요.

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
[컨벤션 자동 감지](#1-컨벤션-자동-감지) · [테스트 강제](#2-테스트-강제) · [자동 Plan 모드](#4-자동-plan-모드) · [모호성 가드](#5-모호성-가드) · [위험 명령 가드](#6-위험-명령-가드) · [컨텍스트 스냅샷](#7-컨텍스트-스냅샷) · [커밋 컨벤션](#8-커밋-컨벤션) · [스코프 가드](#9-스코프-가드) · [사용량 추적](#10-사용량-추적) · [무게 라우팅](#15-무게-라우팅-tier-123) · [Living State](#17-living-state-statemd) · [검증 게이트](#검증-게이트) · [플랜 게이트](#플랜-게이트) · [핸드오프](#핸드오프)

**B. 자율 실행** — 직접 호출하는 워크플로우:
[네이티브 팀](#12-네이티브-팀) · [자율 루프](#13-자율-루프-autonomous-loop) · [스펙 작성](#14-스펙-작성-spec-authoring) · [N-라운드 검증](#16-n-라운드-독립-검증-omh-verify) · [문서 동기화](#문서-동기화-opt-in)

**C. 라우팅·스캐폴딩·관측** — 가로지르는 기능:
[상태 표시줄 (HUD)](#상태-표시줄-hud) · [모델 라우팅](#3-모델-라우팅) · [스킬 스캐폴딩](#11-스킬-스캐폴딩) · [Decision Log](#decision-log) · [프로필](#프로필)

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

Stop 시점에 working tree에서 바뀐 코드 파일(`git diff`, staged, untracked. git이 없으면 마지막 도구의 파일)을 모두 검사합니다:

- 테스트가 없는 변경 코드 → `[omh:anti-rationalization]`이 파일 목록을 보여주고 완료 선언을 금지
- 테스트는 있지만 **같은 diff에서 바뀐 테스트가 하나도 없음** → 기존 테스트가 새 동작을 검증하는지 확인하거나 테스트를 추가하라고 안내
- 테스트가 있고 테스트도 바뀜 → 실행해서 통과를 확인하라고 리마인드
- 각 테스트 파일에 최소 **N**개의 테스트 케이스 (설정 가능, 기본값: 2)

테스트 파일은 `.test.` / `.spec.` 이름, `test/` / `tests/` / `__tests__/` 디렉터리, 그리고 미러된 `src/test/...` 경로의 `FooTest.kt` 같은 JVM 이름으로 인식합니다.

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

잠재적으로 파괴적인 작업을 실행 전에 차단합니다:

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

> 이는 hard `PreToolUse` guard입니다. 감지된 안전하지 않은 작업과 malformed hook 입력은 안전한 형태로 바뀔 때까지 차단합니다.

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

`allowedPaths`와 함께 활성화하면 런타임별 이벤트 계약이 달라집니다. **Codex PreToolUse**는 실행 전에 범위 밖 편집과 감사 가능한 경로가 없는 인식된 파일시스템 mutation을 차단합니다. **Claude PostToolUse**는 기존 observer 등록을 유지하며 도구 실행 후 결과를 보고합니다.

```json
{
  "features": { "scopeGuard": true },
  "scopeGuard": { "allowedPaths": ["src/auth", "src/utils"] }
}
```

> 기본적으로 OFF입니다. Codex가 스코프 설정을 읽지 못해도 프로젝트 경계 fallback은 적용되어 프로젝트 내부 경로는 통과하고 외부로 나가는 traversal은 차단됩니다.

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

### 11. 스킬 스캐폴딩

감지된 컨벤션을 바탕으로 프로젝트 전용 `code-review`, `test-write`, `lint-fix` 스킬을 자동 생성합니다. Claude Code는 `.claude/skills/`, Codex는 `.agents/skills/`를 사용하며 `--runtime both`는 두 위치를 모두 생성합니다.

**생성되는 스킬:**

| 스킬 | 역할 |
|------|------|
| `code-review` | 언어별 리뷰 체크리스트 |
| `test-write` | 감지된 프레임워크의 테스트 작성 규칙 |
| `lint-fix` | 린트 검사와 자동 수정 워크플로우 |

**지원 언어:**

| 언어 | 테스트 프레임워크 | 린터 | 참고 |
|------|------------------|-------|------|
| Node.js | vitest / jest / mocha | eslint / biome | TypeScript 자동 감지 |
| Python | pytest | ruff / flake8 | black / ruff 포매팅 |
| Go | go test | golangci-lint | 테이블 주도 테스트 패턴 |
| Rust | cargo test | clippy | rustfmt 포매팅 |
| Java | junit | — | Gradle / Maven 빌드 |
| Kotlin | kotest / junit5 | ktlint / detekt | null 안전성 검사 |

**동작 순서:**

1. `/init-project` 또는 `oh-my-harness init --runtime <runtime>` 실행
2. 프로젝트 언어, 테스트 도구, 린터 감지
3. 감지된 도구 이름으로 템플릿 렌더링
4. 선택한 런타임의 네이티브 탐색 위치에 스킬 기록
5. 기존 사용자 스킬은 덮어쓰지 않으므로 자유롭게 수정

> 스킬은 사용자 소유 파일입니다. `oh-my-harness reset --runtime claude`, `--runtime codex`, `--runtime both` 모두 삭제하지 않습니다. 인자 없는 reset은 Claude만 기본 대상으로 합니다.

**세션 힌트:**

프로젝트 스킬이 없으면 세션 시작 시 다음 힌트를 표시합니다:

```text
[omh:skill-hint] No project skills found. Run /init-project to scaffold.
```

**설정:**

```json
{
  "features": { "skillScaffolding": true }
}
```

`features.skillScaffolding`을 `false`로 설정하면 세션 힌트와 init 스캐폴딩을 비활성화합니다.

### 12. 네이티브 팀

Claude Code 내장 팀 시스템 또는 Codex 협업 작업을 사용하여 병렬 작업을 오케스트레이션합니다 — tmux나 worktree 의존성이 필요 없습니다.

**템플릿:**

| 템플릿 | 구성원 | 에이전트 유형 |
|--------|--------|------------|
| `fullstack` | frontend + backend + tester | 모두 `standard` |
| `review` | reviewer + tester | `architect` + `standard` |
| `research` | researcher + implementer + architect | `quick` + `standard` + `architect` |

Claude는 이 공유 에이전트 유형을 haiku/sonnet/opus에 매핑합니다. Codex는 사용 가능한 프로필 선호도로 취급하며 특정 모델을 보장하지 않습니다.

**명령어:**

| 명령어 | 설명 |
|--------|------|
| `/team-spawn [template\|N] [task]` | 팀 생성, 작업 분해, 팀원 생성 |
| `/team-status` | 팀원 상태 및 작업 진행률 표시 |
| `/team-stop` | 미완료 작업 경고와 함께 팀 종료 |

**동작 방식:**

1. `/team-spawn fullstack 인증 시스템 구축` 실행
2. Claude는 TeamCreate, Codex는 확인된 `spawn_agent` 호출로 네이티브 팀 생성
3. 작업이 분해되어 팀원에게 할당
4. Claude는 SendMessage, Codex는 `send_message`로 소통하며 병렬 작업
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
quickCheck (lint / typecheck)  →  contract (선택)  →  verify (테스트 / 빌드)  →  self-review  →  cross-verify
   30초, 결정론적                  120초, 결정론적      180초, 결정론적            동일 모델       다른 모델
```

`contractCommand`는 변경 중인 코드 밖에 있는 지식을 검사합니다. API 스펙 diff(예: `openapi-diff`), 마이그레이션 검사(`flyway validate`), 아키텍처 규칙(ArchUnit) 등이며 자동 감지하지 않습니다. 실패한 단계는 위치부터 보고합니다. `file:line`을 가리키는 줄(gradle, kotlinc, tsc, eslint, pytest, go)을 먼저 보여주고, 없으면 빌드 도구가 실제 실패를 출력하는 출력 끝의 에러 줄을 보여줍니다. ktlint나 detekt를 쓰는 Kotlin/Java Gradle 프로젝트는 `./gradlew ktlintCheck` 또는 `./gradlew detekt`가 자동 quickCheck가 됩니다.

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
    "quickCheckCommand": "",
    "contractCommand": "",
    "verifyCommand": "",
    "rungTimeoutSec": { "quickCheck": 30, "verify": 180 }
  }
}
```

> `full` 프로필에서 켜지지만 `/omh-loop`이 활성 상태를 기록하기 전까지는 **비활성**입니다 — 루프가 아닌 세션에는 오버헤드가 없습니다. 전체 설정 블록과 설계 근거는 [자율 루프 가이드](loop.ko.md)를 참고하세요.

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

**훅:** `UserPromptSubmit` · **프로필:** standard (`features.weightRouting`)

각 프롬프트를 무게 Tier로 분류해 가드 강도를 비례 적용합니다. 작은 작업은 가볍게, 무거운 작업은 빠짐없이.

- **신호:** 태스크 수 휴리스틱 + 한/영 무게 암시 표현(`dictionary.mjs` `weightUp`/`weightDown`) + 설정형 도메인 키워드. 상향 신호가 하나라도 있으면 상향(보수적, 놓치지 않기 우선).
- **Tier 1(가벼움):** 컨벤션 리마인더만.
- **Tier 2(보통):** 컨벤션 체크리스트 + 테스트 + 셀프리뷰.
- **Tier 3(무거움):** 완료 선언 전 `/omh-verify` 실행을 강제 주입.
- **Override:** 프롬프트를 `!t1`이나 `!t3`로 시작하면 그 프롬프트의 티어를 강제하고, `!noplan`이면 티어는 유지한 채 플랜 게이트만 건너뜁니다. 모델에게는 이 토큰이 하네스 지시라고 알려줍니다. 사용할 때마다 분류기의 원래 판정과 함께 기록되므로(`override:t1 (classifier said 3)`), `oh-my-harness why`의 override 비율이 곧 분류기 오답률 지표가 됩니다.
- **추측이 아니라 측정:** `test/fixtures/prompts.jsonl`에 키워드 오탐과 키워드 없이 위험한 작업을 포함한 한/영 프롬프트 94개가 라벨과 함께 있습니다. 정확도, Tier 3 recall, Tier 1 precision이 `prompts.baseline.json`의 하한 아래로 떨어지면 CI가 실패합니다.

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

**훅:** `Stop`과 `PreCompact`(재생성) / `SessionStart`(주입) · **프로필:** minimal (`features.stateSync`)

`.claude/.omh/STATE.md`의 주인은 둘입니다. **Goal**과 **Key Decisions**는 사용자(또는 요청받은 모델)가 관리합니다. `<!-- OMH:AUTO:START -->`와 `<!-- OMH:AUTO:END -->` 사이 블록은 hook이 관리하며, 매 Stop과 압축 직전에 기계적 출처만으로 다시 생성합니다: 현재 브랜치, 최근 커밋 5개, 커밋 안 된 파일(최대 8개 이름), 루프 상태, 검증 게이트가 현재 diff를 통과시켰는지. 아무도 갱신을 기억할 필요가 없는 진행 기록은 어긋나지 않습니다.

세션 시작 시 사용자가 쓴 줄이 먼저, 이어서 스냅샷이 들어가며 1000자로 제한됩니다. `.claude/.omh`가 이미 있는 곳에서만 쓰고, 모든 단계는 fail-open입니다.

### 18. 장기 메모리 (Long-Term Memory)

**MCP:** `omh-memory` (지식그래프) · **사용 조건:** MCP 서버가 연결되어 있으면 항상 (feature 플래그 아님)

세션·런타임을 넘나드는 지식그래프. 고정 버전 `@modelcontextprotocol/server-memory@2026.7.4` 기반, 스토어는 `~/.omh/memory/graph.jsonl` — **Claude Code와 Codex가 공유하는 하나의 스토어**. 플러그인 MCP는 plugin root로 이동해 `bin/omh-memory.sh`를 실행하고 로컬 Codex init은 선택 scope 아래 launcher/library를 설치해 `[mcp_servers.omh-memory]`를 관리합니다.

- **읽기** — 계획 전에 `/omh-loop`·`/omh-spec`이 과거 학습·이미 검증된 `quickCheck`/`verify` 커맨드·기존 함정을 조회.
- **쓰기** — 실패한 iteration의 Reflexion은 `Learning`이 되고, 통과한 verify는 검증된 커맨드를 `Project`에 적립, `/omh-verify`는 고신뢰 findings(2+ 모델 합의)를 영속화.
- **접근** — 플러그인 사용자는 MCP 도구를 실시간으로 사용합니다. 로컬 Codex 프로젝트 설치는 `node .claude/.omh/runtime/lib/memory.mjs <command>`를 사용합니다. `oh-my-harness init --runtime codex --scope user` 실행 후 사용자 범위에서는 `node ~/.claude/.omh/runtime/lib/memory.mjs <command>`를 사용합니다. 시그니처는 `read`, `search <query>`, `add-learning <project> <text...>`, `add-observation <entity> <text...>`, `stats`입니다.
- **Graceful degradation** — 서버 미연결 시 LTM 단계는 조용히 스킵, 루프는 메모리 때문에 막히지 않음.
- **동시성** — 그래프 서버는 single-writer 설계. 개인용(한 번에 한 에이전트)엔 무해하나 양 런타임 동시 대량 쓰기는 피할 것.
- **실행/플랫폼 경계** — `npx --yes --prefer-offline`은 warm cache를 우선하지만 처음 uncached 실행은 npm registry/network 접근이 필요합니다. Release 검증은 macOS 현재 머신의 정확한 package cache를 warm합니다. Native Windows Codex hooks에는 `commandWindows`가 있고 MCP launcher에는 Bash가 필요합니다.

> 스토어: `~/.omh/memory/graph.jsonl`. 번들된 파일 메모리 seed 명령은 없습니다. 라이브 MCP 도구 또는 설치된 범위별 도우미로 observation을 가져오세요.

### 검증 게이트

**훅:** `Stop` (`verify-gate.mjs`) · **프로필:** minimal (`features.verifyGate`)

자율 루프는 `/omh-loop` *안에서만* 검증을 강제합니다. 검증 게이트는 동일한 하네스 소유 강제를 **평범한 세션**으로 가져옵니다. 매 Stop마다 모델의 자기판단이 아니라 **실제 working-tree diff**로 위험도를 점수화합니다:

| 신호 | 효과 |
|------|------|
| 민감 경로 (`**/auth/**`, `**/payment/**`, `*migration*`, `.env*`, …) | 최고 위험도로 격상 |
| 대규모 diff (`largeFiles`/`largeLines` 초과) | 격상 |
| 소스가 바뀌었는데 매칭 테스트 없음 | 사다리 실행 |
| 프롬프트 티어(1/2/3) | **하한**으로 작용 — `level = max(diffRisk, tierFloor)` |

위험도가 충분하면 훅이 **verify 사다리를 직접 실행**(중간 위험은 cheap quickCheck, 민감/대규모는 설정된 경우 `contractCommand`까지 포함한 전체 사다리)하고:
- **red** → 위치부터 보여주는 실패 보고와 함께 계속을 강제 (최상위 `{"decision":"block"}` + exit 0);
- **green / 저위험** → stop 허용. 민감/대규모 변경엔 `/omh-verify` 교차모델 권고도 붙습니다.

**세션을 절대 가두지 않습니다.** 변경당 `maxBlocks` 상한이 (기존에 red인 베이스라인에 대해서도) 결국 stop을 허용하도록 보장하고, `stop_hook_active` 재진입 가드·already-verified 스킵·활성 루프 비켜남·빈 사다리/git 부재 통과·off 스위치(`features.verifyGate`, `DISABLE_HARNESS`, `STOP`)·모든 오류에 fail-open이 더해집니다. 판단 로직은 순수·단위테스트된 `lib/risk.mjs`입니다.

> `[omh:verify-gate]`를 방출합니다. [설정](configuration.ko.md)의 `verifyGate` 블록을 참고하세요.

### 플랜 게이트

**훅:** `PreToolUse` (`plan-gate.mjs`) · **프로필:** standard (`features.planGate`)

검증 게이트가 턴 *이후* 검증을 강제한다면, 플랜 게이트는 턴 *이전* 계획을 강제합니다. **Tier 3 프롬프트**(기존 프롬프트 무게 분류기 — 아키텍처·보안·마이그레이션·5+ 작업·도메인 키워드)면 `pre-prompt.mjs`가 프롬프트 단위 마커를 켜고 계획 지시를 주입합니다. 그러면 PreToolUse 훅이 계획 전까지 편집 도구를 **차단**합니다:

| 도구 | armed 상태에서의 동작 |
|------|---------------------|
| `Edit` / `Write` / `NotebookEdit` / `MultiEdit` | 계획 지시와 함께 **차단** (해제 전까지) |
| `Read` / `Grep` / `Glob` / `EnterPlanMode` / … | 항상 허용 (계획하려면 조사해야 하니까) |
| `ExitPlanMode` | 요구사항 **해제** → 이후 편집 허용 |

즉 무거운 프롬프트는 모델이 `EnterPlanMode`를 호출해 **Context · 접근 · 변경 파일 · 검증** 구조로 구현 플랜을 작성·제시·승인받은 뒤에야 편집할 수 있게 만듭니다. (훅은 Claude를 plan모드로 직접 전환할 수 없습니다 — 모델이나 사용자만 가능 — 그래서 편집을 막아 간접적으로 강제합니다.)

이 표는 Claude 계약입니다. Codex bridge는 `apply_patch`를 edit로 매핑하고, 비어 있지 않으며 각 항목의 `step`이 비어 있지 않고 `status`가 허용 값인 `update_plan`만 공유 게이트를 해제합니다. 그 밖의 payload는 해제하지 않으며 denial 상한은 최종 non-wedging 탈출구로 남습니다.

**세션을 절대 가두지 않습니다.** 프롬프트당 `maxDenials` 상한(기본 3)이 결국 경고와 함께 편집을 허용하고, 읽기 도구는 절대 안 막으며, 마커는 프롬프트 단위(Tier 1/2 프롬프트나 앞에 붙인 `!noplan`이 해제)입니다. off 스위치는 `features.planGate` / `DISABLE_HARNESS`입니다. Claude wrapper는 손상된 marker에서 fail open이지만, Codex critical preflight는 armed marker가 손상되고 mapped gated tool이면 fail closed입니다. 판단 로직은 순수·단위테스트된 `lib/plan-gate.mjs`입니다.

> **한계(v1):** Claude는 Edit/Write/NotebookEdit/MultiEdit를 막고 Codex는 `apply_patch`도 매핑합니다. `Bash` 파일 쓰기(`echo > file`)는 우회 가능하며 Bash 전체 gating은 조사 명령까지 막으므로 v1 제외입니다.

> `[omh:plan-gate]`를 방출합니다. [설정](configuration.ko.md)의 `planGate` 블록을 참고하세요.

### Decision Log

**기록 주체:** 모든 hook · **프로필:** 항상 켜짐 (`OMH_DECISION_LOG=0`이면 끔)

silent가 아닌 hook 출력은 모두 `.claude/.omh/decisions.jsonl`에 JSON 한 줄로 추가됩니다: 시각, hook, 이벤트, 결정(`context`, `warn`, `block`, `deny`), 내보낸 `[omh:*]` 태그, 그리고 프롬프트의 경우 티어, 사유, override, 세션 id. 프롬프트 원문과 파일 내용은 저장하지 않습니다. 약 500줄로 제한되고, `.claude/.omh`가 이미 있는 곳에서만 쓰며, 기록 때문에 hook 출력이 바뀌는 일은 없습니다.

```bash
oh-my-harness why              # 최근 판정 10개, hook별 횟수, override 비율, Stop p50/p95
oh-my-harness why --last 30
oh-my-harness why --json       # entries + summary + suggestions
```

`why`는 기록에 근거해 기능 변경도 제안합니다: 일주일에 검증 게이트 block이 3회 이상이면 `planGate`와 `testEnforcement` 켜기, 14일간 발동하지 않은 안내 기능은 끄기, 라우팅된 프롬프트 20개 이상 중 30% 넘게 override되면 `tier3.domainKeywords` 재검토. 안전 가드는 끄기를 제안하지 않습니다.

### 핸드오프

**스킬:** `/omh-handoff` · **CLI:** `oh-my-harness handoff` · **제안 hook:** `UserPromptSubmit` (`features.stateSync`)

한 세션에는 하나의 컨텍스트만 두는 게 좋습니다. 압축이 일어났거나 한 세션의 프롬프트가 `handoff.promptThreshold`(기본 40)를 넘으면 `[omh:handoff]`가 세션당 한 번 핸드오프를 제안합니다. `oh-my-harness handoff`는 `STATE.md` 스냅샷을 갱신하고 **Tried**, **Worked**, **Failed (and why)**, **Next steps** 섹션과 Goal, Decisions, 자동 생성 스냅샷을 담은 `.claude/.omh/HANDOFF.md`를 만듭니다. 스킬은 이 네 섹션만 채우고, 다음 세션은 이 파일로 시작하면 됩니다.

### 프로필

`oh-my-harness init --profile minimal|standard|full`(그리고 `/harness-setup`의 같은 선택지)은 **새** 설정에서 켤 기능을 정합니다. 기존 설정은 다시 바꾸지 않습니다.

| 프로필 | 켜지는 기능 |
|--------|-------------|
| `minimal` (기본값) | `dangerousGuard`, `verifyGate`, `conventionSetup`, `commitConvention`, `autoGitignore`, `stateSync` |
| `standard` | minimal + `testEnforcement`, `weightRouting`, `planGate`, `contextSnapshot`, `skillScaffolding`, `contextOptimization` |
| `full` | 템플릿 기본값 전체 (`scopeGuard`를 뺀 모든 기능) |

작게 시작하고, `oh-my-harness why`가 필요를 보여줄 때 `/set-harness features.<name> true`로 더 켜세요.

### 문서 동기화 (opt-in)

**CLI:** `oh-my-harness docs-sync --install | --uninstall | --print` · **스킬:** `/omh-docs-sync`

`pre-push` git hook을 설치합니다. push할 때 브랜치에서 바뀐 코드 파일을 `claude -p "/omh-docs-sync ..."`에 넘기며, Read, Grep, Glob, Edit만 허용합니다. 스킬은 그 변경 때문에 틀려진 문서(와 한글 쌍)만 고칩니다. 문서가 하나라도 바뀌면 push를 멈춰 문서 변경을 검토하고 코드와 함께 커밋하게 합니다. `claude` CLI가 없거나 실행이 실패하거나 `OMH_DOCS_SYNC=0`이면 push를 막지 않습니다. 직접 만든 pre-push hook은 `--force` 없이 덮어쓰지 않고, 제거하지도 않습니다.
