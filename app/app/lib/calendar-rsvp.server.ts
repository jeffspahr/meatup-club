import type { D1Database } from "@cloudflare/workers-types";

interface PersistCalendarRsvpParams {
  db: D1Database;
  deliveryId: string;
  eventId: number;
  userId: number;
  status: "yes" | "no" | "maybe";
}

/** Persist the RSVP and delivery together so failed writes remain retryable. */
export async function persistCalendarRsvp({
  db,
  deliveryId,
  eventId,
  userId,
  status,
}: PersistCalendarRsvpParams): Promise<boolean> {
  const results = await db.batch([
    db.prepare(
      "INSERT OR IGNORE INTO webhook_deliveries (provider, delivery_id) VALUES (?, ?)"
    ).bind("resend", deliveryId),
    // D1 executes this batch sequentially in one transaction. changes() refers
    // to the preceding delivery insert; a duplicate must not overwrite an RSVP.
    db.prepare(`
      INSERT INTO rsvps (event_id, user_id, status, admin_override, updated_via_calendar)
      SELECT ?, ?, ?, 0, 1 WHERE changes() > 0
      ON CONFLICT(event_id, user_id) DO UPDATE SET
        status = excluded.status,
        admin_override = 0,
        admin_override_by = NULL,
        admin_override_at = NULL,
        updated_via_calendar = 1
    `).bind(eventId, userId, status),
  ]);

  return results[0].meta.changes > 0;
}
