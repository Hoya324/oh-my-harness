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

### 3 to 4. Onboarding

Ask the onboarding questions (scope, detection, feature profile, commit convention, weight
routing, external verifier CLIs) exactly as written in `references/onboarding.md`, then apply the
answers as that file describes.

### 5. Create Config

Write `.claude/.omh/harness.config.json` from the template and rules in `references/config.md`.
Feature keys must match exactly; hooks read these names.

### 6 to 8. Finish

Update `.gitignore`, enable the HUD status line, and print the summary as described in
`references/finish.md`. Ask before overwriting a non-harness `statusLine`.

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
