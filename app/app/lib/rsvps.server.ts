import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types"

export type RsvpSource =
  | "website"
  | "calendar_email"
  | "sms"
  | "admin_override"
  | "poll_default"

interface ExistingRsvpRow {
  id: number
  status: string
  comments: string | null
  admin_override: number
}

export interface UpsertRsvpParams {
  db: D1Database
  eventId: number
  userId: number
  status: string
  comments?: string | null
  source: RsvpSource
  actorUserId?: number | null
  adminOverride?: boolean
}

export interface UpsertRsvpResult {
  mutation: "created" | "updated" | "noop"
  previousStatus: string | null
  status: string
  previousComments: string | null
  comments: string | null
  previousAdminOverride: number
  adminOverride: number
  statusChanged: boolean
  commentsChanged: boolean
  adminOverrideChanged: boolean
}

async function executeStatements(
  db: Pick<D1Database, "batch">,
  statements: D1PreparedStatement[]
): Promise<void> {
  if (typeof db.batch === "function") {
    await db.batch(statements)
    return
  }

  for (const statement of statements) {
    await statement.run()
  }
}

function toOverrideFlag(value: boolean | undefined): number {
  return value ? 1 : 0
}

function normalizeNullableText(value: string | null | undefined): string | null {
  return value ?? null
}

/**
 * Insert or update an RSVP for a user/event pair and append an audit event when
 * the effective current-state row changes.
 */
export async function upsertRsvp({
  db,
  eventId,
  userId,
  status,
  comments,
  source,
  actorUserId,
  adminOverride = false,
}: UpsertRsvpParams): Promise<UpsertRsvpResult> {
  const existing = (await db
    .prepare(
      "SELECT id, status, comments, admin_override FROM rsvps WHERE event_id = ? AND user_id = ?"
    )
    .bind(eventId, userId)
    .first()) as ExistingRsvpRow | null

  const previousStatus = existing?.status ?? null
  const previousComments = normalizeNullableText(existing?.comments)
  const previousAdminOverride = Number(existing?.admin_override ?? 0)

  const nextComments =
    comments !== undefined ? normalizeNullableText(comments) : previousComments
  const nextAdminOverride = toOverrideFlag(adminOverride)

  const statusChanged = previousStatus !== status
  const commentsChanged = previousComments !== nextComments
  const adminOverrideChanged = previousAdminOverride !== nextAdminOverride

  if (existing && !statusChanged && !commentsChanged && !adminOverrideChanged) {
    return {
      mutation: "noop",
      previousStatus,
      status,
      previousComments,
      comments: nextComments,
      previousAdminOverride,
      adminOverride: nextAdminOverride,
      statusChanged,
      commentsChanged,
      adminOverrideChanged,
    }
  }

  const resolvedActorUserId = actorUserId ?? null
  const auditStatement = db
    .prepare(
      `
        INSERT INTO rsvp_events (
          event_id,
          user_id,
          actor_user_id,
          source,
          previous_status,
          new_status,
          previous_comments,
          new_comments,
          previous_admin_override,
          new_admin_override
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      eventId,
      userId,
      resolvedActorUserId,
      source,
      previousStatus,
      status,
      previousComments,
      nextComments,
      previousAdminOverride,
      nextAdminOverride
    )

  if (existing) {
    const updateStatement = db
      .prepare(
        `
          UPDATE rsvps
          SET status = ?,
              comments = ?,
              admin_override = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE event_id = ? AND user_id = ?
        `
      )
      .bind(status, nextComments, nextAdminOverride, eventId, userId)

    await executeStatements(db, [updateStatement, auditStatement])

    return {
      mutation: "updated",
      previousStatus,
      status,
      previousComments,
      comments: nextComments,
      previousAdminOverride,
      adminOverride: nextAdminOverride,
      statusChanged,
      commentsChanged,
      adminOverrideChanged,
    }
  }

  const insertStatement = db
    .prepare(
      `
        INSERT INTO rsvps (event_id, user_id, status, comments, admin_override)
        VALUES (?, ?, ?, ?, ?)
      `
    )
    .bind(eventId, userId, status, nextComments, nextAdminOverride)

  await executeStatements(db, [insertStatement, auditStatement])

  return {
    mutation: "created",
    previousStatus,
    status,
    previousComments,
    comments: nextComments,
    previousAdminOverride,
    adminOverride: nextAdminOverride,
    statusChanged,
    commentsChanged,
    adminOverrideChanged,
  }
}

export function buildSeedPollDefaultRsvpsStatement(
  db: D1Database,
  params: {
    pollId: number
    dateSuggestionId: number
  }
): D1PreparedStatement {
  return db
    .prepare(
      `
        INSERT INTO rsvps (event_id, user_id, status, comments, admin_override)
        SELECT
          p.created_event_id,
          dv.user_id,
          'yes',
          NULL,
          0
        FROM polls p
        JOIN date_votes dv
          ON dv.poll_id = p.id
         AND dv.date_suggestion_id = ?
        JOIN users u
          ON u.id = dv.user_id
        WHERE p.id = ?
          AND p.created_event_id IS NOT NULL
          AND u.status = 'active'
      `
    )
    .bind(params.dateSuggestionId, params.pollId)
}

export function buildSeedPollDefaultRsvpEventsStatement(
  db: D1Database,
  params: {
    pollId: number
    dateSuggestionId: number
    actorUserId: number
  }
): D1PreparedStatement {
  return db
    .prepare(
      `
        INSERT INTO rsvp_events (
          event_id,
          user_id,
          actor_user_id,
          source,
          previous_status,
          new_status,
          previous_comments,
          new_comments,
          previous_admin_override,
          new_admin_override
        )
        SELECT
          p.created_event_id,
          dv.user_id,
          ?,
          'poll_default',
          NULL,
          'yes',
          NULL,
          NULL,
          0,
          0
        FROM polls p
        JOIN date_votes dv
          ON dv.poll_id = p.id
         AND dv.date_suggestion_id = ?
        JOIN users u
          ON u.id = dv.user_id
        WHERE p.id = ?
          AND p.created_event_id IS NOT NULL
          AND u.status = 'active'
      `
    )
    .bind(params.actorUserId, params.dateSuggestionId, params.pollId)
}
