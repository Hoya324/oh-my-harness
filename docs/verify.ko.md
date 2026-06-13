# 검증 & 무게 인식 하네스 (Verification & Weight-Aware Harness)

> 작업의 무게에 가드레일을 맞추고, 무거운 작업은 완료 선언 전에 **독립적인 다중 모델** 라운드로 검증한다.

무게 인식 하네스는 세 부분으로 구성됩니다: **무게 라우팅**(모든 프롬프트 분류), **`/omh-verify`**(N-라운드 독립 검증·수정), **Living State**(`STATE.md`). 이들은 [자율 루프](loop.ko.md)를 보완합니다 — 루프가 *한 작업을 완료까지* 끌고 간다면, 이쪽은 *얼마나 깐깐하게* 볼지를 정하고 외부의 눈으로 검증합니다.

---

## 무게 라우팅 (Tier 1 / 2 / 3)

`UserPromptSubmit` 훅이 각 프롬프트를 무게 티어로 분류하고 가드레일을 비례 적용합니다 — 가벼운 작업은 마찰 없이, 무거운 작업은 조입니다.

| 티어 | 무게 | 정책 |
|:----:|------|------|
| **1** | 사소함 (typo, rename, 한 줄) | 최소 마찰 |
| **2** | 일반 기능 / 버그픽스 | 일반 가드 |
| **3** | 무거움 / 위험 (넓은 범위, 다수 파일, 민감 도메인) | **완료 전 검증 강제** |

Tier 3 승격은 `tier3.*` 임계값으로 결정됩니다:

```jsonc
"tier3": {
  "taskThreshold": 5,     // 독립 작업 N개 이상 → Tier 3
  "fileThreshold": 5,     // 변경 파일 N개 이상 → Tier 3
  "domainKeywords": []    // Tier 3 강제 키워드 (예: "payment", "auth")
}
```

훅은 `[omh:weight]` 태그로 어떤 티어가 발동했는지 보여줍니다.

---

## `/omh-verify` — N-라운드 독립 검증

`/omh-verify`는 `git diff`를 **N개의 독립 라운드**로 돌리며, 라운드마다 검증 모델을 로테이션해 한 모델이 자기 작업에 도장 찍는 걸 막습니다.

```bash
/omh-verify              # verify 설정에 따라 현재 diff를 검증
```

설정(`verify` 블록):

```jsonc
"verify": {
  "rounds": 3,
  "stopWhenClean": true,   // 한 라운드가 NO ISSUES면 조기 종료
  "autoFix": false,        // true: 수정 적용 / false: 사용자에게 제안
  "lenses": [
    { "model": "claude",  "via": "native-subagent", "focus": "correctness" },
    { "model": "gpt",     "via": "codex",  "cmd": "codex exec",                 "focus": "convention" },
    { "model": "gemini",  "via": "gemini", "cmd": "gemini -p --approval-mode plan", "focus": "regression" }
  ]
}
```

동작 방식:

- **라운드 `i`는 렌즈 `i mod len(lenses)`** 사용 — Claude(correctness) → GPT/codex(convention) → Gemini(regression) 순환.
- 각 라운드는 **독립**: 이전 라운드 결론을 다음 검증자에게 주입하지 않음(셀프 도장 방지).
- 외부 검증자는 **읽기 전용**(`codex exec -s read-only`); 수정은 메인 루프만 적용.
- CLI 미설치 모델은 자동 제외 — Claude 단독으로 **graceful degrade**.
- 최종 리포트는 라운드별 발견을 표로 정리하고 **모델 간 합의**(2개 이상 모델이 같은 지적 = high-confidence)를 표시.

자율 루프의 교차검증이 *SPEC 충족*을 확인하는 것이라면, `/omh-verify`는 언제든 돌릴 수 있는 diff 중심의 다중 모델 리뷰입니다. Tier 3 무게 라우팅은 무거운 작업이 완료로 간주되기 전에 이 검증을 강제합니다.

---

## Living State (`STATE.md`)

디스크에 고정되는 `STATE.md`가 현재 목표·단계·주요 결정·진행 상황을 담습니다. **SessionStart**에 재주입되고 **PreCompact**에 통합되어, 길거나 압축된 세션에서도 맥락을 잃지 않습니다(context rot 방어). 루프의 `PROGRESS.md`와 짝을 이룹니다 — `STATE.md`는 "지금 어디에 있나"의 영속 앵커, `PROGRESS.md`는 iteration별 로그입니다.

---

## 설정

모든 설정은 `.claude/.omh/harness.config.json`에 있습니다(프로젝트 로컬, `~/.claude/.omh` 전역 fallback). `features.weightRouting`으로 켜고 끄며, `tier3.*`·`verify.*`를 위와 같이 조정합니다. 전체 레퍼런스는 [Configuration](configuration.ko.md) 참고.
