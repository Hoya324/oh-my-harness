# Code Review

Review checklist for {{language}} projects using {{buildTool}}.

## Checklist

1. **Tests**: Verify {{testFramework}} tests exist for all changed classes
2. **Null Safety**: Use `Optional`, `@Nullable`/`@NonNull` annotations
3. **Error Handling**: Specific exceptions, no empty catch blocks
4. **Naming**: Follow Java conventions (camelCase methods, PascalCase classes)
5. **Immutability**: Prefer `final` fields, use records for value objects
6. **Logging**: Use SLF4J, appropriate log levels, no `System.out.println`
7. **Security**: No SQL injection (use parameterized queries), validate input

## How to use
Run `/code-review` after completing implementation to verify quality.
