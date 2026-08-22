# AGENTS.md

This is the authoritative instruction file for AI coding agents working in this repository. `CLAUDE.md` should be a symlink to this file so Codex, Claude Code, and other tools read the same guidance and do not drift.

## Project Overview

Meatup.Club is a quarterly steakhouse meetup coordination platform for a private group. The app uses React Router 7 SSR loaders/actions and runs on Cloudflare Workers with a Cloudflare D1 SQLite database.

Key technologies:
- React Router 7.15 SSR with loaders/actions.
- React 19.
- Google OAuth 2.0 plus cookie sessions; this project does not use NextAuth.
- Cloudflare Workers, Cloudflare D1, Cloudflare Queues, and Wrangler.
- Vite 7 with `@cloudflare/vite-plugin`.
- Tailwind CSS 3.4.
- Terraform for Cloudflare infrastructure.
- Vitest, Testing Library, `happy-dom`, and V8 coverage.

## Project Structure

- `app/` contains the React Router application and all runtime code.
- `app/app/routes/` contains route modules, loaders, actions, and route-level tests.
- `app/app/components/` contains shared and domain React components.
- `app/app/components/ui/` contains shared UI primitives exported from `components/ui/index.ts`.
- `app/app/lib/` contains server helpers, shared domain logic, provider integrations, and pure utilities.
- `app/test/` contains global setup and cross-route test suites.
- `app/public/` contains static assets served by the app.
- `schema.sql` defines the production-aligned D1 baseline schema.
- `app/migrations/` contains only post-baseline forward migrations.
- `terraform/` manages Cloudflare Pages/Workers, D1, queues, DNS, and related infrastructure.

## Commands

Run application commands from `app/`:

```bash
npm run dev            # Start the local React Router dev server.
npm run build          # Build for production.
npm run preview        # Build, then run a local production preview.
npm run typecheck      # Generate React Router types, then run TypeScript.
npm run test           # Run Vitest in watch mode.
npm run test:run       # Run Vitest once.
npm run test:coverage  # Run Vitest with V8 coverage.
npm run deploy         # Run tests, build, and deploy with Wrangler.
```

Cloudflare D1 examples:

```bash
wrangler d1 execute meatup-club-db --remote --command "SELECT * FROM users"
wrangler d1 list
wrangler d1 execute meatup-club-db --remote --command ".schema"
```

Cache purge requires the Cloudflare zone ID, not the account ID. Never commit or print real tokens.

```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=meatup.club" \
  -H "Authorization: Bearer TOKEN" | jq -r '.result[0].id'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/purge_cache" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

## Architecture

### Authentication

Authentication uses Google OAuth 2.0 and HTTP-only cookie sessions via React Router cookie session storage. Sessions are not stored server-side.

Key functions in `app/app/lib/auth.server.ts`:
- `getUser(request, context)` returns the current user from the session cookie.
- `requireAuth(request, context)` redirects to `/login` when unauthenticated.
- `requireActiveUser(request, context)` redirects when the user is not active.
- `requireAdmin(request, context)` redirects when the user is not an admin.

### Routes, Loaders, and Actions

Routes follow React Router loader/action conventions. Loaders fetch data. Actions handle form submissions and usually dispatch on a `_action` form value.

```ts
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const result = await db.prepare("SELECT * FROM events").all();
  return { user, events: result.results || [] };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const action = formData.get("_action");
  // Dispatch on action and return data or redirects consistently.
}
```

The route map is declared in `app/app/routes.ts`. Current top-level routes include public pages (`/`, `/verification`, `/privacy`, `/terms`, `/sms-consent`, `/login`, `/logout`, `/pending`, `/accept-invite`), OAuth callback routes, Places/Polls/Webhook API routes, and `/dashboard`.

Under `/dashboard`, current member routes are the dashboard index, `about`, `members`, and `profile`. The old `dates`, `events`, `restaurants`, and `polls` member URLs route through `dashboard.legacy-redirect.tsx`. Admin routes include setup, announcements, events, members, polls, content, email templates, analytics, and restaurant refresh.

### Database Access

Access D1 through the Cloudflare context binding:

```ts
const db = context.cloudflare.env.DB;

const user = await db
  .prepare("SELECT * FROM users WHERE email = ?")
  .bind(email)
  .first();

const rows = await db.prepare("SELECT * FROM events").all();

await db
  .prepare("INSERT INTO rsvps (event_id, user_id, status) VALUES (?, ?, ?)")
  .bind(eventId, userId, status)
  .run();
```

Always use parameterized queries with `.bind()`. Do not build SQL by interpolating user-controlled values.

Core tables include:
- `users`: email, name, picture, admin flag, status, phone/SMS and notification preferences.
- `events`: restaurant details, event date/time, and status.
- `rsvps`: event/user RSVP state, admin overrides, and calendar update metadata.
- `polls`: poll status and selected winning restaurant/date/event links.
- `restaurants`: global restaurant records and Google Places metadata.
- `restaurant_votes`: per-poll restaurant votes.
- `date_suggestions` and `date_votes`: poll date suggestions and votes.
- `comments`: threaded comments on polls/events.
- `activity_log`: user actions and route-level audit details.

### Admin System

Admin access is role-based through `users.is_admin`.
- Use `requireAdmin()` on every `/dashboard/admin/*` loader/action.
- Do not rely on UI visibility alone for authorization.
- Security-sensitive admin routes need tests for malformed input, unauthorized access, and persistence/provider failures.

### Shared Libraries

Common modules in `app/app/lib/`:
- `types.ts`: central domain types.
- `auth.server.ts`, `session.server.ts`, `db.server.ts`: auth/session/user primitives.
- `rsvps.server.ts`, `polls.server.ts`, `restaurants.server.ts`, `events.server.ts`, `event-actions.server.ts`: domain data and mutation helpers.
- `comments.server.ts`, `activity.server.ts`, `cache.server.ts`: shared app infrastructure.
- `email.server.ts`, `event-email-delivery.server.ts`, `event-notifications.server.ts`, `email-templates.ts`: email and notification flows.
- `sms.server.ts`: Twilio SMS helpers.
- `places.server.ts`, `restaurant-photo-url.ts`: Google Places and photo URL handling.
- `dateUtils.ts`: timezone-aware date helpers.
- `d1-transactions.server.ts`, `rate-limit.server.ts`, `webhook-idempotency.server.ts`: defensive server utilities.

### UI and Design System

Shared primitives in `app/app/components/ui/`:
- `Alert`: variants `success`, `warning`, `error`, `info`.
- `Badge`: variants `accent`, `success`, `danger`, `warning`, `muted`.
- `Button`: variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `lg`.
- `Card`: wraps `card-shell` and optional hover styles.
- `EmptyState`: icon, title, description, and optional action.
- `PageHeader`: title, description, and actions.
- `UserAvatar`: image or initials fallback.

Domain components include `DashboardNav`, `AdminLayout`, `AddRestaurantModal`, `RestaurantAutocomplete`, `RestaurantDetailModal`, `DateCalendar`, `DoodleView`, `VoteLeadersCard`, event forms, restaurant voting controls, and upcoming event cards.

The visual system is the dark-first "Ember & Smoke" palette in `app/app/app.css`. Prefer existing CSS variables and utility classes:
- Color variables such as `--background`, `--foreground`, `--card`, `--muted`, `--border`, `--accent`, and `--accent-strong`.
- Button classes `btn-primary`, `btn-secondary`, and `btn-ghost`.
- Card classes `card-shell` and `card-hover`.
- Badge classes `badge`, `badge-accent`, `badge-success`, `badge-danger`, and related variants.
- Typography helpers `text-display-xl`, `text-display-lg`, and `text-display-md`.

Page-level layout decisions are centralized in `app/app/app.css`. Do not reintroduce inline width, spacing, or padding overrides for shared defaults; update `.page-main` or `.card-shell` if a project-wide value needs to change.

- `.page-main`: every `<main>` uses this class. It provides the standard centered `max-w-6xl` width and responsive page padding. Modifier classes, such as `dashboard-preview`, compose alongside it.
- `.page-heading`: page-level `h1`. `PageHeader` applies this internally; use it directly only when a route needs a custom header layout.
- `.section-heading`: page-level `h2` for major content sections. Compose margin utilities like `mb-3` or `mb-4` alongside it.
- `.page-section`: standard `mb-8` spacing between major page sections. Compose it with `dashboard-section` on the same element for fade-in. Do not reintroduce inline `mb-12` for major-section breaks.
- `.card-shell`: default card padding is `1.5rem` (`p-6`) through `@layer components`, so Tailwind utilities can override it when needed. Use `p-0` for tables or edge-to-edge lists, `p-4`/`p-5` for tight tiles, and `p-8` or `sm:p-8` for hero/login cards. Do not pass `p-6` explicitly because it is the default.
- `.icon-container` family: `.icon-container` is the standard `2.75rem` soft-fill rounded-square treatment, `.icon-container-lg` is the `3.5rem` variant, and `.icon-container-link` is the `4rem` solid-fill circle for clickable nav-card icons. Pick by visual treatment, not by use site.
- Grid gaps: use `gap-6` for top-level grids, `gap-4` for inner card content, and reserve `gap-3` for compact inline button rows.
- Plain content sections put the section `h2` above the card. Sections with a coherent icon, title, description, and action toolbar can keep that header strip inside the card.
- For page-load fade-in, wrap major sections with `className="dashboard-section"` and set `style={{ "--section-delay": "Xms" } as CSSProperties}`. The current cadence is header `20ms`, first section `40ms`, then follow-on sections at `150ms`, `250ms`, and `350ms`.

## Coding Style

- TypeScript-first; prefer explicit types for DB rows, route data, and external provider responses.
- Match the existing 2-space indentation and local formatting patterns.
- Use the `~` path alias for imports rooted at `app/app`.
- Prefer existing helpers and patterns before introducing new abstractions or dependencies.
- Keep changes narrow and behavior-focused. Avoid unrelated refactors and formatting churn.
- Use standard library or existing utilities unless a new dependency has a clear payoff.
- Treat user input and webhook/provider payloads as untrusted: validate, sanitize, constrain, and test failure paths.
- Do not commit secrets. Environment variables live in `app/.env`, and Cloudflare bindings live in `app/wrangler.toml`.

## Testing Standards

- Tests are named `*.test.ts` or `*.test.tsx` and usually live beside the feature under `app/app/**` or in `app/test/`.
- Behavior changes need automated coverage unless the change is strictly static copy, styling, or docs.
- Bug fixes need a regression test that reproduces the failure mode.
- Choose the smallest layer that proves the behavior:
  - Pure logic in `app/app/lib/**`: unit tests.
  - Route loaders/actions in `app/app/routes/**`: integration-style tests with a real `Request`, mocked Cloudflare context, and mocked DB/provider boundaries.
  - Shared UI in `app/app/components/**`: Testing Library tests against the real component.
- Do not rely on smoke tests alone for behavior changes. Import/export and route-discovery tests are useful guardrails, but they do not replace assertions on real behavior.
- Route changes should cover the primary success path plus the most important failure branch. Include auth, validation, or persistence failures when applicable.
- Security-sensitive code should exercise malformed input, unauthorized access, and external service failure paths.
- Prefer mocking external boundaries over mocking the unit under test. Keep parsing, branching, and validation logic real inside the tested module.
- Avoid inline stand-in components when the goal is to validate production behavior. Import the actual route or component unless the test is explicitly for an isolated helper.
- Before merging behavior changes, run `npm run test:run` and `npm run typecheck` from `app/`. Run `npm run test:coverage` for risky, cross-cutting, or coverage-improvement work.
- See `app/TESTING.md` for detailed strategy, current coverage notes, and naming examples.

## Infrastructure and Deployment

- Infrastructure is managed in `terraform/main.tf`.
- The D1 database name is `meatup-club-db`.
- `app/wrangler.toml` configures `APP_TIMEZONE=America/New_York`, `NODE_VERSION=20`, Cloudflare D1, email delivery queues, assets, and a 15-minute cron trigger.
- `npm run deploy` runs tests, builds, then deploys with Wrangler.
- Production deployment may also happen through GitHub/main-branch automation; confirm the current workflow before changing release assumptions.
- Pair infrastructure changes with corresponding updates in `terraform/` and runtime configuration.

## Commit and Pull Request Guidelines

- Use short, imperative commit messages. Conventional commit style is preferred when it fits the change.
- Use DCO sign-offs when committing. Read the name and email from `git config`; do not guess.
- Keep commits atomic and describable. Do not mix unrelated formatting-only churn with behavior changes.
- PRs should include a brief summary, verification results, and screenshots for UI changes.
- Link related issues, notes, or follow-up tasks when applicable.

## Important Notes

- This repo has historically accumulated stale agent notes. Verify claims against the live code before preserving them.
- Do not chase TS or test errors unrelated to your change. If the root cause is in scope for what you are doing, fix it; otherwise leave it as-is and call it out in the PR description so reviewers can decide.
- Cloudflare cache purging requires a zone ID, not an account ID.
- Restaurants are global records; poll-specific voting is represented by join/vote tables and uniqueness constraints.
- Voting and admin mutation flows commonly dispatch through `_action`; keep action names and response shapes consistent with nearby routes.
