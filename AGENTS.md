# Repository Guidelines

## Project Structure & Module Organization

- `app/` contains the React Router 7 application and all runtime code.
- `app/app/` holds routes, components, and server helpers (`lib/`).
- `app/test/` includes global test setup and some test suites.
- `app/public/` stores static assets served by the app.
- `schema.sql` defines the production-aligned D1 baseline schema.
- `app/migrations/` contains only post-baseline forward migrations.
- `terraform/` manages Cloudflare Pages, D1, and DNS infrastructure.

## Build, Test, and Development Commands

Run commands from `app/`:

- `npm run dev` — start the local dev server.
- `npm run build` — build for production.
- `npm run preview` — run a local preview of the production build.
- `npm run typecheck` — generate React Router types and run TypeScript checks.
- `npm run test` / `npm run test:run` — run Vitest in watch or single-run mode.
- `npm run test:coverage` — generate coverage reports.
- `npm run deploy` — run tests, build, and deploy via Wrangler.

## Coding Style & Naming Conventions

- TypeScript-first; prefer explicit types for DB results and route data.
- Use the existing 2-space indentation and match local formatting patterns.
- Routes follow React Router loader/action conventions in `app/app/routes/`.
- Tests are named `*.test.ts` or `*.test.tsx` and typically live alongside the feature (`app/app/**`) or in `app/test/`.
- Use the `~` path alias for imports rooted at `app/app` (configured in tooling).

## Testing Guidelines

- Framework: Vitest with Testing Library and `happy-dom`.
- Coverage uses V8 (`npm run test:coverage`).
- Behavior changes should include automated test coverage unless the change is strictly static copy, styling, or docs.
- Bug fixes should add a regression test that reproduces the failure mode.
- See `app/TESTING.md` for detailed strategy and naming examples.

## Testing Standards

- Choose the smallest test layer that proves the behavior:
  - pure logic in `app/app/lib/**`: unit tests
  - route loaders/actions in `app/app/routes/**`: integration-style tests with a real `Request`, mocked Cloudflare context, and mocked DB/provider boundaries
  - shared UI in `app/app/components/**`: Testing Library tests against the real component
- Do not rely on smoke tests alone for behavior-changing work. Import/export or route-discovery tests are useful guardrails, but they do not replace assertions on real behavior.
- Route changes should cover the primary success path plus the most important failure branch for the touched code. Include auth, validation, or persistence failures when applicable.
- Security-sensitive code should exercise malformed input, unauthorized access, and external service failure paths.
- Prefer mocking external boundaries over mocking the unit under test. Keep parsing, branching, and validation logic real inside the tested module.
- Avoid inline stand-in components when the goal is to validate production behavior. Prefer importing the actual route or component module unless the test is explicitly about a small isolated helper pattern.
- Before merging behavior changes, run `npm run test:run` and `npm run typecheck` from `app/`. Run `npm run test:coverage` as well for risky, cross-cutting, or coverage-improvement work.

## Commit & Pull Request Guidelines

- Commit messages in this repo are short and imperative (e.g., “Fix …”, “Add …”, “Refactor …”).
- PRs should include a brief summary, test results, and screenshots for UI changes.
- Link related issues or notes if applicable.

## Configuration & Security Notes

- Environment variables live in `app/.env`; do not commit secrets.
- Cloudflare bindings are configured in `app/wrangler.toml`.
- Infrastructure changes should be paired with updates in `terraform/`.
