# Lint & Fix

Run linting and auto-fix for this {{language}} project using {{buildTool}}.

## Commands

1. **Build**: `./gradlew build`
2. **Test**: `./gradlew test`
3. **Lint (ktlint)**: `./gradlew ktlintCheck`
4. **Fix (ktlint)**: `./gradlew ktlintFormat`
5. **Lint (detekt)**: `./gradlew detekt`

## Steps

1. Run build to check for compilation errors
2. Run ktlint or detekt for style/lint issues
3. Apply auto-format with ktlintFormat
4. Run tests to verify correctness
5. Verify build succeeds clean

## How to use
Run `/lint-fix` before committing to ensure code passes all checks.
