# Meatup.Club Architecture

## System Overview

Meatup.Club is a serverless web application built on Cloudflare's edge infrastructure, using React Router 7 for the frontend framework and Cloudflare D1 for data persistence.

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          React Router 7 (Remix) Application                │ │
│  │  - Client-side routing                                     │ │
│  │  - Server-side rendering (SSR)                             │ │
│  │  - Progressive enhancement                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ HTTPS
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Cloudflare Workers                        │ │
│  │  - Server-side React rendering (SSR)                       │ │
│  │  - API route handlers                                      │ │
│  │  - Authentication middleware                               │ │
│  │  - Database queries                                        │ │
│  │  - Static asset serving (Assets binding)                   │ │
│  │  - Global CDN distribution                                 │ │
│  │  - Automatic HTTPS                                         │ │
│  │  - Custom domain (meatup.club)                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Cloudflare D1                            │ │
│  │  - SQLite database                                         │ │
│  │  - Edge-optimized storage                                  │ │
│  │  - Automatic backups                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ External APIs
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     External Services                            │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  Google OAuth        │    │  Google Places API           │  │
│  │  - User authentication│   │  - Restaurant search         │  │
│  │  - Profile data      │    │  - Place details             │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Infrastructure as Code

All Cloudflare resources are managed via Terraform:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Terraform Configuration                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  terraform/                                                │ │
│  │  ├── main.tf          (Cloudflare resources)              │ │
│  │  ├── variables.tf     (Configuration variables)           │ │
│  │  └── outputs.tf       (Resource identifiers)              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Manages:                                                        │
│  • DNS records (A/AAAA for meatup.club)                         │
│  • Worker deployment                                             │
│  • D1 database instance                                          │
│  • Environment variables and secrets                             │
│  • SSL/TLS certificates                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Application Architecture

### Frontend (React Router 7)

```
app/
├── routes/
│   ├── _index.tsx                    # Landing page (public)
│   ├── auth.google.tsx               # OAuth initiation
│   ├── auth.google.callback.tsx      # OAuth callback handler
│   ├── dashboard._index.tsx          # Dashboard home (protected)
│   ├── dashboard.polls.tsx           # Poll management & voting
│   ├── dashboard.restaurants.tsx     # Restaurant management
│   ├── dashboard.rsvp.tsx            # Event RSVP
│   ├── dashboard.admin.tsx           # Admin controls
│   └── api/
│       ├── places.search.tsx         # Google Places search proxy
│       └── places.details.tsx        # Google Places details proxy
│
├── components/
│   ├── RestaurantAutocomplete.tsx    # Shared search component
│   ├── DateCalendar.tsx              # Date selection UI
│   ├── DoodleView.tsx                # Date availability grid
│   └── Header.tsx                    # Navigation header
│
├── lib/
│   ├── auth.server.ts                # Authentication utilities
│   ├── dateUtils.ts                  # Timezone-safe date handling
│   └── utils.ts                      # General utilities
│
└── entry.server.tsx                  # SSR entry point
```

### Authentication Flow

```
┌──────────┐
│  User    │
│  clicks  │
│  "Login" │
└────┬─────┘
     │
     ▼
┌────────────────────────────────────┐
│  /auth/google                      │
│  - Generate OAuth state            │
│  - Redirect to Google OAuth        │
└────────────────┬───────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│  Google OAuth Consent              │
│  - User authorizes                 │
│  - Google redirects to callback    │
└────────────────┬───────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│  /auth/google/callback             │
│  - Verify state                    │
│  - Exchange code for tokens        │
│  - Get user profile                │
│  - Create/update user in D1        │
│  - Create session cookie           │
│  - Redirect to /dashboard          │
└────────────────┬───────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│  Protected Routes                  │
│  - Verify session cookie           │
│  - Load user from D1               │
│  - Check active status             │
│  - Allow access                    │
└────────────────────────────────────┘
```

### Data Flow (Restaurant Voting Example)

```
┌──────────────────────────────────────────────────────────────────┐
│                          User Action                              │
│  User clicks "Vote" button on restaurant                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Client-Side Handler                          │
│  submit(formData, { method: 'post' })                             │
│  - Serializes vote data                                           │
│  - Sends POST request                                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Server-Side Action Handler                     │
│  export async function action({ request, context })               │
│  1. Authenticate user (requireActiveUser)                         │
│  2. Parse form data                                               │
│  3. Validate inputs                                               │
│  4. Check business rules (e.g., one vote per poll)                │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Database Transaction                         │
│  const db = context.cloudflare.env.DB                             │
│                                                                    │
│  If removing vote:                                                │
│    DELETE FROM restaurant_votes WHERE ...                         │
│                                                                    │
│  If adding vote:                                                  │
│    DELETE FROM restaurant_votes WHERE user_id = ? AND poll_id = ? │
│    INSERT INTO restaurant_votes (suggestion_id, user_id, poll_id) │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Response & Revalidation                   │
│  return { success: true }                                         │
│  - React Router revalidates loader                                │
│  - Fresh data fetched from D1                                     │
│  - UI updates automatically                                       │
└──────────────────────────────────────────────────────────────────┘
```

## Deployment Pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│                         Developer                                 │
│  git push origin main                                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      GitHub Repository                            │
│  - Code stored                                                    │
│  - GitHub Actions triggered                                       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                   GitHub Actions Build                            │
│  1. Checkout code                                                 │
│  2. Install dependencies (npm ci)                                 │
│  3. Build application (npm run build)                             │
│     - Client bundle (static assets)                               │
│     - Server bundle (SSR handler)                                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Wrangler Deploy to Workers                      │
│  1. Upload Worker code (workers/app.ts)                           │
│  2. Bundle static assets (Assets binding)                         │
│  3. Bind D1 database                                              │
│  4. Deploy to Cloudflare's edge network                           │
│  5. Activate new version                                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Live Production Site                         │
│  https://meatup.club                                              │
│  - Zero-downtime deployment                                       │
│  - Instant global propagation (300+ locations)                    │
│  - Automatic rollback on errors                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Why Cloudflare Workers?
- **Global performance**: Edge computing ensures low latency worldwide
- **Scalability**: Automatic scaling with no infrastructure management
- **Cost-effective**: Pay-per-use model, generous free tier
- **Integrated ecosystem**: Workers, D1, and Assets work seamlessly together
- **Modern deployment**: Single Worker handles SSR, API routes, and static assets

### Why React Router 7 (Remix)?
- **SSR by default**: Better SEO and initial load performance
- **Progressive enhancement**: Works without JavaScript
- **Loader/Action pattern**: Clean separation of data fetching and mutations
- **File-based routing**: Intuitive project structure

### Why D1 (SQLite)?
- **Relational data model**: Perfect for structured app data
- **Edge integration**: Native binding to Cloudflare Workers
- **SQL familiarity**: Standard SQL syntax
- **ACID compliance**: Data integrity guarantees

### Why String-Based Date Handling?
- **Timezone safety**: YYYY-MM-DD strings avoid timezone conversion bugs
- **Consistency**: Same format in database, server, and client
- **Simplicity**: No complex date library dependencies

## Security Considerations

```
┌──────────────────────────────────────────────────────────────────┐
│                      Security Layers                              │
│                                                                    │
│  1. HTTPS Only                                                    │
│     - All traffic encrypted (TLS 1.3)                             │
│     - HSTS headers                                                │
│                                                                    │
│  2. Authentication                                                │
│     - OAuth 2.0 with Google                                       │
│     - HttpOnly session cookies                                    │
│     - CSRF protection via SameSite cookies                        │
│                                                                    │
│  3. Authorization                                                 │
│     - Server-side user verification                               │
│     - Admin role checks                                           │
│     - Resource ownership validation                               │
│                                                                    │
│  4. Input Validation                                              │
│     - Server-side validation on all inputs                        │
│     - SQL parameterized queries (no injection risk)               │
│     - XSS protection via React auto-escaping                      │
│                                                                    │
│  5. API Security                                                  │
│     - Google API keys stored as secrets                           │
│     - Rate limiting via Cloudflare                                │
│     - CORS policies enforced                                      │
└──────────────────────────────────────────────────────────────────┘
```

## Performance Optimizations

- **Code splitting**: Automatic route-based chunking
- **Static asset caching**: Long-lived CDN cache for immutable assets
- **Edge SSR**: Server rendering at ~50ms from anywhere in the world
- **Optimistic UI**: Immediate feedback on user actions
- **Shared component chunks**: Deduplication of common code
- **Image optimization**: Responsive images via Google Places API

## Monitoring and Observability

- **Cloudflare Analytics**: Traffic, performance, and error metrics
- **Worker Logs**: Real-time logging via `wrangler tail`
- **D1 Insights**: Query performance and database metrics
- **Build Logs**: Deployment status and build errors
