# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meatup.Club is a quarterly steakhouse meetup coordination platform for a private group. It's built with Next.js 15 and deployed on Cloudflare Pages with a Cloudflare D1 (SQLite) database.

**Key Technologies:**
- Next.js 15.5.2 (App Router)
- NextAuth v5 (beta.25) with Google OAuth
- Cloudflare Pages + D1 Database
- Edge Runtime (all routes and API handlers)
- Tailwind CSS
- Terraform for infrastructure

## Build & Development Commands

All commands are run from the `/app` directory:

```bash
# Development
npm run dev              # Local Next.js dev server

# Building
npm run build            # Standard Next.js build
npm run pages:build      # Build for Cloudflare Pages deployment (uses @cloudflare/next-on-pages)

# Linting
npm run lint
```

## Cloudflare D1 Database Commands

```bash
# Execute SQL on remote database
wrangler d1 execute meatup-club-db --remote --command "SELECT * FROM users"

# List all D1 databases
wrangler d1 list

# View schema
wrangler d1 execute meatup-club-db --remote --command ".schema"

# Check deployments
wrangler pages deployment list --project-name=meatup-club
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

### NextAuth v5 Edge Runtime Pattern

**Critical:** All API routes use NextAuth v5's Edge Runtime authentication pattern. This is NOT the standard NextAuth pattern:

```typescript
// ❌ WRONG - doesn't work in Edge Runtime
export async function GET(request: NextRequest) {
  const session = await auth();  // Won't have access to cookies
}

// ✅ CORRECT - Edge Runtime pattern
export const GET = auth(async function GET(request) {
  const session = request.auth;  // Session available via request object
  // ... handler code
});
```

All API routes must:
1. Export `runtime = 'edge'`
2. Wrap handlers with `auth()` function
3. Access session via `request.auth`, not `await auth()`

### Database Access Pattern

D1 database is accessed via Cloudflare Pages environment binding:

```typescript
import { getDb, getUserByEmail, ensureUser } from '@/lib/db';

const db = getDb();  // Returns process.env.DB (Cloudflare binding)
```

The database binding is configured in Terraform (`terraform/main.tf`) as:
- Production: `DB = cloudflare_d1_database.meatup_db.id`
- Preview: Same database (no separate preview DB)

### Database Schema

Core tables:
- **users** - email, name, picture, is_admin, created_at
- **events** - restaurant_name, restaurant_address, event_date, status, created_at
- **rsvps** - event_id, user_id, status (yes/no/maybe), comments, created_at
- **restaurant_suggestions** - user_id, event_id, name, address, cuisine, url, created_at
- **restaurant_votes** - suggestion_id, user_id, created_at
- **date_suggestions** - user_id, event_id, suggested_date, created_at
- **date_votes** - date_suggestion_id, user_id, created_at

### Admin System

Admin functionality is role-based:
- `users.is_admin` column (BOOLEAN, default 0)
- Admin-only API routes check `user.is_admin === 1`
- Admin-only UI elements check via `/api/me` endpoint
- Cannot delete your own admin account

Admin-protected routes: `/api/members` (GET, POST, DELETE)

### Route Protection

Middleware (`middleware.ts`) protects all `/dashboard/*` routes using NextAuth. Public routes:
- `/` (landing page)
- `/login`
- `/api/auth/*`

### Client Components & Navigation

`DashboardNav` component (`components/DashboardNav.tsx`) is used across all dashboard pages and:
- Fetches user admin status via `/api/me` on mount
- Conditionally shows "Members" link for admins
- Highlights active page based on pathname

### API Route Structure

All API routes follow this structure:
1. Export `runtime = 'edge'`
2. Wrap handler with `auth()`
3. Check `request.auth` for session
4. Get DB via `getDb()`
5. Use `ensureUser()` or `getUserByEmail()` for user operations
6. Return `NextResponse.json()`

Example:
```typescript
export const runtime = 'edge';

export const GET = auth(async function GET(request) {
  const session = request.auth;
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const user = await getUserByEmail(db, session.user.email);
  // ... implementation
});
```

### Voting System Pattern

Restaurant and date voting both use the same toggle pattern:
- One vote per user per item (UNIQUE constraint on user_id + item_id)
- Vote/unvote handled in same endpoint via `action` parameter
- Vote counts aggregated via `COUNT(v.id)` in JOIN queries
- User's vote status via `SUM(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) as user_has_voted`

## Terraform Infrastructure

Infrastructure is managed in `terraform/main.tf`:
- Cloudflare Pages project with GitHub source
- D1 database (name: `meatup-club-db`)
- DNS records (root + www CNAME)
- Custom domain configuration
- Environment variables and secrets

Apply changes:
```bash
cd terraform
terraform plan
terraform apply
```

## Important Notes

1. **Next.js Version**: Pinned to 15.5.2 for Cloudflare compatibility
2. **Images**: Unoptimized (`next.config.js`) for Cloudflare Pages
3. **Build Command**: Uses `pages:build` (not standard `build`) for deployment
4. **Database Name**: `meatup-club-db` (NOT `meatup-db`)
5. **Zone ID vs Account ID**: Cache purging requires zone ID, not account ID
6. **Browser Caching**: After deployment, users may need hard refresh (Cmd+Shift+R) or cache purge

## Project Structure

```
app/
  app/                    # Next.js App Router
    api/                  # API routes (all Edge Runtime)
      auth/[...nextauth]/ # NextAuth handlers
      events/             # Event CRUD
      restaurants/        # Restaurant suggestions + voting
      dates/              # Date suggestions + voting
      rsvp/               # RSVP management
      members/            # Member management (admin only)
      me/                 # Current user info
    dashboard/            # Protected dashboard pages
      page.tsx            # Dashboard home
      rsvp/
      restaurants/
      dates/
      members/            # Admin only
    login/
    page.tsx             # Public landing page
  components/
    DashboardNav.tsx     # Shared navigation
  lib/
    db.ts                # D1 database helpers
  auth.ts                # NextAuth configuration
  middleware.ts          # Route protection

terraform/
  main.tf                # Cloudflare infrastructure
  variables.tf
  outputs.tf
```
