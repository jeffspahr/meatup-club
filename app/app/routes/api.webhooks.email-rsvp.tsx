import type { AppLoadContext } from "react-router";
import { Webhook } from "svix";
import { upsertRsvp } from "../lib/rsvps.server";

/**
 * Webhook handler for inbound emails from Resend
 * Parses calendar RSVP responses and updates the database
 */
export async function action({ request, context }: { request: Request; context: AppLoadContext }) {
  const db = context.cloudflare.env.DB;

  try {
    // Verify webhook signature
    const webhookSecret = context.cloudflare.env.RESEND_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET not configured');
      return Response.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    // Get the raw body and headers for verification
    const body = await request.text();
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('Missing Svix headers');
      return Response.json(
        { error: 'Missing signature headers' },
        { status: 401 }
      );
    }

    // Verify the webhook signature
    const wh = new Webhook(webhookSecret);
    let payload;

    try {
      payload = wh.verify(body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as any;
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return Response.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    console.log('Received email webhook:', {
      type: payload.type,
      from: payload.from,
      subject: payload.subject,
    });

    // Only process email.received events
    if (payload.type !== 'email.received') {
      return Response.json({ message: 'Ignored: not an email.received event' });
    }

    const { from, subject, text, html } = payload.data;

    // Parse the email content to extract calendar RSVP
    const rsvpData = parseCalendarRSVP({ subject, text, html });

    if (!rsvpData) {
      console.log('No calendar RSVP data found in email');
      return Response.json({ message: 'No RSVP data found' });
    }

    console.log('Parsed RSVP data:', rsvpData);

    // Extract email address from "Name <email@domain.com>" format
    const emailMatch = from.match(/<([^>]+)>/) || [null, from];
    const userEmail = emailMatch[1].toLowerCase();

    // Find the user
    const user = await db
      .prepare('SELECT id, email, name FROM users WHERE LOWER(email) = ?')
      .bind(userEmail)
      .first();

    if (!user) {
      console.log(`User not found for email: ${userEmail}`);
      return Response.json({
        message: 'User not found',
        email: userEmail
      }, { status: 404 });
    }

    // Extract event ID from UID (format: event-{id}@meatup.club or event-{id}-{timestamp}@meatup.club)
    const uidMatch = rsvpData.eventUid.match(/^event-(\d+)(?:-\d+)?@/);
    if (!uidMatch) {
      console.log(`Invalid event UID format: ${rsvpData.eventUid}`);
      return Response.json({
        message: 'Invalid event UID format',
        uid: rsvpData.eventUid
      }, { status: 400 });
    }

    let eventId = parseInt(uidMatch[1]);
    const originalEventId = eventId;

    // Verify event exists
    let event = await db
      .prepare('SELECT id, restaurant_name, event_date FROM events WHERE id = ?')
      .bind(eventId)
      .first();

    if (!event) {
      const aliasedEventId = await resolveCanonicalEventId(db, originalEventId);
      if (aliasedEventId !== originalEventId) {
        eventId = aliasedEventId;
        console.log(`Redirecting RSVP from event ${originalEventId} to event ${eventId}`);
        event = await db
          .prepare('SELECT id, restaurant_name, event_date FROM events WHERE id = ?')
          .bind(eventId)
          .first();
      }
    }

    if (!event) {
      console.log(`Event not found: ${eventId}`);
      return Response.json({
        message: 'Event not found',
        eventId: originalEventId
      }, { status: 404 });
    }

    // Map calendar PARTSTAT to RSVP status
    const statusMap: Record<string, string> = {
      'ACCEPTED': 'yes',
      'DECLINED': 'no',
      'TENTATIVE': 'maybe',
      'NEEDS-ACTION': 'maybe',
    };

    const rsvpStatus = statusMap[rsvpData.partstat] || 'maybe';

    const result = await upsertRsvp({
      db,
      eventId,
      userId: user.id as number,
      status: rsvpStatus,
      updatedViaCalendar: true,
    });
    console.log(`${result === 'created' ? 'Created' : 'Updated'} RSVP for user ${user.email} as "${rsvpStatus}"`);

    return Response.json({
      success: true,
      message: 'RSVP updated successfully',
      data: {
        user: user.email,
        event: event.restaurant_name,
        status: rsvpStatus,
      },
    });

  } catch (error) {
    console.error('Email webhook error:', error);
    return Response.json(
      {
        success: false,
        error: 'Failed to process email webhook',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

async function resolveCanonicalEventId(db: any, eventId: number): Promise<number> {
  try {
    const alias = await db
      .prepare('SELECT canonical_event_id FROM event_aliases WHERE alias_event_id = ?')
      .bind(eventId)
      .first();

    if (alias?.canonical_event_id) {
      return Number(alias.canonical_event_id);
    }

    return eventId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('no such table')) {
      console.error('Failed to resolve event alias:', error);
    }
    return eventId;
  }
}

/**
 * Parse calendar RSVP data from email content
 * Exported for testing
 */
export function parseCalendarRSVP({
  subject,
  text,
  html
}: {
  subject: string;
  text: string;
  html?: string;
}): { eventUid: string; partstat: string } | null {
  // Look for calendar data in text or HTML
  const content = text + (html || '');

  // Extract UID (unique event identifier)
  // Support both formats: event-{id}@meatup.club and event-{id}-{timestamp}@meatup.club
  const uidMatch = content.match(/UID:(event-\d+(?:-\d+)?@meatup\.club)/);
  if (!uidMatch) {
    return null;
  }

  const eventUid = uidMatch[1];

  // Extract PARTSTAT (participation status)
  // Common values: ACCEPTED, DECLINED, TENTATIVE, NEEDS-ACTION
  const partstatMatch = content.match(/PARTSTAT:(ACCEPTED|DECLINED|TENTATIVE|NEEDS-ACTION)/);

  // Also check subject line for common RSVP indicators
  let partstat = partstatMatch ? partstatMatch[1] : 'NEEDS-ACTION';

  if (!partstatMatch) {
    const subjectLower = subject.toLowerCase();
    if (subjectLower.includes('accepted') || subjectLower.includes('accept')) {
      partstat = 'ACCEPTED';
    } else if (subjectLower.includes('declined') || subjectLower.includes('decline')) {
      partstat = 'DECLINED';
    } else if (subjectLower.includes('tentative') || subjectLower.includes('maybe')) {
      partstat = 'TENTATIVE';
    }
  }

  return { eventUid, partstat };
}
