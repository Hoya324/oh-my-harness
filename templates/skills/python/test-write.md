# Test Writing Conventions

Write tests using **{{testFramework}}** for this {{language}} project.

## Structure

- Place tests in `tests/` directory mirroring source structure
- Name test files: `test_{module}.py`
- Name test functions: `test_{behavior}`
- Use fixtures for shared setup

## Template

```python
import pytest
from mymodule import my_function

class TestMyFunction:
    def test_normal_input(self):
        assert my_function("valid") == expected

    def test_edge_case(self):
        assert my_function("") == fallback

    def test_invalid_input(self):
        with pytest.raises(ValueError):
            my_function(None)

@pytest.fixture
def sample_data():
    return {"key": "value"}
```

## How to use
Run `/test-write` when adding new functions or modules to scaffold test files.
