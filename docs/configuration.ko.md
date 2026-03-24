# 설정

모든 설정은 `.claude/.omh/harness.config.json`에 있습니다.

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
    "autoGitignore": true
  },
  "testEnforcement": { "minCases": 2, "promptOnMissing": true },
  "modelRouting": { "quick": "haiku", "standard": "sonnet", "complex": "opus" },
  "autoPlan": { "threshold": 3 },
  "ambiguityDetection": { "threshold": 2, "language": "auto" },
  "commitConvention": { "style": "auto" },
  "scopeGuard": { "allowedPaths": [] },
  "multiAgent": { "maxAgents": 4, "useWorktree": true, "tmuxSession": "omh-agents" }
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
