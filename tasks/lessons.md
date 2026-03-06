# Lessons Learned

- 2026-02-21: Initialized lessons log for remediation tracking.
- 2026-02-21: Route-action DB mocks must support both `prepare().first/run/all` and `prepare().bind().first/run/all`; otherwise tests can miss real query shapes and fail with mock-only type errors.
- 2026-02-23: When introducing stricter shared DB types, update dependent tests and typed query result casts in the same change; otherwise typecheck breaks on mock shape mismatches and `unknown` row types.
- 2026-02-23: Route-manifest integrity tests should use simple regex literals and validated filename normalization (`/\.tsx?$/`), because over-escaped patterns can silently invalidate the test harness.
- 2026-03-06: Notification helpers that aggregate external-send errors should redact recipient identifiers and return normalized `Error.message` strings; otherwise coverage runs drift between security expectations and runtime behavior.
- 2026-03-06: Debounced React component tests using fake timers need timer advancement wrapped in `act` (for example `await act(async () => vi.advanceTimersByTimeAsync(...))`), or state updates may never commit and the test will hang or assert stale UI.
- 2026-03-06: React Router route-module component tests should cast the assembled props object once at the render boundary when generated route prop types are stricter than the exercised scenario; otherwise `npm run typecheck` fails on test-only missing route metadata even though the runtime behavior is correct.
- 2026-03-06: Route tests that hand work to Cloudflare `waitUntil()` need to capture and await the queued promise before asserting background side effects, or happy-dom teardown can abort the work and make the test look like the side effect never happened.
- 2026-03-06: GitHub Actions only executes workflows from the repository-root `.github/workflows/` directory; nested `app/.github/workflows/` files do not run and can create a false sense that CI is enforcing checks when it is not.
