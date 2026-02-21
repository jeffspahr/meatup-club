# Lessons Learned

- 2026-02-21: Initialized lessons log for remediation tracking.
- 2026-02-21: Route-action DB mocks must support both `prepare().first/run/all` and `prepare().bind().first/run/all`; otherwise tests can miss real query shapes and fail with mock-only type errors.
