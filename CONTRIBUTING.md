# Contributing to oh-my-harness

Thank you for your interest in contributing!

## Prerequisites

- Node.js >= 18.0.0
- Git

## Getting Started

```bash
git clone https://github.com/Hoya324/oh-my-harness.git
cd oh-my-harness
```

No `npm install` needed — this is a zero-dependency project.

## Running Tests

```bash
npm test
# or directly:
node --test test/*.test.mjs
```

All tests must pass before submitting a PR.

## Project Structure

- `bin/` — CLI entry point
- `lib/` — Core libraries (config, detection)
- `hooks/` — Claude Code hook implementations
- `skills/` — Slash command definitions (SKILL.md)
- `agents/` — Model-routed agent definitions
- `templates/` — Configuration templates
- `test/` — Test suite (Node.js native test runner)

## Code Style

- **ESM only** — Use `.mjs` extensions and `import`/`export`
- **Zero dependencies** — Do not add npm packages
- **Node.js built-ins only** — Use `fs`, `path`, `child_process`, etc.

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Adding a Hook

1. Create `hooks/your-hook.mjs`
2. Use helpers from `hooks/lib/output.mjs`
3. Register in `hooks/hooks.json` and `bin/cli.mjs`
4. Add tests in `test/hooks.test.mjs`

## Adding a Skill

1. Create `skills/your-skill/SKILL.md` with YAML frontmatter
2. The CLI will auto-strip frontmatter during `init`

## Pull Request Process

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass
4. Submit a PR with a clear description
