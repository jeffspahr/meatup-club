# Testing Guide - Meatup.Club

## Purpose

This document describes the current test setup, the live coverage baseline, and the plan for improving confidence in the highest-risk parts of the app.

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

## Current Baseline (2026-03-06)

Live numbers from `npm run test:coverage`:

- `17` passing test files
- `196` passing tests
- `15.09%` statements
- `10.38%` branches
- `6.64%` functions
- `15.24%` lines

Coverage by area:

- `app/app/lib`: `24.95%` statements
- `app/app/routes`: `13.82%` statements
- `app/app/components`: `2.66%` statements

Best-covered production files:

- `app/routes/api.webhooks.email-rsvp.tsx`: `92.68%` statements
- `app/lib/rsvps.server.ts`: `100%` statements
- `app/lib/session.server.ts`: `83.33%` statements
- `app/lib/db.server.ts`: `60%` statements
- `app/routes/dashboard.admin.polls.tsx`: `46.55%` statements

Largest uncovered files by statement count:

- `app/routes/dashboard.admin.events.tsx`: `0%`
- `app/routes/dashboard.polls.tsx`: `10.81%`
- `app/lib/sms.server.ts`: `20.69%`
- `app/lib/email.server.ts`: `29.38%`
- `app/routes/dashboard.admin.members.tsx`: `0%`
- `app/routes/dashboard.restaurants.tsx`: `0%`
- `app/components/DateCalendar.tsx`: `0%`

Important interpretation notes:

- `test/route-health.test.ts` is mostly a route import/export smoke suite. It protects route registration and basic module shape, but it is not deep behavioral coverage.
- `test/admin-polls-e2e.test.tsx` exercises test-only inline components and form data construction. It is useful as a guardrail, but it does not provide true route-level end-to-end coverage.
- The current suite is strongest around webhook security, RSVP parsing, email sending, and a few admin poll flows. It is weakest in dashboard UI behavior and mutation-heavy route modules.

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

## Coverage Improvement Plan

### Priority 0: Close the highest-risk server and mutation gaps

Target files:

- `app/routes/dashboard.polls.tsx`
- `app/routes/dashboard.admin.events.tsx`
- `app/lib/email.server.ts`
- `app/lib/sms.server.ts`

Add tests for:

- Loader and action success paths
- Invalid form payloads and input validation
- Auth and permission rejection paths
- Provider or DB failures
- Side effects such as event creation, invite generation, or outbound message dispatch

Suggested exit criteria:

- No mutation-heavy server module above remains effectively untested
- Overall statement coverage reaches roughly `25%`
- Branch coverage improves materially in route actions and provider adapters

### Priority 1: Cover the main dashboard and admin workflows

Target files:

- `app/routes/dashboard.admin.members.tsx`
- `app/routes/dashboard.restaurants.tsx`
- `app/routes/dashboard.dates.tsx`
- `app/routes/api.polls.tsx`
- `app/routes/api.places.search.tsx`
- `app/routes/api.places.details.tsx`
- `app/routes/api.places.photo.tsx`

Add tests for:

- Loader data shaping
- Form submissions and mutations
- Empty states
- Invalid query parameters
- Permission and rate-limit behavior where applicable

Suggested exit criteria:

- Core admin and dashboard mutations have route-level tests
- Zero-coverage route files are no longer concentrated in active product areas
- Overall statement coverage reaches roughly `35%`

### Priority 2: Replace misleading coverage with real behavior coverage

Work items:

- Keep `test/route-health.test.ts` as a smoke suite, but treat it as structural validation only.
- Replace or rename `test/admin-polls-e2e.test.tsx` so it either tests the real route module or no longer implies full E2E coverage.
- For any route that currently has only export/import checks, add at least one behavior test before counting it as covered.

Suggested exit criteria:

- High test counts no longer mask low behavior coverage
- Route-level coverage better reflects real user-visible or server-visible behavior

### Priority 3: Add shared component behavior coverage

Target files:

- `app/components/DateCalendar.tsx`
- `app/components/RestaurantAutocomplete.tsx`
- `app/components/AddRestaurantModal.tsx`
- `app/components/DashboardNav.tsx`
- `app/components/CommentThread.tsx`
- `app/components/CommentSection.tsx`

Focus on:

- Keyboard and mouse interactions
- Disabled and loading states
- Error and empty states
- Callback payloads and form semantics
- Rendering of key content for authenticated workflows

Suggested exit criteria:

- Shared dashboard components have direct behavior tests
- Component statement coverage is no longer near zero

### Priority 4: Add a small number of true workflow tests

High-value candidate flows:

- Accept invite
- Vote in poll
- Close poll and create event
- RSVP webhook update reflected in application state

Guidance:

- Add a workflow test only when the behavior spans multiple layers and lower-level tests would miss the regression.
- Prefer a few reliable workflow tests over a large brittle suite.

## Test Standards for This Repo

Use these standards for new work:

- Any behavior change should include a new test or an update to an existing test, unless the change is strictly static copy, styling, or docs.
- Bug fixes should add a regression test that fails on the pre-fix behavior.
- Smoke tests are allowed, but they do not replace behavioral tests for route or business logic changes.
- Tests should cover both the happy path and the most important failure branch for the touched code.
- Security-sensitive code must exercise malformed input, unauthorized access, and external failure cases.
- Route tests should assert on returned data, redirects, status codes, and side effects, not only the presence of exported functions.
- Component tests should render the real component under test rather than a simplified inline stand-in when the goal is to validate app behavior.

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
- Baseline suite: `196` tests in `17` files
