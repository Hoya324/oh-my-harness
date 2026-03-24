# Code Review

Review checklist for {{language}} projects using {{buildTool}}.

## Checklist

1. **Tests**: Verify {{testFramework}} tests exist for all changed code
2. **Null Safety**: Leverage Kotlin null safety — avoid `!!`, prefer `?.`, `?:`, `let`
3. **Idiomatic Kotlin**: Use data classes, sealed classes, extension functions
4. **Coroutines**: Proper scope management, structured concurrency
5. **Error Handling**: Use `runCatching` or sealed result types, not bare try-catch
6. **Naming**: Follow Kotlin conventions (camelCase, PascalCase for classes)
7. **Security**: Parameterized queries, validate input, no hardcoded secrets

## How to use
Run `/code-review` after completing implementation to verify quality.
