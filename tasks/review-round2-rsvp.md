# Concurrent first RSVP responses

Two simultaneous first responses both read an absent RSVP and attempt INSERT; the second fails the unique event/user constraint. Persistence now uses INSERT ... ON CONFLICT DO UPDATE. The preliminary lookup only chooses the activity label; under concurrency that label remains approximate.

Regression: Promise.all over real SQLite reproduces the constraint error before the fix. Three concurrency cases cover omitted, cleared, and replaced comments while retaining calendar provenance. Existing coverage proves overrides clear and first comments persist.

Verification: 881 tests (105 files), coverage, typecheck, lint, and production build passed. No schema migration or UI change. Provider requests are mocked.

- [x] Reproduce
- [x] Implement atomic upsert
- [x] Verify regression and full suite
- [x] Prepare focused DCO-signed PR
