# Concurrent event mutations

An edit, calendar resend, or deletion can read an event and then commit after another mutation changes it. The stale write can reuse or lower its calendar sequence, overwrite newer details/status, or send a cancellation for an obsolete version.

Updates and resends now compare the original sequence at write time and stage email only when that guarded write succeeds. Deletion matches the original sequence both when staging cancellation and when deleting, in the same batch. Conflicts return a retryable error without enqueueing stale email; a retry reads the current version.

Nine real-schema SQLite regressions cover member/admin edits with notifications enabled/disabled, stale cancellations, resends after edit/cancellation, and deletion with retry. Each newly tested race failed before its fix. Existing tests cover ordinary success and staging-failure rollback.

Verification: 887 tests in 106 files, coverage, typecheck, lint, and production build passed. Independent read-only review found no actionable issue. No migration or UI layout change; external provider calls are mocked.

- [x] Reproduce stale snapshot races
- [x] Guard every route write based on a pre-read calendar version
- [x] Verify regression and full suite
- [x] Prepare focused DCO-signed PR
