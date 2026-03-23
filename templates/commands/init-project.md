Detect and apply project conventions for this codebase.

Steps:
1. Scan the project root for: package.json, pyproject.toml, go.mod, Cargo.toml, build.gradle, pom.xml, Makefile
2. Identify: programming language, test framework, linter, formatter, build tool
3. Check if test infrastructure exists (test directories, test config files, sample tests)
4. If test infrastructure is missing, offer to set up:
   - Test directory structure appropriate for the detected framework
   - Test configuration file (jest.config, vitest.config, pytest.ini, etc.)
   - A sample test file demonstrating the project's testing pattern
5. Read `.claude/.omh/conventions.json` if it exists and show cached results
6. Update the cache by writing detection results to `.claude/.omh/conventions.json`
7. Report all findings to the user in a summary table

This is typically run once when starting work on a new project.
