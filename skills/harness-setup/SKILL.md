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
bash "$CLAUDE_PLUGIN_ROOT/lib/duck.sh" 2>/dev/null || bash "$(dirname "$(realpath "$0")")/../../lib/duck.sh" 2>/dev/null || true
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

**Question 1 — Project Detection**
> "프로젝트 컨벤션을 자동 감지할까요?"
- Auto-detect (Recommended): package.json, pyproject.toml, go.mod 등을 스캔해서 자동 설정
- Manual: 직접 언어/프레임워크를 지정

**Question 2 — Feature Profile**
> "어떤 기능 프로필을 사용할까요?"
- Full (Recommended): 모든 기능 활성화 (scopeGuard 제외)
- Minimal: testEnforcement + dangerousGuard + commitConvention만 활성화
- Custom: 기능을 하나씩 선택

**Question 3 — Commit Convention**
> "커밋 메시지 컨벤션은?"
- Auto-detect (Recommended): git log에서 자동 감지
- Conventional Commits: `type(scope): description`
- Gitmoji: `🎨 description`

### 4. Apply Choices

Based on the user's answers:

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

Write the config to `.claude/.omh/harness.config.json` with the user's choices merged into the defaults.

### 6. Update .gitignore

```bash
if ! grep -q '.claude/.omh/' .gitignore 2>/dev/null; then
  echo -e "\n# oh-my-harness\n.claude/.omh/" >> .gitignore
fi
```

### 7. Report Summary

Show the duck one more time, then output:
```
oh-my-harness is ready!

Project  : {language} | test: {testFramework} | lint: {linter} | fmt: {formatter}
Config   : .claude/.omh/harness.config.json
Features : {N} active ({disabled features list})
Commit   : {commitStyle}

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
