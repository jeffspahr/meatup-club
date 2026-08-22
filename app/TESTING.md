# Testing Guide — Meatup.Club

## Purpose

The suite should make regressions in authentication, invitations, voting, event management, RSVP persistence, notifications, and webhook handling difficult to merge. Prefer the smallest test layer that proves production behavior.

## Current Stack

- Unit/integration runner: Vitest with V8 coverage
- UI assertions: Testing Library with `happy-dom`
- Browser tests: Playwright with Chromium
- Database verification: Wrangler local D1 plus a production-shaped SQLite workflow harness
- Required GitHub check: `Verify application`

Run commands from `app/`:

```bash
npm run test                 # Vitest watch mode
npm run test:run            # Vitest once
npm run test:coverage       # Full-source coverage
npm run test:e2e            # Playwright browser tests
npm run test:stability      # Randomized Vitest order, twice
npm run test:d1             # Fresh schema + forward-migration checks
npm run lint                # ESLint static analysis
npm run typecheck
npm run build
npm run verify              # Local equivalent of the required CI gate
```

## Current Honest Baseline

Baseline captured on 2026-08-22 after the CI-roadmap tests were added, with all production TypeScript and TSX files included, including modules that no test imports:

- 73 Vitest files
- 570 Vitest tests
- 78.60% statements
- 69.97% branches
- 69.36% functions
- 79.11% lines

Area-level statement coverage:

- `app/app/components`: 83.63%
- `app/app/lib`: 74.71%
- `app/app/routes`: 81.00%

Older 90%+ figures used imported-files-only instrumentation and are not comparable to this full-source baseline.

## Coverage Governance

The global floor intentionally leaves a small buffer below the current baseline:

- 75% statements
- 65% branches
- 60% functions
- 75% lines

`vitest.config.ts` also sets higher expectations for security and persistence boundaries such as authentication, RSVP persistence, webhook handlers, and mutation-heavy admin routes. Do not lower a threshold to merge a change. Add behavior coverage or document an intentional exclusion.

Coverage is a regression guard, not the definition of quality. Structural imports and rendered lines are weaker evidence than assertions on authorization, validation, persistence, redirects, external failures, and user-visible behavior.

## Test Layout

```text
app/
├── app/
│   ├── components/**/*.test.tsx
│   ├── lib/**/*.test.ts
│   └── routes/**/*.test.{ts,tsx}
├── e2e/**/*.spec.ts
├── test/
│   ├── fixtures/
│   ├── setup.ts
│   └── cross-cutting suites
├── playwright.config.ts
└── vitest.config.ts
```

Use colocated tests for feature behavior. Reserve `test/` for cross-cutting policies, workflow harnesses, structural route checks, and shared fixtures.

## Choosing the Test Layer

- Pure helpers and business rules: direct unit tests.
- Route loaders/actions: real `Request` objects, mocked Cloudflare context, and mocked external boundaries.
- Shared components: render the production component and assert accessible, user-visible behavior.
- D1 schema changes: test both a fresh canonical schema and the historical forward-migration starting state.
- External signing formats: retain one contract test against the installed library; use mocks for the broader branch matrix.
- Browser tests: reserve for routing, browser/session boundaries, and a few critical user journeys that lower layers cannot prove.

## Required Behavior

- Behavior changes include automated coverage unless they are strictly static copy, styling, or documentation.
- Bug fixes include a regression test that fails before the fix.
- Mutation-heavy routes cover success plus the most important auth, validation, persistence, and provider-failure branches.
- Security-sensitive routes cover malformed input, unauthorized access, replay/idempotency, and signature failure.
- Tests mock providers and storage boundaries, not the parsing or branching logic under test.
- Synthetic credentials are assembled at runtime from non-secret fragments so secret scanners do not mistake fixtures for live keys.
- Do not use `.only`, unexplained hook-rule suppressions, real production credentials, or checked-in Playwright storage state.

## CI Behavior

Pull requests and `main` run the required application workflow. It installs dependencies and the Chromium browser, then executes the shared verification command. Coverage reports are retained for 30 days.

Production deployment is triggered only after the `Application CI` workflow succeeds for `main`; it checks out the exact verified SHA and deploys that commit. It never checks out or executes an untrusted pull-request head with deployment secrets.

Terraform pull requests run formatting and validation without Cloudflare credentials. A manual environment-gated plan is available only to trusted maintainers; without a configured remote backend, treat that plan as advisory rather than authoritative state drift detection.

A weekly stability workflow runs the Vitest suite twice with randomized file and test order. The emitted seed can reproduce order-dependent failures.

## Browser-Test Boundaries

Playwright starts the local development server and uses only local/synthetic state. It must not introduce a production authentication bypass or commit reusable authenticated browser state. OAuth handoff is intercepted at the browser boundary so tests never contact or authenticate with Google.

Current browser coverage protects public routing/compliance surfaces, the unauthenticated OAuth boundary, and an authenticated restaurant vote cast/reload/remove journey. Authenticated tests use ephemeral local D1 seed data and the existing localhost-only development authentication mechanism.

## Next Targets

Prioritize meaningful branch coverage over aggregate percentages:

1. Event admin editor failure/recovery behavior.
2. Email-template and content-admin mutations.
3. Dashboard navigation and accessibility states.
4. RSVP browser journeys using isolated local D1 state.
5. A real preview-environment smoke test if a safe ephemeral deployment environment is introduced.
