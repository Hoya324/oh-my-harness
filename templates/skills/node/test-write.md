# Test Writing Conventions

Write tests using **{{testFramework}}** for this {{language}} project.

## Structure

- Place test files next to source: `foo.test.ts` or in `__tests__/foo.test.ts`
- Use `describe` for grouping, `it` or `test` for cases
- Minimum 2 test cases per function: happy path + edge case

## Template

```typescript
import { describe, it, expect } from '{{testFramework}}';
import { myFunction } from './my-module';

describe('myFunction', () => {
  it('should handle normal input', () => {
    expect(myFunction('valid')).toBe(expected);
  });

  it('should handle edge case', () => {
    expect(myFunction('')).toBe(fallback);
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

## How to use
Run `/test-write` when adding new functions or modules to scaffold test files.
