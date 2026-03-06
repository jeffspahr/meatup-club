# Lessons Learned

- 2026-02-21: Initialized lessons log for remediation tracking.
- 2026-02-21: Route-action DB mocks must support both `prepare().first/run/all` and `prepare().bind().first/run/all`; otherwise tests can miss real query shapes and fail with mock-only type errors.
- 2026-02-23: When introducing stricter shared DB types, update dependent tests and typed query result casts in the same change; otherwise typecheck breaks on mock shape mismatches and `unknown` row types.
- 2026-02-23: Route-manifest integrity tests should use simple regex literals and validated filename normalization (`/\.tsx?$/`), because over-escaped patterns can silently invalidate the test harness.
- 2026-03-06: Notification helpers that aggregate external-send errors should redact recipient identifiers and return normalized `Error.message` strings; otherwise coverage runs drift between security expectations and runtime behavior.
