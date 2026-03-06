# Testing Guide - Meatup.Club

## Purpose

This document describes the current test setup, the live coverage baseline, the ideal state for the test suite, and the roadmap for getting there.

## Current Stack

- Test runner: Vitest
- UI testing: Testing Library
- DOM environment: `happy-dom`
- Coverage provider: V8
- Coverage command: `npm run test:coverage`
- HTML coverage report: `/Users/jspahr/repo/meatup-club/app/coverage/index.html`

## Test Layout

```text
app/
├── vitest.config.ts
├── test/
│   ├── setup.ts
│   ├── route-health.test.ts
│   ├── timezone.test.ts
│   └── admin-polls-e2e.test.tsx
└── app/
    ├── lib/
    │   └── *.test.ts
    └── routes/
        └── *.test.ts
```

Use colocated tests for feature-specific behavior in `app/app/**`, and reserve `app/test/` for cross-cutting guardrails, smoke tests, or multi-route suites.

## Running Tests

Run all commands from `/Users/jspahr/repo/meatup-club/app`.

```bash
npm run test           # watch mode
npm run test:run       # single run
npm run test:coverage  # single run with coverage
npm run test:ui        # Vitest UI
npm run typecheck
npm run build
```

Filter to a specific file or pattern when iterating:

```bash
npm run test -- email.server.test.ts
```

## Current Baseline (2026-03-06, after roadmap PR 3 slice)

Live numbers from `npm run test:coverage`:

- `40` passing test files
- `331` passing tests
- `53.75%` statements
- `42.61%` branches
- `36.22%` functions
- `53.87%` lines

Coverage by area:

- `app/app/lib`: `72.95%` statements
- `app/app/routes`: `42.90%` statements
- `app/app/components`: `82.64%` statements

Best-covered production files:

- `app/routes/api.webhooks.email-rsvp.tsx`: `92.68%` statements
- `app/routes/api.polls.tsx`: `88.57%` statements
- `app/lib/email.server.ts`: `90.62%` statements
- `app/lib/sms.server.ts`: `88.27%` statements
- `app/lib/comments.server.ts`: `100%` statements
- `app/lib/restaurants.server.ts`: `100%` statements
- `app/lib/polls.server.ts`: `100%` statements
- `app/components/AddRestaurantModal.tsx`: `100%` statements
- `app/components/CommentSection.tsx`: `100%` statements
- `app/components/DoodleView.tsx`: `100%` statements
- `app/components/DateCalendar.tsx`: `82.41%` statements
- `app/components/RestaurantAutocomplete.tsx`: `80.64%` statements
- `app/routes/api.places.search.tsx`: `79.31%` statements
- `app/routes/api.places.details.tsx`: `73.68%` statements
- `app/routes/api.places.photo.tsx`: `76.92%` statements
- `app/lib/rsvps.server.ts`: `100%` statements

Largest remaining gaps in active product code:

- `app/routes/dashboard.admin._index.tsx`: `0%`
- `app/routes/dashboard.admin.analytics.tsx`: `0%`
- `app/routes/dashboard.admin.backfill-hours.tsx`: `0%`
- `app/routes/dashboard.admin.content.tsx`: `0%`
- `app/routes/dashboard.admin.email-templates.tsx`: `0%`
- `app/routes/dashboard.admin.setup.tsx`: `0%`
- `app/routes/dashboard.about.tsx`: `0%`
- `app/routes/dashboard.members.tsx`: `0%`
- `app/routes/dashboard.rsvp.tsx`: `0%`
- `app/components/DashboardLeadersCard.tsx`: `0%`
- `app/components/PageHeader.tsx`: `0%`

Important interpretation notes:

- `test/route-health.test.ts` is mostly a route import/export smoke suite. It protects route registration and basic module shape, but it is not deep behavioral coverage.
- `test/admin-polls-e2e.test.tsx` exercises test-only inline components and form data construction. It is useful as a guardrail, but it does not provide true route-level end-to-end coverage.
- The current suite is strongest around webhook security, RSVP parsing, notifications, poll/date/admin helpers, member dashboard actions, shared poll/comment/restaurant UI, and the Places API. It is still weakest in admin-only routes and a handful of low-coverage dashboard support surfaces.

## Ideal State

The target is not "100% everywhere." The target is a codebase where a real regression in a core workflow is likely to fail a test quickly.

For this repo, the ideal state is:

- Every mutation-heavy route has real loader/action coverage for success, validation, permission denial, and failure branches.
- Every domain helper that owns business rules has direct tests, not just incidental route coverage.
- Every shared interactive component used in core flows has behavior tests for user-visible state changes and callback payloads.
- A small workflow suite exercises the most important cross-layer journeys end to end.
- Smoke suites remain in place, but they are treated as structural checks rather than substantive behavior coverage.
- No important product file remains at `0%` coverage.

If this state is reached, breaking poll creation, voting, event creation, invites, comment replies, or webhook handling should be difficult to do without at least one failing test.

## Long-Term Coverage Goals

Use these as the ideal-state targets:

- Global coverage: `70%+` statements and `60%+` branches.
- Critical route/action and server modules: `85-95%+` statements with meaningful branch coverage.
- Important product files at `0%`: `0`.
- Major workflows covered: each one should have direct route/helper coverage, and the highest-value flows should also have at least one cross-layer workflow test.

These numbers are not the point by themselves. They are a forcing function to make sure the core meetup workflows are actually defended.

## Testing Strategy

Use the smallest test that proves the behavior:

- Pure utility and server helper logic: unit tests next to the module.
- Route loaders and actions: integration-style tests using a real `Request`, mocked Cloudflare context, and mocked DB/provider boundaries.
- React components: render the real component and assert on user-visible behavior, accessibility, and interaction.
- Full workflows: reserve broader integration or end-to-end tests for high-value journeys that span multiple layers.

What to optimize for:

- Behavior over implementation details.
- Reproducible regression tests for every bug fix.
- Focus on security, permissions, data integrity, and external integration failures before cosmetic UI coverage.
- Keep mocks at the system boundary. Prefer real parsing, validation, and branching logic inside the unit under test.

## Test Standards for This Repo

Use these standards for all new work and all future coverage expansion:

- Any behavior change should include a new test or an update to an existing test, unless the change is strictly static copy, styling, or docs.
- Bug fixes should add a regression test that fails on the pre-fix behavior.
- Smoke tests are useful, but they do not replace behavioral tests for route logic, business rules, or user interactions.
- Tests should cover both the happy path and the most important failure branch for the touched code.
- Security-sensitive code must exercise malformed input, unauthorized access, and external failure cases.
- Route tests should assert on returned data, redirects, status codes, permission checks, and side effects.
- Helper tests should cover business-rule branches directly, especially when the helper owns mutation or validation logic.
- Component tests should render the real component under test rather than a simplified inline stand-in when the goal is to validate app behavior.
- Workflow tests should be used selectively for cross-layer journeys that lower-level tests would not protect well on their own.
- The suite should optimize for trustworthiness, not raw test count.

## Multi-PR Roadmap

This is the concrete roadmap to reach the ideal state without turning the suite into an unstructured pile of tests.

### PR 1: Poll Core and Domain Helpers

Target files:

- `app/routes/dashboard.polls.tsx`
- `app/lib/restaurants.server.ts`
- `app/lib/comments.server.ts`
- `app/lib/polls.server.ts`

Focus:

- Poll loader data shaping
- Restaurant suggest/vote/change/unvote/delete behavior
- Comment add/reply/delete behavior
- Permission checks and invalid payload handling
- Side effects such as notifications or activity logging

Exit criteria:

- Poll mutations have real route-level coverage beyond date-only branches
- Restaurant/comment/poll helper modules are no longer at `0%`
- `dashboard.polls.tsx` is above roughly `50%` statement coverage with meaningful branch movement

Current status:

- Complete on 2026-03-06.
- Result:
  `dashboard.polls.tsx` moved to `63.24%` statements / `56.47%` branches.
  `restaurants.server.ts`, `comments.server.ts`, and `polls.server.ts` are now at `100%` statement coverage.

### PR 2: Member-Facing Dashboard Routes

Target files:

- `app/routes/dashboard.events.tsx`
- `app/routes/dashboard._index.tsx`
- `app/routes/dashboard.profile.tsx`
- `app/routes/accept-invite.tsx`

Focus:

- Loader states
- Empty and populated rendering states
- RSVP-related actions and validation
- Invite acceptance and edge cases

Exit criteria:

- Main member-facing dashboard surfaces are no longer untested
- Core event viewing and invite acceptance paths have direct coverage

Current status:

- Complete on 2026-03-06.
- Result:
  `dashboard.events.tsx` moved to `61.53%` statements / `27.39%` branches.
  `dashboard._index.tsx` moved to `50.72%` statements / `14.39%` branches.
  `dashboard.profile.tsx` moved to `90.00%` statements / `50.00%` branches.
  `accept-invite.tsx` moved to `93.33%` statements / `80.00%` branches.

### PR 3: Shared Interactive Components and Places API

Target files:

- `app/components/RestaurantAutocomplete.tsx`
- `app/components/AddRestaurantModal.tsx`
- `app/components/CommentThread.tsx`
- `app/components/CommentSection.tsx`
- `app/components/DashboardNav.tsx`
- `app/routes/api.places.search.tsx`
- `app/routes/api.places.details.tsx`
- `app/routes/api.places.photo.tsx`

Focus:

- Input behavior
- Disabled/loading/error states
- Keyboard and mouse interactions
- Callback payload correctness
- Invalid query handling, auth, and rate-limit behavior for places endpoints

Exit criteria:

- Shared interactive UI in the poll/restaurant/comment flows has direct behavior coverage
- Places API routes are protected by real request/response tests

Current status:

- Complete on 2026-03-06.
- Result:
  `RestaurantAutocomplete.tsx` moved to `80.64%` statements / `73.80%` branches.
  `AddRestaurantModal.tsx` moved to `100.00%` statements / `94.11%` branches.
  `CommentThread.tsx` moved to `88.88%` statements / `86.95%` branches.
  `CommentSection.tsx` moved to `100.00%` statements / `100.00%` branches.
  `DashboardNav.tsx` moved to `88.23%` statements / `80.00%` branches.
  `api.places.search.tsx` moved to `79.31%` statements / `72.72%` branches.
  `api.places.details.tsx` moved to `73.68%` statements / `56.81%` branches.
  `api.places.photo.tsx` moved to `76.92%` statements / `73.91%` branches.

### PR 4: Remaining Admin Surfaces

Target files:

- `app/routes/dashboard.admin.email-templates.tsx`
- `app/routes/dashboard.admin.setup.tsx`
- `app/routes/dashboard.admin.analytics.tsx`
- `app/routes/dashboard.admin.content.tsx`
- `app/routes/dashboard.admin.backfill-hours.tsx`
- `app/routes/dashboard.admin._index.tsx`

Focus:

- Admin-only access
- Loader shaping
- Form submissions and mutations
- Empty/error states

Exit criteria:

- No important admin workflow route remains effectively untested
- Admin mutation routes have at least one success-path and one rejection/failure-path test

### PR 5: Workflow Truth Suite

High-value flows:

- Accept invite
- Vote on poll dates and restaurants
- Close poll and create event
- RSVP webhook update reflected in app state
- Comment reply notification

Guidance:

- Prefer a small number of durable workflow tests over broad brittle end-to-end coverage.
- Each workflow should prove something lower-level tests could still miss.

Exit criteria:

- The app’s highest-value cross-layer journeys have dedicated workflow protection

### PR 6: Suite Hygiene and Governance

Work items:

- Rework or rename `test/admin-polls-e2e.test.tsx` so its name matches what it actually proves
- Keep `test/route-health.test.ts` as a smoke suite, but document and treat it as structural-only coverage
- Refresh this file whenever the baseline changes materially
- Add or tighten CI expectations only after the suite reaches stable, trustworthy coverage

Exit criteria:

- Test names and docs accurately describe what the suite proves
- Coverage numbers no longer overstate confidence
- The test suite is maintainable, not just large

## Verification Checklist

Before merging behavior changes:

```bash
npm run test:run
npm run typecheck
```

Run these as well when the change touches multiple routes, shared infrastructure, or coverage-sensitive areas:

```bash
npm run test:coverage
npm run build
```

## Debugging Tips

- Use `npm run test` for watch mode while iterating.
- Use `npm run test:ui` to inspect failing tests interactively.
- Open `/Users/jspahr/repo/meatup-club/app/coverage/index.html` after a coverage run to inspect uncovered branches before adding tests.

## Last Updated

- Date: 2026-03-06
- Baseline suite: `295` tests in `30` files
