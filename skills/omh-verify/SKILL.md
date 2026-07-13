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
3. **리포트:** 라운드별 발견·수정 요약 + 모델 간 합의/불일치(2개 이상 모델이 같은 지적 = high-confidence)를 표로 출력한다. **고신뢰(2+ 합의) 항목은 LTM에 적립한다**(장기메모리 참조).

## 장기메모리 (LTM)

`omh-memory` MCP(지식그래프 `~/.omh/memory/graph.jsonl`, **Claude·Codex 공유**)에 검증 결과를 영속화한다.
연결 시 MCP 툴, 아니면 CLI 폴백, 둘 다 없으면 **조용히 스킵**(graceful degrade — 검증을 막지 않는다).

- **읽기(시작 시):** 이 프로젝트의 과거 고신뢰 findings를 조회해 이번 검증 focus에 반영(재발견 방지).
  - MCP: `search_nodes({query: "<project> finding"})`  ·  CLI: `node ~/.omh/lib/memory.mjs search "<project>"`
- **쓰기(리포트 후):** **2개 이상 모델이 합의한 고신뢰 findings**를 `Finding`으로 적립(`about`→`Project`).
  다음 루프/세션이 같은 문제를 재발견하지 않게 한다.
  - MCP: `create_entities`+`create_relations`  ·  CLI: `node ~/.omh/lib/memory.mjs add-learning "<project>" "high-conf: <finding>"`

## 원칙
- 각 라운드는 **독립**이다: 이전 라운드 결론을 검증자에게 주입하지 말 것(셀프 도장 방지).
- 외부 검증자는 **읽기 전용**이다. 수정은 메인 루프(너)가 적용한다.
- CLI 미설치 모델은 자동 제외된다(Claude 단독으로 graceful degrade).
