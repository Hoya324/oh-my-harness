# 설정

설정은 `.claude/.omh/harness.config.json`에 있습니다.

## 설정 탐색 순서 (프로젝트 → 전역)

훅은 다음 순서로 config를 찾아 **먼저 존재하는 것**을 사용합니다:

1. `<프로젝트>/.claude/.omh/harness.config.json` — 프로젝트 로컬 (우선)
2. `~/.claude/.omh/harness.config.json` — 사용자 전역 fallback

전역 기본값(User 스코프)을 한 번 설정해 모든 프로젝트에 적용하면서, 프로젝트별로 덮어쓸 수 있습니다. 둘 다 없으면 훅은 아무 동작도 하지 않습니다.

## 기본 설정

```json
{
  "version": 1,
  "features": {
    "conventionSetup": true,
    "testEnforcement": true,
    "contextOptimization": true,
    "autoPlanMode": true,
    "ambiguityDetection": true,
    "dangerousGuard": true,
    "contextSnapshot": true,
    "commitConvention": true,
    "scopeGuard": false,
    "usageTracking": true,
    "autoGitignore": true,
    "nativeTeam": true,
    "autonomousLoop": true
  },
  "testEnforcement": { "minCases": 2, "promptOnMissing": true },
  "modelRouting": { "quick": "haiku", "standard": "sonnet", "complex": "opus" },
  "autoPlan": { "threshold": 3 },
  "ambiguityDetection": { "threshold": 2, "language": "auto" },
  "commitConvention": { "style": "auto" },
  "scopeGuard": { "allowedPaths": [] },
  "multiAgent": { "maxAgents": 4, "useWorktree": true, "tmuxSession": "omh-agents" },
  "nativeTeam": { "maxTeammates": 4, "defaultTeamName": "omh-team" },
  "loop": {
    "classify": "auto",
    "defaultTier": "quick",
    "requireSpec": true,
    "specPath": "SPEC.md",
    "logFile": "PROGRESS.md",
    "learningsFile": ".claude/.omh/loop-learnings.md",
    "requireCommit": true,
    "oneTaskPerIteration": true,
    "maxDiffFilesPerIteration": 20,
    "maxTotalIterations": 30,
    "stopOnNoProgress": true,
    "quickCheckCommand": "",
    "verifyCommand": "",
    "verifyInHook": true,
    "rungTimeoutSec": { "quickCheck": 30, "verify": 180 },
    "crossVerify": true,
    "crossVerifyModel": "architect",
    "maxDeepVerifiesPerTask": 3,
    "reflectionWindow": 3,
    "tiers": {
      "quick":    { "model": "standard",  "maxIterations": 3,  "maxWallClockMinutes": 5,  "plateauWindow": 2, "crossVerify": false, "marginalGainEpsilon": 0.05 },
      "standard": { "model": "standard",  "maxIterations": 8,  "maxWallClockMinutes": 15, "plateauWindow": 2, "crossVerify": true,  "crossVerifyEvery": 0, "marginalGainEpsilon": 0.03 },
      "deep":     { "model": "architect", "maxIterations": 20, "maxWallClockMinutes": 45, "plateauWindow": 3, "crossVerify": true,  "crossVerifyEvery": 5, "marginalGainEpsilon": 0.02 }
    }
  }
}
```

## 설정 변경

```bash
/set-harness                                # 현재 설정 전체 보기
/set-harness features.scopeGuard true       # 스코프 가드 활성화
/set-harness testEnforcement.minCases 3     # 테스트 케이스 3개 이상 요구
/set-harness modelRouting.standard opus     # 구현에 opus 사용
/set-harness commitConvention.style gitmoji # gitmoji로 전환
/set-harness multiAgent.maxAgents 6         # 최대 6개 에이전트 허용
/set-harness nativeTeam.maxTeammates 6        # 최대 6명의 팀원 허용
```

## 설정 레퍼런스

| 경로 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `features.conventionSetup` | bool | `true` | 프로젝트 컨벤션 자동 감지 |
| `features.testEnforcement` | bool | `true` | 변경 후 테스트 리마인드 |
| `features.contextOptimization` | bool | `true` | 모델 라우팅 활성화 |
| `features.autoPlanMode` | bool | `true` | 다중 작업 시 Plan 모드 제안 |
| `features.ambiguityDetection` | bool | `true` | 모호한 요청에 명확화 강제 |
| `features.dangerousGuard` | bool | `true` | 파괴적 명령 전 경고 |
| `features.contextSnapshot` | bool | `true` | 압축 전 상태 저장 |
| `features.commitConvention` | bool | `true` | 커밋 형식 안내 |
| `features.scopeGuard` | bool | `false` | 파일 수정 범위 제한 |
| `features.usageTracking` | bool | `true` | 도구 사용량 추적 |
| `features.autoGitignore` | bool | `true` | .gitignore 자동 업데이트 |
| `testEnforcement.minCases` | number | `2` | 파일당 최소 테스트 케이스 |
| `testEnforcement.promptOnMissing` | bool | `true` | 테스트 미존재 시 알림 |
| `modelRouting.quick` | string | `haiku` | 탐색용 모델 |
| `modelRouting.standard` | string | `sonnet` | 구현용 모델 |
| `modelRouting.complex` | string | `opus` | 아키텍처용 모델 |
| `autoPlan.threshold` | number | `3` | 자동 Plan 트리거 작업 수 |
| `ambiguityDetection.threshold` | number | `2` | 명확화 트리거 점수 |
| `commitConvention.style` | string | `auto` | `auto` / `conventional` / `gitmoji` |
| `scopeGuard.allowedPaths` | string[] | `[]` | 허용 디렉토리 (빈 배열 = 제한 없음) |
| `multiAgent.maxAgents` | number | `4` | 최대 병렬 에이전트 수 |
| `multiAgent.useWorktree` | bool | `true` | 격리를 위한 git worktree 사용 |
| `multiAgent.tmuxSession` | string | `omh-agents` | tmux 세션 이름 |
| `features.nativeTeam` | bool | `true` | 네이티브 팀 스킬 활성화 |
| `nativeTeam.maxTeammates` | number | `4` | 팀당 최대 팀원 수 |
| `nativeTeam.defaultTeamName` | string | `omh-team` | 기본 팀 이름 |
| `features.autonomousLoop` | bool | `true` | 스펙 기반 자율 루프(`/omh-loop`) 활성화 |
| `features.weightRouting` | bool | `true` | 작업 무게(Tier 1/2/3) 판정 후 가드 비례 적용 |
| `features.verifyGate` | bool | `true` | 평범한 세션에서 위험도 기반 검증 게이트(Stop 훅) 활성화 |
| `verifyGate.riskThreshold` | number | `2` | 사다리를 실행할 최소 위험도(0–3) |
| `verifyGate.maxBlocks` | number | `2` | 변경당 차단 횟수 상한 → 이후 stop 허용 (절대 wedge 안 함) |
| `verifyGate.runLadder` | bool | `true` | 결정론적 사다리 실행 여부 (끄면 소프트 리마인드만) |
| `verifyGate.recommendCrossVerify` | bool | `true` | 민감/대규모 변경에 `/omh-verify` 권고 |
| `verifyGate.largeFiles` / `largeLines` | number | `8` / `400` | 위험도 점수의 diff 규모 임계값 |
| `verifyGate.sensitivePaths` | string[] | auth/payment/migration/.env/… | 최고 위험도로 격상시키는 글롭 |
| `features.planGate` | bool | `true` | Tier 3 프롬프트는 편집 전 plan모드 플랜 강제 |
| `planGate.minTier` | number | `3` | 프롬프트 티어가 이 값 이상이면 게이트 발동 |
| `planGate.maxDenials` | number | `3` | 프롬프트당 편집 차단 횟수 상한 (never-wedge) |
| `planGate.gatedTools` | string[] | Edit/Write/NotebookEdit/MultiEdit | 플랜 전까지 차단할 도구 |

> `features.autonomousLoop`는 기본값이 ON이지만 `/omh-loop`가 활성 루프 상태를 기록하기 전까지는 동작하지 않습니다 — 루프를 사용하지 않는 세션에는 오버헤드가 전혀 없습니다(활성 루프가 없으면 Stop 훅이 즉시 반환).

> `features.verifyGate`는 기본값 ON: 평범한 세션(활성 `/omh-loop` 없음)에서 Stop 훅이 매 턴 diff를 점수화(민감 경로·규모·무테스트 소스, 프롬프트 티어가 하한)하고 위험도가 충분하면 verify 사다리를 실행해 실제 red면 차단합니다. 활성 루프엔 비켜나며, `maxBlocks` 상한 + fail-open으로 세션을 절대 가두지 않습니다. `/set-harness features.verifyGate false`로 끌 수 있습니다.

> `features.planGate`는 기본값 ON: Tier 3 프롬프트는 모델이 plan모드에 진입해 구현 플랜(Context · 접근 · 변경 파일 · 검증)을 제시하기 전까지 편집 도구(Edit/Write/NotebookEdit/MultiEdit)를 차단합니다. `ExitPlanMode`가 해제합니다. 읽기 도구는 항상 통과하고, 프롬프트당 `maxDenials` 상한으로 절대 가두지 않습니다. `/set-harness features.planGate false`로 끌 수 있습니다.

---

## 자율 루프 (`loop` 블록)

`loop` 블록은 `/omh-loop`로 실행되는 스펙 기반 자율 루프를 설정합니다. 루프는 계속할지/멈출지를 강제하며, *언제 멈출지*는 모델의 자가 판단이 아니라 하네스가 소유합니다. 전체 설계는 **[자율 루프](loop.ko.md)** 를 참고하세요.

설정은 기본값에 deep-merge되므로 변경하려는 필드만 덮어쓰면 됩니다.

| 경로 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `loop.classify` | string | `auto` | 티어 선택: `auto`(휴리스틱) / `quick` / `standard` / `deep` |
| `loop.defaultTier` | string | `quick` | 시작 티어; 관측된 신호에 따라 `standard`/`deep`로 상향 |
| `loop.requireSpec` | bool | `true` | 루프 시작 전에 `SPEC.md` 필수 |
| `loop.specPath` | string | `SPEC.md` | EARS 인수 기준이 담긴 스펙 경로 |
| `loop.logFile` | string | `PROGRESS.md` | 사람이 읽는 계획 + 반복 로그 |
| `loop.learningsFile` | string | `.claude/.omh/loop-learnings.md` | 반복 간 빌드/테스트 호출 캐시 |
| `loop.requireCommit` | bool | `true` | 반복마다 커밋(커밋 수 = 반복 수, diff = 진행도) |
| `loop.oneTaskPerIteration` | bool | `true` | 반복당 하나의 작업 단위 |
| `loop.maxDiffFilesPerIteration` | number | `20` | diff가 이 값을 넘으면 반복 분할(스멜 가드) |
| `loop.maxTotalIterations` | number | `30` | 티어 간 총 반복 상한(하드 월) |
| `loop.stopOnNoProgress` | bool | `true` | 정체(개선 없음 + 빈/형식적 diff) 시 중단 |
| `loop.quickCheckCommand` | string | `""` | 빠른 단계(린트/타입체크); 비우면 컨벤션에서 자동 감지 |
| `loop.verifyCommand` | string | `""` | 전체 단계(테스트/빌드); 비우면 자동 감지 |
| `loop.verifyInHook` | bool | `true` | 저비용 검증 단계를 Stop 훅 안에서 실행 |
| `loop.rungTimeoutSec.quickCheck` | number | `30` | `quickCheck` 단계별 서브프로세스 타임아웃(초) |
| `loop.rungTimeoutSec.verify` | number | `180` | `verify` 단계별 서브프로세스 타임아웃(초) |
| `loop.crossVerify` | bool | `true` | 다른 모델에 의한 교차 검증 활성화 |
| `loop.crossVerifyModel` | string | `architect` | 판정자 모델 라우팅 슬롯(생성자와 다른 모델) |
| `loop.maxDeepVerifiesPerTask` | number | `3` | 작업당 고비용 교차 검증 횟수 상한 |
| `loop.reflectionWindow` | number | `3` | 반복마다 재주입하는 최근 Reflexion 항목 수 |

### 티어 예산 (`loop.tiers`)

각 티어는 자체 반복 및 월클럭 예산과 검증 깊이를 설정합니다. 루프는 가장 저렴한 티어에서 시작하고 신호(검증 실패, 큰 diff, 재계획, 반복되는 실패 시그니처)가 있을 때만 상향됩니다.

| 필드 | `quick` | `standard` | `deep` |
|------|---------|------------|--------|
| `model` | `standard` | `standard` | `architect` |
| `maxIterations` | `3` | `8` | `20` |
| `maxWallClockMinutes` | `5` | `15` | `45` |
| `plateauWindow` | `2` | `2` | `3` |
| `crossVerify` | `false` | `true` | `true` |
| `crossVerifyEvery` | — | `0` (완료 시) | `5` (+완료 시) |
| `marginalGainEpsilon` | `0.05` | `0.03` | `0.02` |

> **비용 튜닝.** 기본 반복 예산(quick 3 / standard 8 / deep 20)은 권장 시작점입니다. 설계의 리서치 단계는 더 보수적인 수치 — **quick 3 / standard 5 / deep 8** — 를 비용 절감 옵션으로 제안했습니다. `tiers.*.maxIterations`(및/또는 `maxTotalIterations`)를 낮춰 적용하세요.

```bash
/set-harness features.autonomousLoop false       # 자율 루프 비활성화
/set-harness loop.defaultTier standard           # 루프를 standard 티어에서 시작
/set-harness loop.tiers.standard.maxIterations 5 # 보수적인 3/5/8 예산 적용
/set-harness loop.crossVerify false              # 교차 검증 완전히 끄기
```

---

## 무게 인식 라우팅 (`tier3` 블록)

`features.weightRouting`가 켜져 있으면 하네스는 모든 프롬프트의 무게를 Tier 1/2/3으로 자동 분류하고, 가드를 무게에 비례해 적용합니다. Tier 3(고위험·대규모)으로 판정되면 검증이 강제됩니다. 전체 설계는 **[검증 & 무게 인식 하네스](verify.ko.md)** 를 참고하세요.

설정은 기본값에 deep-merge되므로 변경하려는 필드만 덮어쓰면 됩니다.

| 경로 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `tier3.taskThreshold` | number | `5` | Tier 3 강제 태스크 수 |
| `tier3.fileThreshold` | number | `5` | Tier 3 강제 변경 파일 수 |
| `tier3.domainKeywords` | string[] | `[]` | Tier 3 강제 도메인 용어 (예: `["결제","매출"]`) |

## 독립 검증 (`verify` 블록)

`verify` 블록은 `/omh-verify`로 실행되는 N회 독립 멀티모델 검증+수정 루프를 설정합니다. 각 라운드는 Claude / GPT-codex / Gemini 렌즈를 로테이션하며, 외부 검증자는 읽기 전용으로 동작합니다.

| 경로 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `verify.rounds` | number | `3` | `/omh-verify` 독립 검증 라운드 수 |
| `verify.stopWhenClean` | bool | `true` | 발견 없는 라운드에서 조기 종료 |
| `verify.autoFix` | bool | `false` | 자동 수정 (false면 확인 후) |
| `verify.lenses` | object[] | claude/gpt/gemini | 검증자 모델+초점, 라운드마다 로테이션; 미설치 CLI 자동 제외 |

```bash
/set-harness features.weightRouting false        # 무게 인식 라우팅 비활성화
/set-harness tier3.taskThreshold 3               # 더 빨리 Tier 3로 상향
/set-harness verify.rounds 2                      # 독립 검증 2라운드로
/set-harness verify.autoFix true                  # 검증 결과 자동 수정
```

---

## CLI 명령어

```bash
oh-my-harness init      # 현재 프로젝트에 하네스 설정
oh-my-harness update    # 설정에서 세팅 재생성
oh-my-harness status    # 현재 설정 표시
oh-my-harness reset     # 모든 하네스 파일 제거 (완전 삭제)
```

## 슬래시 명령어 (스킬)

| 명령어 | 설명 |
|--------|------|
| `/harness-setup` | oh-my-harness 초기화 (플러그인 모드) |
| `/set-harness [경로] [값]` | 하네스 설정 보기 또는 수정 |
| `/init-project` | 컨벤션 감지 및 테스트 인프라 설정 |
| `/agent-spawn [N] [작업]` | N개의 병렬 Claude 에이전트를 tmux에서 실행 |
| `/agent-status` | 실행 중인 에이전트 상태 확인 |
| `/agent-apply [id\|all]` | 에이전트 worktree 변경사항 머지 |
| `/agent-stop [id\|all]` | 에이전트 중지 및 정리 |
| `/team-spawn [template\|N] [작업]` | 팀원과 함께 네이티브 팀 생성 |
| `/team-status` | 팀 및 작업 진행률 확인 |
| `/team-stop` | 팀 종료 및 정리 |
| `/omh-spec [목표]` | 기계 검증 가능한 `SPEC.md` 작성 (EARS 인수 기준) |
| `/omh-loop [목표\|SPEC.md]` | 스펙 기반 자율 루프 실행 |
| `/omh-loop stop` | 실행 중인 루프 중단 (킬 스위치) |

---

## OMC 호환성

Oh My Harness는 [Oh My ClaudeCode](https://github.com/yeachan-heo/oh-my-claudecode)와 충돌 없이 공존합니다:

| 항목 | OMH | OMC |
|------|-----|-----|
| CLAUDE.md 마커 | `<!-- HARNESS:START/END -->` | `<!-- OMC:START/END -->` |
| 훅 네임스페이스 | `.omh/hooks/` | OMC 플러그인 훅 |
| 스킬 접두사 | (없음) | `oh-my-claudecode:` |
| 에이전트 접두사 | `harness:` | `oh-my-claudecode:` |
| 킬 스위치 | `DISABLE_HARNESS=1` | `DISABLE_OMC=1` |

두 플러그인을 동시에 설치해도 충돌이 발생하지 않습니다.

---

## 비활성화 / 삭제

```bash
# 일시적 비활성화 (환경 변수)
DISABLE_HARNESS=1 claude

# 플러그인 모드 — 삭제
claude plugin uninstall oh-my-harness@oh-my-harness

# npm 모드 — 완전 제거
oh-my-harness reset
npm uninstall -g oh-my-harness
```

## 요구사항

- **Node.js** >= 18
- **Claude Code** CLI
- **tmux** — 멀티 에이전트 전용 (`brew install tmux`)
- **git** — worktree 격리용
