import { Form, Link } from "react-router";
import type { Route } from "./+types/dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import VoteLeadersCard from "../components/VoteLeadersCard";
import { getActivePollLeaders } from "../lib/polls.server";
import { formatDateForDisplay } from "../lib/dateUtils";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);

  if (!user.is_admin) {
    return redirect('/dashboard');
  }

  const db = context.cloudflare.env.DB;

  // Get vote leaders from shared utility
  const { activePoll, topRestaurant, topDate } = await getActivePollLeaders(db);

  // Get recent closed polls
  const closedPolls = await db
    .prepare(`
      SELECT
        p.*,
        u.name as created_by_name,
        cu.name as closed_by_name,
        r.name as winning_restaurant_name,
        ds.suggested_date as winning_date,
        e.id as event_id
      FROM polls p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users cu ON p.closed_by = cu.id
      LEFT JOIN restaurants r ON p.winning_restaurant_id = r.id
      LEFT JOIN date_suggestions ds ON p.winning_date_id = ds.id
      LEFT JOIN events e ON p.created_event_id = e.id
      WHERE p.status = 'closed'
      ORDER BY p.closed_at DESC
      LIMIT 10
    `)
    .all();

  return {
    activePoll,
    topRestaurant,
    topDate,
    closedPolls: closedPolls.results || [],
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);

  if (!user.is_admin) {
    return { error: 'Only admins can manage polls' };
  }

  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const action = formData.get('_action');

  if (action === 'close') {
    const pollId = formData.get('poll_id');
    const winningRestaurantId = formData.get('winning_restaurant_id');
    const winningDateId = formData.get('winning_date_id');
    const createEvent = formData.get('create_event') === 'true';
    const sendInvites = formData.get('send_invites') === 'true';
    const eventTime = (formData.get('event_time') as string) || '18:00';

    if (!pollId) {
      return { error: 'Poll ID is required' };
    }

    let createdEventId: number | null = null;

    // If creating an event, validate and create
    if (createEvent && winningRestaurantId && winningDateId) {
      // Get restaurant with vote count
      const restaurant = await db
        .prepare(`
          SELECT r.*, COUNT(rv.id) as vote_count
          FROM restaurants r
          LEFT JOIN restaurant_votes rv ON r.id = rv.restaurant_id AND rv.poll_id = ?
          WHERE r.id = ?
          GROUP BY r.id
        `)
        .bind(pollId, winningRestaurantId)
        .first();

      // Get date with vote count
      const date = await db
        .prepare(`
          SELECT ds.*, COUNT(dv.id) as vote_count
          FROM date_suggestions ds
          LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id
          WHERE ds.id = ?
          GROUP BY ds.id
        `)
        .bind(winningDateId)
        .first();

      if (!restaurant || !date) {
        return { error: 'Selected restaurant or date not found' };
      }

      // Validation 1: Check if date is in the past
      const selectedDate = new Date(date.suggested_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        return { error: 'Cannot create event for a date in the past' };
      }

      // Validation 2: Require minimum vote threshold
      if (restaurant.vote_count === 0 || date.vote_count === 0) {
        return { error: 'Cannot create event: winning options must have at least 1 vote' };
      }

      // Validation 3: Warn if restaurant has no address
      if (!restaurant.address && sendInvites) {
        return { error: 'Cannot send calendar invites: restaurant is missing an address. Please add an address first.' };
      }

      // Create the event
      const eventResult = await db
        .prepare(`
          INSERT INTO events (restaurant_name, restaurant_address, event_date, event_time, status)
          VALUES (?, ?, ?, ?, 'upcoming')
        `)
        .bind(restaurant.name, restaurant.address, date.suggested_date, eventTime)
        .run();

      createdEventId = eventResult.meta.last_row_id;

      // Send calendar invites if requested
      if (sendInvites && createdEventId) {
        const { sendEventInvites } = await import('../lib/email.server');

        // Get all active users
        const usersResult = await db
          .prepare('SELECT email FROM users WHERE status = ?')
          .bind('active')
          .all();

        if (usersResult.results && usersResult.results.length > 0) {
          const resendApiKey = context.cloudflare.env.RESEND_API_KEY;

          // Use waitUntil if available for background processing
          const invitePromise = sendEventInvites({
            eventId: Number(createdEventId),
            restaurantName: restaurant.name,
            restaurantAddress: restaurant.address,
            eventDate: date.suggested_date,
            eventTime: eventTime,
            recipientEmails: usersResult.results.map((u: any) => u.email),
            resendApiKey,
          }).then(result => {
            console.log(`Sent ${result.sentCount} calendar invites for event ${createdEventId}`);
            if (result.errors.length > 0) {
              console.error('Some invites failed:', result.errors);
            }
            return result;
          }).catch(err => {
            console.error('Failed to send calendar invites:', err);
          });

          if (context.cloudflare.ctx?.waitUntil) {
            context.cloudflare.ctx.waitUntil(invitePromise);
          } else {
            await invitePromise;
          }
        }
      }
    }

    // Close the poll
    await db
      .prepare(`
        UPDATE polls
        SET status = 'closed',
            closed_by = ?,
            closed_at = CURRENT_TIMESTAMP,
            winning_restaurant_id = ?,
            winning_date_id = ?,
            created_event_id = ?
        WHERE id = ?
      `)
      .bind(
        user.id,
        winningRestaurantId || null,
        winningDateId || null,
        createdEventId || null,
        pollId
      )
      .run();

    return redirect('/dashboard/admin/polls');
  }

  return { error: 'Invalid action' };
}

export default function AdminPollsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { activePoll, topRestaurant, topDate, closedPolls } = loaderData;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        to="/dashboard/admin"
        className="inline-flex items-center text-meat-red hover:text-meat-brown mb-6 font-medium"
      >
        ← Back to Admin
      </Link>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Poll Management</h1>
          <p className="text-gray-600 mt-1">Manage voting polls and close with winners</p>
        </div>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {/* Active Poll Section */}
      {activePoll ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                🗳️ {activePoll.title}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Started {formatDateForDisplay(activePoll.created_at)}
              </p>
            </div>
            <span className="px-4 py-2 bg-green-100 text-green-800 font-semibold rounded-full">
              Active
            </span>
          </div>

          {/* Current Winners */}
          <div className="mb-6">
            <VoteLeadersCard
              topRestaurant={topRestaurant}
              topDate={topDate}
              variant="amber"
            />
          </div>

          {/* Close Poll Form */}
          {topRestaurant && topDate && (
            <Form method="post" className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Close Poll</h3>
              <input type="hidden" name="_action" value="close" />
              <input type="hidden" name="poll_id" value={activePoll.id} />
              <input type="hidden" name="winning_restaurant_id" value={topRestaurant.id} />
              <input type="hidden" name="winning_date_id" value={topDate.id} />

              <div className="space-y-4 mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="create_event"
                    value="true"
                    defaultChecked
                    className="w-4 h-4 text-meat-red rounded focus:ring-meat-red"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Create event from winners
                  </span>
                </label>
                <p className="text-xs text-gray-600 mt-1 ml-6">
                  This will create an upcoming event with the winning restaurant and date
                </p>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="send_invites"
                    value="true"
                    defaultChecked
                    className="w-4 h-4 text-meat-red rounded focus:ring-meat-red"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Send calendar invites to all members
                  </span>
                </label>
                <p className="text-xs text-gray-600 mt-1 ml-6">
                  Sends personalized calendar invites to all active members
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Event Preview:</h4>
                <p className="text-sm text-gray-700">
                  <strong>Restaurant:</strong> {topRestaurant.name}
                  {!topRestaurant.address && (
                    <span className="ml-2 text-yellow-600 text-xs">
                      ⚠️ Missing address (calendar invites will be limited)
                    </span>
                  )}
                </p>
                {topRestaurant.address && (
                  <p className="text-sm text-gray-700">
                    <strong>Address:</strong> {topRestaurant.address}
                  </p>
                )}
                <p className="text-sm text-gray-700">
                  <strong>Date:</strong>{' '}
                  {formatDateForDisplay(topDate.suggested_date, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  <strong>Votes:</strong> {topRestaurant.vote_count} for restaurant, {topDate.vote_count} for date
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Event Time
                </label>
                <input
                  type="time"
                  name="event_time"
                  defaultValue="18:00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-meat-red focus:border-meat-red"
                  required
                />
                <p className="text-xs text-gray-600 mt-1">
                  Time for the event (defaults to 6:00 PM)
                </p>
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 bg-meat-red text-white rounded-md font-bold hover:bg-meat-brown transition-colors"
              >
                Close Poll & Finalize Winners
              </button>
            </Form>
          )}
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center mb-8">
          <p className="text-yellow-800 font-medium mb-2">No active poll</p>
          <p className="text-sm text-yellow-700">
            Users can start a new poll from the restaurant or date voting pages.
          </p>
        </div>
      )}

      {/* Closed Polls History */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Closed Polls History</h2>
        </div>

        {closedPolls.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No closed polls yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {closedPolls.map((poll: any) => (
              <div key={poll.id} className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{poll.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Closed {formatDateForDisplay(poll.closed_at)} by{' '}
                      {poll.closed_by_name}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-semibold rounded-full">
                    Closed
                  </span>
                </div>

                {poll.winning_restaurant_name && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Winning Restaurant</p>
                      <p className="font-medium text-gray-900">
                        {poll.winning_restaurant_name}
                      </p>
                    </div>

                    {poll.winning_date && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Winning Date</p>
                        <p className="font-medium text-gray-900">
                          {formatDateForDisplay(poll.winning_date, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {poll.event_id && (
                  <div className="mt-3">
                    <Link
                      to="/dashboard/admin/events"
                      className="text-sm text-meat-red hover:text-meat-brown font-medium"
                    >
                      View Created Event →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
