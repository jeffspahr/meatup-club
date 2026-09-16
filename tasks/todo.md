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
