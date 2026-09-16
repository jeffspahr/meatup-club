# Round 2 account and consent review

## Plan and acceptance
- [x] Inspect OAuth/session lookup, invitations, account administration, and profile persistence.
- [x] Reproduce a confirmed consent race with real SQLite and the production profile action.
- [x] Prevent stale profile saves from overwriting newer SMS state.
- [x] Ensure consent evidence is recorded only for successful mutations and rolls back on failure.
- [x] Verify typecheck, lint, and production build.
- [x] Verify the full test suite with coverage and prepare the focused PR.

## Finding
The profile action reads SMS settings during authentication, then later saves them unconditionally. A STOP received in between can be erased by a checked consent form; an unchecked form can replace the carrier opt-out source with `profile`, permitting later reactivation without START. Concurrent START commands and phone edits can likewise be lost.

## Fix
Compare all SMS fields with the authenticated snapshot in the UPDATE predicate. Return a refresh error when another request changed them. In the same atomic batch, append consent evidence only when the immediately preceding update changed a row. Existing webhook audit inserts retain their unconditional behavior.

## Regression evidence
Two STOP interleavings failed against the original implementation. Seven SQLite cases now cover STOP for checked and unchecked forms, START, concurrent phone changes, ordinary opt-in/out, and transaction rollback when consent storage fails. All account writes and consent queries use the canonical schema.

## Lessons
Read-time consent checks do not protect writes against concurrent provider webhooks. Guard the database mutation and couple its audit row to successful persistence in the same transaction.

## Risk and rollback
No schema migration, provider calls, or visual changes. Reverting the isolated commit restores the previous behavior. A conflicting SMS save is rejected with a refresh message rather than overwriting the newer settings.

## Results
- Full coverage suite: 885 tests passed across 106 files; 83.89% statements, 75.56% branches.
- Typecheck, lint, production build, and diff whitespace validation passed.
