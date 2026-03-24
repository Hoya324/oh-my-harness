# Lint & Fix

Run linting and auto-fix for this {{language}} project.

## Commands

1. **Check**: `cargo check`
2. **Lint**: `cargo clippy -- -D warnings`
3. **Fix**: `cargo clippy --fix --allow-dirty`
4. **Format**: `cargo fmt`

## Steps

1. Run `cargo check` for compilation errors
2. Run clippy for lint warnings
3. Apply auto-fix where possible
4. Format all files
5. Verify `cargo test` still passes

## How to use
Run `/lint-fix` before committing to ensure code passes all checks.
