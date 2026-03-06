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
