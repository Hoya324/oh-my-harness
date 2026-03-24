# Test Writing Conventions

Write tests following this project's conventions.

## Guidelines

- Place test files near the source code they test
- Minimum 2 test cases per function: happy path + edge case
- Name tests descriptively: what is being tested and expected outcome

## Structure

1. **Setup**: Prepare test data and dependencies
2. **Execute**: Call the function under test
3. **Assert**: Verify the expected outcome
4. **Cleanup**: Release any resources if needed

## How to use
Run `/test-write` when adding new functions or modules to scaffold test files.
