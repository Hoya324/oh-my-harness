---
name: harness-setup
description: Initialize oh-my-harness in the current project (plugin mode)
level: 2
---

# Harness Setup

Initialize oh-my-harness for the current project. This is the plugin equivalent of `oh-my-harness init`.

**When this skill is invoked, immediately execute the workflow below.**

## What It Does

In plugin mode, hooks and CLAUDE.md are already provided by the plugin system automatically.
This setup only creates the **project-level configuration** file.

---

## Step 0: Detect First Run

Check if `.claude/.omh/harness.config.json` exists.

- **If it does NOT exist** → this is the first run. Go to **First-Time Welcome** below.
- **If it exists** → this is a returning user. Go to **Returning User** below.

---

## First-Time Welcome

### 1. Show the Duck

Run the duck ASCII art to greet the user:
```bash
bash "$CLAUDE_PLUGIN_ROOT/lib/duck.sh" 2>/dev/null || bash "$(dirname "$(realpath "$0")")/../../../lib/duck.sh" 2>/dev/null || true
```

### 2. Welcome Message

Output the following message (adapt naturally, keep it concise and friendly):

```
Welcome to oh-my-harness!

Smart defaults for Claude Code — test enforcement, guard rails,
convention detection, and model routing, all in one harness.

Let's set up your project in a few quick steps.
```

### 3. Interactive Onboarding

Ask the user the following questions using AskUserQuestion (ask all at once):

**Question 1 — Installation Scope**
> "설치 범위를 선택해주세요."
- Project (Recommended): `.claude/settings.local.json` — 이 프로젝트에만 적용
- User (Global): `~/.claude/settings.json` — 모든 프로젝트에 적용

**Question 2 — Project Detection**
> "프로젝트 컨벤션을 자동 감지할까요?"
- Auto-detect (Recommended): package.json, pyproject.toml, go.mod 등을 스캔해서 자동 설정
- Manual: 직접 언어/프레임워크를 지정

**Question 3 — Feature Profile**
> "어떤 기능 프로필을 사용할까요?"
- Full (Recommended): 모든 기능 활성화 (scopeGuard 제외)
- Minimal: testEnforcement + dangerousGuard + commitConvention만 활성화
- Custom: 기능을 하나씩 선택

**Question 4 — Commit Convention**
> "커밋 메시지 컨벤션은?"
- Auto-detect (Recommended): git log에서 자동 감지
- Conventional Commits: `type(scope): description`
- Gitmoji: `🎨 description`

**Question 5 — Weight Routing & 검증 (무게 비례 하네스)**
> "작업 무게(Tier)에 따라 검증 강도를 자동 조절할까요? Tier 3(무거운 작업)은 완료 전 `/omh-verify` N-라운드 독립검증을 강제합니다."
- Enable (Recommended): weightRouting ON, verify.rounds=3, autoFix=false (검증만, 수정은 확인 후)
- Enable + autoFix: weightRouting ON, 발견된 문제를 자동 수정
- Disable: 무게 판정/검증 강제를 끔

### 3-A. 모델 CLI 자동 감지 (Multi-model 교차검증)

`/omh-verify`는 Claude 외에 GPT(codex)·Gemini를 독립 검증자로 로테이션할 수 있습니다. 설치 여부를 감지:

```bash
which codex >/dev/null 2>&1 && echo "codex: ✓" || echo "codex: ✗"
which gemini >/dev/null 2>&1 && echo "gemini: ✓" || echo "gemini: ✗"
```

감지된 CLI가 있으면 AskUserQuestion으로 제안:
> "GPT/Gemini도 독립 검증에 넣을까요? (감지됨: {codex, gemini 중 설치된 것})"
- 전부 사용 (Recommended): 감지된 모델을 verify.lenses에 포함
- Claude만: 외부 모델 미사용

선택에 따라 `verify.lenses` 배열을 구성한다(미설치 모델은 제외). 둘 다 없으면 이 질문은 건너뛰고 Claude 단독으로 동작한다(graceful degrade).

### 4. Apply Choices

Based on the user's answers:

- **Project scope** selected → Config and hooks target `.claude/settings.local.json` (this project only)
- **User scope** selected → Config stays in `.claude/.omh/` but hooks are registered in `~/.claude/settings.json` (applies to all projects)

- **Auto-detect** selected → Run convention detection (scan project root for package.json, pyproject.toml, go.mod, Cargo.toml, build.gradle, pom.xml) and save to `.claude/.omh/conventions.json`
- **Manual** selected → Ask for language, test framework, linter, formatter, build tool

- **Full profile** → Use all default features as-is
- **Minimal profile** → Set all features to `false` except: `testEnforcement`, `dangerousGuard`, `commitConvention`, `autoGitignore`
- **Custom profile** → Ask the user which features to enable using AskUserQuestion with multiSelect

- **Commit convention** → Set `commitConvention.style` to the chosen value (`auto`, `conventional`, `gitmoji`)

### 5. Create Config

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

- For **Minimal profile**, set all features to `false` except: `testEnforcement`, `dangerousGuard`, `commitConvention`, `autoGitignore`
- For **Custom profile**, toggle individual features based on user selection
- Never rename feature keys — hooks depend on these exact names

### 6. Update .gitignore

```bash
if ! grep -q '.claude/.omh/' .gitignore 2>/dev/null; then
  echo -e "\n# oh-my-harness\n.claude/.omh/" >> .gitignore
fi
```

### 7. Enable HUD (Status Line)

Register the oh-my-harness HUD in the user's Claude Code settings.

**IMPORTANT**: `$CLAUDE_PLUGIN_ROOT` is NOT available in statusLine context (it's a global setting, not a plugin hook). Use a dynamic path lookup instead.

Write the statusLine config to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash -c 'node \"$(ls ~/.claude/plugins/cache/oh-my-harness/*/*/hud/omh-hud.mjs 2>/dev/null | head -1)\"'"
  }
}
```

If `statusLine` is already set to a non-harness value, ask the user before overwriting.

### 8. Report Summary

Show the duck one more time, then output:
```
oh-my-harness is ready!

Scope    : {Project|User (Global)}
Project  : {language} | test: {testFramework} | lint: {linter} | fmt: {formatter}
Config   : .claude/.omh/harness.config.json
Features : {N} active ({disabled features list})
Commit   : {commitStyle}
Weight   : {weightRouting on/off} | verify {rounds}라운드, autoFix {on/off}
Verifiers: {claude (+gpt) (+gemini) — 감지·선택된 모델}
HUD      : enabled (restart Claude Code to see status line)

Hooks are provided automatically by the plugin.
Use /set-harness to change settings anytime.
```

---

## Returning User

If `.claude/.omh/harness.config.json` already exists:

1. Show current config summary
2. Ask the user using AskUserQuestion:
   - "Update config to latest defaults" — merge new defaults while preserving user customizations
   - "Reset to defaults" — overwrite with fresh defaults (run onboarding again)
   - "Cancel" — exit without changes

If "Reset to defaults" is chosen, delete the existing config and run the **First-Time Welcome** flow above.

---

## Notes

- Plugin mode does NOT modify `settings.local.json` — hooks come from `hooks/hooks.json`
- Plugin mode does NOT append to `CLAUDE.md` — the root `CLAUDE.md` is injected by the plugin system
- This skill only creates the project config that hooks read at runtime
