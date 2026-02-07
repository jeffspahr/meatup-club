# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meatup.Club is a quarterly steakhouse meetup coordination platform for a private group. It's built with React Router 7 (Remix-style SSR) and deployed on Cloudflare Workers with a Cloudflare D1 (SQLite) database.

**Key Technologies:**
- React Router 7.13 (SSR with loaders/actions)
- Google OAuth 2.0 + cookie sessions (NOT NextAuth)
- Cloudflare Workers + D1 Database
- Vite 7 + @cloudflare/vite-plugin
- Tailwind CSS 3.4
- Terraform for infrastructure

## Build & Development Commands

All commands are run from the `/app` directory:

```bash
# Development
npm run dev              # Local dev server (Vite + Cloudflare)

# Building
npm run build            # Build for Cloudflare Workers

# Type checking
npm run typecheck        # react-router typegen + tsc

# Testing
npm run test:run         # Run vitest tests

# Deployment
npm run deploy           # test + build + wrangler deploy
```

## Cloudflare D1 Database Commands

```bash
# Execute SQL on remote database
wrangler d1 execute meatup-club-db --remote --command "SELECT * FROM users"

# List all D1 databases
wrangler d1 list

# View schema
wrangler d1 execute meatup-club-db --remote --command ".schema"
```

## Deployment & Cache Management

Deployment happens automatically via GitHub push to main branch. After deployment:

```bash
# Purge Cloudflare cache (requires zone ID, not account ID)
# Get zone ID first:
curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=meatup.club" \
  -H "Authorization: Bearer TOKEN" | jq -r '.result[0].id'

# Then purge:
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/purge_cache" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

## Architecture

### Authentication

Google OAuth 2.0 flow with cookie-based sessions:

```typescript
// lib/auth.server.ts — key functions
getUser(request, context)         // Get current user from session cookie
requireAuth(request, context)     // Redirect to /login if not authenticated
requireActiveUser(request, context) // Redirect if user status !== 'active'
requireAdmin(request, context)    // Redirect if not admin
```

Sessions are stored in an HTTP-only cookie (`__session`) via React Router's `createCookieSessionStorage`. No server-side session store needed.

### Route Pattern (Loaders & Actions)

All routes use React Router's loader/action convention:

```typescript
// Loader — fetches data for the page
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const result = await db.prepare('SELECT * FROM events').all();
  return { events: result.results || [] };
}

// Action — handles form submissions
export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const action = formData.get('_action');
  // ... dispatch on _action value
}
```

### Database Access

D1 database is accessed via Cloudflare context binding:

```typescript
const db = context.cloudflare.env.DB;

// Parameterized queries (always use .bind() — no string interpolation)
const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
const rows = await db.prepare('SELECT * FROM events').all();
await db.prepare('INSERT INTO rsvps (event_id, user_id, status) VALUES (?, ?, ?)').bind(eventId, userId, status).run();
```

### Database Schema

Core tables:
- **users** — email, name, picture, is_admin, status (active/invited/pending), phone_number, sms_opt_in, notification prefs
- **events** — restaurant_name, restaurant_address, event_date, event_time, status (upcoming/completed/cancelled)
- **rsvps** — event_id, user_id, status (yes/no/maybe), admin_override, updated_via_calendar. UNIQUE(event_id, user_id)
- **polls** — title, status (active/closed), winning_restaurant_id, winning_date_id, created_event_id
- **restaurants** — name, address, google_place_id, google_rating, cuisine, photo_url. Global across all polls
- **restaurant_votes** — poll_id, restaurant_id, user_id. UNIQUE(poll_id, restaurant_id, user_id)
- **date_suggestions** — user_id, poll_id, suggested_date
- **date_votes** — date_suggestion_id, user_id. UNIQUE(date_suggestion_id, user_id)
- **comments** — user_id, commentable_type (poll/event), commentable_id, content, parent_id (threaded)
- **activity_log** — user_id, action_type, action_details (JSON), route

### Admin System

Role-based via `users.is_admin` column:
- `requireAdmin()` guard on all `/dashboard/admin/*` routes
- Admin pages: events, polls, members, analytics, email-templates, content, backfill-hours

### Shared Libraries

```
lib/
  types.ts              # Centralized domain types (Event, Rsvp, Poll, Member, etc.)
  auth.server.ts        # Authentication (Google OAuth, session management)
  db.server.ts          # DB helpers (ensureUser, getUserByEmail)
  session.server.ts     # Cookie session storage
  rsvps.server.ts       # upsertRsvp() — shared across 3 routes
  restaurants.server.ts # Restaurant CRUD + voting
  polls.server.ts       # Vote leader queries
  comments.server.ts    # Threaded comments CRUD
  cache.server.ts       # withCache() — Cloudflare Cache API wrapper
  activity.server.ts    # Activity logging (non-throwing)
  email.server.ts       # Resend email service
  sms.server.ts         # Twilio SMS service
  dateUtils.ts          # Timezone-aware date helpers
  email-templates.ts    # Email template generation
```

### UI Components

Shared primitives in `components/ui/` (barrel export from `components/ui/index.ts`):
- **Alert** — variant: success/warning/error/info
- **Badge** — variant: accent/success/danger/warning/muted (wraps CSS badge classes)
- **Button** — variant: primary/secondary/ghost/danger, size: sm/md/lg
- **Card** — hover prop, wraps `card-shell`/`card-hover` CSS classes
- **EmptyState** — icon, title, description, action
- **PageHeader** — title, description, actions
- **UserAvatar** — src, name, email, size: sm/lg, fallback to initials

Domain components in `components/`:
- **CommentSection** — Full comment thread with form, reply, delete (uses CommentThread internally)
- **DashboardNav** — Sticky nav with mobile menu, admin-conditional links
- **AddRestaurantModal** — Google Places search + restaurant creation
- **RestaurantAutocomplete** — Debounced Places autocomplete with keyboard nav
- **DateCalendar** — Interactive calendar with vote indicators
- **DoodleView** — Doodle-style availability grid
- **VoteLeadersCard** — Top voted restaurant/date display

### Design System ("Ember & Smoke")

CSS variables in `app.css` define a dark-first warm palette:
- Colors: `--background`, `--foreground`, `--card`, `--muted`, `--border`, `--accent`, `--accent-strong`
- Button classes: `btn-primary`, `btn-secondary`, `btn-ghost`
- Card classes: `card-shell`, `card-hover`
- Badge classes: `badge`, `badge-accent`, `badge-success`, `badge-danger`, etc.
- Typography: `text-display-xl/lg/md` (Cormorant Garamond display font)
- Tailwind aliases: `meat-red` → accent, `meat-brown` → accent-strong (legacy, being removed)

### Voting System

Restaurants are global entities. In each poll, users can vote on any restaurant (unless excluded):
- One vote per user per poll (UNIQUE constraint)
- Vote/unvote via form actions with `_action` dispatcher
- Vote counts via subqueries in SQL

### Route Map

**Public:** `/` (landing), `/login`, `/pending`, `/accept-invite`
**Dashboard:** `/dashboard` (layout) → `_index`, `about`, `polls`, `events`, `restaurants`, `dates`, `members`, `profile`
**Admin:** `/dashboard/admin` → `_index`, `events`, `polls`, `members`, `analytics`, `email-templates`, `content`, `backfill-hours`
**API:** `api.polls`, `api.places.{search,details,photo}`, `api.webhooks.{sms,email-rsvp}`, `api.admin.setup-resend`
**Auth:** `login`, `logout`, `auth.google.callback`

## Terraform Infrastructure

Infrastructure is managed in `terraform/main.tf`:
- Cloudflare D1 database (`meatup-club-db`)
- Cloudflare Workers route configuration
- DNS records (AAAA records for root + www)

## Important Notes

1. **Database Name**: `meatup-club-db` (NOT `meatup-db`)
2. **Zone ID vs Account ID**: Cache purging requires zone ID, not account ID
3. **Pre-existing TS issues**: ~65 `context.cloudflare` type errors (Cloudflare types not configured), 2 dark-mode test failures
4. **Cron**: `wrangler.toml` configures a 15-minute cron trigger for scheduled tasks
5. **Timezone**: `APP_TIMEZONE=America/New_York` set in wrangler.toml vars
