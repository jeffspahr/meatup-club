# Active Backlog

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

- [x] Reproduce and repair delivery-status webhook transaction and ordering failures: five regressions failed before the fix; 719 tests and coverage pass.
- [ ] Preserve cancellation calendar IDs after deleting events and verify the final patch (in progress).
Results (delivery callbacks): delivery IDs and status changes now commit atomically, allowing retries after write failures. SQL enforces status progression so late sent/delayed callbacks cannot overwrite delivered or negative final outcomes. Signed callbacks execute against real SQLite for rollback, retry, duplicate, and out-of-order cases; all 719 tests and coverage gates pass.

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
