# Lint & Fix

Run linting and auto-fix for this {{language}} project.

## Commands

1. **Vet**: `go vet ./...`
2. **Lint**: `golangci-lint run`
3. **Format**: `gofmt -w .`
4. **Tidy**: `go mod tidy`

## Steps

1. Run `go vet` for common mistakes
2. Run linter for comprehensive checks
3. Format all files with `gofmt`
4. Tidy module dependencies
5. Verify `go build ./...` succeeds

## How to use
Run `/lint-fix` before committing to ensure code passes all checks.
