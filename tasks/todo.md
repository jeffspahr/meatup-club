# Active Backlog

## Background delivery and webhook bug review — 2026-09-16

Acceptance: reproduce concrete failures with production handlers and real SQLite; keep failed webhook writes retryable and prevent duplicate callbacks from reverting newer member state.

- [x] Read instructions, lessons, Worker configuration, outbox, SMS and webhook handlers.
- [x] Reproduce SMS webhook persistence/replay bugs: four regressions fail on original code.
- [x] Implement SMS atomic RSVP/consent fixes and controlled malformed-body response.
- [x] Verify SMS changes with focused tests, all 708 tests, typecheck, lint, and diff checks.
- [ ] Reproduce and repair unstable email retry payloads (in progress).
- [ ] Run coverage and remaining verification for delivery fixes.
- [ ] Record verification and remaining audit limitations.

Working notes: SMS RSVP and Resend delivery callbacks reserve their IDs before applying state. SMS consent deduplicates audit rows but unconditionally changes consent, allowing an old START replay to undo a later STOP. Work is isolated in the jobs review worktree.

Results (SMS): same-ID retries recover after failed RSVP writes; duplicate START/STOP receipts cannot reverse newer consent. Signed route tests execute real SQLite transactions, including failure rollback and preservation of RSVP comments/admin override semantics. Node 24 lint, typecheck, and 708 tests pass.

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






## Review: preserve default email templates

Acceptance: create/update/default-selection failures and missing target IDs preserve the current default; successful changes atomically select one default.

- [x] Trace template mutation paths.
- [x] Reproduce failure and nonexistent-target behavior with real SQLite: five regressions failed.
- [x] Batch dependent writes and guard default clearing on target existence.
- [x] Verify eight SQLite cases, 743 full-suite tests, lint, and typecheck.
- [x] Record results and prevention lesson.

Results: template creation, edits, and default selection now commit together with clearing the previous default. Missing update/default targets return a form error while preserving the current default. Trigger-based tests prove rollback if the second write fails.

## Event timezone conversion at DST transitions — 2026-09-16

### Acceptance criteria
Valid event wall times after a DST transition convert using the offset at the actual event instant. Past-event classification changes only after the true start time. Preserve the existing interpretation of ambiguous and nonexistent local times.

- [x] Review conversion and add spring/fall UTC conversion plus past-event boundary regressions.
- [x] Reproduce four regression failures and correct the offset when the initial guess crosses a DST boundary.
- [x] Run focused tests, full tests, typecheck and lint; record results.

### DST results
- A bounded correction now uses the offset at the candidate event instant and accepts it only when it matches the requested wall time. Existing ambiguous and nonexistent time choices remain unchanged.
- The spring 2026 03:30 New York event now maps to 07:30Z, and the fall event maps to 08:30Z. Past-event checks are covered immediately before, at, and after each actual start.
- Verification: all 33 focused date/timezone tests, all 712 tests in 91 files, typecheck, lint and diff checks pass under Node 24.

## Review: calendar date validation

Acceptance: event forms and date nominations only persist actual calendar dates in YYYY-MM-DD format; impossible dates and non-string submissions return form errors. Poll closure cannot copy an invalid legacy nomination into an event.

- [x] Trace event parsing, date nominations, and poll-to-event creation.
- [x] Reproduce invalid date acceptance: 13 regressions failed before the fix.
- [x] Add shared calendar-date validation at write boundaries.
- [x] Verify 735 full-suite tests, lint, typecheck, and diff checks.
- [x] Record results and prevention lesson.

Results: a shared validator requires strict YYYY-MM-DD input and a real calendar day, preventing JavaScript date rollover for invalid month lengths and leap years. Event forms, date nominations, and poll-to-event creation reject malformed dates before writes. Existing future-date and voting semantics remain intact.

### Alternate poll API coverage
- [x] Reproduce malformed persisted nominations creating invalid events through `/api/polls`.
- [x] Apply the same calendar validator before API event creation; preserve poll state on rejection.
- [x] Verify three baseline failures plus valid leap-day success with SQLite, full 722-test suite, typecheck, and lint.

## Review: cancelled event calendar delivery

Acceptance: an admin marking an event cancelled, or its creator editing an already-cancelled event, stages calendar cancellation messages at the incremented sequence when notifications are enabled. Ordinary updates remain update messages and disabled notifications stage nothing.

- [x] Trace status-form update and cancellation delivery helpers.
- [x] Reproduce incorrect update delivery on admin cancellation and creator edits to cancelled events.
- [x] Select the cancellation helper and delivery type for cancelled events in both entry points.
- [x] Verify 749 full-suite tests, lint, typecheck, and diff checks.
- [x] Record results and prevention lesson.

Results: cancelled event edits now persist cancellation deliveries rather than calendar requests, retaining the incremented sequence and atomic staging. Route regressions verify delivery selection/notification opt-out; real SQLite tests cover cancelled/ordinary edits and rollback if staging fails. Corrected the admin test batch double to execute a lone UPDATE instead of treating its final statement as a SELECT.

- [x] Preserve cancellation calendar IDs after deleting events; regression reproduced event-0 before the fix.
- [x] Verify final patches and record audit limitations.
Results (deleted event cancellation): the immutable dedupe key preserves the original calendar event ID after the event foreign key becomes NULL. The sender now uses that ID and rejects invalid snapshot IDs before sending. A real SQLite stage/delete/send regression inspects the actual cancellation attachment.

Final verification: Node 24 lint, typecheck, secret-fixture scan, 722 tests in 92 suites with coverage, production client/SSR/Worker build, and git diff checks pass. Coverage: 81.31% statements, 72.38% branches, 73.07% functions, 81.79% lines. Reviewed scheduled Worker dispatch/config, SMS scheduling/tracking/consent, email outbox staging/sending/recovery, delivery callbacks, provider error handling, and event deletion handoff. No production callbacks or sends were triggered; live provider behavior is represented by signed contract requests and documented Resend responses. Browser checks and D1 schema/migration checks were not rerun for these server-only changes with no schema edits.

- [x] Reproduce and repair delivery-status webhook transaction and ordering failures: five regressions failed before the fix; 719 tests and coverage pass.
- [ ] Preserve cancellation calendar IDs after deleting events and verify the final patch (in progress).
Results (delivery callbacks): delivery IDs and status changes now commit atomically, allowing retries after write failures. SQL enforces status progression so late sent/delayed callbacks cannot overwrite delivered or negative final outcomes. Signed callbacks execute against real SQLite for rollback, retry, duplicate, and out-of-order cases; all 719 tests and coverage gates pass.

- [x] Reproduce and repair unstable email retry payloads: all three event message types failed before the fix.
- [x] Verify email retry fix with all 713 tests/coverage, lint and typecheck.
- [ ] Reproduce and repair delivery-status webhook transaction and ordering failures (in progress).
Results (email retries): event email bodies now use the persisted outbox creation timestamp and stable idempotency key as their entity reference. Provider acceptance followed by a lost response recovers with an identical payload on retry. Provider concurrent-request 409 errors retry; mismatched-payload 409 errors remain terminal. Verified current Resend contract at https://resend.com/docs/dashboard/emails/idempotency-keys. Node 24 lint, typecheck and 713 tests pass; coverage gates pass (81.06% statements, 72.13% branches).

- [x] Record results and separately review member deletion.

## Atomic member removal — 2026-09-16

### Acceptance criteria
A failed user deletion must preserve the user's votes and suggestions and other members' votes on those suggestions. Successful removal must still remove the intended member and participation without deleting global restaurants.

- [x] Reproduce destructive partial deletion against the canonical schema (activity_log foreign key blocks user deletion after votes were removed).
- [x] Move participation and user deletions into a single atomic D1 batch and return an actionable error.
- [x] Run focused real-SQL and route tests, full coverage, typecheck and lint.

### Working notes
- Existing restrictive foreign keys intentionally protect authored records, including non-null poll creator and activity user IDs. Fully supporting removal of those authors requires a separate archive/anonymization policy; this fix preserves data on failure.

### Removal results
- Member deletion now uses one D1 transaction; the route clearly explains that linked history prevents deletion. Restrictive foreign keys and global restaurants remain preserved.
- Real SQLite regressions cover successful deletion and complete rollback, including cascaded votes from other members.
- Verification: 14 focused tests, all 706 tests in 90 files, coverage thresholds (80.90% statements, 71.82% branches), typecheck, lint and git diff checks pass. Cloudflare D1 documentation confirms batch statements roll back as a unit on failure.


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

## Durable forced reauthentication — 2026-09-16

Acceptance: forcing reauthentication permanently revokes existing cookies even after a different browser logs in. Fresh OAuth sessions carry the current account generation. Legacy cookies remain valid until that account is explicitly revoked; other accounts are unaffected.

- [x] Reproduce with two signed cookies and real SQLite (one regression failed before fix).
- [x] Add an account session generation, forward migration, baseline and schema assertions; validate every session against it and stamp fresh OAuth sessions.
- [x] Verify regression tests, full tests/coverage, typecheck, lint, D1 migration chain and production build.
- [x] Record compatibility and classify the invitation-template ordering lead without broadening this fix.

Results: forced reauthentication atomically advances the account session version. Every session lookup compares the signed generation to the database; fresh OAuth sessions receive the current generation. Existing unversioned cookies map to generation zero. Migration seeds generation one for already-pending revocations, preserving them after a fresh login.

Verification: 30 focused auth tests; full npm run verify passed (703 tests across 89 files, coverage gates, lint, secret scan, typecheck, fresh D1 schema, complete forward migration chain, production build and 11 browser tests). Independently applied the migration to the exact origin/main canonical schema with ordinary/revoked rows and verified generations zero/one plus foreign keys.

Deployment prerequisite: apply 20260916_add_user_session_version.sql before application deployment; no migration or code was applied to production. Leave the additive column intact on application rollback; old application code does not enforce durable revocation.

Invitation-template ordering was independently reproduced with real SQLite: an invalid template returned an error after persisting an invited user, then retry failed because the account existed. A temporary audit test confirmed this and was removed; its separate fix belongs to the invitation PR, not this change.

Stacked integration: invitation membership/preflight changes are the PR base; the combined callback preserves invited-account routing and session generations. All 714 tests, TypeScript and lint pass on the stacked branch.

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


## Event SMS notifications PR — 2026-09-16
- [x] Record default delivery preference: always open PRs for completed code changes.
- [x] Inspect current main and isolate SMS feature from unrelated checkout changes.
- [x] Adapt automatic event SMS, admin pending default, and event-specific replies while retaining current delivery tracking.
- [x] Verify tests, lint, typecheck, schema, build, and browser checks.
- [x] Publish signed PR #332; GitHub verification started.

Acceptance: all event creation paths notify active SMS-consenting members independently of calendar invites; admin sends default to no RSVP with all-members option; event-specific YES/NO/MAYBE replies; preserve delivery callbacks and opt-outs; report failures without undoing events.

Results: current-main implementation preserves provider health and delivery callbacks, adds tracked automatic notices across four creation paths, reports partial failures without undoing events, defaults admin recipients to pending, and supports event-specific YES/NO/MAYBE replies. No migration required.

Verification: Node 24; lint, secret-fixture check, typecheck, coverage (797 tests in 95 files), local D1 baseline/migration verification, and production build passed. Browser suite: 10 passed initially; two existing voting checks failed, then both passed in isolation against a fresh fixture. The new admin control test and all desktop/mobile event-creation checks passed. Screenshot: `docs/screenshots/event-sms-admin.png`. No live SMS sends or deployment.

Known limits: send success denotes Twilio acceptance; callbacks retain final delivery state. Automatic sends use the existing tracked-send path with bounded concurrency, not a durable outbox. Sequential repeated automatic notices skip accepted recipients; simultaneous duplicate invocations are not atomically deduplicated.

PR: https://github.com/jeffspahr/meatup-club/pull/332 — feature commit `bfbb536`, based on current main. PR includes the admin screenshot and validation results.

## PR #321 refresh for next merge

Acceptance: failed member removal preserves participation and cascaded data while retaining current invitation and event SMS behavior.

- [x] Merge current main and preserve both parent review-note histories.
- [x] Review the combined member route and run full tests, typecheck, and lint before publication.

Results: 799 tests in 96 files, TypeScript, ESLint and diff checks pass. Member-route code merged cleanly; shared note conflicts preserve both histories. Required CI will verify the published revision before handoff.

## PR #320 integration with event SMS commands

Acceptance: preserve explicit invitation targeting, MAYBE replies and event validation while keeping RSVP persistence/receipt writes atomic and consent replays harmless.

- [x] Resolve conflicts preserving current routing and both note histories.
- [x] Reproduce and fix MAYBE receipt interaction and verify regression coverage, full tests, typecheck and lint.

Results: the new signed-request SQLite MAYBE rollback test failed before the integration fix. All 43 focused SMS tests and 810 full tests (97 files), coverage gates, TypeScript, lint and diff checks pass. Existing explicit invitation targeting, event eligibility, HELP copy and named confirmations are preserved. Required GitHub CI will validate the published revision before handoff.

## PR #323 refresh for next merge

Acceptance: preserve current application behavior while ensuring retried calendar messages retain identical provider payloads and recover from concurrent-request conflicts.

- [x] Merge current main and resolve shared notes, preserving both histories.
- [x] Review the final diff and run full tests, typecheck and lint before publication.

Results: all 815 tests in 98 files, TypeScript, ESLint and diff checks pass. Calendar retry source merged unchanged; both parent review-note histories are preserved. Required GitHub CI will validate the published revision before handoff.

## PR #326 refresh for next merge

Acceptance: callback persistence failures remain retryable, terminal delivery states cannot be downgraded by late callbacks, and merged calendar retries retain stable payloads.

- [x] Merge current main and resolve review notes while preserving both parent histories.
- [x] Review the combined delivery module and run full tests, typecheck and lint before publication.

Results: 821 tests in 99 files, TypeScript, ESLint and diff checks pass. Delivery code merged cleanly with stable calendar payloads; note conflicts preserve both parent histories. Required GitHub CI will validate the published revision before handoff.

## PR #328 refresh for next merge

Acceptance: deleting an event keeps queued calendar cancellation identity intact and preserves stable retry payloads and ordered delivery callbacks.

- [x] Merge current main and preserve both sets of review notes.
- [x] Review the combined delivery changes and run full tests, typecheck and lint before publishing.

Results: 824 tests in 100 files, TypeScript, ESLint and diff checks pass. The cancellation identity change merged cleanly with stable retry payloads and ordered callback handling; both review-note histories were preserved. Required GitHub CI will validate the published revision before handoff.

## PR #330 refresh for next merge

Acceptance: cancelling events and editing already-cancelled events sends calendar cancellation notices in both admin and shared edit paths, while preserving current email/SMS delivery behavior.

- [x] Merge current main and resolve shared review notes, preserving both histories.
- [x] Review combined event mutations and run full tests, typecheck and lint before publication.

Results: 830 tests in 101 files, TypeScript, ESLint and diff checks pass. Both mutation paths merged cleanly with current event SMS and email-delivery behavior; both parent note histories were preserved. Required GitHub CI will validate the published revision before handoff.

## PR #324 refresh for next merge

Acceptance: event and poll date inputs reject impossible calendar days while preserving current atomic mutations and notification staging across dashboard, admin and API routes.

- [x] Merge current main and preserve both parent review-note histories.
- [x] Review combined date boundaries and run full tests, typecheck and lint before publication.

Results: 852 tests in 103 files, TypeScript, ESLint and diff checks pass. Event/poll code merged cleanly with current atomic mutations and notification staging; both review-note histories were preserved. Required GitHub CI will validate the published revision before handoff.

## PR #327 refresh for next merge

Acceptance: valid event wall times convert correctly across both DST transitions while preserving documented ambiguous/nonexistent-time behavior and current date validation.

- [x] Merge current main and resolve review notes, preserving both histories.
- [x] Review the conversion diff and run full tests, typecheck and lint before publication.

Results: 857 tests in 103 files, TypeScript, ESLint and diff checks pass. Conversion source merged cleanly with current date validation; both parent review-note histories were preserved. Required GitHub CI will validate the published revision before handoff.

## PR #329 refresh for next merge

Acceptance: failed replacement or missing template IDs preserve the existing default; successful replacements remain atomic with current membership/email behavior.

- [x] Merge current main and resolve review notes while preserving both histories.
- [x] Review template mutation changes and run full tests, typecheck and lint before publication.

Results: 865 tests in 104 files, TypeScript, ESLint and diff checks pass. Template mutation source merged cleanly with current main; both parent review-note histories were preserved. Required GitHub CI will validate the published revision before handoff.

## PR #317 refresh for next merge

Acceptance: stale search/details responses cannot overwrite newer input or selections; failed lookups remain recoverable and keyboard selection remains valid on current main.

- [x] Merge current main and resolve shared review notes, preserving both histories.
- [x] Review UI cancellation and selection changes and run full tests, typecheck and lint before publication.

Results: 873 tests in 104 files, TypeScript, ESLint and diff checks pass. UI source merged cleanly; its effect synchronizes external Places requests and cancels obsolete work. Both parent review-note histories were preserved. Required GitHub CI will validate the build and browser journeys before handoff.

## PR #325 refresh for next merge

Acceptance: content preview preserves the submitted draft, and restaurant metadata refresh permits retry after navigation completes or fails on current main.

- [x] Merge current main and preserve both parent review-note histories.
- [x] Review form-state changes and run full tests, typecheck and lint before publication.

Results: 875 tests in 104 files, TypeScript, ESLint and diff checks pass. Form changes merged cleanly; pending UI derives from navigation state without new effects. Both parent review-note histories were preserved. Required GitHub CI will validate the published revision before handoff.

## PR #331 final integration and rollout preparation

Acceptance: session generations remain revoked after fresh logins, retain the merged account-ID and invitation checks, and migrate existing accounts without reviving outstanding revocations.

- [x] Merge current main and preserve both parent review-note histories.
- [x] Review auth integration and migration and run verification.

Results: 878 tests in 105 files, coverage gates, lint, secret scan, typecheck, local D1 baseline and migration chain, and production builds pass. Browser verification initially timed out opening the event form; a fresh-fixture rerun passed all 12 browser journeys. Repeated diagnostics exposed fixture-name collisions, recorded separately in lessons. Independently upgraded exact current-main schema: ordinary generation zero, pending revocation one, new-account default zero, foreign keys clean. Retargeted PR will receive required GitHub CI before handoff.
- [ ] Coordinate production migration before merge/deployment; no production writes authorized by this preparation.
