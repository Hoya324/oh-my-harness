# Test Writing Conventions

Write tests using **{{testFramework}}** for this {{language}} project.

## Structure

- Place test files next to source: `foo_test.go`
- Use table-driven tests for multiple cases
- Name: `TestFunctionName` or `TestFunctionName_Scenario`

## Template

```go
func TestMyFunction(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected string
        wantErr  bool
    }{
        {"normal input", "valid", "result", false},
        {"empty input", "", "fallback", false},
        {"nil input", "", "", true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := MyFunction(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("unexpected error: %v", err)
            }
            if got != tt.expected {
                t.Errorf("got %q, want %q", got, tt.expected)
            }
        })
    }
}
```

## How to use
Run `/test-write` when adding new functions to scaffold test files with table-driven tests.
