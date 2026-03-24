# Code Review

Review checklist for {{language}} projects.

## Checklist

1. **Tests**: Verify `go test ./...` passes for all changed packages
2. **Lint**: Run `golangci-lint run` and fix all issues
3. **Error Handling**: All errors are checked (no `_ = err`)
4. **Naming**: Follow Go conventions (camelCase exports, short variable names)
5. **Concurrency**: Proper goroutine lifecycle, no data races
6. **Interfaces**: Keep interfaces small, accept interfaces return structs
7. **Security**: No SQL injection, validate user input, use `crypto/rand`

## How to use
Run `/code-review` after completing implementation to verify quality.
