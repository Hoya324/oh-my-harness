/**
 * Language dictionary for oh-my-harness hooks.
 *
 * Centralises all locale-specific regex patterns and message templates so that
 * individual hooks stay language-agnostic.
 *
 * Adding a new language:
 *   1. Add a new key (e.g. "ja") to `dictionary`.
 *   2. Provide `patterns` and `messages` following the same shape as "ko"/"en".
 */

const dictionary = {
  ko: {
    patterns: {
      // Auto-Plan: conjunctions that link independent tasks
      conjunctions: /(그리고|또한|추가로|아울러|더불어|그 다음)/g,
      // Ambiguity: vague demonstrative pronouns
      vaguePronouns: /(?:이거|그거|저거|이것|그것|저것)\s/,
      // Ambiguity: broad action verbs + imperative endings (no specific target)
      vagueVerbs:
        /(?:리팩토링|개선|정리|수정|고쳐|바꿔|변경|업데이트|리뷰|확인|분석|살펴|점검|검토|체크)(?:해줘|해주세요|하자|해봐)/,
      // Specificity: nouns that indicate a concrete target
      targetNouns: /(?:파일|함수|클래스|메서드|컴포넌트|모듈)\s/,
      // Ambiguity: expressions showing indecision / open choice
      vagueExpressions: /(?:하거나|든지|같은거|뭐든|아무거나)/,
      // Ambiguity: open-ended scope markers ("등", "기타")
      // Note: \b doesn't work with Korean chars — use \s or $ instead
      openEndedScope: /(?:,?\s*등을?\s|,?\s*등$|등등|기타)/,
    },
    messages: {
      autoPlan: (count) =>
        `[omh:auto-plan] ${count}개의 독립 작업이 감지되었습니다. EnterPlanMode 도구를 호출하여 plan 모드로 전환하세요.`,
      ambiguityGuard:
        '[omh:ambiguity-guard] 요청이 모호합니다. 작업 전에 AskUserQuestion 도구로 사용자에게 구체적 범위와 방향을 확인하세요.',
      testEnforcement: (minCases) => [
        `[omh:test-enforcement] 코드 변경이 감지되었습니다. 다음을 확인하세요:`,
        `1. 변경된 코드에 대한 테스트 파일이 존재하는지 확인`,
        `2. 각 테스트 파일에 최소 ${minCases}개 이상의 테스트 케이스가 있는지 확인`,
        `3. 테스트가 없다면 사용자에게 테스트 추가를 제안`,
      ],
      testEnforcementPrompt:
        '4. 테스트 미존재 시 작업 완료 전에 반드시 사용자에게 알림',
    },
  },

  en: {
    patterns: {
      conjunctions: /\b(and also|additionally|furthermore|moreover|as well as|on top of that)\b/gi,
      vaguePronouns: /\b(?:this|that|it)\s/i,
      vagueVerbs:
        /\b(?:fix it|change it|update it|refactor|clean up|improve|review|check|look at|take a look)\b/i,
      targetNouns: /\b(?:file|function|class|method|component|module)\s/i,
      vagueExpressions: /\b(?:or something|whatever|anything|stuff|things)\b/i,
      openEndedScope: /\b(?:etc\.?|and so on|and more|and such)\b/i,
    },
    messages: {
      autoPlan: (count) =>
        `[omh:auto-plan] ${count} independent tasks detected. Call EnterPlanMode tool to switch to plan mode.`,
      ambiguityGuard:
        '[omh:ambiguity-guard] Request is ambiguous. Use AskUserQuestion tool to clarify specific scope and direction before starting work.',
      testEnforcement: (minCases) => [
        `[omh:test-enforcement] Code changes detected. Please verify:`,
        `1. Test files exist for the changed code`,
        `2. Each test file has at least ${minCases} test cases`,
        `3. If tests are missing, suggest adding them before marking complete`,
      ],
      testEnforcementPrompt:
        '4. Notify user when tests are missing before completing task',
    },
  },
};

/**
 * Detect the dominant language of `text`.
 * Returns "ko" if Korean characters are found, otherwise "en".
 */
export function detectLang(text) {
  // Count Korean syllable characters (가-힣)
  const korean = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  return korean >= 2 ? 'ko' : 'en';
}

/**
 * Return the dictionary entry for `lang`, falling back to "en".
 */
export function getLang(lang) {
  return dictionary[lang] || dictionary.en;
}

/**
 * Convenience: detect language from text and return the matching dictionary.
 */
export function getDictionary(text) {
  return getLang(detectLang(text));
}

export default dictionary;
