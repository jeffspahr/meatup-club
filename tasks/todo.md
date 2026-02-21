# Critical Review Remediation (2026-02-21)

## Goal
Address all prioritized review findings: auth/session hardening, poll/date data integrity, transactional poll closing, webhook redirect cleanup, places endpoint security controls, and missing regression coverage.

## Acceptance Criteria
- [x] OAuth login no longer auto-activates invited/pending users.
- [x] Session secret has no insecure production fallback.
- [x] Date vote/delete actions reject cross-poll payloads server-side.
- [x] Admin poll close validates winner IDs against the active poll and writes atomically.
- [x] Email RSVP webhook redirect logic is data-driven (no hardcoded event map).
- [x] Places API endpoints require authenticated active users and enforce rate limits/input validation.
- [x] Regression tests cover all above invariants.
- [x] Docs reflect corrected auth/session and setup guidance.

## Checklist
- [x] Review existing auth/session implementation details and patch safely.
- [x] Add/adjust tests for auth flow behavior and secret handling.
- [x] Patch dashboard poll/date actions with strict poll scoping checks.
- [x] Patch admin poll close action with active-poll guard + transaction.
- [x] Add tests for crafted cross-poll payloads and invalid close selections.
- [x] Add event alias table migration and webhook alias lookup.
- [x] Update webhook integration tests for alias-based redirect.
- [x] Add API rate-limit utility + migration; apply to places routes.
- [x] Add places route auth/validation tests.
- [x] Update README and rerun verification (test/typecheck/build).

## Working Notes
- Current branch: `main` tracking `origin/main`.
- Existing untracked file before work: `.claude/settings.local.json` (do not modify).
- Use smallest safe deltas; avoid unrelated refactors.

## Results
- Updated auth/session safety paths, poll/date data-integrity checks, admin close transaction handling, webhook alias resolution, and places API protections.
- Added migrations for `event_aliases` and `api_rate_limits`.
- Added regression tests for DB user sync logic, poll/date cross-poll guards, admin close transaction behavior, and places route security gates.
- Verification: `npm run test:run` (188 passed), `npm run typecheck` (pass), `npm run build` (pass).

# Architecture Improvement Plan: Reusability & Consistency

## Executive Summary

The Meatup Club codebase is a well-structured React Router/Cloudflare app with good server-side patterns (auth, DB access, activity logging). However, the UI layer has significant duplication — nearly every page re-implements the same card layouts, error alerts, form controls, button styles, and voting patterns with raw Tailwind classes. The design system in `app.css` defines a solid foundation (`card-shell`, `btn-primary`, `badge-*`, etc.) that routes often ignore in favor of inline classes, creating drift between the intended system and what's actually rendered.

This plan focuses on extracting reusable patterns, eliminating duplication, and enforcing consistency across both server and client code.

---

## Phase 1: Shared Types & Server Utilities

**Problem:** Types are defined inline per-route (`interface Event`, `interface RSVP`, etc.) and DB queries for the same entities use `as any` casts inconsistently. The RSVP upsert pattern is duplicated across SMS and email webhook handlers.

### 1.1 — Centralize domain types → `lib/types.ts`
- [ ] Extract shared types: `Event`, `RSVP`, `Poll`, `DateSuggestion`, `Restaurant`, `User`, `Comment`
- [ ] Currently `Event` is defined inline in `dashboard.events.tsx`, `RSVP` is defined there too, `Restaurant` is in `restaurants.server.ts` (good), `Comment` is in `comments.server.ts` (good)
- [ ] Add a `lib/types.ts` barrel that re-exports domain types used across routes
- [ ] Replace all `as any` DB result casts with properly typed generics: `db.prepare(...).first<User>()`

### 1.2 — Extract RSVP upsert → `lib/rsvps.server.ts`
- [ ] The identical upsert-or-insert RSVP pattern exists in:
  - `api.webhooks.sms.tsx` (~10 lines)
  - `api.webhooks.email-rsvp.tsx` (~10 lines)
  - `dashboard.events.tsx` action handler
- [ ] Create `upsertRsvp(db, eventId, userId, status, opts?)` that handles both insert and update with optional metadata (`updated_via_calendar`, `admin_override`, etc.)

### 1.3 — Extract cache helper → `lib/cache.server.ts`
- [ ] The Cloudflare Cache API pattern is copy-pasted across all 3 Google Places routes:
  - `api.places.search.tsx`
  - `api.places.details.tsx`
  - `api.places.photo.tsx`
- [ ] Create `withCache(request, context, fetcher, { maxAge })` or similar wrapper
- [ ] Each route becomes ~5 lines instead of ~25

**Acceptance criteria:** No `as any` casts for DB results. RSVP logic lives in one place. Cache boilerplate eliminated.

---

## Phase 2: UI Component Library

**Problem:** The CSS design system (`app.css`) defines `btn-primary`, `btn-secondary`, `btn-ghost`, `card-shell`, `badge-*`, etc. — but most routes don't use them. Instead they inline Tailwind classes like `bg-meat-red text-white rounded-lg px-4 py-2 font-semibold` for buttons and `bg-card border border-border rounded-lg p-6` for cards. This creates visual inconsistency and makes design changes require touching every file.

### 2.1 — `<Button>` component
- [ ] Create `components/ui/Button.tsx`
- [ ] Variants: `primary`, `secondary`, `ghost`, `danger` — mapped to the existing CSS classes (`btn-primary`, etc.)
- [ ] Props: `variant`, `size` (`sm`/`md`/`lg`), `loading`, `disabled`, standard button attrs
- [ ] Replace inline button styling across all routes
- [ ] Routes currently using inline styles: `dashboard.polls.tsx`, `dashboard.events.tsx`, `dashboard.restaurants.tsx`, `dashboard.dates.tsx`, `dashboard.members.tsx`, `dashboard.profile.tsx`, all admin routes

### 2.2 — `<Card>` component
- [ ] Create `components/ui/Card.tsx` using the existing `card-shell` / `card-hover` CSS classes
- [ ] Sub-components: `Card`, `Card.Header`, `Card.Body`, `Card.Footer`
- [ ] Replace the ~6 different card class combinations used across routes
- [ ] Specific patterns to consolidate:
  - `bg-card border border-border rounded-lg p-6` (most common, ~15 instances)
  - `card-shell card-hover` (dashboard index)
  - `bg-card/80 backdrop-blur` (some admin pages)

### 2.3 — `<Alert>` component
- [ ] Create `components/ui/Alert.tsx`
- [ ] Variants: `error`, `success`, `warning`, `info`
- [ ] Currently every route hand-rolls: `<div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">{actionData?.error}</div>`
- [ ] This exact pattern appears in: `dashboard.polls.tsx`, `dashboard.events.tsx`, `dashboard.restaurants.tsx`, `dashboard.dates.tsx`, `dashboard.members.tsx`, `dashboard.profile.tsx`, all admin routes
- [ ] Some use `bg-red-50` (wrong — overridden by CSS base layer), others use `bg-red-500/10` (correct for dark mode)

### 2.4 — `<Badge>` component
- [ ] Create `components/ui/Badge.tsx` wrapping the existing CSS badge classes
- [ ] Variants: `accent`, `muted`, `success`, `warning`, `danger` (all already defined in `app.css`)
- [ ] Currently some routes use the CSS classes, others inline their own badge styles — standardize

### 2.5 — `<EmptyState>` component
- [ ] Create `components/ui/EmptyState.tsx`
- [ ] Props: `icon`, `title`, `description`, `action` (optional CTA button)
- [ ] Pattern appears in: restaurants, dates, polls, events, members pages
- [ ] Currently each hand-rolls a `div` with centered text and sometimes a button

### 2.6 — `<UserAvatar>` component
- [ ] Create `components/ui/UserAvatar.tsx`
- [ ] Props: `src`, `name`, `email`, `size`
- [ ] Handles: image display, fallback to initials, consistent sizing
- [ ] Currently duplicated across: events (RSVP list), members, poll comments, admin analytics

### 2.7 — `<PageHeader>` component
- [ ] Create `components/ui/PageHeader.tsx`
- [ ] Props: `title`, `description`, `badge?`, `actions?`
- [ ] Every dashboard page starts with the same structure: `<h1>` + `<p>` with consistent spacing
- [ ] Some use `text-display-md` (correct), others use `text-2xl font-bold` (inconsistent)

**Acceptance criteria:** Every button, card, alert, badge, empty state, and page header uses the shared component. No inline Tailwind for these primitives in route files.

---

## Phase 3: Composite Components (Domain-Specific)

**Problem:** Several domain-specific UI patterns are duplicated across routes.

### 3.1 — `<VoteableItem>` component
- [ ] Encapsulates: item card + vote count + vote/unvote button + delete button (if owner/admin)
- [ ] Used for both restaurants and dates in the polls page
- [ ] Currently `dashboard.polls.tsx` has separate but structurally identical rendering for restaurant items and date items

### 3.2 — `<CommentThread>` component
- [ ] Extract the comment rendering + reply form from `dashboard.polls.tsx`
- [ ] Currently the comment UI is ~100 lines of JSX embedded in the polls route
- [ ] Make it reusable for any `commentable_type` (polls, events, future entities)
- [ ] Props: `comments`, `currentUser`, `commentableType`, `commentableId`

### 3.3 — `<ConfirmDelete>` pattern
- [ ] The `window.confirm()` → form submit pattern for deleting items is repeated across restaurants, dates, and comments
- [ ] Extract into a shared hook or component: `useConfirmAction(message)` or `<ConfirmDialog>`
- [ ] Centralizes the confirm message and form submission logic

### 3.4 — `<RestaurantCard>` component
- [ ] Restaurant display pattern (photo, name, cuisine, address, rating, vote count) appears in both `dashboard.restaurants.tsx` and `dashboard.polls.tsx`
- [ ] Extract shared rendering; let each context add its own actions

**Acceptance criteria:** No duplicated domain UI across routes. Adding a new "voteable" entity type requires only a new loader, not new UI code.

---

## Phase 4: Form & Action Consistency

**Problem:** Three different form submission patterns are used: auto-submit on change, manual button submit, and `useSubmit()` hook. Error/success feedback is handled differently per route.

### 4.1 — Standardize form submission approach
- [ ] Audit all forms and categorize:
  - **Toggle actions** (vote, RSVP): should use `useSubmit()` for immediate feedback without full page re-render
  - **Data entry forms** (add restaurant, suggest date, post comment): should use `<Form>` with submit button
  - **Settings/profile forms**: should use `<Form>` with explicit save button
- [ ] Document the convention in CLAUDE.md
- [ ] Refactor forms that don't match the convention

### 4.2 — Standardize action response shape
- [ ] Define a consistent return type for all actions:
  ```typescript
  type ActionResult =
    | { ok: true; message?: string }
    | { ok: false; error: string; field?: string }
  ```
- [ ] Currently some actions return `{ error: string }`, others return `{ success: true }`, others redirect
- [ ] Convention: mutations that change page state → return data; mutations that navigate → redirect
- [ ] Create a `useActionFeedback()` hook that reads `actionData` and renders the appropriate `<Alert>`

### 4.3 — Input validation consistency
- [ ] Currently: ad-hoc null checks in each action handler
- [ ] Proposal: lightweight validation helper (no new dependency) for common patterns:
  ```typescript
  function validateForm(formData: FormData, schema: Record<string, 'required' | 'email' | 'date'>):
    { data: Record<string, string> } | { error: string }
  ```
- [ ] Apply to all action handlers that parse `FormData`

**Acceptance criteria:** Consistent UX for all form interactions. Error feedback always appears the same way. No mixing of submission patterns within the same interaction type.

---

## Phase 5: Styling Consistency & Design Token Alignment

**Problem:** The design system defines semantic color tokens (`--foreground`, `--accent`, etc.) and CSS classes (`btn-primary`, `card-shell`), but routes use a mix of:
- Semantic tokens via Tailwind (`text-foreground`, `bg-card`) — correct
- Legacy gray utilities (`text-gray-900`, `bg-gray-50`) — mapped by CSS overrides but fragile
- Hardcoded colors (`bg-blue-600`, `text-white`) — breaks dark mode
- Legacy `meat-red` / `meat-brown` aliases — adds confusion

### 5.1 — Eliminate hardcoded color values
- [ ] Audit all route files for non-semantic Tailwind color classes
- [ ] Replace `bg-blue-600` → `btn-primary` or `bg-accent`
- [ ] Replace `text-white` (on dark backgrounds) → `text-foreground` or inherits from component
- [ ] Replace `bg-red-50 border-red-200 text-red-800` error patterns → `<Alert variant="error">`
- [ ] Replace `bg-green-50 border-green-200 text-green-800` success patterns → `<Alert variant="success">`

### 5.2 — Remove legacy gray overrides
- [ ] The `@layer base` section in `app.css` overrides standard Tailwind grays to map to CSS variables
- [ ] This is a migration bridge that should be eliminated — routes should use semantic classes directly
- [ ] After Phase 2 components are in place, audit remaining gray usage and replace with semantic equivalents:
  - `bg-gray-50` → `bg-background`
  - `bg-gray-100` → `bg-muted`
  - `text-gray-900` → `text-foreground`
  - `text-gray-500` → `text-muted-foreground`
  - `border-gray-200` → `border-border`
- [ ] Remove the `@layer base` overrides from `app.css`

### 5.3 — Deprecate `meat-red` / `meat-brown` aliases
- [ ] These are mapped to `--accent` / `--accent-strong` in tailwind.config
- [ ] Search-and-replace all `meat-red` → `accent` and `meat-brown` → `accent-strong`
- [ ] Remove the aliases from tailwind.config

### 5.4 — Consistent page container pattern
- [ ] Most pages use: `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12`
- [ ] Some vary the max-width or padding
- [ ] If extracted to `<PageHeader>` / `<PageShell>`, enforce via component props rather than per-route inline classes

**Acceptance criteria:** Zero hardcoded Tailwind color classes in route files. Zero `@layer base` gray overrides. All color usage flows through the CSS variable design system.

---

## Phase 6: Error Boundaries & Loading States

**Problem:** No error boundaries exist. No loading skeletons. When loaders fail or are slow, users see nothing.

### 6.1 — Add React Router error boundaries
- [ ] Add `ErrorBoundary` export to `dashboard.tsx` layout route (catches all dashboard errors)
- [ ] Add specific `ErrorBoundary` to high-risk routes (events, polls, admin)
- [ ] Design a consistent error UI using the `<Card>` and `<Alert>` components

### 6.2 — Add loading states via `HydrateFallback`
- [ ] React Router supports `HydrateFallback` for SSR hydration
- [ ] Add skeleton loading states for data-heavy pages: dashboard index, polls, events
- [ ] Use the `card-shell` pattern with pulsing placeholder content

**Acceptance criteria:** No unhandled errors result in a blank page. Slow-loading pages show meaningful skeletons.

---

## Phase 7: Documentation & Conventions

### 7.1 — Update CLAUDE.md
- [ ] The current CLAUDE.md describes a Next.js + NextAuth architecture that no longer matches the codebase (now React Router + cookie sessions + Google OAuth)
- [ ] Update to reflect actual framework, auth pattern, and routing structure
- [ ] Add section on UI component conventions (which components to use, how to add new ones)
- [ ] Add section on action response conventions

### 7.2 — Component documentation
- [ ] Add JSDoc to all shared components with usage examples
- [ ] Consider a simple Storybook or route-based component gallery (low priority)

**Acceptance criteria:** CLAUDE.md accurately describes the codebase. New contributors can find and use shared components without reading every route file.

---

## Prioritization

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| Phase 1: Types & Server Utils | High (safety + DRY) | Low | **P0** |
| Phase 2: UI Component Library | High (consistency + DRY) | Medium | **P0** |
| Phase 3: Composite Components | Medium (DRY) | Medium | **P1** |
| Phase 4: Form Consistency | Medium (UX) | Low-Medium | **P1** |
| Phase 5: Styling Cleanup | Medium (maintainability) | Low | **P1** — best done alongside Phase 2 |
| Phase 6: Error Boundaries | Medium (reliability) | Low | **P2** |
| Phase 7: Documentation | Medium (onboarding) | Low | **P2** |

---

## Implementation Strategy

1. **Phase 1 + 2 together** — Extract types and build UI primitives. This is the foundation.
2. **Phase 5 concurrently with Phase 2** — As each component is created, migrate the styling at the same time.
3. **Phase 3 + 4 together** — Build composite components and standardize forms. Each route gets touched once.
4. **Phase 6 + 7 last** — Polish layer: error boundaries, loading states, documentation.

Each phase should be a separate branch/PR for reviewability. Within each phase, work route-by-route to keep changes verifiable.
