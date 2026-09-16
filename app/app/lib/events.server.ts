import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import type { AuthUser } from "./auth.server";
import { isValidCalendarDate } from "./date-validation";

const EVENT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface EditableEvent {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string | null;
  status: string;
  calendar_sequence: number | null;
  created_by: number | null;
}

export interface EventMutationInput {
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime: string;
  status: "upcoming" | "cancelled";
}

function getTrimmedString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseEventMutationFormData(
  formData: FormData,
  options: { allowCancelled?: boolean } = {}
): { error?: string; value?: EventMutationInput } {
  const restaurantName = getTrimmedString(formData.get("restaurant_name"));
  const restaurantAddress = getTrimmedString(formData.get("restaurant_address")) || null;
  const eventDate = getTrimmedString(formData.get("event_date"));
  const rawEventTime = getTrimmedString(formData.get("event_time"));
  const eventTime = rawEventTime || "18:00";
  const requestedStatus = getTrimmedString(formData.get("status"));
  const status =
    options.allowCancelled && requestedStatus === "cancelled" ? "cancelled" : "upcoming";

  if (!restaurantName) {
    return { error: "Select a restaurant from Google Places." };
  }

  if (!isValidCalendarDate(eventDate)) {
    return { error: "A valid event date is required." };
  }

  if (!EVENT_TIME_PATTERN.test(eventTime)) {
    return { error: "A valid event time is required." };
  }

  return {
    value: {
      restaurantName,
      restaurantAddress,
      eventDate,
      eventTime,
      status,
    },
  };
}

export function canEditEvent(
  user: Pick<AuthUser, "id" | "is_admin">,
  event: Pick<EditableEvent, "created_by">
): boolean {
  return user.is_admin === 1 || (event.created_by !== null && event.created_by === user.id);
}

export async function createEvent(
  db: any,
  input: EventMutationInput,
  createdBy: number | null
): Promise<number> {
  const result = await buildCreateEventStatement(db, input, createdBy).run();

  return Number(result.meta.last_row_id);
}

export function buildCreateEventStatement(
  db: D1Database,
  input: EventMutationInput,
  createdBy: number | null
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT INTO events (
        restaurant_name,
        restaurant_address,
        event_date,
        event_time,
        status,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.restaurantName,
      input.restaurantAddress,
      input.eventDate,
      input.eventTime,
      input.status,
      createdBy
    );
}

export function buildCreateEventStatementForActivePoll(
  db: D1Database,
  params: {
    input: EventMutationInput;
    createdBy: number | null;
    pollId: number;
  }
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT INTO events (
        restaurant_name,
        restaurant_address,
        event_date,
        event_time,
        status,
        created_by
      )
      SELECT ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM polls
        WHERE id = ? AND status = 'active'
      )
    `)
    .bind(
      params.input.restaurantName,
      params.input.restaurantAddress,
      params.input.eventDate,
      params.input.eventTime,
      params.input.status,
      params.createdBy,
      params.pollId
    );
}

export function buildSelectLastInsertedEventIdStatement(
  db: D1Database
): D1PreparedStatement {
  return db.prepare(`
    SELECT last_insert_rowid() AS id
  `);
}

export function getInsertedEventIdFromQueryResult(
  result: D1Result<{ id: number }>
): number | null {
  const row = ((result.results || []) as Array<{ id: number }>)[0];
  if (!row) {
    return null;
  }

  const eventId = Number(row.id);
  return Number.isInteger(eventId) && eventId > 0 ? eventId : null;
}

export async function getEditableEventById(
  db: any,
  eventId: number
): Promise<EditableEvent | null> {
  return (await db
    .prepare(`
      SELECT
        id,
        restaurant_name,
        restaurant_address,
        event_date,
        event_time,
        status,
        calendar_sequence,
        created_by
      FROM events
      WHERE id = ?
    `)
    .bind(eventId)
    .first()) as EditableEvent | null;
}

export async function updateEvent(
  db: any,
  eventId: number,
  input: EventMutationInput
): Promise<void> {
  await db
    .prepare(`
      UPDATE events
      SET restaurant_name = ?,
          restaurant_address = ?,
          event_date = ?,
          event_time = ?,
          status = ?,
          calendar_sequence = COALESCE(calendar_sequence, 0) + 1
      WHERE id = ?
    `)
    .bind(
      input.restaurantName,
      input.restaurantAddress,
      input.eventDate,
      input.eventTime,
      input.status,
      eventId
    )
    .run();
}

export function buildUpdateEventStatement(
  db: D1Database,
  eventId: number,
  input: EventMutationInput,
  calendarSequence: number
): D1PreparedStatement {
  return db
    .prepare(`
      UPDATE events
      SET restaurant_name = ?,
          restaurant_address = ?,
          event_date = ?,
          event_time = ?,
          status = ?,
          calendar_sequence = ?
      WHERE id = ? AND COALESCE(calendar_sequence, 0) = ?
    `)
    .bind(
      input.restaurantName,
      input.restaurantAddress,
      input.eventDate,
      input.eventTime,
      input.status,
      calendarSequence,
      eventId,
      calendarSequence - 1
    );
}

export function buildDeleteEventStatement(
  db: D1Database,
  eventId: number,
  expectedCalendarSequence?: number
): D1PreparedStatement {
  return db
    .prepare(`
      DELETE FROM events
      WHERE id = ?
        ${expectedCalendarSequence === undefined ? "" : "AND COALESCE(calendar_sequence, 0) = ?"}
    `)
    .bind(...(expectedCalendarSequence === undefined ? [eventId] : [eventId, expectedCalendarSequence]));
}

export async function incrementEventCalendarSequence(
  db: any,
  eventId: number
): Promise<void> {
  await db
    .prepare(`
      UPDATE events
      SET calendar_sequence = COALESCE(calendar_sequence, 0) + 1
      WHERE id = ?
    `)
    .bind(eventId)
    .run();
}
