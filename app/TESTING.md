# Testing Strategy - Meatup.Club

## Overview

This document outlines the comprehensive testing strategy to catch bugs and regressions before deployment.

## Test Framework

- **Framework**: Vitest (fast, Vite-native testing framework)
- **UI Testing**: @testing-library/react
- **Coverage**: V8 coverage provider

## Test Structure

```
app/
├── vitest.config.ts          # Vitest configuration
├── test/
│   └── setup.ts              # Global test setup
├── app/
│   ├── lib/
│   │   └── email.server.test.ts    # Calendar invite tests
│   └── routes/
│       └── api.webhooks.email-rsvp.test.ts  # Webhook & RSVP parser tests
```

## Running Tests

### Available Commands

```bash
# Run tests in watch mode (recommended during development)
npm run test

# Run tests once and exit
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Watch specific test file
npm run test -- email.server.test.ts
```

### Pre-Deployment Checklist

**Before deploying to production, always run:**

```bash
npm run test:run
npm run typecheck
npm run build
```

## Test Coverage

### Current Coverage (98 tests)

#### ✅ Calendar RSVP Parsing (26 tests)
- **File**: `app/routes/api.webhooks.email-rsvp.test.ts`
- **What's Tested**:
  - Valid RSVP parsing (ACCEPTED, DECLINED, TENTATIVE)
  - Legacy UID format support
  - Subject line fallback parsing
  - HTML content parsing
  - Security: SQL injection attempts
  - Security: XSS attempts
  - Security: Invalid UID formats
  - Security: Wrong domain rejection
  - Edge cases: Multiple UIDs, long input, null/undefined
  - Event UID validation and extraction
  - PARTSTAT to RSVP status mapping

**Security Focus**: This test suite heavily focuses on validating untrusted email input to prevent attacks.

#### ✅ Webhook Integration & Database Operations (18 tests)
- **File**: `app/routes/api.webhooks.email-rsvp.integration.test.ts`
- **What's Tested**:
  - **Webhook Security** (7 tests):
    - Missing webhook secret configuration
    - Missing Svix signature headers (svix-id, svix-timestamp, svix-signature)
    - Invalid signature rejection
    - Valid signature processing
    - Non-email.received event filtering
    - Emails without RSVP data handling
  - **Database Operations** (11 tests):
    - User lookup by email (case-insensitive)
    - Email extraction from "Name <email@domain.com>" format
    - User not found (404) scenarios
    - Event validation and not found (404) scenarios
    - RSVP creation for new responses
    - RSVP updates for existing responses
    - PARTSTAT to status mapping (ACCEPTED→yes, DECLINED→no, TENTATIVE→maybe)
    - Status change tracking (updated_via_calendar flag)
    - Database error handling

**Security Focus**: Critical tests for webhook signature verification using Svix. Ensures only authenticated webhooks from Resend can modify RSVPs.

**Quality Focus**: Full integration testing with mocked D1 database ensures the entire RSVP sync flow works correctly.

#### ✅ Calendar Invite Generation (21 tests)
- **File**: `app/lib/email.server.test.ts`
- **What's Tested**:
  - RFC 5545 compliance
  - Stable UID generation (critical for calendar updates)
  - Date/time formatting (UTC ISO format)
  - 2-hour event duration
  - Custom event times
  - Restaurant details (name, address)
  - Location fallback when address is null
  - SEQUENCE numbering (0 for original)
  - PARTSTAT configuration (NEEDS-ACTION)
  - RSVP=TRUE setting
  - Organizer email (rsvp@mail.meatup.club)
  - 24-hour reminder alarm
  - Special characters handling

**Quality Focus**: Ensures calendar invites work correctly across all major calendar applications (Google Calendar, Apple Calendar, Outlook).

#### ✅ Dark Mode System (14 tests)
- **File**: `test/dark-mode.test.ts`
- **What's Tested**:
  - CSS variables configuration (`:root` and dark mode media query)
  - Color overrides for gray-scale classes (bg, text, border)
  - WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
  - Light mode contrast validation
  - Dark mode contrast validation
  - Component best practices (no manual `dark:` prefixes for grays)
  - Documentation for visual regression testing with Playwright

**Quality Focus**: Ensures the CSS variable-based dark mode system is properly configured and meets accessibility standards. Prevents regression to manual `dark:` class approach.

#### ✅ Email Sending (19 tests)
- **File**: `app/lib/email.server.send.test.ts`
- **What's Tested**:
  - **Resend API Integration** (14 tests):
    - Successful email sending with correct API calls
    - Template variable replacement ({{inviteeName}}, {{inviterName}}, {{acceptLink}})
    - Default values for null parameters
    - Email metadata (from, to, reply_to, headers, tags)
    - Resend API error handling (non-2xx responses)
    - Network error handling
    - Timeout error handling
    - Multiple variable replacements in same field
    - Special characters in template variables
  - **Comment Reply Emails** (7 tests):
    - Comment reply notification sending
    - Correct metadata for reply emails
    - Null recipient name handling
    - Long comment text handling
    - Special characters in comments
    - API errors for comment replies
    - Network errors for comment replies
  - **Error Handling Edge Cases** (3 tests):
    - Malformed JSON responses
    - Empty API keys
    - Invalid email addresses

**Security Focus**: Tests validate that API keys are properly included in Authorization headers and that errors don't expose sensitive information.

**Quality Focus**: Comprehensive mocking of fetch API ensures email sending logic works correctly without making real API calls during testing.

## Testing Philosophy

### 1. **Test Critical Paths First**

Priority areas:
1. **Security-sensitive code** (webhook signature verification, input validation)
2. **Data integrity** (RSVP syncing, event creation)
3. **External integrations** (calendar invites, email sending)

### 2. **Test Input Validation Thoroughly**

All user/external input should be tested with:
- Valid inputs
- Invalid inputs
- Malicious inputs (SQL injection, XSS)
- Edge cases (empty, null, extremely long)
- Special characters

### 3. **Test Edge Cases**

Examples of edge cases we test:
- Multiple UIDs in one email
- Missing required fields
- Legacy format support
- Case sensitivity
- Timezone handling

### 4. **Don't Test Implementation Details**

Focus on:
- **What** the code does (behavior)
- **Not how** it does it (implementation)

## What's NOT Tested Yet

### 🔴 Critical Gaps

1. **Email Sending - Advanced Features**
   - Calendar invite attachments (sendEventInvites, sendCalendarUpdate functions)
   - Batch email sending to multiple recipients
   - Email template loading from database

2. **Authentication**
   - Admin permission checks
   - Session validation

### 🟡 Nice to Have

1. **Component Tests**
   - AddRestaurantModal
   - DashboardNav
   - Form components

2. **E2E Tests**
   - Full RSVP flow (website → calendar → webhook → website)
   - Event creation flow
   - Restaurant voting flow

3. **Performance Tests**
   - Large email payloads
   - Concurrent webhook requests
   - Database query performance

## Adding New Tests

### Test File Naming Convention

```
# For route handlers
app/routes/[route-name].test.ts

# For library functions
app/lib/[module-name].test.ts

# For components
app/components/[ComponentName].test.tsx
```

### Example Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  describe('Valid Input', () => {
    it('should handle basic case', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = myFunction(input);

      // Assert
      expect(result).toBe('expected');
    });
  });

  describe('Invalid/Malicious Input', () => {
    it('should reject SQL injection', () => {
      const malicious = "'; DROP TABLE users; --";
      const result = myFunction(malicious);
      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      expect(myFunction('')).toBeNull();
    });
  });
});
```

## CI/CD Integration (Future)

### Recommended GitHub Actions Workflow

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd app && npm ci
      - run: cd app && npm run test:run
      - run: cd app && npm run typecheck
      - run: cd app && npm run build
```

### Pre-Commit Hooks (Future)

When the project structure allows for it:

```json
// package.json
{
  "lint-staged": {
    "**/*.{ts,tsx}": [
      "npm run test:run -- --related",
      "npm run typecheck"
    ]
  }
}
```

## Testing Workflow

### During Development

1. **Write test first** (TDD recommended for critical features)
2. Run `npm run test` in watch mode
3. Write code until test passes
4. Refactor if needed
5. Ensure all tests still pass

### Before Committing

```bash
npm run test:run
npm run typecheck
```

### Before Deploying

```bash
npm run test:coverage  # Check coverage
npm run test:run       # All tests pass
npm run typecheck      # No TypeScript errors
npm run build          # Build succeeds
```

## Coverage Goals

### Current Coverage
- **Calendar Parsing**: ~95% (excellent)
- **Calendar Generation**: ~90% (excellent)
- **Webhook Integration**: ~85% (excellent)
- **RSVP Database Operations**: ~80% (good)
- **Email Sending**: ~75% (good)
- **Overall**: ~50% (good progress)

### Coverage Targets
- **Critical Security Code**: 100%
- **Business Logic**: 80%+
- **UI Components**: 60%+
- **Overall Project**: 70%+

## Debugging Tests

### View Test UI

```bash
npm run test:ui
```

This opens a browser interface showing:
- Test results
- Code coverage
- File changes triggering re-runs

### Run Single Test File

```bash
npm run test email.server.test.ts
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test:run"],
  "console": "integratedTerminal"
}
```

## Best Practices

### ✅ DO

- Test behavior, not implementation
- Use descriptive test names
- Test happy path AND error cases
- Test with malicious input for security-sensitive code
- Keep tests fast and isolated
- Mock external dependencies (APIs, database)

### ❌ DON'T

- Test framework code
- Test third-party libraries
- Make tests depend on each other
- Hardcode dates/times (use relative dates)
- Skip error cases
- Test private functions directly

## Security Testing

### Input Validation Tests

Every function that accepts external input MUST have tests for:

```typescript
describe('Security', () => {
  it('should reject SQL injection attempts', () => {
    const malicious = "'; DROP TABLE users; --";
    expect(sanitize(malicious)).not.toContain('DROP');
  });

  it('should escape XSS attempts', () => {
    const xss = '<script>alert("XSS")</script>';
    const result = sanitize(xss);
    expect(result).not.toContain('<script>');
  });

  it('should handle extremely long input', () => {
    const long = 'A'.repeat(1000000);
    expect(() => sanitize(long)).not.toThrow();
  });
});
```

## Performance Testing

For performance-critical code:

```typescript
import { describe, it, expect } from 'vitest';

describe('Performance', () => {
  it('should process large input quickly', () => {
    const start = Date.now();
    const largeInput = Array(10000).fill('data');
    processData(largeInput);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000); // Should complete in <1s
  });
});
```

## Regression Testing

When a bug is found:

1. **Write a failing test** that reproduces the bug
2. Fix the bug
3. Verify the test now passes
4. Keep the test to prevent regression

Example:

```typescript
// Bug: Restaurant addition failing with field name mismatch
describe('Restaurant Addition Regression', () => {
  it('should use google_place_id not place_id', async () => {
    // This test would have caught the bug
    const result = await addRestaurant({
      google_place_id: '123',
      name: 'Test Restaurant'
    });
    expect(result.success).toBe(true);
  });
});
```

## Continuous Improvement

- **Monthly**: Review test coverage and add tests for untested code
- **After bugs**: Add regression tests
- **Before new features**: Write tests first (TDD)
- **Code reviews**: Require tests for all PRs

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [RFC 5545 (iCalendar)](https://tools.ietf.org/html/rfc5545)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**Last Updated**: 2025-12-28
**Test Count**: 98 tests
**All Tests**: ✅ Passing
