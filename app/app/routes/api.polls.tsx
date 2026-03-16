import type { D1Result } from "@cloudflare/workers-types";
import type { Route } from "./+types/api.polls";
import { requireActiveUser } from "../lib/auth.server";
import { buildCreateEventStatementForActivePoll } from "../lib/events.server";
import {
  buildSeedPollDefaultRsvpEventsStatement,
  buildSeedPollDefaultRsvpsStatement,
} from "../lib/rsvps.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  // Get the current active poll
  const activePoll = await db
    .prepare(`
      SELECT * FROM polls
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first();

  return Response.json({ activePoll });
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const action = formData.get('_action');

  if (action === 'create') {
    if (!user.is_admin) {
      return Response.json({ error: 'Only admins can create polls' }, { status: 403 });
    }

    const title = formData.get('title');

    if (!title) {
      return Response.json({ error: 'Poll title is required' }, { status: 400 });
    }

    // Close any existing active polls first
    await db
      .prepare(`UPDATE polls SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP WHERE status = 'active'`)
      .bind(user.id)
      .run();

    // Create new poll
    const result = await db
      .prepare(`INSERT INTO polls (title, status, created_by) VALUES (?, 'active', ?)`)
      .bind(title, user.id)
      .run();

    const newPoll = await db
      .prepare(`SELECT * FROM polls WHERE id = ?`)
      .bind(result.meta.last_row_id)
      .first();

    return Response.json({ poll: newPoll });
  }

  if (action === 'close') {
    // Only admins can close polls
    if (!user.is_admin) {
      return Response.json({ error: 'Only admins can close polls' }, { status: 403 });
    }

    const pollId = formData.get('poll_id');
    const winningRestaurantId = formData.get('winning_restaurant_id');
    const winningDateId = formData.get('winning_date_id');
    const createEvent = formData.get('create_event') === 'true';

    if (!pollId) {
      return Response.json({ error: 'Poll ID is required' }, { status: 400 });
    }

    const parsedPollId = Number(pollId);
    if (!Number.isInteger(parsedPollId) || parsedPollId <= 0) {
      return Response.json({ error: 'Invalid poll ID' }, { status: 400 });
    }

    const parsedWinningRestaurantId = winningRestaurantId
      ? Number(winningRestaurantId)
      : null;
    const parsedWinningDateId = winningDateId
      ? Number(winningDateId)
      : null;

    if (createEvent && (!parsedWinningRestaurantId || !parsedWinningDateId)) {
      return Response.json(
        { error: 'Winning restaurant and date are required to create an event' },
        { status: 400 }
      );
    }

    if (winningRestaurantId) {
      if (
        parsedWinningRestaurantId === null ||
        !Number.isInteger(parsedWinningRestaurantId) ||
        parsedWinningRestaurantId <= 0
      ) {
        return Response.json({ error: 'Invalid restaurant ID' }, { status: 400 });
      }
    }

    if (winningDateId) {
      if (
        parsedWinningDateId === null ||
        !Number.isInteger(parsedWinningDateId) ||
        parsedWinningDateId <= 0
      ) {
        return Response.json({ error: 'Invalid date ID' }, { status: 400 });
      }
    }

    const activePoll = await db
      .prepare(`SELECT id FROM polls WHERE id = ? AND status = 'active'`)
      .bind(parsedPollId)
      .first();

    if (!activePoll) {
      return Response.json({ error: 'Poll is not active or does not exist' }, { status: 400 });
    }

    if (parsedWinningDateId) {
      const dateInPoll = await db
        .prepare(`SELECT id FROM date_suggestions WHERE id = ? AND poll_id = ?`)
        .bind(parsedWinningDateId, parsedPollId)
        .first();

      if (!dateInPoll) {
        return Response.json({ error: 'Winning date must belong to the poll being closed' }, { status: 400 });
      }
    }

    let createdEventId = null;

    // If creating an event, get the winner details and create event
    if (createEvent && parsedWinningRestaurantId && parsedWinningDateId) {
      const restaurant = (await db
        .prepare(`SELECT * FROM restaurants WHERE id = ?`)
        .bind(parsedWinningRestaurantId)
        .first()) as { name: string; address: string | null } | null;

      const date = (await db
        .prepare(`SELECT * FROM date_suggestions WHERE id = ? AND poll_id = ?`)
        .bind(parsedWinningDateId, parsedPollId)
        .first()) as { suggested_date: string } | null;

      if (!restaurant || !date) {
        return Response.json(
          { error: 'Selected winning options were not found in the target poll' },
          { status: 400 }
        );
      }

      try {
        const closeResults = await db.batch([
          buildCreateEventStatementForActivePoll(db, {
            input: {
              restaurantName: restaurant.name,
              restaurantAddress: restaurant.address,
              eventDate: date.suggested_date,
              eventTime: "18:00",
              status: "upcoming",
            },
            createdBy: user.id,
            pollId: parsedPollId,
          }),
          db
            .prepare(`
              UPDATE polls
              SET status = 'closed',
                  closed_by = ?,
                  closed_at = CURRENT_TIMESTAMP,
                  winning_restaurant_id = ?,
                  winning_date_id = ?,
                  created_event_id = last_insert_rowid()
              WHERE id = ? AND status = 'active'
            `)
            .bind(
              user.id,
              parsedWinningRestaurantId,
              parsedWinningDateId,
              parsedPollId
            ),
          buildSeedPollDefaultRsvpsStatement(db, {
            pollId: parsedPollId,
            dateSuggestionId: parsedWinningDateId,
          }),
          buildSeedPollDefaultRsvpEventsStatement(db, {
            pollId: parsedPollId,
            dateSuggestionId: parsedWinningDateId,
            actorUserId: user.id,
          }),
          db
            .prepare(`
              SELECT created_event_id
              FROM polls
              WHERE id = ?
            `)
            .bind(parsedPollId),
        ]);

        const createEventResult = closeResults[0] as D1Result;
        const closeResult = closeResults[1] as D1Result;

        if (
          (createEventResult.meta?.changes ?? 0) === 0 ||
          (closeResult.meta?.changes ?? 0) === 0
        ) {
          throw new Error('Poll close failed due to concurrent status change');
        }

        const createdEventRow = (
          (closeResults[4] as D1Result<{ created_event_id: number | null }>).results || []
        )[0];
        createdEventId = Number(createdEventRow?.created_event_id ?? 0) || null;

        if (!createdEventId) {
          throw new Error('Poll close failed to persist the created event id');
        }
      } catch (error) {
        return Response.json({ error: 'Failed to close poll' }, { status: 500 });
      }
    } else {
      const closeResult = await db
        .prepare(`
          UPDATE polls
          SET status = 'closed',
              closed_by = ?,
              closed_at = CURRENT_TIMESTAMP,
              winning_restaurant_id = ?,
              winning_date_id = ?,
              created_event_id = ?
          WHERE id = ? AND status = 'active'
        `)
        .bind(
          user.id,
          parsedWinningRestaurantId,
          parsedWinningDateId,
          createdEventId,
          parsedPollId
        )
        .run();

      if ((closeResult.meta?.changes ?? 0) === 0) {
        return Response.json({ error: 'Failed to close poll' }, { status: 409 });
      }
    }

    const closedPoll = await db
      .prepare(`SELECT * FROM polls WHERE id = ?`)
      .bind(parsedPollId)
      .first();

    return Response.json({ poll: closedPoll, eventId: createdEventId });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
