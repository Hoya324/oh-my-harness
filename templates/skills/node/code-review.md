# Code Review

Review checklist for {{language}} projects using {{testFramework}}.

## Checklist

1. **Tests**: Verify {{testFramework}} tests exist for all changed code
2. **Lint**: Run `npx {{linter}}` and fix all warnings
3. **Types**: Check for TypeScript errors if applicable
4. **Imports**: No unused imports or circular dependencies
5. **Error Handling**: All async operations have proper error handling
6. **Security**: No hardcoded secrets, SQL injection, or XSS vulnerabilities
7. **Performance**: No unnecessary re-renders, N+1 queries, or memory leaks

## How to use
Run `/code-review` after completing implementation to verify quality.
