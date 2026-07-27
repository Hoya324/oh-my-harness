---
name: init-project
description: Use when detecting project conventions or scaffolding project-local Codex skills for a codebase.
---

# Initialize project

Scan the project root for `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `build.gradle`,
`pom.xml`, and `Makefile`. Detect languages, test framework, linter, formatter, build tool, test
directories, test configs, and representative tests. Read `.claude/.omh/conventions.json` when it
exists and distinguish cached values from newly detected evidence.

Present the proposed convention record and ask for explicit confirmation before atomically writing
`.claude/.omh/conventions.json`. Never overwrite manual overrides silently.

If test infrastructure is missing, offer an appropriate directory, config, and sample test.
Describe the exact files first and wait for confirmation before creating them.

Use `.agents/skills` for project-local Codex skills. If it does not exist and a language was
detected, offer `code-review`, `test-write`, and `lint-fix` skill scaffolds based on the confirmed
commands. Wait for confirmation before creating them. If it exists, preserve every existing skill.
Put durable project instructions in `AGENTS.md`, never overwrite them without confirmation, and
never spawn agents during initialization.
