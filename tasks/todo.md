# Active Backlog (2026-02-23)

## Goal
Keep only unresolved, high-impact work and remove stale planning artifacts.

## Baseline Snapshot
- Non-test runtime `as any` usages: `66`
- `window.confirm()` call sites: `7`
- Legacy/non-semantic color-pattern hits in route files: `15`
- Dashboard route `ErrorBoundary` exports: `1`
- `HydrateFallback` usage: `0`

## Acceptance Criteria
- [x] Non-test runtime `as any` usage is reduced from `66` to `0` (or explicitly documented exceptions).
- [x] Destructive confirm behavior is centralized and used in all current call sites.
- [x] Remaining legacy color/error utility patterns are migrated to semantic tokens/shared UI primitives.
- [x] High-risk dashboard routes have route-level `ErrorBoundary` exports.
- [x] Dashboard index, polls, and events routes provide explicit loading fallback UI.
- [x] Request-handler logs are redacted and avoid payload/PII dumps.
- [x] Verification passes: `npm run typecheck`, `npm run test:run`, `npm run build`.

## Active Tasks

### P0 - Safety and Correctness
- [x] Eliminate runtime `as any` in non-test code, starting with `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard._index.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.sms.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/auth.google.callback.tsx`, `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.ts`, and `/Users/jspahr/repo/meatup-club/app/app/lib/comments.server.ts`.
- [x] Redact/normalize request-handler logging in `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.email-rsvp.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.admin.setup-resend.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.places.search.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.places.details.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.places.photo.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`.

### P1 - UX and Consistency
- [x] Replace duplicated `window.confirm()` flows with a shared abstraction in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.members.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.restaurants.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.dates.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.email-templates.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/components/CommentThread.tsx`.
- [x] Migrate remaining legacy color/error classes in `/Users/jspahr/repo/meatup-club/app/app/routes/accept-invite.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.setup.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/_index.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.restaurants.tsx`.

### P1 - Resilience
- [x] Add route-level `ErrorBoundary` exports to `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`, and at least one admin entry route (`/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin._index.tsx`).
- [x] Add `HydrateFallback` skeletons for `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard._index.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`.

### P2 - Conventions
- [x] Add action response conventions to `/Users/jspahr/repo/meatup-club/CLAUDE.md` (success/error shape and redirect rules).
- [x] Add short JSDoc usage examples to shared UI components in `/Users/jspahr/repo/meatup-club/app/app/components/ui/`.

## Verification
- [x] Run `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck`.
- [x] Run `cd /Users/jspahr/repo/meatup-club/app && npm run test:run`.
- [x] Run `cd /Users/jspahr/repo/meatup-club/app && npm run build`.
- [x] Record outcomes and any remaining risks.

## Results
- Completed all active backlog items across safety, UX consistency, resilience, and conventions.
- Verification status:
  - `npm run typecheck` passed.
  - `npm run test:run` passed (`17` files, `193` tests).
  - `npm run build` passed for client, SSR, and worker bundles.
- Remaining low-risk warnings:
  - Vite reports existing dynamic-import chunking warnings for shared modules (`auth.server`, `db.server`, `session.server`, `activity.server`, `email.server`).

## Current Task (2026-02-25)

### Goal
Resolve Twilio toll-free verification rejection and resubmit within the prioritized 7-day window.

### Acceptance Criteria
- [ ] Twilio resubmission text is finalized for all required fields.
- [ ] Public compliance pages include clear SMS consent, STOP/HELP instructions, frequency disclosure, and rates disclosure.
- [ ] A public consent-proof URL exists and does not require login.
- [ ] Public terms URL exists and is linked from landing/privacy.
- [ ] Verification performed: local route check/build and manual URL accessibility notes.

### Active Tasks
- [x] Audit current public compliance routes and consent copy.
- [x] Draft Twilio field-by-field resubmission content.
- [x] Propose minimal site changes and get user approval before editing.
- [x] Implement approved compliance page/copy updates.
- [x] Verify routes/build and summarize resubmission steps.

### Working Notes
- Twilio rejection reasons: 30484, 30485, 30491, 30513.
- Compliance routes are public and return `200`: `/privacy`, `/terms`, `/sms-consent`.
- Homepage footer now links to `/`, `/sms-consent`, `/privacy`, and `/terms`.
- Public copy now states sole proprietor operation, optional SMS enrollment, and explicit HELP/STOP wording.

## Review Task (2026-03-05)

### Goal
Review PR #72 (`feature/popular-dates-grid`) for correctness, regression risk, and test coverage gaps before merge.

### Acceptance Criteria
- [x] Identify any behavior regressions or correctness issues in the diff.
- [x] Check affected tests and call out missing regression coverage if needed.
- [x] Summarize findings with file/line references and verification evidence.

### Active Tasks
- [x] Inspect PR metadata and changed files.
- [x] Analyze behavioral changes against existing route/component patterns.
- [x] Review impacted tests or run targeted verification if needed.
- [x] Record findings and verification notes.

### Results
- Reviewed PR #72 (`feature/popular-dates-grid`) against `origin/main`.
- Verification in isolated worktree:
  - `npm run typecheck` passed.
  - `npm run test:run` passed (`17` files, `196` tests).
- Finding recorded: collapsed grid now recomputes each voter's `Total` from only `displayedDates`, so users who voted only on hidden dates render as `0` votes even though they participated.

## Coverage Audit (2026-03-06)

### Goal
Assess current automated test coverage from the live Vitest report and identify the most important gaps.

### Acceptance Criteria
- [ ] Run the current coverage suite successfully.
- [ ] Capture top-line statement/branch/function/line coverage numbers.
- [ ] Identify the lowest-coverage production files or directories that materially affect risk.
- [ ] Summarize the verification story and practical next steps.

### Active Tasks
- [x] Review existing testing docs and Vitest coverage configuration.
- [x] Run `npm run test:coverage`.
- [x] Inspect the generated report for the weakest coverage areas.
- [x] Summarize findings and recommended follow-up.

### Working Notes
- `app/TESTING.md` coverage counts are stale; it still documents `98` tests while the last backlog verification recorded `196`.
- Current Vitest coverage excludes `node_modules/`, `test/`, config files, generated `+types`, and `build/`.

### Results
- `cd /Users/jspahr/repo/meatup-club/app && npm run test:coverage` passed (`17` files, `196` tests).
- Current aggregate coverage is low: `15.09%` statements, `10.38%` branches, `6.64%` functions across `68` instrumented files.
- Coverage is concentrated in a few critical backend paths, especially `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.email-rsvp.tsx` (`92.68%` statements) and targeted server helpers under `/Users/jspahr/repo/meatup-club/app/app/lib/`.
- The biggest gaps are untested dashboard routes/components and large server modules: `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`, `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.ts`, and `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`.
- Test count overstates confidence in some areas because `/Users/jspahr/repo/meatup-club/app/test/route-health.test.ts` is mostly export/smoke validation and `/Users/jspahr/repo/meatup-club/app/test/admin-polls-e2e.test.tsx` largely exercises inline test components instead of the real route module.

## Testing Docs Refresh (2026-03-06)

### Goal
Create a concrete coverage-improvement plan, refresh the main testing guide to match the current repo state, and codify durable testing standards in the repository instructions.

### Acceptance Criteria
- [ ] `app/TESTING.md` reflects the current test suite, current coverage baseline, and a prioritized improvement plan.
- [ ] `AGENTS.md` includes explicit testing standards for new behavior changes, regression coverage, and acceptable test shapes.
- [ ] Documentation is internally consistent with the current Vitest setup and current suite count.
- [ ] Verification includes reviewing the edited docs for correctness and repo alignment.

### Active Tasks
- [x] Review current `AGENTS.md` and `app/TESTING.md`.
- [x] Design the updated testing guidance and coverage roadmap.
- [x] Update `app/TESTING.md`.
- [x] Update `AGENTS.md`.
- [x] Verify final docs for clarity and consistency.

### Working Notes
- Current live baseline from `npm run test:coverage`: `196` tests, `15.09%` statements, `10.38%` branches, `6.64%` functions.
- Existing `app/TESTING.md` still reports `98` tests and does not distinguish smoke/import checks from true behavioral coverage.
- The highest-value missing coverage areas are dashboard admin/event flows and larger server modules (`email.server.ts`, `sms.server.ts`).

### Results
- Rewrote `/Users/jspahr/repo/meatup-club/app/TESTING.md` to reflect the live `2026-03-06` baseline, current test commands, interpretation of the existing suite, and a phased coverage-improvement roadmap.
- Added explicit testing standards to `/Users/jspahr/repo/meatup-club/AGENTS.md`, including regression-test requirements, route/component test expectations, and limits of smoke coverage.
- Verification performed:
  - Reviewed the edited docs against the live Vitest config and the current coverage run.
  - Confirmed `app/TESTING.md` now matches the current suite size (`196` tests in `17` files) and the live coverage metrics.

## Testing Plan Implementation (2026-03-06)

### Goal
Implement the first high-value slice of the coverage improvement plan by adding real tests around the lowest-covered, highest-risk server logic and a key dashboard action module.

### Acceptance Criteria
- [ ] Add new behavioral tests for advanced email notification flows in `app/app/lib/email.server.ts`.
- [ ] Add new behavioral tests for SMS delivery/reminder flows in `app/app/lib/sms.server.ts`.
- [ ] Add real action tests for date-related branches in `app/app/routes/dashboard.polls.tsx`.
- [ ] Verification passes for targeted tests and the full coverage run.
- [ ] Record the new coverage baseline and notable improvements.

### Active Tasks
- [x] Inspect target modules and current test patterns.
- [x] Add tests for `email.server.ts`.
- [x] Add tests for `sms.server.ts`.
- [x] Add tests for `dashboard.polls.tsx`.
- [x] Run verification and summarize coverage changes.

### Working Notes
- This pass targets the highest-value subset of Priority 0 work rather than the entire roadmap.
- `email.server.ts` already has baseline tests for invite/comment sends, so advanced invite-update-cancellation flows are the easiest missing slice to cover next.
- `sms.server.ts` has very limited coverage today and can gain quickly from send/reminder/signature tests without UI setup.

### Results
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.notifications.test.ts` with coverage for RSVP override emails, event invites, calendar updates, event updates, and event cancellations.
- Expanded `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.test.ts` to cover reminder message formatting, Twilio send behavior, signature verification, XML responses, scheduled reminders, and adhoc reminder scopes.
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.date-actions.test.ts` with real action tests for date suggestion, voting, deletion, and active-poll validation.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/email.server.notifications.test.ts app/lib/sms.server.test.ts app/routes/dashboard.polls.date-actions.test.ts` passed (`34` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:coverage` passed (`19` files, `223` tests).
- Coverage improvements from the prior `2026-03-06` baseline:
  - Overall statements: `15.09%` -> `24.44%`
  - Overall branches: `10.38%` -> `14.89%`
  - Overall functions: `6.64%` -> `13.27%`
  - `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`: `29.38%` -> `90.62%`
  - `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.ts`: `20.69%` -> `88.27%`
  - `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`: `10.81%` -> `24.32%`

## Testing Roadmap PR2 (2026-03-06)

### Goal
Add real coverage for the next member-facing dashboard routes so the core logged-in user flows are no longer sitting at `0%` or near-`0%`.

### Acceptance Criteria
- [ ] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard.events.tsx`.
- [ ] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard._index.tsx`.
- [ ] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard.profile.tsx`.
- [ ] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/accept-invite.tsx`.
- [ ] Verification passes for targeted tests, `npm run typecheck`, and a full coverage run.
- [ ] Record the updated coverage baseline and any blockers or follow-up work.

### Active Tasks
- [x] Inspect the target routes and current test patterns.
- [x] Add tests for `dashboard.events.tsx`.
- [x] Add tests for `dashboard._index.tsx`.
- [x] Add tests for `dashboard.profile.tsx`.
- [x] Add tests for `accept-invite.tsx`.
- [x] Reconcile full-suite verification failures and keep the branch green.
- [x] Run final verification and summarize the new coverage baseline.
- [ ] Commit and publish the PR slice.

### Working Notes
- Clean worktree for this slice: `/Users/jspahr/repo/meatup-club-pr2a` on branch `codex/testing-roadmap-pr2`.
- Targeted route tests pass.
- Full coverage was initially blocked by two expectation mismatches in `/Users/jspahr/repo/meatup-club-pr2a/app/app/lib/email.server.notifications.test.ts`; the fix was to restore email redaction and normalize thrown error messages in `/Users/jspahr/repo/meatup-club-pr2a/app/app/lib/email.server.ts`, not to loosen the tests.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard.events.test.ts` with loader coverage for upcoming/past event shaping plus RSVP create/update action coverage.
- Added `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard._index.test.ts` with empty and populated dashboard loader coverage.
- Added `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard.profile.test.ts` with notification settings, SMS validation, duplicate-phone, and invalid-action coverage.
- Added `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/accept-invite.test.ts` with loader redirects, invited-user handling, and activation coverage.
- Hardened `/Users/jspahr/repo/meatup-club-pr2a/app/app/lib/email.server.ts` so invite-send failures redact recipient emails and thrown errors return the plain `Error.message`.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr2a/app && npm run test:run -- app/routes/dashboard.events.test.ts app/routes/dashboard._index.test.ts app/routes/dashboard.profile.test.ts app/routes/accept-invite.test.ts` passed (`18` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr2a/app && npm run test:run -- app/lib/email.server.notifications.test.ts` passed (`9` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr2a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr2a/app && npm run test:coverage` passed (`34` files, `313` tests).
- Coverage improvements from the prior PR 1 baseline:
  - Overall statements: `42.55%` -> `47.60%`
  - Overall branches: `31.93%` -> `35.59%`
  - Overall functions: `23.55%` -> `26.68%`
  - `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard.events.tsx`: `0%` -> `61.53%`
  - `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard._index.tsx`: `0%` -> `50.72%`
  - `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/dashboard.profile.tsx`: `0%` -> `90.00%`
  - `/Users/jspahr/repo/meatup-club-pr2a/app/app/routes/accept-invite.tsx`: `0%` -> `93.33%`

## Testing Roadmap PR3 (2026-03-06)

### Goal
Add real behavioral coverage for shared interactive UI used in restaurant/comment flows and for the Places API request handlers that back those components.

### Acceptance Criteria
- [ ] Add behavioral tests for `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/RestaurantAutocomplete.tsx`.
- [ ] Add behavioral tests for `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/AddRestaurantModal.tsx`.
- [ ] Add behavioral tests for `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/CommentThread.tsx`.
- [ ] Add behavioral tests for `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/CommentSection.tsx`.
- [ ] Add behavioral tests for `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/DashboardNav.tsx`.
- [ ] Add request/response tests for `/Users/jspahr/repo/meatup-club-pr3a/app/app/routes/api.places.search.tsx`, `/Users/jspahr/repo/meatup-club-pr3a/app/app/routes/api.places.details.tsx`, and `/Users/jspahr/repo/meatup-club-pr3a/app/app/routes/api.places.photo.tsx`.
- [ ] Verification passes for targeted tests, `npm run typecheck`, and a full coverage run.
- [ ] Record the updated coverage baseline and any remaining high-value gaps.

### Active Tasks
- [x] Inspect the target components/routes and current test patterns.
- [x] Add component tests for shared interactive UI.
- [x] Add route tests for the Places API handlers.
- [x] Run final verification and summarize the new coverage baseline.
- [ ] Commit and publish the PR slice.

### Working Notes
- Clean worktree for this slice: `/Users/jspahr/repo/meatup-club-pr3a` on branch `codex/testing-roadmap-pr3`.
- PR2 merged into `main` as commit `61dda8e`, so PR3 can branch directly from current `origin/main`.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/RestaurantAutocomplete.test.tsx` with debounce, keyboard-selection, empty-result, and click-outside coverage.
- Added `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/AddRestaurantModal.test.tsx` with closed-state, selection, submit, and cancel/reset coverage.
- Added `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/CommentThread.test.tsx`, `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/CommentSection.test.tsx`, and `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/DashboardNav.test.tsx` with real interaction coverage for reply state, delete confirmation, empty state, and mobile-nav behavior.
- Added `/Users/jspahr/repo/meatup-club-pr3a/app/app/routes/api.places.test.ts` with request/response coverage for search success/failure, details transformation, media proxying, and stale-photo refresh handling.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr3a/app && npm run test:run -- app/components/RestaurantAutocomplete.test.tsx app/components/AddRestaurantModal.test.tsx app/components/CommentThread.test.tsx app/components/CommentSection.test.tsx app/components/DashboardNav.test.tsx app/routes/api.places.test.ts` passed (`18` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr3a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr3a/app && npm run test:coverage` passed (`40` files, `331` tests).
- Coverage improvements from the prior PR 2 baseline:
  - Overall statements: `47.60%` -> `53.75%`
  - Overall branches: `35.59%` -> `42.61%`
  - Overall functions: `26.68%` -> `36.22%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/RestaurantAutocomplete.tsx`: `0%` -> `80.64%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/AddRestaurantModal.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/CommentThread.tsx`: `11.11%` -> `88.88%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/CommentSection.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/components/DashboardNav.tsx`: `0%` -> `88.23%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/routes/api.places.search.tsx`: `37.93%` -> `79.31%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/routes/api.places.details.tsx`: `36.84%` -> `73.68%`
  - `/Users/jspahr/repo/meatup-club-pr3a/app/app/routes/api.places.photo.tsx`: `19.23%` -> `76.92%`

## Testing Roadmap PR4 (2026-03-06)

### Goal
Add direct loader/action coverage for the remaining admin-only routes so the rest of the operational dashboard is no longer effectively untested.

### Acceptance Criteria
- [x] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.email-templates.tsx`.
- [x] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.setup.tsx`.
- [x] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.analytics.tsx`.
- [x] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.content.tsx`.
- [x] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.backfill-hours.tsx`.
- [x] Add route-level behavioral tests for `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin._index.tsx`.
- [x] Verification passes for targeted tests, `npm run typecheck`, and a full coverage run.
- [x] Record the updated coverage baseline and remaining follow-up work.

### Active Tasks
- [x] Inspect the target admin routes and current test patterns.
- [x] Add loader/action tests for the remaining admin routes.
- [x] Run final verification and summarize the new coverage baseline.
- [x] Commit and publish the PR slice.

### Working Notes
- Clean worktree for this slice: `/Users/jspahr/repo/meatup-club-pr4a` on branch `codex/testing-roadmap-pr4`.
- PR3 merged into `main` as commit `94953aa`, so PR4 can branch directly from current `origin/main`.
- The new `dashboard.admin.setup.tsx` tests exposed a real auth gap: the route `action` was forwarding the setup POST without calling `requireAdmin`, so the route now enforces admin access before proxying.
- Generated React Router route prop types are stricter than most test scenarios, so route component tests need a single cast at the render boundary to keep `npm run typecheck` green without weakening runtime assertions.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.setup.test.tsx`, `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.analytics.test.tsx`, `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.backfill-hours.test.tsx`, `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin._index.test.tsx`, `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.content.test.tsx`, and `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.email-templates.test.tsx`.
- Hardened `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.setup.tsx` so the `action` checks `requireAdmin` before posting to `/api/admin/setup-resend`.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr4a/app && npm run test:run -- app/routes/dashboard.admin.setup.test.tsx app/routes/dashboard.admin.analytics.test.tsx app/routes/dashboard.admin.backfill-hours.test.tsx app/routes/dashboard.admin._index.test.tsx app/routes/dashboard.admin.content.test.tsx app/routes/dashboard.admin.email-templates.test.tsx` passed (`24` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr4a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr4a/app && npm run test:coverage` passed (`46` files, `355` tests).
- Coverage improvements from the prior PR 3 baseline:
  - Overall statements: `53.75%` -> `61.05%`
  - Overall branches: `42.61%` -> `48.63%`
  - Overall functions: `36.22%` -> `48.15%`
  - `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin._index.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.analytics.tsx`: `0%` -> `93.75%`
  - `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.backfill-hours.tsx`: `0%` -> `91.66%`
  - `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.content.tsx`: `0%` -> `65.07%`
  - `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.email-templates.tsx`: `0%` -> `72.28%`
  - `/Users/jspahr/repo/meatup-club-pr4a/app/app/routes/dashboard.admin.setup.tsx`: `0%` -> `100.00%`

## Testing Roadmap PR5 (2026-03-06)

### Goal
Add cross-layer workflow tests for the highest-value meetup journeys so the suite protects full user and admin flows, not just individual modules.

### Acceptance Criteria
- [x] Add a workflow test covering invite acceptance through the route and resulting state transition.
- [x] Add a workflow test covering poll date and restaurant voting across the member-facing routes/helpers.
- [x] Add a workflow test covering close poll -> create event across the poll-closing and event-creation boundaries.
- [x] Add a workflow test covering email RSVP webhook processing reflected in member-visible event state.
- [x] Add a workflow test covering comment reply creation and reply-notification dispatch.
- [x] Verification passes for targeted workflow tests, `npm run typecheck`, and a full coverage run.
- [x] Record the updated baseline, workflow coverage gains, and remaining suite-governance work.

### Active Tasks
- [x] Inspect the route/helper seams for the workflow suite and choose the minimal durable test boundaries.
- [x] Implement the workflow truth-suite tests.
- [x] Run final verification and summarize the new baseline.
- [x] Commit and publish the PR slice.

### Working Notes
- Clean worktree for this slice: `/Users/jspahr/repo/meatup-club-pr5a` on branch `codex/testing-roadmap-pr5`.
- PR4 merged into `main` as commit `6d7e56a`, so PR5 can branch directly from current `origin/main`.
- This slice uses a real in-memory SQLite database with the canonical `/Users/jspahr/repo/meatup-club-pr5a/schema.sql` loaded into a D1-style adapter, so route loaders/actions and shared helpers all mutate the same state.
- Background email work in these routes uses `context.cloudflare.ctx.waitUntil`, so tests need to await the queued promise before asserting side effects.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr5a/app/test/support/sqlite-d1.ts` and `/Users/jspahr/repo/meatup-club-pr5a/app/test/workflow-truth-suite.test.ts`.
- The new workflow suite covers invite acceptance -> active dashboard access, member date/restaurant voting -> admin poll close -> event creation, email RSVP webhook -> events dashboard state, and comment reply -> notification delivery.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr5a/app && npm run test:run -- test/workflow-truth-suite.test.ts` passed (`4` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr5a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr5a/app && npm run test:coverage` passed (`47` files, `361` tests).
- Coverage improvements from the prior PR 4 baseline:
  - Overall statements: `61.05%` -> `61.71%`
  - Overall branches: `48.63%` -> `49.59%`
  - Overall functions: `48.15%` -> `49.46%`
  - `/Users/jspahr/repo/meatup-club-pr5a/app/app/lib/activity.server.ts`: `0%` -> `33.33%`
  - `/Users/jspahr/repo/meatup-club-pr5a/app/app/routes/dashboard.admin.polls.tsx`: `46.55%` -> `50.86%`

## Testing Roadmap PR6 (2026-03-06)

### Goal
Align the suite names, docs, and CI wiring with what the tests actually prove so coverage confidence is not overstated and regressions are enforced in the real repository workflows.

### Acceptance Criteria
- [x] Rename the old admin polls pseudo-E2E suite so its filename and descriptions match its actual form-contract scope.
- [x] Rename the route smoke suite so its filename and descriptions clearly communicate structural-only coverage.
- [x] Update testing docs so the renamed suites and their limits are explicit.
- [x] Add or tighten real CI coverage enforcement in the repository-root workflow configuration.
- [x] Verification passes for the renamed suites, `npm run typecheck`, and a full coverage run with thresholds enabled.
- [x] Record the governance changes and any remaining non-threshold follow-up work.

### Active Tasks
- [x] Inspect the current smoke/E2E suite names, docs, and CI wiring.
- [x] Implement the suite-governance cleanup and CI threshold enforcement.
- [x] Run final verification and summarize the unchanged or updated baseline.
- [ ] Commit and publish the PR slice.

### Working Notes
- Clean worktree for this slice: `/Users/jspahr/repo/meatup-club-pr6a` on branch `codex/testing-roadmap-pr6`.
- PR5 merged into `main` as commit `e5da5d9`, so PR6 can branch directly from current `origin/main`.
- GitHub Actions only executes workflows from the repository-root `.github/workflows/` directory, so the old nested `app/.github/workflows/test.yml` was not enforcing anything in GitHub.

### Results
- Renamed `/Users/jspahr/repo/meatup-club-pr6a/app/test/admin-polls-e2e.test.tsx` to `/Users/jspahr/repo/meatup-club-pr6a/app/test/admin-polls.form-contract.test.tsx` and updated its file/describe text so it no longer reads like a true end-to-end suite.
- Renamed `/Users/jspahr/repo/meatup-club-pr6a/app/test/route-health.test.ts` to `/Users/jspahr/repo/meatup-club-pr6a/app/test/route-exports.smoke.test.ts` and made the smoke-only scope explicit in the file documentation.
- Added repository-root CI enforcement in `/Users/jspahr/repo/meatup-club-pr6a/.github/workflows/test.yml`, removed the dead nested workflow in `/Users/jspahr/repo/meatup-club-pr6a/app/.github/workflows/test.yml`, and enabled Vitest coverage thresholds in `/Users/jspahr/repo/meatup-club-pr6a/app/vitest.config.ts` (`60%` statements/lines, `45%` branches/functions).
- Updated `/Users/jspahr/repo/meatup-club-pr6a/app/TESTING.md` to reflect the renamed suites, their limits, and the new CI/threshold enforcement.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr6a/app && npm run test:run -- test/admin-polls.form-contract.test.tsx test/route-exports.smoke.test.ts` passed (`2` files, `42` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr6a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr6a/app && npm run test:coverage` passed (`47` files, `361` tests) with thresholds enabled.
- Coverage baseline remains above the new floor: `61.71%` statements, `49.59%` branches, `49.46%` functions, `61.80%` lines.

## Post-Roadmap Testing Slice 1 (2026-03-06)

### Goal
Reduce the remaining zero-coverage blind spots in core auth helpers and member-facing routes, while adding direct tests for low-covered pure business helpers that shape important emails and analytics logging.

### Acceptance Criteria
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/auth.server.ts`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/activity.server.ts`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/email-templates.ts`.
- [x] Add route/component tests for `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.members.tsx`.
- [x] Add route/component tests for `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.about.tsx`.
- [x] Add redirect coverage for `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.rsvp.tsx`.
- [x] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [x] Record the updated baseline and any new follow-up gaps.

### Active Tasks
- [x] Review current coverage docs, lessons, and target modules.
- [x] Implement helper and route tests for the selected zero/low-coverage files.
- [x] Run final verification and summarize the new baseline.
- [x] Commit and publish the PR slice.

### Working Notes
- Fresh worktree for this slice: `/Users/jspahr/repo/meatup-club-pr7a` on branch `codex/testing-post-roadmap`.
- The current merged testing guide still lists several active product files at `0%`, with `auth.server.ts`, `dashboard.members.tsx`, and `dashboard.rsvp.tsx` among the most meaningful remaining gaps.
- `dashboard.about.tsx` is lower risk than auth or poll/event code, but it is still a real member-facing route and inexpensive to cover while the route harness is already open.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/auth.server.test.ts` with coverage for session lookup, auth/active/admin redirects, session creation/destruction, and Google OAuth helper fetch paths.
- Added `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/activity.server.test.ts` with coverage for metadata capture, error swallowing, user/global activity retrieval, and summary statistics.
- Added `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/email-templates.test.ts` with direct assertions on invite, comment-reply, and RSVP-override template shaping.
- Added `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.members.test.tsx`, `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.about.test.tsx`, and `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.rsvp.test.ts` so those member-facing routes are no longer at `0%`.
- Added `/Users/jspahr/repo/meatup-club-pr7a/app/app/components/VoteLeadersCard.test.tsx` to close the untested vote-leader display component used in admin poll/event flows.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr7a/app && npm run test:run -- app/lib/auth.server.test.ts app/lib/activity.server.test.ts app/lib/email-templates.test.ts app/routes/dashboard.members.test.tsx app/routes/dashboard.about.test.tsx app/routes/dashboard.rsvp.test.ts app/components/VoteLeadersCard.test.tsx` passed (`29` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr7a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr7a/app && npm run test:coverage` passed (`54` files, `390` tests).
- Coverage improvements from the prior merged baseline:
  - Overall statements: `61.71%` -> `65.06%`
  - Overall branches: `49.59%` -> `52.44%`
  - Overall functions: `49.46%` -> `55.43%`
  - `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/auth.server.ts`: `0%` -> `95.00%`
  - `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/activity.server.ts`: `33.33%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr7a/app/app/lib/email-templates.ts`: `35.71%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.members.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.about.tsx`: `0%` -> `75.00%`
  - `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.rsvp.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr7a/app/app/components/VoteLeadersCard.tsx`: `0%` -> `100.00%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/api.admin.setup-resend.tsx`, `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/auth.google.callback.tsx`, `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.tsx`, `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/logout.tsx`, `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.admin.events.tsx`, and `/Users/jspahr/repo/meatup-club-pr7a/app/app/routes/dashboard.restaurants.tsx`.

## Post-Roadmap Testing Slice 2 (2026-03-07)

### Goal
Remove the remaining easy `0%` route blind spots by adding direct loader/action coverage for the setup resend API route, Google auth callback, dashboard shell loader, and logout route.

### Acceptance Criteria
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.admin.setup-resend.tsx`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/auth.google.callback.tsx`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.tsx`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/logout.tsx`.
- [x] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [x] Record the updated baseline and the next remaining gaps.

### Active Tasks
- [x] Review the current baseline, lessons, and target files.
- [x] Inspect route implementations and current test patterns.
- [x] Implement the route tests for the remaining `0%` files.
- [x] Run final verification and summarize the updated baseline.
- [x] Commit and publish the PR slice.

### Working Notes
- Fresh worktree for this slice: `/Users/jspahr/repo/meatup-club-pr8a` on branch `codex/testing-zero-routes`.
- This pass intentionally targets the remaining low-effort `0%` routes before taking on the larger partially-covered admin and restaurant surfaces.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.admin.setup-resend.test.ts` with coverage for the Resend domain lookup failure path, missing-domain handling, already-correct route reuse, and stale-route replacement.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/auth.google.callback.test.ts` with coverage for missing params, CSRF state validation, active-user login redirects, and pending-user redirects.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.test.tsx` with loader, layout-shell, and error-boundary coverage for the authenticated dashboard wrapper.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/logout.test.ts` with loader/action coverage for logout activity logging and the unauthenticated fast path.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/api.admin.setup-resend.test.ts app/routes/auth.google.callback.test.ts app/routes/dashboard.test.tsx app/routes/logout.test.ts` passed (`15` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`59` files, `411` tests).
- Coverage improvements from the prior merged baseline:
  - Overall statements: `65.06%` -> `68.81%`
  - Overall branches: `52.44%` -> `54.93%`
  - Overall functions: `55.43%` -> `57.96%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.admin.setup-resend.tsx`: `0%` -> `87.80%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/auth.google.callback.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/logout.tsx`: `0%` -> `100.00%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/login.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/pending.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.restaurants.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.members.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/rate-limit.server.ts`.

## Post-Roadmap Testing Slice 3 (2026-03-07)

### Goal
Clear the remaining auth-lifecycle blind spots by covering the login loader, pending route, and rate-limit helper before moving back to the larger admin and restaurant surfaces.

### Acceptance Criteria
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/login.tsx`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/pending.tsx`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/rate-limit.server.ts`.
- [x] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [x] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the current branch state, lessons, and target files.
- [x] Implement the auth-lifecycle tests for login, pending, and rate limiting.
- [x] Run final verification and summarize the new baseline.
- [ ] Commit and publish the updated branch.

### Working Notes
- This slice stays on `/Users/jspahr/repo/meatup-club-pr8a` and extends PR #88 rather than cutting a new branch.
- The auth/session test lessons from `2026-03-06` apply here: avoid asserting `Set-Cookie` off redirect responses, and stub `request.headers.get("Cookie")` directly when the code depends on cookies.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/login.test.ts` with coverage for OAuth state generation, session persistence, and Google redirect URL construction.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/pending.test.tsx` with loader coverage plus personalized/fallback pending-state rendering checks.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/rate-limit.server.test.ts` with direct coverage for successful window tracking, `waitUntil()` cleanup scheduling, cleanup failure swallowing, and fail-open error handling.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/login.test.ts app/routes/pending.test.tsx app/lib/rate-limit.server.test.ts` passed (`8` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`62` files, `419` tests).
- Coverage improvements from the prior branch baseline:
  - Overall statements: `68.81%` -> `69.83%`
  - Overall branches: `54.93%` -> `55.20%`
  - Overall functions: `57.96%` -> `59.02%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/login.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/pending.tsx`: `0%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/rate-limit.server.ts`: direct helper coverage added; overall file coverage remains `58.33%` statements / `41.66%` branches and is still a follow-up target.
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.webhooks.sms.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.restaurants.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.members.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/rate-limit.server.ts`.

## Post-Roadmap Testing Slice 4 (2026-03-07)

### Goal
Raise coverage on the largest remaining admin route gap and the most important partially-covered webhook boundary by expanding `dashboard.admin.events.tsx` and `api.webhooks.sms.tsx`.

### Acceptance Criteria
- [ ] Add loader/action/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`.
- [ ] Add direct behavioral coverage for the remaining SMS webhook branches in `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.webhooks.sms.tsx`.
- [ ] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [ ] Record the updated baseline and the next remaining gaps.

### Active Tasks
- [x] Review current gaps and existing route test shapes for the selected files.
- [x] Implement the new admin-events and SMS webhook tests.
- [x] Run final verification and summarize the updated baseline.
- [ ] Commit and publish the updated branch.

### Working Notes
- This slice stays on `/Users/jspahr/repo/meatup-club-pr8a` and continues extending PR #88.
- `dashboard.admin.events.tsx` already has some action coverage, so the highest-value additions are the untested loader branches, the remaining mutation actions, and the route UI state transitions that can regress without route-level failures.
- `api.webhooks.sms.tsx` is security-sensitive and still only has idempotency coverage even though it owns signature validation, opt-out handling, fallback event lookup, and RSVP writes.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.route-ui.test.tsx` with loader coverage, route UI state checks, event update/delete coverage, and ad hoc SMS reminder coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`.
- Replaced the thin `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.webhooks.sms.test.ts` idempotency-only suite with full behavioral coverage for signature validation, phone normalization, unknown-user handling, STOP/help branches, and both reminder-based and fallback RSVP writes.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/dashboard.admin.events.route-ui.test.tsx app/routes/api.webhooks.sms.test.ts` passed (`18` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`63` files, `436` tests).
- Coverage improvements from the prior branch baseline:
  - Overall statements: `69.83%` -> `76.11%`
  - Overall branches: `55.20%` -> `61.24%`
  - Overall functions: `59.02%` -> `64.33%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`: `23.04%` -> `80.86%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.webhooks.sms.tsx`: `43.47%` -> `100.00%`

## Post-Roadmap Testing Slice 5 (2026-03-07)

### Goal
Add route/UI coverage for the remaining member voting surfaces so `dashboard.dates.tsx` and `dashboard.restaurants.tsx` are not mostly defended by action-only tests.

### Acceptance Criteria
- [ ] Add loader/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`.
- [ ] Add loader/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.restaurants.tsx`.
- [ ] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [ ] Record the updated baseline and the next remaining gaps.

### Active Tasks
- [x] Review the current route implementations and existing action/security tests.
- [x] Implement the new dates and restaurants route/UI tests.
- [x] Run final verification and summarize the updated baseline.
- [ ] Commit and publish the updated branch.

### Working Notes
- This slice follows the same pattern as admin events: keep the existing action/security tests, then add route-level loader and UI interaction coverage on top.
- `DateCalendar` and `AddRestaurantModal` already have direct component tests, so route tests can mock those child components to focus on route wiring and state transitions.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.route-ui.test.tsx` with loader checks, no-poll UI coverage, suggest-form toggling, and calendar/list submit wiring for suggest/vote/delete flows.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.restaurants.route-ui.test.tsx` with loader coverage for normalized photos plus route-level modal submit and delete wiring.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` to reflect the new post-slice baseline and remaining active gaps.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/dashboard.dates.route-ui.test.tsx app/routes/dashboard.restaurants.route-ui.test.tsx` passed (`7` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`65` files, `443` tests).
- Coverage improvements from the post-slice-4 baseline:
  - Overall statements: `76.11%` -> `79.47%`
  - Overall branches: `61.24%` -> `65.26%`
  - Overall functions: `64.33%` -> `69.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`: `42.05%` -> `83.17%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.restaurants.tsx`: `45.78%` -> `95.18%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.members.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.events.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.polls.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/rate-limit.server.ts`.

## Post-Roadmap Testing Slice 6 (2026-03-07)

### Goal
Replace the remaining admin route blind spots with real loader/UI coverage for member management and poll management.

### Acceptance Criteria
- [ ] Add loader/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.members.tsx`.
- [ ] Add loader/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`.
- [ ] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [ ] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the current admin route implementations and their existing action/security tests.
- [x] Implement the new admin-members and admin-polls route/UI tests.
- [x] Run final verification and summarize the updated baseline.
- [ ] Commit and publish the updated branch.

### Working Notes
- `dashboard.admin.members.tsx` already has solid action coverage, so the highest-value additions are its loader, invite-form UI, edit/reset flow, and destructive submit wiring.
- `dashboard.admin.polls.tsx` still relies heavily on a form-contract test that does not mount the real route. This slice should cover the actual loader and component with real route data shapes.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.members.route-ui.test.tsx` with loader coverage, invite-form UI coverage, edit-reset behavior, and re-login/remove submit wiring for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.members.tsx`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.route-ui.test.tsx` with non-admin redirect coverage, admin loader coverage, and real close/create/history UI coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` and `/Users/jspahr/repo/meatup-club-pr8a/tasks/lessons.md` to reflect the new baseline and the route-form query lesson.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/dashboard.admin.members.route-ui.test.tsx app/routes/dashboard.admin.polls.route-ui.test.tsx` passed (`7` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`67` files, `450` tests).
- Coverage improvements from the post-slice-5 baseline:
  - Overall statements: `79.47%` -> `81.91%`
  - Overall branches: `65.26%` -> `68.12%`
  - Overall functions: `69.00%` -> `73.03%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.members.tsx`: `49.07%` -> `88.88%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`: `50.86%` -> `67.24%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.events.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.polls.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/rate-limit.server.ts`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.ts`.

## Post-Roadmap Testing Slice 7 (2026-03-07)

### Goal
Replace the remaining member dashboard route blind spots with real component coverage for the dashboard home, events, and polls pages.

### Acceptance Criteria
- [ ] Add route/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.tsx`.
- [ ] Add route/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.events.tsx`.
- [ ] Add route/component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.polls.tsx`.
- [ ] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [ ] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the current route implementations and existing loader/action tests.
- [x] Implement the new dashboard home, events, and polls route/UI tests.
- [x] Run final verification and summarize the updated baseline.
- [ ] Commit and publish the updated branch.

### Working Notes
- The existing suites already defend loader/action logic for these routes; the biggest remaining uncovered branches are in route component state, UI branching, and submit wiring.
- Follow the thin route/UI pattern from the dates, restaurants, and admin route slices: mock child components only where the route wiring itself is the behavior under test.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.route-ui.test.tsx` with first-visit content/SMS prompt coverage, returning-admin branch coverage, and `HydrateFallback` coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.tsx`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.events.route-ui.test.tsx` with RSVP grouping, radio auto-submit, past-event badge, and empty-state coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.events.tsx`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.polls.route-ui.test.tsx` with no-active-poll history coverage plus calendar/doodle/modal/restaurant submit wiring for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.polls.tsx`.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` and `/Users/jspahr/repo/meatup-club-pr8a/tasks/lessons.md` to reflect the new baseline and the localStorage test-harness lesson.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/dashboard._index.route-ui.test.tsx app/routes/dashboard.events.route-ui.test.tsx app/routes/dashboard.polls.route-ui.test.tsx` passed (`7` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`70` files, `457` tests).
- Coverage improvements from the post-slice-6 baseline:
  - Overall statements: `81.91%` -> `85.43%`
  - Overall branches: `68.12%` -> `74.20%`
  - Overall functions: `73.03%` -> `81.10%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.tsx`: `50.72%` -> `88.40%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.events.tsx`: `61.53%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.polls.tsx`: `64.24%` -> `88.26%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/cache.server.ts`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/confirm.client.ts`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/webhook-idempotency.server.ts`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/db.server.ts`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`.

## Post-Roadmap Testing Slice 8 (2026-03-07)

### Goal
Close the remaining low-coverage helper blind spots in cache, confirmation, webhook idempotency, and DB helper code.

### Acceptance Criteria
- [ ] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/cache.server.ts`.
- [ ] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/confirm.client.ts`.
- [ ] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/webhook-idempotency.server.ts`.
- [ ] Expand direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/db.server.ts`.
- [ ] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [ ] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the target helper modules and existing test patterns.
- [x] Implement the helper coverage additions.
- [x] Run final verification and summarize the updated baseline.
- [ ] Commit and publish the updated branch.

### Working Notes
- This is mostly direct unit coverage; these helpers are small enough that mocking at the DB/cache boundary is sufficient and lower-risk than expanding more route suites first.
- `db.server.ts` already has `ensureUser` tests, so this slice should add the missing helper coverage rather than replacing the existing tests.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/cache.server.test.ts` with cache-hit, cache-miss, and non-cacheable-response coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/cache.server.ts`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/confirm.client.test.ts` with browser and non-browser coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/confirm.client.ts`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/webhook-idempotency.server.test.ts` with reserve/duplicate/fail-open/rethrow coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/webhook-idempotency.server.ts`.
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/db.server.test.ts` to cover `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/db.server.ts` lookup, active-state, and forced re-auth helpers in addition to `ensureUser`.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` to reflect the new helper baseline and remaining active gaps.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/lib/cache.server.test.ts app/lib/confirm.client.test.ts app/lib/webhook-idempotency.server.test.ts app/lib/db.server.test.ts` passed (`15` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`73` files, `470` tests).
- Coverage improvements from the post-slice-7 baseline:
  - Overall statements: `85.43%` -> `86.41%`
  - Overall branches: `74.20%` -> `74.74%`
  - Overall functions: `81.10%` -> `82.16%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/cache.server.ts`: `0.00%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/confirm.client.ts`: `0.00%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/webhook-idempotency.server.ts`: `58.33%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/db.server.ts`: `60.00%` -> `100.00%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.email-templates.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.details.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.ts`.

## Post-Roadmap Testing Slice 9 (2026-03-07)

### Goal
Raise the remaining admin editor routes by covering route-state behavior that action/loader tests currently miss.

### Acceptance Criteria
- [ ] Add route-state coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.tsx`.
- [ ] Add route-state coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.email-templates.tsx`.
- [ ] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [ ] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the current admin editor routes and the existing tests around them.
- [x] Implement the new route-state coverage additions.
- [x] Run final verification and summarize the updated baseline.
- [x] Commit and publish the updated branch.

### Working Notes
- The current tests already cover loaders and primary actions; the uncovered lines are mostly in component state management, navigation-based form reset, preview/details rendering, and destructive-action affordances.
- Keep the route modules real and control navigation state with a shared mock variable, similar to the other route UI slices.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.route-ui.test.tsx` with submit-cycle auto-reset, failed-update retention, preview rendering, and cancel-flow coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.tsx`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.email-templates.route-ui.test.tsx` with create-reset, failed-update retention, preview/details rendering, checkbox state, and delete-confirm coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.email-templates.tsx`.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` to reflect the new baseline and the reduced admin-route gap list.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/dashboard.admin.content.route-ui.test.tsx app/routes/dashboard.admin.email-templates.route-ui.test.tsx` passed (`4` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`75` files, `474` tests).
- Coverage improvements from the post-slice-8 baseline:
  - Overall statements: `86.41%` -> `87.36%`
  - Overall branches: `74.74%` -> `75.59%`
  - Overall functions: `82.16%` -> `84.50%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.tsx`: `65.07%` -> `85.71%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.email-templates.tsx`: `72.28%` -> `85.54%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.details.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.photo.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.search.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.ts`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`.

## Post-Roadmap Testing Slice 10 (2026-03-07)

### Goal
Raise `dashboard.admin.polls.tsx` by covering the remaining close/create action validation and transaction branches directly.

### Acceptance Criteria
- [ ] Add action-matrix coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`.
- [ ] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [ ] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the remaining uncovered action paths in `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`.
- [x] Implement the new admin-polls action coverage additions.
- [x] Run final verification and summarize the updated baseline.
- [x] Commit and publish the updated branch.

### Working Notes
- The existing admin-polls suites already cover loader/UI, data-shape consistency, and a few security checks; the remaining uncovered paths are mostly action validation, selection checks, and transaction/send-invites branches.
- Keep this slice focused on the action function and DB/provider boundary mocks rather than broadening the UI surface again.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.action-coverage.test.ts` with direct action coverage for admin-only enforcement, create validation, close validation, winner selection checks, transaction rollback, and invite scheduling in `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` to reflect the new baseline and the post-admin-polls gap list.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/dashboard.admin.polls.action-coverage.test.ts` passed (`17` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`76` files, `491` tests).
- Coverage improvements from the post-slice-9 baseline:
  - Overall statements: `87.36%` -> `88.66%`
  - Overall branches: `75.59%` -> `76.93%`
  - Overall functions: `84.50%` -> `84.92%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.polls.tsx`: `67.24%` -> `95.68%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.details.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.photo.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.search.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.ts`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/RestaurantAutocomplete.tsx`.

## Post-Roadmap Testing Slice 11 (2026-03-07)

### Goal
Raise the remaining low-coverage date and Places code by covering guard, fallback, and error-handling branches that the current suites still miss.

### Acceptance Criteria
- [x] Add direct unit coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.ts`.
- [x] Extend Places route tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.search.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.details.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.photo.tsx`.
- [x] Extend UI behavior coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/RestaurantAutocomplete.tsx`.
- [x] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [x] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the remaining uncovered branches in the target files.
- [x] Implement the new date/Places/autocomplete coverage additions.
- [x] Run final verification and summarize the updated baseline.
- [x] Commit and publish the updated branch.

### Working Notes
- `app/coverage/coverage-final.json` shows the remaining misses are mostly validation guards, fallback transforms, stale-photo failure branches, and autocomplete keyboard/error state transitions.
- Keep the route modules real and extend the existing Places/autocomplete suites instead of creating a second overlapping harness.

### Results
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.test.ts` with direct coverage for timezone fallback, UTC/local comparisons, datetime formatting, and backwards-compatible wrapper functions in `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.ts`.
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.security.test.ts` to cover missing input, invalid formats, inactive users, missing API configuration, invalid photo dimensions, and rate limiting across the Places handlers.
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.test.ts` to cover sparse details transforms, upstream details failures, stale-photo refresh failures, background photo URL update failures, and top-level photo proxy errors.
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/RestaurantAutocomplete.test.tsx` to cover closed-dropdown keyboard handling, hover/arrow-up/escape navigation, search failure handling, and mouse-based detail fetch failures.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` to reflect the new baseline and the updated post-Places/date gap list.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/lib/dateUtils.test.ts app/routes/api.places.test.ts app/routes/api.places.security.test.ts app/components/RestaurantAutocomplete.test.tsx` passed (`42` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`77` files, `521` tests).
- Coverage improvements from the post-slice-10 baseline:
  - Overall statements: `88.66%` -> `90.80%`
  - Overall branches: `76.93%` -> `78.72%`
  - Overall functions: `84.92%` -> `87.04%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/dateUtils.ts`: `79.71%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.search.tsx`: `79.31%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.details.tsx`: `73.68%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.places.photo.tsx`: `76.92%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/RestaurantAutocomplete.tsx`: `80.64%` -> `100.00%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/ui/UserAvatar.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/restaurant-photo-url.ts`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/DateCalendar.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/session.server.ts`.

## Post-Roadmap Testing Slice 12 (2026-03-07)

### Goal
Raise the remaining member-facing date surfaces and small shared helper/component gaps that are still below the branch baseline.

### Acceptance Criteria
- [x] Extend route coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.tsx`.
- [x] Extend route/UI coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`.
- [x] Extend component coverage for `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/DateCalendar.tsx`.
- [x] Add direct tests for `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/ui/UserAvatar.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/restaurant-photo-url.ts`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/session.server.ts`.
- [x] Run targeted verification plus `npm run typecheck` and `npm run test:coverage`.
- [x] Record the updated baseline and next remaining gaps.

### Active Tasks
- [x] Review the remaining uncovered branches in the target route/helper/component files.
- [x] Implement the new about/date/calendar/helper coverage additions.
- [x] Run final verification and summarize the updated baseline.
- [x] Commit and publish the updated branch.

### Working Notes
- `dashboard.admin.events.tsx` is still a meaningful gap, but it is a larger follow-up route matrix; this slice stays on the cheaper wins around member-facing date UX and small shared utilities.
- The uncovered lines in `dashboard.about.tsx` are mostly icon/markdown variant branches, while `restaurant-photo-url.ts`, `session.server.ts`, and `UserAvatar.tsx` can likely be closed with small direct tests.

### Results
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.test.tsx` to cover empty-content fallback plus the remaining icon and markdown rendering branches in `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.tsx`.
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.route-ui.test.tsx` to cover the admin no-poll state, empty-state suggest shortcut, form submit reset, list vote submissions, and declined delete confirmations in `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`.
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/DateCalendar.test.tsx` to cover month navigation, today reset, and previous/next year rollover dates in `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/DateCalendar.tsx`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/ui/UserAvatar.test.tsx` for image, initials, email fallback, and question-mark fallback coverage in `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/ui/UserAvatar.tsx`.
- Expanded `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/restaurant-photo-url.test.ts` to cover null/proxied inputs, unrelated app origins, default dimensions, and malformed URL fallbacks in `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/restaurant-photo-url.ts`.
- Added `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/session.server.test.ts` to cover test fallback secrets, secure production cookies, and the missing-secret throw path in `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/session.server.ts`.
- Updated `/Users/jspahr/repo/meatup-club-pr8a/app/TESTING.md` to reflect the new baseline and the updated remaining route gap list.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:run -- app/routes/dashboard.about.test.tsx app/components/DateCalendar.test.tsx app/components/ui/UserAvatar.test.tsx app/lib/restaurant-photo-url.test.ts app/lib/session.server.test.ts app/routes/dashboard.dates.route-ui.test.tsx` passed (`30` tests).
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club-pr8a/app && npm run test:coverage` passed (`79` files, `538` tests).
- Coverage improvements from the post-slice-11 baseline:
  - Overall statements: `90.80%` -> `92.30%`
  - Overall branches: `78.72%` -> `80.06%`
  - Overall functions: `87.04%` -> `89.17%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.about.tsx`: `75.00%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.dates.tsx`: `83.17%` -> `93.45%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/DateCalendar.tsx`: `82.41%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/ui/UserAvatar.tsx`: `81.81%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/restaurant-photo-url.ts`: `81.81%` -> `100.00%`
  - `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/session.server.ts`: `83.33%` -> `100.00%`
- Remaining follow-up gaps worth the next slice: `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.email-templates.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.admin.content.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/api.admin.setup-resend.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/components/DashboardNav.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard.polls.tsx`, `/Users/jspahr/repo/meatup-club-pr8a/app/app/lib/sms.server.ts`, and `/Users/jspahr/repo/meatup-club-pr8a/app/app/routes/dashboard._index.tsx`.

## Branch Management Fix (2026-03-07)

### Goal
Move the post-merge testing commits off the already-merged `codex/testing-zero-routes` branch and reopen them as a clean PR from current `origin/main`.

### Acceptance Criteria
- [x] Identify the commits made after PR `#88` merged.
- [x] Create a fresh `codex/*` branch from current `origin/main`.
- [x] Replay the post-merge commits onto the fresh branch.
- [x] Push the fresh branch and open a replacement PR.
- [x] Summarize the corrected branch/PR state and any cleanup follow-up.

### Working Notes
- `origin/main` already contains merge commit `4e081bd` for PR `#88`, so every later coverage commit on `codex/testing-zero-routes` needs to move to a new branch instead of staying attached to the merged PR.
- Fresh replacement branch: `/Users/jspahr/repo/meatup-club-pr89a` on `codex/testing-post-pr88`.
- Current `origin/main` also includes the shared `closePoll()` refactor that uses `session.batch()`, so the replayed `dashboard.admin.polls.action-coverage.test.ts` harness needed to move off old rollback assertions before `npm run test:coverage` would pass again.

### Results
- Published the replayed coverage slice on `codex/testing-post-pr88` and opened replacement PR `#91`: `https://github.com/jeffspahr/meatup-club/pull/91`.
- Added a route-harness compatibility fix in `/Users/jspahr/repo/meatup-club-pr89a/app/app/routes/dashboard.admin.polls.action-coverage.test.ts` so the rebased branch matches the current shared `closePoll()` implementation on `main`.
- Refreshed `/Users/jspahr/repo/meatup-club-pr89a/app/TESTING.md` to the verified replacement-branch baseline: `542` tests in `79` files, `92.23%` statements, `79.78%` branches, `89.61%` functions, `92.17%` lines.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club-pr89a/app && npm run test:run -- app/routes/dashboard.admin.polls.action-coverage.test.ts`
  - `cd /Users/jspahr/repo/meatup-club-pr89a/app && npm run typecheck`
  - `cd /Users/jspahr/repo/meatup-club-pr89a/app && npm run test:coverage`
