# Code Review

Review checklist for {{language}} projects.

## Checklist

1. **Tests**: Verify `cargo test` passes for all changed code
2. **Lint**: Run `cargo clippy` and fix all warnings
3. **Unsafe**: Review all `unsafe` blocks — is it truly necessary?
4. **Error Handling**: Use `Result<T, E>` properly, avoid `.unwrap()` in production
5. **Ownership**: No unnecessary cloning, proper lifetime annotations
6. **Documentation**: Public items have `///` doc comments
7. **Security**: No unchecked input, use `const` generics where possible

## How to use
Run `/code-review` after completing implementation to verify quality.
