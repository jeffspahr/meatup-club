/**
 * Server-side utilities for poll and vote leader data
 */

import type { VoteLeader, DateLeader, VoteLeaders } from "./types";

type PollWriteResult<T = Record<string, unknown>> = {
  meta?: {
    changes?: number;
    last_row_id?: number;
  };
  results?: T[];
};

type PollPreparedStatement = {
  bind(...values: unknown[]): PollPreparedStatement;
  run(): Promise<PollWriteResult>;
  first(): Promise<Record<string, unknown> | null>;
};

type PollWriteSession = {
  prepare(query: string): PollPreparedStatement;
  batch(statements: PollPreparedStatement[]): Promise<PollWriteResult[]>;
};

type PollWriteDatabase = PollWriteSession & {
  withSession?: (constraintOrBookmark?: "first-primary" | "first-unconstrained" | string) => PollWriteSession;
};

type ClosePollEventPayload = {
  restaurantName: string;
  restaurantAddress: string | null;
  eventDate: string;
  eventTime: string;
};

export type ClosePollParams = {
  db: PollWriteDatabase;
  pollId: number;
  closedByUserId: number;
  winningRestaurantId: number | null;
  winningDateId: number | null;
  event: ClosePollEventPayload | null;
};

export type ClosePollResult =
  | {
      ok: true;
      eventId: number | null;
    }
  | {
      ok: false;
      reason: "conflict";
    };

const CREATE_EVENT_FOR_ACTIVE_POLL_SQL = `
  INSERT INTO events (restaurant_name, restaurant_address, event_date, event_time, status)
  SELECT ?, ?, ?, ?, 'upcoming'
  WHERE EXISTS (SELECT 1 FROM polls WHERE id = ? AND status = 'active')
`;

function getPollWriteSession(db: PollWriteDatabase): PollWriteSession {
  return db.withSession?.("first-primary") ?? db;
}

function buildClosePollStatement(
  session: PollWriteSession,
  {
    closedByUserId,
    pollId,
    winningRestaurantId,
    winningDateId,
  }: Pick<ClosePollParams, "closedByUserId" | "pollId" | "winningRestaurantId" | "winningDateId">,
  createdEventExpression: "NULL" | "last_insert_rowid()"
) {
  return session
    .prepare(`
      UPDATE polls
      SET status = 'closed',
          closed_by = ?,
          closed_at = CURRENT_TIMESTAMP,
          winning_restaurant_id = ?,
          winning_date_id = ?,
          created_event_id = ${createdEventExpression}
      WHERE id = ? AND status = 'active'
    `)
    .bind(closedByUserId, winningRestaurantId, winningDateId, pollId);
}

export async function closePoll({
  db,
  pollId,
  closedByUserId,
  winningRestaurantId,
  winningDateId,
  event,
}: ClosePollParams): Promise<ClosePollResult> {
  const session = getPollWriteSession(db);

  if (!event) {
    const closeResult = await buildClosePollStatement(
      session,
      {
        closedByUserId,
        pollId,
        winningRestaurantId,
        winningDateId,
      },
      "NULL"
    ).run();

    if ((closeResult.meta?.changes ?? 0) === 0) {
      return { ok: false, reason: "conflict" };
    }

    return { ok: true, eventId: null };
  }

  const closeStatements = [
    session
      .prepare(CREATE_EVENT_FOR_ACTIVE_POLL_SQL)
      .bind(
        event.restaurantName,
        event.restaurantAddress,
        event.eventDate,
        event.eventTime,
        pollId
      ),
    buildClosePollStatement(
      session,
      {
        closedByUserId,
        pollId,
        winningRestaurantId,
        winningDateId,
      },
      "last_insert_rowid()"
    ),
  ];

  const [, closeResult] = await session.batch(closeStatements);

  if ((closeResult.meta?.changes ?? 0) === 0) {
    return { ok: false, reason: "conflict" };
  }

  const closedPoll = await session
    .prepare("SELECT created_event_id FROM polls WHERE id = ?")
    .bind(pollId)
    .first() as { created_event_id: number | null } | null;

  return {
    ok: true,
    eventId: closedPoll?.created_event_id ?? null,
  };
}

/**
 * Fetches vote leaders for the active poll
 *
 * IMPORTANT: This is the single source of truth for vote leader queries.
 * Both admin pages use this to ensure consistent data.
 *
 * @param db - D1 database instance
 * @returns Vote leaders for the active poll
 */
export async function getActivePollLeaders(db: any): Promise<VoteLeaders> {
  // Get active poll
  const activePoll = await db
    .prepare(`
      SELECT * FROM polls
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first();

  let topRestaurant = null;
  let topDate = null;

  if (activePoll) {
    // Fetch top restaurant for active poll
    // All restaurants are available in all polls (unless explicitly excluded)
    topRestaurant = await db
      .prepare(`
        SELECT
          r.id,
          r.name,
          r.address,
          COUNT(rv.user_id) as vote_count
        FROM restaurants r
        LEFT JOIN restaurant_votes rv ON rv.restaurant_id = r.id AND rv.poll_id = ?
        LEFT JOIN poll_excluded_restaurants per ON per.restaurant_id = r.id AND per.poll_id = ?
        WHERE per.id IS NULL
        GROUP BY r.id
        HAVING vote_count > 0
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind(activePoll.id, activePoll.id)
      .first();

    // Fetch top date for active poll
    topDate = await db
      .prepare(`
        SELECT
          ds.id,
          ds.suggested_date,
          COUNT(dv.id) as vote_count
        FROM date_suggestions ds
        LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id
        WHERE ds.poll_id = ?
        GROUP BY ds.id
        HAVING vote_count > 0
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind(activePoll.id)
      .first();
  }

  return {
    topRestaurant: topRestaurant || null,
    topDate: topDate || null,
    activePoll: activePoll || null,
  };
}
