# Testing & Code Quality

## Available Commands

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Linting (Code Quality Checks)

```bash
# Check code for errors and style issues
npm run lint

# Auto-fix what can be fixed automatically
npm run lint:fix
```

## What Gets Tested

### Jest (Unit Tests)

Located in `__tests__/` directory:

- **validation.test.js** - Tests for input validation functions
  - Site name validation (lowercase, alphanumeric + hyphens)
  - Required field checking
  - Enum/allowed values validation

- **errorHandler.test.js** - Tests for error handling
  - AppError class creation
  - asyncHandler wrapper functionality
  - Error catching and forwarding

**Coverage:** Currently testing middleware validation and error handling. Future tests could include:
- API endpoint tests (with supertest)
- Config loading/saving
- Lando command helpers

### ESLint (Static Analysis)

Checks `server.js`, `config.js`, and `middleware/` for:

**Real Bugs:**
- Undefined variables
- Unused variables (dead code)
- Missing `await` on promises
- Unreachable code
- Empty catch blocks
- Accidental reassignment

**Code Quality:**
- Prefer `const` over `let`/`var`
- Require curly braces for if/else
- Use `===` instead of `==`
- No `eval()` usage

## Current Test Results

```
✓ 18 tests passing
✓ 2 test suites
✓ All validation tests pass
✓ All error handler tests pass
```

## ESLint Findings

ESLint currently finds:
- Unused error variables in catch blocks (warnings)
- Empty catch blocks that should log errors
- Missing curly braces in some if statements
- Control characters in regex (ANSI stripping - expected)

Most are warnings, not critical errors. Can be fixed with `npm run lint:fix` or manually.

## CI/CD Integration (Future)

Can add GitHub Actions to run tests automatically:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run lint
```

## Pre-commit Hooks (Future)

Can add Husky to run tests before commits:

```bash
npm install --save-dev husky
npx husky init
echo "npm test && npm run lint" > .husky/pre-commit
```

This prevents committing broken code.

## Writing New Tests

**Example test structure:**

```javascript
const { functionToTest } = require('../path/to/module');

describe('Feature Name', () => {
  test('should do something specific', () => {
    const result = functionToTest('input');
    expect(result).toBe('expected output');
  });

  test('should throw error on invalid input', () => {
    expect(() => functionToTest(null)).toThrow();
  });
});
```

## Testing Philosophy

Similar to PHPStan/PHPCS in PHP world:
- **ESLint = PHPCS** - Code quality and style
- **Jest = PHPUnit** - Unit and integration tests
- Together they catch bugs before production
