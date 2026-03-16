import { describe, expect, it, vi } from "vitest"
import { upsertRsvp } from "./rsvps.server"

type MockRsvpRow = {
  id: number
  event_id: number
  user_id: number
  status: string
  comments: string | null
  admin_override: number
}

type MockRsvpEventRow = {
  event_id: number
  user_id: number
  actor_user_id: number | null
  source: string
  previous_status: string | null
  new_status: string
  previous_comments: string | null
  new_comments: string | null
  previous_admin_override: number
  new_admin_override: number
}

function createMockRsvpDb(initialRows: MockRsvpRow[] = []) {
  const rsvps = initialRows.map((row) => ({ ...row }))
  const rsvpEvents: MockRsvpEventRow[] = []

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim()

    return {
      bind: (...bindArgs: unknown[]) => ({
        first: async () => {
          if (
            normalizedSql ===
            "SELECT id, status, comments, admin_override FROM rsvps WHERE event_id = ? AND user_id = ?"
          ) {
            return (
              rsvps.find(
                (row) =>
                  row.event_id === Number(bindArgs[0]) &&
                  row.user_id === Number(bindArgs[1])
              ) ?? null
            )
          }

          throw new Error(`Unexpected first() query: ${normalizedSql}`)
        },
        run: async () => {
          if (normalizedSql.includes("INSERT INTO rsvps (event_id, user_id, status, comments, admin_override)")) {
            const [eventId, userId, status, comments, adminOverride] = bindArgs
            rsvps.push({
              id: rsvps.length + 1,
              event_id: Number(eventId),
              user_id: Number(userId),
              status: String(status),
              comments: comments === null ? null : String(comments),
              admin_override: Number(adminOverride),
            })
            return { meta: { changes: 1 } }
          }

          if (normalizedSql.includes("UPDATE rsvps SET status = ?, comments = ?, admin_override = ?, updated_at = CURRENT_TIMESTAMP")) {
            const [status, comments, adminOverride, eventId, userId] = bindArgs
            const row = rsvps.find(
              (entry) =>
                entry.event_id === Number(eventId) &&
                entry.user_id === Number(userId)
            )
            if (row) {
              row.status = String(status)
              row.comments = comments === null ? null : String(comments)
              row.admin_override = Number(adminOverride)
            }
            return { meta: { changes: row ? 1 : 0 } }
          }

          if (normalizedSql.includes("INSERT INTO rsvp_events")) {
            const [
              eventId,
              userId,
              actorUserId,
              source,
              previousStatus,
              newStatus,
              previousComments,
              newComments,
              previousAdminOverride,
              newAdminOverride,
            ] = bindArgs

            rsvpEvents.push({
              event_id: Number(eventId),
              user_id: Number(userId),
              actor_user_id: actorUserId === null ? null : Number(actorUserId),
              source: String(source),
              previous_status: previousStatus === null ? null : String(previousStatus),
              new_status: String(newStatus),
              previous_comments:
                previousComments === null ? null : String(previousComments),
              new_comments: newComments === null ? null : String(newComments),
              previous_admin_override: Number(previousAdminOverride),
              new_admin_override: Number(newAdminOverride),
            })
            return { meta: { changes: 1 } }
          }

          throw new Error(`Unexpected run() query: ${normalizedSql}`)
        },
      }),
    }
  })

  const batch = vi.fn(async (statements: Array<{ run: () => Promise<unknown> }>) => {
    const results = []
    for (const statement of statements) {
      results.push(await statement.run())
    }
    return results
  })

  return {
    prepare,
    batch,
    rsvps,
    rsvpEvents,
  }
}

describe("rsvps.server", () => {
  it("creates a new RSVP and appends an audit event", async () => {
    const db = createMockRsvpDb()

    const result = await upsertRsvp({
      db: db as never,
      eventId: 42,
      userId: 7,
      status: "yes",
      comments: "See you there",
      source: "website",
      actorUserId: 7,
    })

    expect(result).toEqual({
      mutation: "created",
      previousStatus: null,
      status: "yes",
      previousComments: null,
      comments: "See you there",
      previousAdminOverride: 0,
      adminOverride: 0,
      statusChanged: true,
      commentsChanged: true,
      adminOverrideChanged: false,
    })
    expect(db.rsvps).toEqual([
      {
        id: 1,
        event_id: 42,
        user_id: 7,
        status: "yes",
        comments: "See you there",
        admin_override: 0,
      },
    ])
    expect(db.rsvpEvents).toEqual([
      {
        event_id: 42,
        user_id: 7,
        actor_user_id: 7,
        source: "website",
        previous_status: null,
        new_status: "yes",
        previous_comments: null,
        new_comments: "See you there",
        previous_admin_override: 0,
        new_admin_override: 0,
      },
    ])
  })

  it("updates an existing RSVP, preserves comments when omitted, and clears admin override", async () => {
    const db = createMockRsvpDb([
      {
        id: 1,
        event_id: 42,
        user_id: 7,
        status: "maybe",
        comments: "Need a sitter",
        admin_override: 1,
      },
    ])

    const result = await upsertRsvp({
      db: db as never,
      eventId: 42,
      userId: 7,
      status: "no",
      source: "sms",
      actorUserId: 7,
    })

    expect(result).toEqual({
      mutation: "updated",
      previousStatus: "maybe",
      status: "no",
      previousComments: "Need a sitter",
      comments: "Need a sitter",
      previousAdminOverride: 1,
      adminOverride: 0,
      statusChanged: true,
      commentsChanged: false,
      adminOverrideChanged: true,
    })
    expect(db.rsvps[0]).toMatchObject({
      status: "no",
      comments: "Need a sitter",
      admin_override: 0,
    })
    expect(db.rsvpEvents[0]).toMatchObject({
      source: "sms",
      previous_status: "maybe",
      new_status: "no",
      previous_admin_override: 1,
      new_admin_override: 0,
    })
  })

  it("returns noop and skips audit writes when the effective RSVP state is unchanged", async () => {
    const db = createMockRsvpDb([
      {
        id: 1,
        event_id: 42,
        user_id: 7,
        status: "yes",
        comments: null,
        admin_override: 0,
      },
    ])

    const result = await upsertRsvp({
      db: db as never,
      eventId: 42,
      userId: 7,
      status: "yes",
      source: "calendar_email",
      actorUserId: 7,
    })

    expect(result.mutation).toBe("noop")
    expect(db.rsvpEvents).toEqual([])
    expect(db.batch).not.toHaveBeenCalled()
  })
})
