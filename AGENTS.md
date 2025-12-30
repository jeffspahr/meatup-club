# Repository Guidelines

## Project Structure & Module Organization

- `app/` contains the React Router 7 application and all runtime code.
- `app/app/` holds routes, components, and server helpers (`lib/`).
- `app/test/` includes global test setup and some test suites.
- `app/public/` stores static assets served by the app.
- `app/migrations/` and `schema.sql` define the D1 schema and migrations.
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
- New features should include unit or integration tests when behavior changes.
- See `app/TESTING.md` for detailed strategy and naming examples.

## Commit & Pull Request Guidelines

- Commit messages in this repo are short and imperative (e.g., “Fix …”, “Add …”, “Refactor …”).
- PRs should include a brief summary, test results, and screenshots for UI changes.
- Link related issues or notes if applicable.

## Configuration & Security Notes

- Environment variables live in `app/.env`; do not commit secrets.
- Cloudflare bindings are configured in `app/wrangler.toml`.
- Infrastructure changes should be paired with updates in `terraform/`.
