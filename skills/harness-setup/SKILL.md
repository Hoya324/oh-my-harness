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

## Steps

1. **Check if already configured**: Look for `.claude/.omh/harness.config.json`.
   If it exists, show current config and ask:
   - "Update config to latest defaults" — merge new defaults
   - "Reset to defaults" — overwrite with fresh defaults
   - "Cancel" — exit

2. **Create config directory**:
   ```bash
   mkdir -p .claude/.omh
   ```

3. **Write default config** to `.claude/.omh/harness.config.json`:
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

4. **Update .gitignore**: Add `.claude/.omh/` if not already present:
   ```bash
   if ! grep -q '.claude/.omh/' .gitignore 2>/dev/null; then
     echo -e "\n# oh-my-harness\n.claude/.omh/" >> .gitignore
   fi
   ```

5. **Run convention detection**: Scan the project root for conventions:
   - Check `package.json` → Node.js (jest/vitest/mocha, eslint/biome, prettier, typescript)
   - Check `pyproject.toml` → Python (pytest, ruff/flake8, black, mypy)
   - Check `go.mod` → Go (go test, golangci-lint)
   - Check `Cargo.toml` → Rust (cargo test, clippy, rustfmt)
   - Check `build.gradle` → Java (junit, gradle)
   - Check `pom.xml` → Java (junit, maven)

   Save results to `.claude/.omh/conventions.json`.

6. **Report summary**:
   ```
   oh-my-harness initialized!

   Project  : {language} | test: {testFramework} | lint: {linter} | fmt: {formatter}
   Config   : .claude/.omh/harness.config.json
   Features : 11 active (scopeGuard: OFF)

   Hooks are provided automatically by the plugin.
   Use /set-harness to modify settings.
   ```

## Notes

- Plugin mode does NOT modify `settings.local.json` — hooks come from `hooks/hooks.json`
- Plugin mode does NOT append to `CLAUDE.md` — the root `CLAUDE.md` is injected by the plugin system
- This skill only creates the project config that hooks read at runtime
