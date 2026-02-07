# Known Issues & Tech Debt Backlog

## Pre-existing Test Failures
- [ ] **2 dark-mode CSS tests always fail** (`test/dark-mode.test.ts`) — "should have dark mode media query" and "should define different colors for dark mode". The CSS uses `@media (prefers-color-scheme: light)` to override defaults (dark-first), but tests expect `prefers-color-scheme: dark`.

## TypeScript Errors (Pre-existing)
- [ ] **~65 `context.cloudflare` is of type 'unknown'** — Cloudflare Worker types not properly configured in tsconfig. Affects nearly every route loader/action.
- [ ] **Missing `+types` modules** — Several routes reference generated type modules that don't exist: `api.admin.setup-resend`, `api.webhooks.email-rsvp`, `dashboard.admin.setup`, `dashboard.dates`.
- [ ] **`RestaurantAutocomplete.tsx` TS2554** — Expected 1 argument but got 0 (line 38).
- [ ] **`dashboard.admin.analytics.tsx` — loader data typed as `{}`** — `stats.total`, `stats.recentLogins` etc. resolve to `{}` which isn't assignable to `ReactNode` inside Card children.
- [ ] **`workers/app.ts`** — Missing Cloudflare type declarations (`D1Database`, `Fetcher`, `ExportedHandler`).
- [ ] **`dashboard.admin.setup2.tsx:198`** — References `formatDateForDisplay` which isn't imported.

## CLAUDE.md Accuracy
- [ ] **CLAUDE.md describes Next.js + NextAuth** — The actual stack is React Router 7.13 + cookie sessions + Google OAuth. Needs full rewrite (Task 8).

## Deferred Extractions
- [ ] **RestaurantCard** — Polls page (compact vote card) and Restaurants page (full detail card with links/hours/rating) render restaurants too differently for a single shared component. Consider extracting a `RestaurantInfo` sub-component for shared fields (name, address, cuisine, photo, rating) if a third usage appears.

## Code Quality
- [ ] **`as any` casts in DB queries** — Several routes still use `(user as any).id` or `event as any` for D1 query results. Should type with generics: `db.prepare(...).first<User>()`.
- [ ] **Hardcoded event redirect** in `api.webhooks.email-rsvp.tsx` — `EVENT_REDIRECTS: Record<number, number> = { 2: 3 }`. Should be DB config or env var.
- [ ] **`RestaurantDisplay` interface** in `dashboard.restaurants.tsx` — Still inline, extends `Restaurant` with user fields. Could be moved to types.ts.
