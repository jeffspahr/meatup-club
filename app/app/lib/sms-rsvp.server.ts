import type { D1Database } from "@cloudflare/workers-types";

/** Commit the reply and its receipt together so a failed write remains retryable. */
export async function persistSmsRsvp({
  db,
  deliveryId,
  eventId,
  userId,
  status,
}: {
  db: D1Database;
  deliveryId?: string;
  eventId: number;
  userId: number;
  status: "yes" | "no";
}): Promise<boolean> {
  const upsert = db.prepare(`
    INSERT INTO rsvps (event_id, user_id, status, admin_override, updated_via_calendar)
    SELECT ?, ?, ?, 0, 0 WHERE ${deliveryId ? "changes() > 0" : "1"}
    ON CONFLICT(event_id, user_id) DO UPDATE SET
      status = excluded.status,
      admin_override = 0,
      admin_override_by = NULL,
      admin_override_at = NULL
  `).bind(eventId, userId, status);

  if (!deliveryId) {
    await upsert.run();
    return true;
  }

  // changes() reads the receipt insert in this sequential, atomic D1 batch.
  const results = await db.batch([
    db.prepare("INSERT OR IGNORE INTO webhook_deliveries (provider, delivery_id) VALUES (?, ?)")
      .bind("twilio", deliveryId),
    upsert,
  ]);
  return results[0].meta.changes > 0;
}
