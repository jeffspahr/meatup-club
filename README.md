# 🥩 Meatup.Club

A private web application for organizing quarterly meetups at steakhouses and meat-focused restaurants. Built for a small group (<12 members) with Google OAuth authentication, RSVP management, and voting features.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Authentication**: Google OAuth via NextAuth.js
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Cloudflare Pages + Functions
- **Infrastructure**: Terraform for IaC

## Features

- 🔐 Google OAuth login (no password management)
- 📅 RSVP system for quarterly events
- 🍖 Restaurant suggestion and voting
- 📆 Date suggestion and voting
- 🎨 Clean, minimal UI with meat-themed colors
- 🔒 All functionality behind authentication

## Project Structure

```
meatup-club/
├── terraform/              # Infrastructure as Code
│   ├── main.tf            # Cloudflare resources
│   ├── variables.tf       # Input variables
│   ├── outputs.tf         # Output values
│   └── terraform.tfvars.example
├── app/                   # Next.js application
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── lib/             # Utilities, DB client
│   └── package.json
├── schema.sql            # D1 database schema
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 20+
- Terraform 1.0+
- Cloudflare account with:
  - Domain added (meatup.club)
  - API token with D1, Pages, and DNS permissions
- Google OAuth credentials
- GitHub account

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/jeffspahr/meatup-club.git
cd meatup-club
cd app && npm install
```

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Enable "Google+ API"
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URI: `https://meatup.club/api/auth/callback/google`
   - For local dev: `http://localhost:3000/api/auth/callback/google`
5. Save your Client ID and Client Secret

### 3. Configure Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and fill in your values:

```hcl
cloudflare_api_token = "your-cloudflare-api-token"
cloudflare_account_id = "your-account-id"
github_owner = "jeffspahr"
google_client_id = "your-google-client-id"
google_client_secret = "your-google-client-secret"
nextauth_secret = "generate-with-openssl-rand-base64-32"
```

**Generate NextAuth secret:**
```bash
openssl rand -base64 32
```

**Get Cloudflare API token:**
- Visit: https://dash.cloudflare.com/profile/api-tokens
- Create token with permissions: D1:Edit, Pages:Edit, DNS:Edit

**Get Cloudflare Account ID:**
- Visit: https://dash.cloudflare.com/
- Copy from right sidebar

### 4. Provision Infrastructure

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

This will create:
- D1 database instance
- Cloudflare Pages project
- DNS records for meatup.club
- Environment variables and secrets

### 5. Initialize Database

After Terraform creates the D1 database, get the database ID:

```bash
terraform output d1_database_id
```

Then run the schema migration:

```bash
# Install wrangler if not already installed
npm install -g wrangler

# Run migration (replace DATABASE_ID with output from terraform)
wrangler d1 execute meatup-club-db --remote --file=../schema.sql
```

Or use the database ID from Terraform output:

```bash
wrangler d1 execute DATABASE_ID --remote --file=../schema.sql
```

### 6. Deploy to Cloudflare Pages

The Terraform configuration sets up GitHub integration, so deployments happen automatically:

```bash
git add .
git commit -m "Initial setup"
git push origin main
```

Cloudflare Pages will automatically build and deploy on push to main.

### 7. Local Development

Create a local `.env.local` file:

```bash
cd app
cat > .env.local << EOF
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
EOF
```

Run the development server:

```bash
npm run dev
```

Visit http://localhost:3000

## Database Schema

The D1 database includes the following tables:

- `users` - User profiles from Google OAuth
- `events` - Quarterly meetup events
- `rsvps` - RSVP responses for events
- `restaurant_suggestions` - Suggested restaurants
- `restaurant_votes` - Votes for restaurant suggestions
- `date_suggestions` - Suggested dates for events
- `date_votes` - Votes for date suggestions

See `schema.sql` for full schema details.

## Usage

## How Meatup.Club Works

- Members suggest restaurants and vote on the favorites.
- Members propose dates and vote to pick a meetup time.
- Admins finalize the event and send calendar invites.
- Members RSVP on the dashboard, via calendar response, or by SMS.
- Automated reminders go out 24 hours and 2 hours before the event.

### For Members

1. Visit https://meatup.club
2. Click "Sign in with Google"
3. View upcoming events and RSVP
4. Suggest and vote on restaurants
5. Suggest and vote on dates

### For Admins

(Admin features to be implemented in future iterations)

- Create new events
- Finalize restaurant and date selections
- Manage members
- View past events

## Deployment

Deployments are automated via Cloudflare Pages GitHub integration:

1. Push to `main` branch
2. Cloudflare Pages automatically builds and deploys
3. Preview deployments for PRs

## Environment Variables

Set via Terraform in `terraform/main.tf`:

- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `NEXTAUTH_SECRET` - NextAuth.js encryption secret
- `NEXTAUTH_URL` - Application URL
- `DB` - D1 database binding (automatic)

## Troubleshooting

### OAuth redirect errors

- Verify redirect URI in Google Console matches `https://meatup.club/api/auth/callback/google`
- Check that `NEXTAUTH_URL` is set correctly

### Database connection issues

- Verify D1 database binding in Cloudflare Pages settings
- Check that schema has been applied with `wrangler d1 execute`

### Build failures

- Check Node version is 20+
- Verify all environment variables are set in Cloudflare Pages
- Review build logs in Cloudflare dashboard

## Future Enhancements

- Admin role and permissions
- Email notifications
- Photo sharing from events
- Restaurant ratings and reviews
- Calendar integration (.ics export)
- Member profiles and dietary preferences
- Past event archive

## License

Private project - All rights reserved

## Support

For issues or questions, contact the repository owner.
