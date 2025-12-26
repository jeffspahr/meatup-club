# Meatup.Club Database Architecture

## Overview

Meatup.Club uses **Cloudflare D1**, a serverless SQLite database that runs on Cloudflare's edge network. The schema is designed to support quarterly meetup events with restaurant and date voting functionality.

## Database: Cloudflare D1

- **Type**: SQLite (edge-optimized)
- **Location**: Cloudflare's global network
- **Access**: Via Cloudflare Workers bindings
- **Backup**: Automatic via Cloudflare

## Entity Relationship Diagram

```
┌─────────────────────┐
│       users         │
│─────────────────────│
│ id (PK)             │◄────────┐
│ email (UNIQUE)      │         │
│ name                │         │
│ picture             │         │
│ is_admin            │         │
│ is_active           │         │
│ google_id           │         │
│ session_token       │         │
│ session_expires_at  │         │
│ created_at          │         │
└─────────────────────┘         │
         ▲                      │
         │                      │
         │                      │
         │ (user_id)            │ (user_id)
         │                      │
┌────────┴─────────────┐  ┌─────┴───────────────────┐
│        rsvps         │  │ restaurant_suggestions  │
│──────────────────────│  │─────────────────────────│
│ id (PK)              │  │ id (PK)                 │◄───────┐
│ event_id (FK)        │  │ user_id (FK)            │        │
│ user_id (FK)         │  │ poll_id (FK, nullable)  │        │
│ status               │  │ name                    │        │
│ dietary_restrictions │  │ address                 │        │
│ created_at           │  │ cuisine                 │        │
└──────────────────────┘  │ url                     │        │
         ▲                │ google_place_id         │        │
         │                │ google_rating           │        │
         │ (event_id)     │ rating_count            │        │
         │                │ price_level             │        │
┌────────┴──────────┐     │ phone_number            │        │
│      events       │     │ reservation_url         │        │
│───────────────────│     │ menu_url                │        │
│ id (PK)           │     │ photo_url               │        │
│ restaurant_name   │     │ google_maps_url         │        │
│ restaurant_address│     │ opening_hours           │        │
│ event_date        │     │ created_at              │        │
│ status            │     └─────────────────────────┘        │
│ created_at        │              ▲                         │
└───────────────────┘              │                         │
                                   │ (suggestion_id)         │ (suggestion_id)
                                   │                         │
                      ┌────────────┴─────────────┐  ┌────────┴────────────────┐
                      │   restaurant_votes       │  │        polls           │
                      │──────────────────────────│  │─────────────────────────│
                      │ id (PK)                  │  │ id (PK)                 │◄──┐
                      │ suggestion_id (FK)       │  │ status                  │   │
                      │ user_id (FK)             │  │ winner_restaurant_id(FK)│   │
                      │ poll_id (FK)             │  │ winner_date_id (FK)     │   │
                      │ created_at               │  │ created_at              │   │
                      │ UNIQUE(suggestion, user, │  │ completed_at            │   │
                      │        poll)             │  └─────────────────────────┘   │
                      └──────────────────────────┘                               │
                                   ▲                                             │
                                   │ (poll_id)                   (poll_id)       │
                                   └──────────────────────┬──────────────────────┘
                                                          │
                                                          │
                      ┌───────────────────────┐  ┌────────┴─────────────────┐
                      │  date_suggestions     │  │     date_votes          │
                      │───────────────────────│  │─────────────────────────│
                      │ id (PK)               │◄─┤ id (PK)                 │
                      │ user_id (FK)          │  │ date_suggestion_id (FK) │
                      │ poll_id (FK)          │  │ user_id (FK)            │
                      │ suggested_date        │  │ created_at              │
                      │ created_at            │  │ UNIQUE(suggestion, user)│
                      └───────────────────────┘  └─────────────────────────┘
                               ▲
                               │ (user_id)
                               │
                               │
                         (back to users)
```

## Table Definitions

### users

Stores user account information from Google OAuth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique user identifier |
| email | TEXT | UNIQUE NOT NULL | User's email from Google |
| name | TEXT | | User's display name |
| picture | TEXT | | URL to profile picture |
| is_admin | INTEGER | DEFAULT 0 | Admin flag (0=false, 1=true) |
| is_active | INTEGER | DEFAULT 1 | Active status (0=inactive, 1=active) |
| google_id | TEXT | UNIQUE | Google OAuth user ID |
| session_token | TEXT | | Current session token |
| session_expires_at | DATETIME | | Session expiration timestamp |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Account creation timestamp |

**Indexes:**
- `email` (UNIQUE)
- `google_id` (UNIQUE)
- `session_token`

### events

Represents quarterly meetup events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Event identifier |
| restaurant_name | TEXT | | Selected restaurant name |
| restaurant_address | TEXT | | Restaurant address |
| event_date | DATE | | Scheduled event date |
| status | TEXT | DEFAULT 'upcoming' | Event status: upcoming, completed, cancelled |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Business Logic:**
- Created after poll completes and admin selects winners
- Status changes: upcoming → completed (after event) or cancelled

### rsvps

User responses for event attendance.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | RSVP identifier |
| event_id | INTEGER | FOREIGN KEY → events(id) | Associated event |
| user_id | INTEGER | FOREIGN KEY → users(id) | User responding |
| status | TEXT | DEFAULT 'yes' | Response: yes, no, maybe |
| dietary_restrictions | TEXT | | User's dietary notes |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | RSVP timestamp |

**Constraints:**
- UNIQUE(event_id, user_id) - One RSVP per user per event

### polls

Voting sessions for restaurant and date selection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Poll identifier |
| status | TEXT | DEFAULT 'active' | Poll status: active, completed |
| winner_restaurant_id | INTEGER | FOREIGN KEY → restaurant_suggestions(id) | Winning restaurant |
| winner_date_id | INTEGER | FOREIGN KEY → date_suggestions(id) | Winning date |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Poll start timestamp |
| completed_at | DATETIME | | Poll completion timestamp |

**Business Logic:**
- Only one poll can have status='active' at a time
- Admin closes poll and selects winners
- Winners used to create new event

### restaurant_suggestions

Restaurant proposals (permanent collection).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Suggestion identifier |
| user_id | INTEGER | FOREIGN KEY → users(id) | User who added it |
| poll_id | INTEGER | FOREIGN KEY → polls(id), nullable | Associated poll (if suggested during poll) |
| name | TEXT | NOT NULL | Restaurant name |
| address | TEXT | | Street address |
| cuisine | TEXT | | Type of cuisine |
| url | TEXT | | Website URL |
| google_place_id | TEXT | | Google Places ID |
| google_rating | REAL | | Rating from Google (0-5) |
| rating_count | INTEGER | | Number of Google reviews |
| price_level | INTEGER | | Price level (1-4, $ to $$$$) |
| phone_number | TEXT | | Contact number |
| reservation_url | TEXT | | Direct reservation link |
| menu_url | TEXT | | Menu link |
| photo_url | TEXT | | Restaurant photo URL |
| google_maps_url | TEXT | | Google Maps link |
| opening_hours | TEXT | | JSON array of hours |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Addition timestamp |

**Design Note:**
- Restaurants are permanent (not deleted when poll ends)
- Can be reused across multiple polls
- Rich metadata from Google Places API

### restaurant_votes

User votes for restaurants in a specific poll.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Vote identifier |
| suggestion_id | INTEGER | FOREIGN KEY → restaurant_suggestions(id) | Restaurant being voted for |
| user_id | INTEGER | FOREIGN KEY → users(id) | User casting vote |
| poll_id | INTEGER | FOREIGN KEY → polls(id) | Poll this vote belongs to |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Vote timestamp |

**Constraints:**
- UNIQUE(suggestion_id, user_id, poll_id) - One vote per user per poll

**Business Logic:**
- User can change vote (delete old, insert new)
- Votes are poll-specific (same restaurant can get different votes in different polls)

### date_suggestions

Proposed dates for the next event.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Suggestion identifier |
| user_id | INTEGER | FOREIGN KEY → users(id) | User proposing date |
| poll_id | INTEGER | FOREIGN KEY → polls(id) | Associated poll |
| suggested_date | DATE | NOT NULL | Proposed date (YYYY-MM-DD) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Suggestion timestamp |

**Business Logic:**
- Cannot add dates in the past
- Multiple users can suggest same date
- Each suggestion gets separate vote tracking

### date_votes

User votes for date availability (Doodle-style).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Vote identifier |
| date_suggestion_id | INTEGER | FOREIGN KEY → date_suggestions(id) | Date being voted for |
| user_id | INTEGER | FOREIGN KEY → users(id) | User voting |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Vote timestamp |

**Constraints:**
- UNIQUE(date_suggestion_id, user_id) - One vote per user per date

**Business Logic:**
- Multiple votes allowed (user can vote for multiple dates)
- Represents "I'm available on this date"
- Cannot vote on past dates (server-side validation)

## Common Queries

### Get Active Poll with Restaurant Votes

```sql
SELECT
  rs.id,
  rs.name,
  rs.address,
  rs.cuisine,
  rs.photo_url,
  COUNT(DISTINCT rv.id) as vote_count,
  SUM(CASE WHEN rv.user_id = ? THEN 1 ELSE 0 END) as user_has_voted
FROM restaurant_suggestions rs
LEFT JOIN restaurant_votes rv ON rs.id = rv.suggestion_id AND rv.poll_id = ?
GROUP BY rs.id
ORDER BY vote_count DESC, rs.name ASC
```

### Get Date Suggestions with Votes for Active Poll

```sql
SELECT
  ds.id,
  ds.suggested_date,
  ds.user_id,
  COUNT(DISTINCT dv.id) as vote_count,
  SUM(CASE WHEN dv.user_id = ? THEN 1 ELSE 0 END) as user_has_voted,
  u.name as suggested_by
FROM date_suggestions ds
LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id
JOIN users u ON ds.user_id = u.id
WHERE ds.poll_id = ?
GROUP BY ds.id
ORDER BY ds.suggested_date ASC
```

### Get User's Restaurant Vote for a Poll

```sql
SELECT rs.name
FROM restaurant_votes rv
JOIN restaurant_suggestions rs ON rv.suggestion_id = rs.id
WHERE rv.poll_id = ? AND rv.user_id = ?
```

### Get All RSVPs for an Event

```sql
SELECT
  r.id,
  r.status,
  r.dietary_restrictions,
  u.name,
  u.email,
  u.picture
FROM rsvps r
JOIN users u ON r.user_id = u.id
WHERE r.event_id = ?
ORDER BY r.created_at ASC
```

## Data Integrity Rules

### Referential Integrity

All foreign keys use SQLite's foreign key constraints:

```sql
PRAGMA foreign_keys = ON;
```

**Cascade Rules:**
- Delete user → Delete their votes, suggestions, RSVPs
- Delete poll → Delete associated votes and date suggestions
- Delete restaurant suggestion → Delete votes for it
- Delete date suggestion → Delete votes for it
- Delete event → Delete RSVPs for it

### Business Rules (Enforced in Application Layer)

1. **Single Active Poll**: Only one poll can have status='active'
2. **Past Date Prevention**: Cannot add/vote on dates before today (using timezone-safe YYYY-MM-DD comparison)
3. **One Restaurant Vote per Poll**: User can only vote for one restaurant per poll
4. **Multiple Date Votes**: User can vote for multiple dates (availability)
5. **Admin-Only Poll Management**: Only admins can create/close polls
6. **Owner or Admin Delete**: Users can only delete their own suggestions (unless admin)

## Timezone Handling

**Critical Design Decision**: All dates stored as `YYYY-MM-DD` strings to avoid timezone bugs.

- **Database**: `DATE` type stores YYYY-MM-DD
- **Application**: Custom `dateUtils.ts` performs string comparisons
- **Client**: Displays dates in user's local timezone
- **Server**: Validates dates using string comparison (no Date objects)

Example:
```typescript
// ✅ CORRECT - String comparison
const today = '2025-12-26';
const checkDate = '2025-12-25';
const isPast = checkDate < today; // true

// ❌ WRONG - Date object comparison (timezone issues)
const today = new Date();
const checkDate = new Date('2025-12-25');
const isPast = checkDate < today; // May be incorrect due to timezone
```

## Database Migrations

Migrations are managed via Wrangler CLI:

```bash
# Create migration
wrangler d1 migrations create DB_NAME migration_name

# Apply migrations
wrangler d1 migrations apply DB_NAME
```

**Migration Files Location**: `migrations/`

## Performance Considerations

### Indexes

Key indexes for query performance:

1. `users.email` - Unique index for login lookups
2. `users.google_id` - Unique index for OAuth
3. `users.session_token` - Index for session validation
4. `restaurant_votes.poll_id` - Index for poll queries
5. `date_suggestions.poll_id` - Index for poll queries

### Query Optimization

- Use `JOIN` instead of multiple queries
- Use `COUNT(DISTINCT ...)` for vote counts
- Use `SUM(CASE ...)` for user-specific flags in grouped queries
- Limit results where appropriate (e.g., `LIMIT 1` for active poll)

### D1 Specific

- **Read Performance**: D1 serves reads from edge cache when possible
- **Write Performance**: Writes are globally consistent but may have higher latency
- **Connection Pooling**: Handled automatically by Cloudflare
- **Row Limit**: No practical limit for this use case

## Backup and Recovery

- **Automatic Backups**: Cloudflare D1 provides automatic backups
- **Export**: Can export database via `wrangler d1 export`
- **Point-in-Time Recovery**: Available through Cloudflare dashboard

## Security

### SQL Injection Prevention

All queries use parameterized statements:

```typescript
// ✅ SAFE
db.prepare('SELECT * FROM users WHERE email = ?').bind(email);

// ❌ UNSAFE - Never do this
db.prepare(`SELECT * FROM users WHERE email = '${email}'`);
```

### Access Control

- **Database binding**: Only accessible via Cloudflare Workers
- **No direct access**: Database not exposed to internet
- **Authentication required**: All queries require valid session
- **Authorization checks**: User permissions verified before mutations
