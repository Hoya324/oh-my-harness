# Code Review

Review checklist for {{language}} projects.

## Checklist

1. **Tests**: Verify {{testFramework}} tests exist for all changed code
2. **Lint**: Run `{{linter}} check .` and fix all issues
3. **Types**: Check type hints are present and correct
4. **Imports**: Organized (stdlib → third-party → local), no circular imports
5. **Error Handling**: Specific exceptions, no bare `except:`
6. **Docstrings**: Public functions and classes have docstrings
7. **Security**: No hardcoded secrets, SQL injection, or path traversal

## How to use
Run `/code-review` after completing implementation to verify quality.
