/**
 * Server-side utilities for RSVP operations.
 *
 * Centralises the upsert-or-insert pattern that was previously
 * duplicated across dashboard.events, api.webhooks.sms, and
 * api.webhooks.email-rsvp.
 */

export interface UpsertRsvpParams {
  db: any;
  eventId: number;
  userId: number;
  status: string;
  comments?: string | null;
  updatedViaCalendar?: boolean;
}

/**
 * Insert or update an RSVP for a user/event pair.
 * Returns `'created'` or `'updated'` so callers can log the right activity type.
 */
export async function upsertRsvp({
  db,
  eventId,
  userId,
  status,
  comments,
  updatedViaCalendar = false,
}: UpsertRsvpParams): Promise<"created" | "updated"> {
  const existing = await db
    .prepare("SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?")
    .bind(eventId, userId)
    .first();

  const calendarClause = updatedViaCalendar ? ", updated_via_calendar = 1" : "";
  const commentsClause = comments !== undefined ? ", comments = excluded.comments" : "";

  // The read above is only for the activity label. Resolve races at the unique
  // key so two first responses cannot both attempt a plain insert.
  await db
    .prepare(`
      INSERT INTO rsvps (event_id, user_id, status, comments, admin_override, updated_via_calendar)
      VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(event_id, user_id) DO UPDATE SET
        status = excluded.status,
        admin_override = 0,
        admin_override_by = NULL,
        admin_override_at = NULL${calendarClause}${commentsClause}
    `)
    .bind(eventId, userId, status, comments ?? null, updatedViaCalendar ? 1 : 0)
    .run();
  return existing ? "updated" : "created";
}
