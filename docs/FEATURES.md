# Meatup.Club Feature Slideshow

A visual guide to the Meatup.Club quarterly steakhouse meetup platform.

---

## 1. Landing Page

![Landing Page](screenshots/01-landing.png)

The public landing page showcases the club's mission:
- **Steakhouse nights, four times a year** - Quarterly dinner meetups
- **Member-voted venues** - Democratic restaurant selection
- **RSVP by web or text** - Multiple response channels
- Key stats: 4x dinners/year, 100% member voted, <60s average RSVP

---

## 2. Member Flow Overview

![Member Flow](screenshots/02-landing-features.png)

The landing page explains the member experience:
- **Vote** - Suggest restaurants and dates
- **Confirm** - RSVP via web, calendar, or SMS
- **Minimal overhead** - Two reminders, one tap, no noise

---

## 3. Dashboard Home

![Dashboard](screenshots/03-dashboard.png)

The main dashboard provides:
- Personalized welcome message
- About section with club details
- Active poll status indicator
- Quick actions for common tasks

---

## 4. Quick Actions

![Quick Actions](screenshots/04-quick-actions.png)

One-click access to key features:
- **Restaurants** - Browse and add steakhouses
- **Events** - View past and upcoming meetups
- **Members** - See active club members
- **Admin Panel** - Manage the club (admin only)

---

## 5. Events Page

![Events](screenshots/05-events.png)

View upcoming and past meetups:
- **Upcoming Events** - Next scheduled dinners
- **Past Events** - History of completed meetups
- Event details include restaurant, address, date/time

---

## 6. Restaurants Page

![Restaurants](screenshots/06-restaurants.png)

Browse the curated restaurant collection:
- Restaurant photos and ratings
- Cuisine type and price level
- Address and contact info
- Google Maps integration
- Member who suggested each venue

---

## 7. Polls Page

![Polls](screenshots/07-polls.png)

Vote on the next meetup location and date:
- **Active Polls** - Cast your vote
- **Previous Polls** - View past results
- Poll winners become scheduled events

---

## 8. Members Directory

![Members](screenshots/08-members.png)

View all active club members:
- Member profiles with photos
- Admin badge indicators
- Quick contact information
- Total member count

---

## 9. Profile & Settings

![Profile](screenshots/09-profile.png)

Manage your account preferences:
- **Account Information** - View synced Google profile
- **Email Notifications** - Toggle comment replies, poll updates, event updates
- **SMS Reminders** - Configure text message alerts

---

## 10. Admin Panel

![Admin Panel](screenshots/10-admin.png)

Administrative controls for club managers:
- **Polls** - Create/close voting polls
- **Events** - Manage meetup schedule
- **Members** - Invite/remove members, manage roles
- **Content** - Edit club description and guidelines
- **Email Templates** - Customize invitation emails
- **Analytics** - Track user engagement

---

## Screenshot Guidelines

### PII Redaction Required

The following screenshots contain personally identifiable information that must be obfuscated:

| Screenshot | PII to Redact |
|------------|---------------|
| 03-dashboard.png | User's first name in welcome message |
| 06-restaurants.png | "Suggested by [Name]" attribution |
| 08-members.png | All member names, emails, and profile photos |
| 09-profile.png | User's name, email address |

### Recommended Redaction

1. Use a solid color block (e.g., gray #666) to cover names
2. Replace emails with `member@example.com` format
3. Replace profile photos with generic avatars
4. Use placeholder names like "Member A", "Member B"

---

## Technical Stack

- **Framework**: React Router 7 (Cloudflare Pages)
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Google OAuth
- **Hosting**: Cloudflare Pages
- **SMS**: Twilio integration
- **Email**: Resend API
