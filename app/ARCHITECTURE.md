# Meatup.Club - Architecture Documentation

## Calendar RSVP Sync System

This document describes the two-way calendar synchronization system that enables RSVPs to be updated both from the website and from calendar applications.

### Overview

The calendar sync system consists of three main components:

1. **Calendar Invite Generation** - Creates RFC 5545 compliant iCalendar (.ics) files
2. **Outbound Calendar Updates** - Sends calendar invites and updates via email (Website → Calendar)
3. **Inbound RSVP Processing** - Receives and processes RSVP responses from calendar applications (Calendar → Website)

### System Flow

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Admin Creates │         │  Calendar Invite │         │  User's Calendar│
│   Event         │────────▶│  Sent via Email  │────────▶│  Application    │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                                                   │
                                                                   │
                                                         User responds in
                                                         calendar app (Accept/
                                                         Decline/Tentative)
                                                                   │
                                                                   ▼
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   RSVP Updated  │◀────────│  Webhook Processes│◀────────│  Email with     │
│   in Database   │         │  Calendar Response│         │  RSVP Response  │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                                                   ▲
                                                                   │
                                                          Sent to rsvp@
                                                          mail.meatup.club
```

### File Structure

```
app/
├── lib/
│   └── email.server.ts                    # Calendar generation and email functions
├── routes/
│   ├── dashboard.admin.events.tsx         # Event creation with calendar invites
│   ├── dashboard.admin.setup.tsx          # Resend configuration UI
│   ├── dashboard.rsvp.tsx                 # RSVP page with calendar updates
│   ├── api.admin.setup-resend.tsx         # Resend API configuration endpoint
│   └── api.webhooks.email-rsvp.tsx        # Inbound RSVP webhook handler
└── components/
    └── AddRestaurantModal.tsx             # Reusable restaurant selection UI
```

## Calendar Invite System

### iCalendar Format (RFC 5545)

The system generates standards-compliant iCalendar files with the following structure:

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Meatup.Club//Event Invite//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:event-{eventId}@meatup.club
DTSTART:20250131T180000Z
DTEND:20250131T200000Z
SUMMARY:Meatup.Club - Restaurant Name
DESCRIPTION:Join us for our quarterly steakhouse meetup!
LOCATION:123 Main St, City, State
SEQUENCE:0
ORGANIZER;CN=Meatup.Club:mailto:rsvp@mail.meatup.club
ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=user@example.com:mailto:user@example.com
STATUS:CONFIRMED
TRANSP:OPAQUE
BEGIN:VALARM
TRIGGER:-PT24H
ACTION:DISPLAY
DESCRIPTION:Reminder: Meatup.Club event tomorrow
END:VALARM
END:VEVENT
END:VCALENDAR
```

### Key Implementation Details

#### Stable UIDs

**Critical**: Event UIDs use a stable format without timestamps:
```
UID:event-{eventId}@meatup.club
```

This is essential because:
- Calendar applications use UID to match updates to original events
- Including timestamps would create duplicate events instead of updates
- The same UID must be used for both original invites and updates

#### SEQUENCE Numbers

Calendar updates use the SEQUENCE field to version events:
- `SEQUENCE:0` - Original invitation
- `SEQUENCE:1` - Updated invitation (e.g., RSVP change)

#### PARTSTAT Values

The system maps between calendar participation statuses and website RSVP values:

| Calendar (PARTSTAT) | Website Status | Description |
|---------------------|---------------|-------------|
| ACCEPTED            | yes           | User will attend |
| DECLINED            | no            | User will not attend |
| TENTATIVE           | maybe         | User is unsure |
| NEEDS-ACTION        | maybe         | No response yet (default) |

### Email Delivery

Calendar invites are sent via Resend API with:
- **From**: `events@mail.meatup.club`
- **Attachment**: `event.ics` with `content_type: text/calendar; method=REQUEST`
- **Subject**: Descriptive event subject
- **HTML body**: Event details with fallback instructions

## Two-Way RSVP Sync

### Website → Calendar (Outbound Updates)

When a user updates their RSVP on the website:

1. RSVP is updated in database (`dashboard.rsvp.tsx` action)
2. `sendCalendarUpdate()` is called with user's new RSVP status
3. New .ics file is generated with:
   - Same `UID` as original invite
   - `SEQUENCE:1` to indicate update
   - Updated `PARTSTAT` matching new RSVP status
4. Email sent to user with updated calendar file
5. Calendar app receives email and updates existing event

**Implementation**: `/app/lib/email.server.ts:416-607`

```typescript
export async function sendCalendarUpdate({
  eventId,
  restaurantName,
  restaurantAddress,
  eventDate,
  eventTime,
  userEmail,
  rsvpStatus,
  resendApiKey,
}: CalendarUpdateParams): Promise<{ success: boolean; error?: string }>
```

**Used in**: `dashboard.rsvp.tsx` lines 133-162

### Calendar → Website (Inbound Processing)

When a user responds to the calendar invite in their calendar app:

1. Calendar app sends RSVP response email to `rsvp@mail.meatup.club`
2. Resend inbound routing forwards to webhook: `https://meatup.club/api/webhooks/email-rsvp`
3. Webhook receives email payload with:
   - Sender email address
   - iCalendar PARTSTAT value
   - Event UID
4. System extracts:
   - User email from `From` header
   - Event ID from UID pattern: `event-{id}@meatup.club`
   - PARTSTAT value from email content
5. User is looked up in database by email
6. Event is verified to exist
7. RSVP is created or updated in database
8. `updated_via_calendar` flag is set to track sync source

**Implementation**: `/app/routes/api.webhooks.email-rsvp.tsx`

```typescript
export async function action({ request, context }: Route.ActionArgs) {
  const payload = await request.json();
  const { from, subject, text, html } = payload.data;

  const rsvpData = parseCalendarRSVP({ from, subject, text, html });
  // ... process and update database
}
```

#### Email Parsing

The webhook parses calendar RSVP data from email content:

```typescript
function parseCalendarRSVP({
  subject,
  text,
  html
}): { eventUid: string; partstat: string } | null {
  // Extract UID from email body
  const uidMatch = content.match(/UID:(event-\d+(?:-\d+)?@meatup\.club)/);

  // Extract PARTSTAT from email body
  const partstatMatch = content.match(/PARTSTAT:(ACCEPTED|DECLINED|TENTATIVE|NEEDS-ACTION)/);

  // Fallback to subject line parsing
  if (!partstatMatch) {
    if (subject.toLowerCase().includes('accepted')) partstat = 'ACCEPTED';
    // ... other fallbacks
  }

  return { eventUid, partstat };
}
```

**Supports both UID formats**:
- `event-{id}@meatup.club` (current)
- `event-{id}-{timestamp}@meatup.club` (legacy, for backward compatibility)

### Database Schema

**Table**: `rsvps`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| event_id | INTEGER | Foreign key to events |
| user_id | INTEGER | Foreign key to users |
| status | TEXT | RSVP status (yes/no/maybe) |
| comments | TEXT | Optional user comments |
| updated_via_calendar | INTEGER | Flag: 1 if last update came from calendar, 0 if from website |
| created_at | DATETIME | Timestamp |

**Migration**: Added `updated_via_calendar` column

```sql
ALTER TABLE rsvps ADD COLUMN updated_via_calendar INTEGER DEFAULT 0;
```

## Resend Email Setup

### Prerequisites

- Resend account with verified domain (`mail.meatup.club`)
- Resend API key stored in `RESEND_API_KEY` environment variable
- Admin access to Meatup.Club

### Automated Setup

The system provides an admin UI for one-click Resend configuration.

**Access**: https://meatup.club/dashboard/admin/setup

#### What It Does

1. Fetches verified domains from Resend API
2. Locates `mail.meatup.club` domain
3. Creates inbound email route:
   - **Email address**: `rsvp@mail.meatup.club`
   - **Forwards to**: `https://meatup.club/api/webhooks/email-rsvp`
4. Handles existing routes (updates or recreates as needed)

#### Implementation

**UI**: `/app/routes/dashboard.admin.setup.tsx`

**API Endpoint**: `/app/routes/api.admin.setup-resend.tsx`

```typescript
export async function action({ request, context }: Route.ActionArgs) {
  const resendApiKey = context.cloudflare.env.RESEND_API_KEY;

  // Get domains
  const domainsResponse = await fetch('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${resendApiKey}` },
  });

  // Create inbound route
  await fetch(`https://api.resend.com/domains/${domain.id}/inbound-routes`, {
    method: 'POST',
    body: JSON.stringify({
      pattern: 'rsvp',
      forward_to: 'https://meatup.club/api/webhooks/email-rsvp',
    }),
  });
}
```

### Manual Setup (Alternative)

If automated setup fails, configure manually in Resend dashboard:

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Select `mail.meatup.club` domain
3. Navigate to "Inbound" tab
4. Create new inbound route:
   - Pattern: `rsvp`
   - Forward to: `https://meatup.club/api/webhooks/email-rsvp`

## Event Creation Workflow

When an admin creates a new event with calendar invites:

1. Admin fills out event form:
   - Restaurant name
   - Restaurant address
   - Event date
   - Event time (default: 18:00)
   - ✅ "Send calendar invites" checkbox
2. Event is created in database
3. If "Send calendar invites" is checked:
   - Fetch all active users' emails
   - Generate personalized .ics file for each user
   - Send email with calendar attachment via Resend
   - Processing happens in background using `ctx.waitUntil()` on Cloudflare Workers

**Implementation**: `dashboard.admin.events.tsx` lines 77-142

```typescript
if (send_invites && eventId) {
  const { sendEventInvites } = await import('../lib/email.server');

  const invitePromise = sendEventInvites({
    eventId: Number(eventId),
    restaurantName,
    restaurantAddress,
    eventDate,
    eventTime,
    recipientEmails,
    resendApiKey,
  });

  // Background processing (non-blocking)
  if (context.cloudflare.ctx?.waitUntil) {
    context.cloudflare.ctx.waitUntil(invitePromise);
  }
}
```

## Background Processing

Calendar operations use Cloudflare Workers' `waitUntil()` for non-blocking execution:

```typescript
const updatePromise = sendCalendarUpdate({ /* ... */ });

if (context.cloudflare.ctx?.waitUntil) {
  context.cloudflare.ctx.waitUntil(updatePromise);
} else {
  await updatePromise; // Fallback for non-Workers environments
}
```

**Benefits**:
- User doesn't wait for email delivery
- Faster page responses
- Email errors don't block user actions

## Error Handling

### Calendar Generation
- Validates date formats
- Provides default values for optional fields
- Logs generation errors

### Email Delivery
- Catches and logs Resend API errors
- Returns success/error status
- Counts successful sends

### Webhook Processing
- Validates email payload type
- Handles missing user/event gracefully
- Returns appropriate HTTP status codes
- Logs all processing steps

### Resend Setup
- Checks for domain existence
- Handles existing routes
- Provides detailed error messages
- Shows available domains on failure

## Testing Calendar Sync

### Test Outbound (Website → Calendar)

1. Create event as admin with "Send calendar invites" checked
2. Check email for calendar invite
3. Add to your calendar application
4. Verify event appears correctly

### Test Inbound (Calendar → Website)

1. Open calendar invite in calendar app
2. Change RSVP status (Accept/Decline/Tentative)
3. Calendar app sends response email
4. Check database for updated RSVP:
   ```sql
   SELECT * FROM rsvps WHERE user_id = ? AND event_id = ?;
   ```
5. Verify `updated_via_calendar = 1`

### Test Two-Way Sync

1. Accept invite in calendar app → Check website shows "Yes"
2. Change to "No" on website → Check calendar app updates
3. Change to "Maybe" in calendar app → Check website updates

## Security Considerations

### Webhook Authentication

Currently, the webhook endpoint is public. Resend supports webhook signatures for verification. Consider adding:

```typescript
// Future enhancement
const signature = request.headers.get('svix-signature');
const isValid = verifyWebhookSignature(payload, signature, WEBHOOK_SECRET);
if (!isValid) {
  return Response.json({ error: 'Invalid signature' }, { status: 401 });
}
```

### Email Validation

- User email must exist in database
- Event must exist in database
- Only processes `email.received` webhook events
- Extracts email safely with regex

### Admin-Only Setup

Resend configuration requires admin authentication:
```typescript
await requireAdmin(request, context);
```

## Future Enhancements

### Potential Improvements

1. **Webhook Signature Verification** - Add Svix signature validation
2. **Calendar Cancellations** - Send CANCEL method when events are deleted
3. **Event Updates** - Notify attendees when event details change
4. **Time Zone Support** - Detect user time zones for personalized times
5. **Recurring Events** - Support quarterly recurrence rules
6. **Attachment Photos** - Include restaurant photos in calendar invites
7. **Rich Text Descriptions** - Add formatting to event descriptions
8. **RSVP Comments** - Include user comments in calendar responses
9. **Reply Tracking** - Track email delivery and open rates via Resend
10. **Conflict Detection** - Warn users about calendar conflicts

### Database Enhancements

Consider adding:
- `calendar_sync_enabled` user preference flag
- `last_calendar_sync` timestamp tracking
- `calendar_response_email_id` for Resend email tracking

## Troubleshooting

### Calendar Invites Not Received

1. Check Resend dashboard for delivery status
2. Verify sender email (`events@mail.meatup.club`) is from verified domain
3. Check recipient spam folder
4. Verify `RESEND_API_KEY` is set correctly

### RSVP Responses Not Processing

1. Check Resend inbound route exists: `rsvp@mail.meatup.club` → webhook
2. Verify webhook URL is correct and accessible
3. Check webhook logs in Cloudflare Workers
4. Verify user exists in database with matching email
5. Confirm event UID format matches expected pattern

### Calendar Updates Not Syncing

1. Verify UID is stable (no timestamp)
2. Check SEQUENCE number incremented
3. Confirm email was delivered to user
4. Calendar app must support .ics updates (most do)
5. Some apps require manual refresh

### Resend Setup Fails

1. Verify API key has correct permissions
2. Check domain is verified in Resend
3. Ensure domain name matches exactly (`mail.meatup.club`)
4. Review error details in setup response
5. Try manual configuration as fallback

## References

- [RFC 5545 - iCalendar](https://tools.ietf.org/html/rfc5545)
- [Resend API Documentation](https://resend.com/docs/api-reference/introduction)
- [Resend Inbound Routing](https://resend.com/docs/dashboard/domains/inbound-routing)
- [Cloudflare Workers waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)
