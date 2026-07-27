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

# Codex contracts and runtime-aware installer
node --test test/codex-hooks.test.mjs test/codex-plugin.test.mjs
node --test test/runtime.test.mjs test/cli.test.mjs

# Dual-runtime documentation and site dictionaries
node --test test/docs-codex.test.mjs test/i18n-parity.test.mjs
```

All tests must pass before submitting a PR.

## Project Structure

- `bin/` — CLI entry point
- `lib/` — Core libraries (config, detection)
- `hooks/` — Shared hook implementations plus the Codex bridge under `hooks/codex/`
- `skills/` — Claude Code skill definitions (`SKILL.md`)
- `agents/` — Model-routed agent definitions
- `codex/` — Codex-native skills, roles, durable guidance, and runtime mapping
- `.codex-plugin/` — Codex plugin manifest
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
3. Register the Claude contract in `hooks/hooks.json`
4. If Codex supports the event, add the hook to the bridge allowlist and `hooks/codex/hooks.json`
5. Add Claude and Codex contract tests; keep shared decisions in `lib/`

## Adding a Skill

1. Create `skills/your-skill/SKILL.md` with YAML frontmatter
2. Add a Codex-native variant under `codex/skills/` when the workflow is supported
3. Translate runtime surfaces (`AGENTS.md`, `.agents/skills`, and Codex collaboration operations) without changing shared config/state semantics
4. The CLI will install the correct variant for `--runtime claude|codex|both`

## Documentation Parity

- Update English and Korean document pairs together with matching section structure and facts.
- Put every new site string in both `en` and `ko` dictionaries in `docs/i18n.js`; do not hardcode one-language UI prose in HTML.
- Keep commands, runtime values, paths, trust behavior, shared-state behavior, and the Codex HUD difference identical across languages.
- Run the focused documentation tests before the full suite.

## Pull Request Process

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass
4. Submit a PR with a clear description
