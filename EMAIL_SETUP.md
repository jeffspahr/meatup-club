# Email Invitation Setup

This guide walks through setting up email invitations for Meatup.Club using Resend.

## Why Resend?

- **Generous free tier**: 3,000 emails/month, 100 emails/day
- **Simple API**: Clean, modern API designed for developers
- **Good deliverability**: Reliable transactional email service
- **No credit card required**: Can start completely free
- **Fast setup**: Just one API key needed

## Setup Steps

### 1. Create a Resend Account (if you don't have one)

1. Go to [resend.com](https://resend.com)
2. Sign up for a free account
3. Verify your email address

### 2. Get Your API Key

1. In the Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Name it "Meatup.Club Production"
4. Select **Sending access** permission
5. Copy the API key (starts with `re_`)

**Important**: Save this key immediately - you won't be able to see it again! Keep it secure - never commit it to the repository.

### 3. Configure Domain (Optional - For Production)

For production use without "via resend.dev" label:

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter `meatup.club` (or a subdomain like `mg.meatup.club`)
4. Follow the instructions to add DNS records (SPF, DKIM, DMARC)
5. Wait for verification (usually takes a few minutes)

**DNS Records to Add:**
Add the TXT and CNAME records shown in Resend dashboard to your Cloudflare DNS.

**For Development/Testing:**
You can use `onboarding@resend.dev` as the sender (default in code) which works immediately without domain verification.

### 4. Add API Key to Cloudflare Workers

You need to add the Resend API key as an environment variable:

**Option A: Using Wrangler CLI (Recommended)**

```bash
# From the app directory
cd /Users/jspahr/repo/meatup-club/app

# Add API key (encrypted secret)
wrangler secret put RESEND_API_KEY
# Paste your API key when prompted (starts with re_)
```

**Option B: Using Cloudflare Dashboard**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages**
3. Select your `meatup-club` worker
4. Go to **Settings** → **Variables**
5. Under **Environment Variables**, click **Add variable**
6. Name: `RESEND_API_KEY`
7. Value: Your Resend API key (starts with `re_`)
8. Click **Encrypt** (recommended)
9. Click **Save**

### 5. Deploy the Changes

```bash
cd /Users/jspahr/repo/meatup-club/app
npm run build
wrangler deploy
```

## Testing

### Test Email Sending

1. Go to `/dashboard/admin/members`
2. Click **+ Invite User**
3. Enter an email address you control
4. Submit the form
5. Check your email inbox for the invitation

### Troubleshooting

**Email not received?**
- Check spam/junk folder
- Verify API key is correctly set in Cloudflare
- Check Cloudflare Workers logs: `wrangler tail`
- Check Resend dashboard **Emails** for delivery status

**"Failed to send email" warning?**
- API key might be incorrect or not set
- Check Cloudflare Workers environment variables (RESEND_API_KEY)
- View logs: `wrangler tail` to see detailed error
- Verify API key has sending permissions in Resend dashboard

**Domain verification issues?**
- DNS changes can take up to 48 hours to propagate
- Use Resend's DNS checker to verify records
- You can still send from `onboarding@resend.dev` while waiting

## Development vs Production

**Development (Default)**
- Uses `onboarding@resend.dev` as sender
- Shows "via resend.dev" label in some email clients
- 100 emails/day limit
- Works immediately, no setup needed

**Production (After Domain Verification)**
- Uses `invites@meatup.club` as sender (update in code)
- No "via" label
- Full 3,000 emails/month limit
- Better deliverability and branding

## Email Template Preview

The invitation email includes:
- 🥩 Meatup.Club branding
- Personal greeting with invitee's name
- Information about what Meatup.Club is
- Clear call-to-action button
- Accept link (also as plain text)
- Inviter's name

## Cost

**Free Tier:**
- 3,000 emails per month
- 100 emails per day
- No credit card required
- 1 domain included

For a small club, this should be more than sufficient. If you ever exceed limits, paid plans start at $20/month for 50,000 emails.

## Resend Dashboard Features

**Useful features available in your Resend account:**
- **Emails**: See all sent emails and their delivery status
- **Analytics**: Track deliverability metrics
- **Domains**: Manage verified sending domains
- **API Keys**: Manage multiple keys for different environments

## Security Notes

- API key is encrypted and stored in Cloudflare Workers environment
- Never commit API keys to the repository
- Invite links include email parameter but no sensitive data
- Users must authenticate via Google OAuth to complete signup
- Resend provides detailed logs for debugging and monitoring
