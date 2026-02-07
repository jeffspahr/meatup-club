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

  if (existing) {
    const calendarClause = updatedViaCalendar ? ", updated_via_calendar = 1" : "";
    const commentsClause = comments !== undefined ? ", comments = ?" : "";

    const sql = `UPDATE rsvps SET status = ?, admin_override = 0, admin_override_by = NULL, admin_override_at = NULL${calendarClause}${commentsClause} WHERE event_id = ? AND user_id = ?`;

    const bindings =
      comments !== undefined
        ? [status, comments, eventId, userId]
        : [status, eventId, userId];

    await db.prepare(sql).bind(...bindings).run();
    return "updated";
  }

  const calendarVal = updatedViaCalendar ? 1 : 0;
  await db
    .prepare(
      "INSERT INTO rsvps (event_id, user_id, status, admin_override, updated_via_calendar) VALUES (?, ?, ?, 0, ?)"
    )
    .bind(eventId, userId, status, calendarVal)
    .run();
  return "created";
}
