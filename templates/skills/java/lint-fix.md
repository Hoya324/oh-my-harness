# Lint & Fix

Run linting and auto-fix for this {{language}} project using {{buildTool}}.

## Commands (Gradle)

1. **Build**: `./gradlew build`
2. **Test**: `./gradlew test`
3. **Check**: `./gradlew check`
4. **Format**: `./gradlew spotlessApply` (if Spotless configured)

## Commands (Maven)

1. **Build**: `mvn compile`
2. **Test**: `mvn test`
3. **Check**: `mvn verify`
4. **Format**: `mvn spotless:apply` (if Spotless configured)

## Steps

1. Run build to check for compilation errors
2. Run tests to verify correctness
3. Run check tasks for lint/style issues
4. Apply auto-formatter if available
5. Verify build succeeds clean

## How to use
Run `/lint-fix` before committing to ensure code passes all checks.
