# Test Writing Conventions

Write tests using **{{testFramework}}** 5 for this {{language}} project.

## Structure

- Place tests in `src/test/java/` mirroring source package
- Name: `{ClassName}Test.java`
- Use `@DisplayName` for readable test names

## Template

```java
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import static org.junit.jupiter.api.Assertions.*;

class MyClassTest {

    @Test
    @DisplayName("should handle normal input")
    void testNormalInput() {
        var result = new MyClass().process("valid");
        assertEquals(expected, result);
    }

    @Test
    @DisplayName("should handle edge case")
    void testEdgeCase() {
        var result = new MyClass().process("");
        assertEquals(fallback, result);
    }

    @Test
    @DisplayName("should throw on null input")
    void testNullInput() {
        assertThrows(IllegalArgumentException.class,
            () -> new MyClass().process(null));
    }
}
```

## How to use
Run `/test-write` when adding new classes to scaffold test files.
