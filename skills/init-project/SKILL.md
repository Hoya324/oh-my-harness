---
name: init-project
description: Detect and apply project conventions for this codebase (language, test framework, linter) and scaffold project-specific skills
level: 2
---

Detect and apply project conventions for this codebase.

Usage: /init-project

## Steps

1. Scan the project root for: package.json, pyproject.toml, go.mod, Cargo.toml, build.gradle, pom.xml, Makefile
2. Identify: programming language, test framework, linter, formatter, build tool
3. Check if test infrastructure exists (test directories, test config files, sample tests)
4. If test infrastructure is missing, offer to set up:
   - Test directory structure appropriate for the detected framework
   - Test configuration file (jest.config, vitest.config, pytest.ini, etc.)
   - A sample test file demonstrating the project's testing pattern
5. Read `.claude/.omh/conventions.json` if it exists and show cached results
6. Update the cache by writing detection results to `.claude/.omh/conventions.json`
7. Report all findings to the user in a summary table
8. Check if `.claude/skills/` directory exists
9. If `.claude/skills/` does not exist and a language was detected:
   - Scaffold project-specific skills (code-review, test-write, lint-fix) based on detected conventions
   - Use the detected test framework, linter, and formatter in skill templates
   - Report scaffolded skills to the user
10. If `.claude/skills/` already exists, inform the user that existing skills are preserved

This is typically run once when starting work on a new project.
