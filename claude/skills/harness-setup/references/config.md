# Config file

Read by `harness-setup` step 5.

```bash
mkdir -p .claude/.omh
```

Write the config to `.claude/.omh/harness.config.json` with the user's choices merged into the following default template.

**IMPORTANT: Feature keys MUST match exactly — hooks read these exact names.**

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
    "weightRouting": true
  },
  "testEnforcement": { "minCases": 2, "promptOnMissing": true },
  "modelRouting": { "quick": "haiku", "standard": "sonnet", "complex": "opus" },
  "autoPlan": { "threshold": 3 },
  "ambiguityDetection": { "threshold": 2, "language": "auto" },
  "commitConvention": { "style": "auto" },
  "scopeGuard": { "allowedPaths": [] },
  "multiAgent": { "maxAgents": 4, "useWorktree": true, "tmuxSession": "omh-agents" },
  "tier3": { "taskThreshold": 5, "fileThreshold": 5, "domainKeywords": [] },
  "verify": {
    "rounds": 3,
    "stopWhenClean": true,
    "autoFix": false,
    "lenses": [
      { "model": "claude", "via": "native-subagent", "focus": "correctness" },
      { "model": "gpt", "via": "codex", "cmd": "codex exec", "focus": "convention" },
      { "model": "gemini", "via": "gemini", "cmd": "gemini -p --approval-mode plan", "focus": "regression" }
    ]
  }
}
```

> `weightRouting` 선택에 따라 `features.weightRouting`를 토글하고, Question 5 / 모델 감지 결과로 `verify.rounds`, `verify.autoFix`, `verify.lenses`를 구성한다. Tier3의 `domainKeywords`에 프로젝트 핵심 도메인(예: 결제·매출 관련 용어)을 넣으면 해당 작업이 자동으로 Tier 3로 분류된다.

- For **Minimal profile**, set all features to `false` except: `dangerousGuard`, `verifyGate`, `conventionSetup`, `commitConvention`, `autoGitignore`, `stateSync`
- For **Standard profile**, enable minimal plus `testEnforcement`, `weightRouting`, `planGate`, `contextSnapshot`, `skillScaffolding`, `contextOptimization`
- For **Custom profile**, toggle individual features based on user selection
- Never rename feature keys — hooks depend on these exact names
