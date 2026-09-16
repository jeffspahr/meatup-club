# Active Backlog

## Invitation validation follow-up — 2026-09-16

Acceptance: missing selected/default email templates must not create or promote a member, and correcting the template must permit retry. Newly entered invitation addresses must be trimmed/lowercased so Google sign-in finds them. Invitations without a configured email API key retain their existing behavior.

- [x] Reproduce template-write ordering and email normalization failures against the real schema: all seven new cases fail before the fix.
- [x] Validate templates before writes and normalize invitation input only.
- [x] Run full tests, typecheck, lint and diff checks; record results and lessons.

Scope: no shared DB helper changes or legacy account migration.

Results: template lookup/validation now precedes both account insertion and pending-account promotion. Fixing a missing template permits the same invitation to retry. New addresses are trimmed/lowercased before lookup, persistence, email sending, and invite-link generation. Real-schema route coverage exercises default/selected templates, new/pending accounts, retry after template repair, Google sign-in routing, normalized provider payloads, and invitation without an API key/template. Full Node 24 tests, typecheck, lint and diff checks pass.

Keep this file limited to current engineering follow-ups. GitHub issues are the source of truth for the product backlog, pull requests preserve completed work and verification history, and durable agent guidance belongs in `AGENTS.md` or `tasks/lessons.md`.

## Deferred Upgrades

### TypeScript 7

- [ ] Reassess when TypeScript 7 exposes the programmatic compiler API required by typescript-eslint and the supported toolchain accepts it.

The project currently uses the official TypeScript 6 compatibility package and passes the TypeScript 7-readiness diagnostic. Do not replace it with the native TypeScript 7 compiler until the API/tooling blocker is resolved.

## Event creation failures — 2026-09-15

- [x] Reproduce restaurant selection and invite staging failures on current main.
- [x] Fix selected restaurant state loss and capture event IDs before inserting invitations.
- [x] Add real form, SQLite, poll-close workflow, and desktop/iPhone browser regressions.
- [x] Verify lint, credential-fixture scan, typecheck, 653 tests with coverage, D1 schema/migrations, production builds, and 9 browser tests.
- [x] Verify the corrected invite SQL on isolated local D1 with differing event and delivery ID sequences.
- [x] Record root causes and prevention rules in `tasks/lessons.md`.
- [x] Prepare the verified fix, review notes, and iPhone screenshot for pull-request publication.

Results: poll closure with invitations now preserves the event ID across every recipient. Restaurant selection retains both name and address when creating or editing events. Neither failure is specific to mobile. No new React effects; removed the search field's state-reset effect. Browser tests mock only Places responses and exercise real application routing and local D1 persistence. Production remains unchanged pending review and merge.

## Dashboard admin poll closure

Acceptance: admins can close the active poll and create its event from the dashboard; members cannot perform the action. Reuse close-poll validation/atomic persistence/invite staging, preserve form on errors, and return to the dashboard on success. Fit existing mobile layout.

- [x] Trace shared close flow, dashboard data, UI, and test patterns.
- [x] Add dashboard admin controls and reuse server mutation logic.
- [x] Cover authorization, validation, successful event creation, errors, default invite payload, and mobile flow.
- [x] Verify lint, typecheck, 667 tests, D1 schema/migrations, builds, and all 11 browser checks.
- [x] Capture the iPhone screenshot and prepare the verified change for PR publication.


### Results
- Admins can expand Close poll beneath the dashboard poll, review/override voted winners, set time, choose event creation/invites, and confirm closure without visiting admin pages.
- Reuses the existing admin action for all validation, atomic creation and invite staging; only the exact `/dashboard` return destination is accepted. Other admin entry points retain their existing redirect.
- Errors remain beside the form, entered choices survive failure, and pending controls prevent repeated clicks. Native disclosure and form controls support keyboard/mobile; no new effects.
- Tests cover member denial before DB access, redirect allowlisting, leader defaults, form payloads, cancellation, pending/error recovery, and desktop/iPhone persistence. Browser tests disable invites; existing real SQLite workflow tests cover invite staging and component tests assert the default invite payload.
- Node 24 full verification passed: lint, credential-fixture scan, typecheck, 667 tests across 85 suites with coverage, D1 verification, client/SSR/Worker builds, and 11 browser tests.

## Calendar RSVP sync — 2026-09-16

### Goal and acceptance criteria
Calendar accept/decline/tentative replies must update the corresponding member/event RSVP. Real Resend metadata-only notifications and ICS attachments must work; signature rejection, duplicate suppression, and retries after provider/DB failures must remain safe.

### Tasks
- [x] Trace current-main handler and verify Resend inbound API contract.
- [x] Reproduce missing content and standard ICS parsing failures: 11 of 12 new tests failed on the original handler.
- [x] Fetch inbound content/attachments, correct parsing, and commit RSVP plus delivery ID atomically.
- [x] Run focused regressions and full Node 24 verification: lint, secret scan, typecheck, 700 tests/coverage, D1 schema/migrations, build, and 11 browser checks.
- [x] Review diff and record results and remaining production limitations.

### Working notes
- Isolated worktree based on current origin/main cb4a295; existing checkout edits preserved.
- Resend email.received contains metadata only, while handler expects text/html. Standard ICS uses PARTSTAT=ACCEPTED, while parser expects PARTSTAT:ACCEPTED.
- Handler reserves delivery IDs before processing and never releases them on failure, suppressing retries.

- Verified live receiving MX and presence of both required Worker secret bindings, without reading values. Production logged a signed inbound request at 2026-09-16T02:47:21.893Z without a subsequent RSVP update; provider payload and API-key read permissions remain unverified.
- Review replaced release-on-failure cleanup with an atomic D1 batch: cleanup itself can fail during an outage, stranding a delivery reservation.
- Focused verification: 82 tests pass across RSVP parsing, signed receiving webhooks, provider failure retries, and real SQLite transaction rollback/duplicate behavior.
- Deployment does not recover old ignored replies automatically. Check receiving API key permissions and use a new calendar reply (or a carefully inspected replay) after deployment.

### Results
- Added Resend receiving content retrieval, bounded calendar attachment downloads, and standard attendee status parsing with folded-line support.
- RSVP updates and delivery completion now commit atomically; real SQLite tests verify failure rollback, same-ID retry, duplicate suppression, comment preservation, and admin-override clearing.
- Updated receiving setup documentation and added direct coverage for the existing shared RSVP helper after removing its incidental webhook coverage.
- `npm run verify` passed under Node 24: 700 tests in 88 files, all coverage gates, lint, secret scan, typecheck, D1 verification, production build, and 11 Playwright checks. `git diff --check` passed.
- Production remains unchanged; full receiving API-key permissions and recovery of previously ignored replies require deployment validation.


## Review: atomic poll replacement

Acceptance: creating a poll closes the previous active poll and creates its replacement atomically; insert failure leaves the current poll open and preserves its votes; retry succeeds without duplicate active polls.

- [x] Inspect poll create action and D1 batch contract.
- [x] Reproduce insert-failure data loss with real SQLite.
- [x] Batch poll closure and creation in one transaction.
- [x] Verify focused regression, 717 full-suite tests, typecheck, and lint.
- [x] Record results and prevention lesson.

Working notes: Cloudflare documents D1 batch rollback on statement failure at https://developers.cloudflare.com/d1/worker-api/d1-database/#batch.

Results: poll replacement now runs in one D1 batch, so the original poll closure rolls back if creation fails. The real SQLite failure test reproduced the original closed-without-replacement behavior; regressions cover successful creation, rollback, retry, vote preservation, and member authorization. All 717 tests, typecheck, lint, and diff checks passed under Node 24.

### API creation follow-up
Acceptance: the API create action shares the admin action's atomic replacement behavior and still returns the inserted poll.
- [x] Reproduce API insert failure against SQLite, batch close/create, and verify rollback/retry plus returned ID.
- [x] Run focused/full tests, typecheck, lint and record results.

API results: insertion failure originally closed the current poll; the route now batches closure and replacement, returns a controlled 500 on failure, and reads the new poll using the insert result ID. Four real SQLite API tests cover rollback/retry, success with returned ID, votes, authorization, and required title. All 17 focused tests, all 707 tests in this isolated branch, typecheck, lint and diff checks passed under Node 24.

## Session identity after account replacement — 2026-09-16

### Acceptance criteria
A signed session for a deleted account must never authenticate a later account with the same email. Valid sessions for the current account must continue working.

- [x] Reproduce account replacement with real signed cookies and the canonical SQLite schema (old cookie incorrectly returned the replacement user).
- [x] Require the loaded user ID to match the session's original user ID.
- [x] Verify focused auth tests, full coverage, typecheck and lint.

### Session results and audit boundaries
- getUser now rejects cookies whose original account ID differs from the current row sharing that email. Valid replacement-account sessions still authenticate.
- Verification: 23 focused auth tests; full 707 tests in 91 files pass with coverage gates (80.93% statements, 71.87% branches), typecheck, lint and diff checks pass.
- Reviewed auth/session/OAuth, invitation, member/profile actions, and Places API authorization. Comment runtime modules are absent from current main (only legacy schema remains). No production writes or account changes were made.
- Follow-up leads outside these patches: invitation creation precedes template validation; invitation email lookup remains case-sensitive; forced reauthentication uses a global flag rather than per-session revocation. These need separately scoped regressions and fixes.


## Review: RSVP persistence and input validation

Acceptance: the shared RSVP helper persists supplied comments on both initial and subsequent responses, including explicit empty comments. Invalid statuses and malformed event IDs return form errors without writing.

- [x] Inspect member action and shared RSVP persistence against the canonical schema.
- [x] Reproduce initial-comment loss and malformed-input behavior using real SQLite.
- [x] Include comments in the initial insert and validate status/event IDs before persistence.
- [x] Verify focused regressions, 714 full-suite tests, typecheck, and lint.
- [x] Record results and prevention lesson.

Results: the initial insert now retains comments; the member action rejects unsupported statuses and invalid event IDs without changing existing responses or activity history. Two comment regressions and seven route validation regressions failed before their fixes. All 714 tests, typecheck, lint, and diff checks passed under Node 24.

### RSVP browser regression follow-up

- [x] Diagnose PR browser failure: seeded events used negative IDs rejected by the production boundary.
- [x] Switch seeded event/poll IDs and cleanup queries to reserved positive IDs.
- [x] Verify all 11 browser journeys under CI mode, including RSVP persistence after reload.

## PR #322 refresh after invitation merge

Acceptance: preserve current main invitation behavior and reject deleted-account cookies after email reuse.

- [x] Merge current main and preserve both sets of task notes; source merged without conflict.
- [x] Run full tests, typecheck and lint.
- [ ] Publish and confirm required CI.

Results: all regression tests, TypeScript and ESLint pass on the combined invitation/session branch; the merge changed no session-fix source. Both parent note histories were checked for preservation.

## PR #318 refresh after session fix merge

Acceptance: preserve merged invitation/session behavior and keep existing polls/votes unchanged when replacement creation fails through either route.

- [x] Merge current main and resolve shared notes while preserving both parent histories.
- [x] Verify full tests, typecheck and lint.

Results: 733 tests in 93 files pass, with TypeScript, ESLint and diff checks. Only task notes needed conflict resolution; both parent histories were preserved. The updated branch will run required GitHub CI before handoff.
