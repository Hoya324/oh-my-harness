# Test Writing Conventions

Write tests using **{{testFramework}}** for this {{language}} project.

## Structure

- Place tests in `src/test/kotlin/` mirroring source package
- Name: `{ClassName}Test.kt`
- Use descriptive test names with backticks

## Template (JUnit 5)

```kotlin
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class MyClassTest {

    @Test
    @DisplayName("should handle normal input")
    fun `process valid input returns expected result`() {
        val result = MyClass().process("valid")
        assertEquals(expected, result)
    }

    @Test
    @DisplayName("should handle edge case")
    fun `process empty input returns fallback`() {
        val result = MyClass().process("")
        assertEquals(fallback, result)
    }

    @Test
    @DisplayName("should throw on null input")
    fun `process null input throws exception`() {
        assertThrows<IllegalArgumentException> {
            MyClass().process(null)
        }
    }
}
```

## Template (Kotest)

```kotlin
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.kotest.assertions.throwables.shouldThrow

class MyClassSpec : DescribeSpec({
    describe("process") {
        it("should handle normal input") {
            MyClass().process("valid") shouldBe expected
        }

        it("should handle edge case") {
            MyClass().process("") shouldBe fallback
        }

        it("should throw on null input") {
            shouldThrow<IllegalArgumentException> {
                MyClass().process(null)
            }
        }
    }
})
```

## How to use
Run `/test-write` when adding new classes to scaffold test files.
