# Meatup.Club Database Guide

## Source of Truth

- Canonical schema file: `/Users/jspahr/repo/meatup-club/schema.sql`
- Canonical schema policy: repo-managed fresh-install snapshot aligned to the current production schema shape (last synced: 2026-03-14)
- Internal D1 tables (`_cf_KV`, `d1_migrations`) are runtime internals and are not part of `schema.sql`

## Database Platform

- Engine: Cloudflare D1 (SQLite)
- Runtime access: Worker binding `DB`
- Migrations: Wrangler D1 migrations table (`d1_migrations`) on each environment

## Current Table Inventory

### Core domain
- `users`
- `events`
- `polls`
- `restaurants`
- `restaurant_votes`
- `poll_excluded_restaurants`
- `date_suggestions`
- `date_votes`
- `rsvps`
- `sms_reminders`

### Content and activity
- `comments`
- `activity_log`
- `site_content`
- `email_templates`

### Integrations and controls
- `event_aliases`
- `api_rate_limits`
- `webhook_deliveries`
- `event_email_deliveries`
- `provider_webhooks`

## Views

- `current_poll_restaurant_votes`
- `current_poll_date_votes`

## Recent Cleanup Applied

- 2026-02-23: `polls.winning_restaurant_id` foreign key was normalized to reference `restaurants(id)`.
- 2026-02-23: `restaurant_votes` now enforces one vote per user per poll with `UNIQUE(poll_id, user_id)`.
- 2026-02-23: `users.phone_number` index was hardened to unique.

## Migration Strategy

### Fresh environments

From `/Users/jspahr/repo/meatup-club/app`:

```bash
wrangler d1 execute meatup-club-db --file=../schema.sql
```

### Existing environments

- Apply only post-baseline migration files from `/Users/jspahr/repo/meatup-club/app/migrations`.
- Use `wrangler d1 migrations apply` for forward changes after this baseline snapshot.

## Flattening Policy

- Keep `d1_migrations` history in deployed DBs (do not rewrite/delete applied records).
- Legacy pre-baseline migration SQL files have been removed from the active repo tree.
- Continue forward with new, additive migrations from the current baseline.
