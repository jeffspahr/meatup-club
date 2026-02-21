# Meatup.Club - React Router (Remix) Version

A quarterly steakhouse meetup club app built with React Router 7, Cloudflare Pages, and D1 database.

## Features

- 🥩 Quarterly steakhouse meetup coordination
- 🗳️ Restaurant and date voting system
- 📅 RSVP management
- 👥 Member management and invitations
- 🔐 Google OAuth authentication
- 👨‍💼 Admin panel for event and member management
- 📧 Calendar invite sync - Two-way RSVP synchronization between website and calendar apps

> **📖 For detailed technical documentation on calendar sync, see [ARCHITECTURE.md](./ARCHITECTURE.md)**

## Tech Stack

- **Framework**: React Router 7 (formerly Remix)
- **Runtime**: Cloudflare Pages (Edge)
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Google OAuth
- **Email**: Resend (with inbound routing for calendar RSVP sync)
- **Styling**: Tailwind CSS v3
- **Language**: TypeScript

## Prerequisites

- Node.js 20+
- Cloudflare account
- Wrangler CLI installed globally (`npm install -g wrangler`)
- Google OAuth credentials

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/[your-username]/meatup-club.git
   cd meatup-club/app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Fill in your values:
   ```env
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   SESSION_SECRET=your-random-secret-string
   ```

4. **Set up Cloudflare D1 database**

   Create a new D1 database:
   ```bash
   wrangler d1 create meatup-club-db
   ```

   Update `wrangler.toml` with your database ID.

   Apply the base schema and migrations (from `app/`):
   ```bash
   wrangler d1 execute meatup-club-db --file=../schema.sql
   for f in ../migrations/*.sql ./migrations/*.sql; do
     wrangler d1 execute meatup-club-db --file="$f"
   done
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```

   Visit http://localhost:5173

## Database Schema

The app uses the following database structure:

- **users** - Member information and authentication
- **events** - Quarterly meetup events
- **rsvps** - Event attendance responses
- **restaurant_suggestions** - Restaurant nominations
- **restaurant_votes** - Votes for restaurants
- **date_suggestions** - Date nominations
- **date_votes** - Votes for dates

See `../schema.sql`, `../migrations/`, and `./migrations/` for the complete schema history.

## Deployment

### Deploy to Cloudflare Pages

1. **Configure secrets**
   ```bash
   wrangler pages secret put GOOGLE_CLIENT_ID
   wrangler pages secret put GOOGLE_CLIENT_SECRET
   wrangler pages secret put SESSION_SECRET
   ```

2. **Deploy**
   ```bash
   npm run deploy
   ```

### Automated Deployment (GitHub Actions)

Push to the `main` branch to trigger automatic deployment:

```bash
git push origin main
```

Make sure these secrets are configured in your GitHub repository:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Project Structure

```
app/
├── app/
│   ├── components/          # Reusable React components
│   │   └── DashboardNav.tsx # Main navigation
│   ├── lib/                 # Utilities and helpers
│   │   ├── auth.server.ts   # Authentication logic
│   │   ├── db.server.ts     # Database helpers
│   │   └── session.server.ts # Session management
│   ├── routes/              # Application routes
│   │   ├── _index.tsx       # Landing page
│   │   ├── login.tsx        # OAuth redirect
│   │   ├── pending.tsx      # Pending approval page
│   │   ├── accept-invite.tsx # Accept invitation
│   │   ├── dashboard.tsx    # Dashboard layout
│   │   ├── dashboard._index.tsx  # Dashboard home
│   │   ├── dashboard.rsvp.tsx    # RSVP management
│   │   ├── dashboard.events.tsx  # Events list
│   │   ├── dashboard.members.tsx # Members list
│   │   ├── dashboard.restaurants.tsx # Restaurant voting
│   │   ├── dashboard.dates.tsx   # Date voting
│   │   └── dashboard.admin/      # Admin routes
│   ├── app.css              # Global styles
│   ├── entry.server.tsx     # Server entry point
│   └── root.tsx             # Root layout
├── public/                  # Static assets
├── .github/workflows/       # CI/CD workflows
├── wrangler.toml            # Cloudflare configuration
├── react-router.config.ts   # React Router config
└── package.json
```

## Available Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run deploy` - Build and deploy to Cloudflare Pages
- `npm run preview` - Preview production build locally
- `npm run typecheck` - Run TypeScript type checking
- `npm run cf-typegen` - Generate Cloudflare types

## Environment Variables

### Required

- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `SESSION_SECRET` - Random string for session encryption
- `RESEND_API_KEY` - Resend API key for email sending and calendar invites
- `RESEND_WEBHOOK_SECRET` - Svix webhook secret for inbound RSVP email verification
- `GOOGLE_PLACES_API_KEY` - Google Places API key for restaurant search/details/photo proxy routes
- `TWILIO_ACCOUNT_SID` - Twilio Account SID for SMS sending and webhooks
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token for SMS sending and webhook signature validation
- `TWILIO_FROM_NUMBER` - Twilio phone number used for reminders

### Cloudflare Bindings

- `DB` - D1 database binding (configured in wrangler.toml)

### Setting up Resend

After deploying the application, configure Resend inbound email routing:

1. Visit https://meatup.club/dashboard/admin/setup (requires admin access)
2. Click "Configure Resend Inbound Email"
3. This will automatically set up `rsvp@mail.meatup.club` to forward calendar RSVP responses to your webhook

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed setup instructions and troubleshooting.

## Authentication Flow

1. User clicks "Sign in with Google" on landing page
2. Redirects to Google OAuth
3. Callback creates or updates the user profile (without auto-promoting account status)
4. Users without active status are sent to the pending flow
5. Admin can activate users to grant access
6. Invited users can accept invitation to become active

## Admin Features

Admins (users with `is_admin = 1`) can:

- Create events from vote winners
- Manually create and edit events
- Invite new members
- Edit member roles (Admin/Member)
- View all members regardless of status

## Migration from Next.js

This is a React Router 7 (Remix) version, migrated from the original Next.js implementation. Key changes:

- Replaced NextAuth with custom Google OAuth + sessions
- Converted API routes to loaders/actions
- Removed client-side data fetching
- Updated to use Cloudflare Pages runtime
- Downgraded Tailwind from v4 to v3

## License

Apache 2.0

## Contributors

Meatup.Club Contributors
