# Test Writing Conventions

Write tests using **{{testFramework}}** for this {{language}} project.

## Structure

- Place unit tests in `#[cfg(test)] mod tests` at bottom of source file
- Place integration tests in `tests/` directory
- Name: `test_{behavior}`

## Template

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normal_input() {
        let result = my_function("valid");
        assert_eq!(result, expected);
    }

    #[test]
    fn test_edge_case() {
        let result = my_function("");
        assert_eq!(result, fallback);
    }

    #[test]
    #[should_panic(expected = "invalid input")]
    fn test_invalid_input() {
        my_function(null_val);
    }
}
```

## How to use
Run `/test-write` when adding new functions to scaffold test modules.
