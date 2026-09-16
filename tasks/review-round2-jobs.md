# Round 2 review: notification ingress and jobs

## Scope
Reviewed the Worker scheduled and queue handlers, durable event-email staging/retries and provider callbacks, SMS reminder scheduling and delivery tracking, Resend configuration, inbound calendar attachment retrieval, and calendar RSVP persistence.

## Confirmed defect
- Calendar replies looked up members by email without requiring active membership. Signed provider delivery authenticates the notification but does not authorize inactive, pending, or invited accounts to participate.
- A signed real-SQLite regression showed all three excluded account states overwriting a stored RSVP and recording the delivery as applied.
- The user lookup now requires `status = 'active'`, matching the existing website and SMS membership boundary. Ineligible senders follow the existing unknown-user response and cannot write either the RSVP or receipt.

## Regression coverage
- Inactive, pending, and invited senders leave the RSVP and receipt table unchanged.
- Active members retain case-insensitive email matching and signed reply processing.
- Duplicate deliveries preserve subsequent RSVP changes; invalid signatures cannot write.
- Real Svix signatures and the canonical SQLite schema exercise the route and persistence together.

## Verification
All 883 tests across 106 files passed with coverage (83.88% statements). Typecheck, lint, and production build passed. The focused 76-test calendar route suite also passed. The three excluded-membership cases failed before the fix.

## Scope decisions
Event status/date eligibility and RSVP source-flag behavior remain unchanged: the website currently permits historical RSVP changes, and existing source-flag tests intentionally preserve the calendar flag. These require product intent before changing.
