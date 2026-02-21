import { Form, Link } from "react-router";
import type { Route } from "./+types/dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import VoteLeadersCard from "../components/VoteLeadersCard";
import { getActivePollLeaders } from "../lib/polls.server";
import { formatDateForDisplay, formatDateTimeForDisplay, getAppTimeZone, isDateInPastInTimeZone } from "../lib/dateUtils";
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { AdminLayout } from "../components/AdminLayout";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);

  if (!user.is_admin) {
    return redirect('/dashboard');
  }

  const db = context.cloudflare.env.DB;

  // Get vote leaders from shared utility
  const { activePoll, topRestaurant, topDate } = await getActivePollLeaders(db);

  // Get ALL restaurants with votes for the active poll (for override dropdown)
  let allRestaurants: any[] = [];
  let allDates: any[] = [];

  if (activePoll) {
    const restaurantsResult = await db
      .prepare(`
        SELECT r.id, r.name, r.address, COUNT(rv.user_id) as vote_count
        FROM restaurants r
        LEFT JOIN restaurant_votes rv ON rv.restaurant_id = r.id AND rv.poll_id = ?
        LEFT JOIN poll_excluded_restaurants per ON per.restaurant_id = r.id AND per.poll_id = ?
        WHERE per.id IS NULL
        GROUP BY r.id
        HAVING vote_count > 0
        ORDER BY vote_count DESC, r.name ASC
      `)
      .bind(activePoll.id, activePoll.id)
      .all();

    allRestaurants = restaurantsResult.results || [];

    // Get ALL date suggestions with votes for the active poll (for override dropdown)
    const datesResult = await db
      .prepare(`
        SELECT ds.id, ds.suggested_date, COUNT(dv.id) as vote_count
        FROM date_suggestions ds
        LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id
        WHERE ds.poll_id = ?
        GROUP BY ds.id
        HAVING vote_count > 0
        ORDER BY vote_count DESC, ds.suggested_date ASC
      `)
      .bind(activePoll.id)
      .all();

    allDates = datesResult.results || [];
  }

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
    allRestaurants,
    allDates,
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

    const parsedPollId = Number(pollId);
    if (!Number.isInteger(parsedPollId) || parsedPollId <= 0) {
      return { error: 'Invalid poll ID' };
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime)) {
      return { error: 'Invalid event time format' };
    }

    const parsedWinningRestaurantId = winningRestaurantId
      ? Number(winningRestaurantId)
      : null;
    const parsedWinningDateId = winningDateId
      ? Number(winningDateId)
      : null;

    if (winningRestaurantId) {
      if (
        parsedWinningRestaurantId === null ||
        !Number.isInteger(parsedWinningRestaurantId) ||
        parsedWinningRestaurantId <= 0
      ) {
        return { error: 'Invalid restaurant selection' };
      }
    }

    if (winningDateId) {
      if (
        parsedWinningDateId === null ||
        !Number.isInteger(parsedWinningDateId) ||
        parsedWinningDateId <= 0
      ) {
        return { error: 'Invalid date selection' };
      }
    }

    const activePoll = await db
      .prepare("SELECT id FROM polls WHERE id = ? AND status = 'active'")
      .bind(parsedPollId)
      .first();

    if (!activePoll) {
      return { error: 'Poll is not active or does not exist' };
    }

    if (createEvent && (!parsedWinningRestaurantId || !parsedWinningDateId)) {
      return { error: 'Winning restaurant and date are required to create an event' };
    }

    let selectedRestaurant: any = null;
    let selectedDate: any = null;

    if (parsedWinningRestaurantId) {
      selectedRestaurant = await db
        .prepare(`
          SELECT r.*, COUNT(rv.id) as vote_count
          FROM restaurants r
          LEFT JOIN restaurant_votes rv ON r.id = rv.restaurant_id AND rv.poll_id = ?
          WHERE r.id = ?
          GROUP BY r.id
        `)
        .bind(parsedPollId, parsedWinningRestaurantId)
        .first();

      if (!selectedRestaurant) {
        return { error: 'Selected restaurant not found' };
      }

      if (Number(selectedRestaurant.vote_count) < 1) {
        return { error: 'Cannot select a restaurant with zero votes' };
      }
    }

    if (parsedWinningDateId) {
      selectedDate = await db
        .prepare(`
          SELECT ds.*, COUNT(dv.id) as vote_count
          FROM date_suggestions ds
          LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id AND dv.poll_id = ?
          WHERE ds.id = ? AND ds.poll_id = ?
          GROUP BY ds.id
        `)
        .bind(parsedPollId, parsedWinningDateId, parsedPollId)
        .first();

      if (!selectedDate) {
        return { error: 'Selected date not found in this poll' };
      }

      if (Number(selectedDate.vote_count) < 1) {
        return { error: 'Cannot select a date with zero votes' };
      }
    }

    // Event-specific validation
    if (createEvent && selectedDate) {
      const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);
      if (isDateInPastInTimeZone(selectedDate.suggested_date as string, appTimeZone)) {
        return { error: 'Cannot create event for a date in the past' };
      }
    }

    if (createEvent && sendInvites && selectedRestaurant && !selectedRestaurant.address) {
      return { error: 'Cannot send calendar invites: restaurant is missing an address. Please add an address first.' };
    }

    let createdEventId: number | null = null;
    try {
      await db.prepare('BEGIN TRANSACTION').run();

      if (createEvent && selectedRestaurant && selectedDate) {
        const eventResult = await db
          .prepare(`
            INSERT INTO events (restaurant_name, restaurant_address, event_date, event_time, status)
            VALUES (?, ?, ?, ?, 'upcoming')
          `)
          .bind(selectedRestaurant.name, selectedRestaurant.address, selectedDate.suggested_date, eventTime)
          .run();

        createdEventId = eventResult.meta.last_row_id;
      }

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
        throw new Error('Poll close failed due to concurrent status change');
      }

      await db.prepare('COMMIT').run();
    } catch (error) {
      await db.prepare('ROLLBACK').run().catch(() => null);
      console.error('Failed to close poll transaction:', error);
      return { error: 'Failed to close poll. Please try again.' };
    }

    if (sendInvites && createdEventId && selectedRestaurant && selectedDate) {
      const { sendEventInvites } = await import('../lib/email.server');

      const usersResult = await db
        .prepare('SELECT email FROM users WHERE status = ?')
        .bind('active')
        .all();

      if (usersResult.results && usersResult.results.length > 0) {
        const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
        const invitePromise = sendEventInvites({
          eventId: Number(createdEventId),
          restaurantName: selectedRestaurant.name as string,
          restaurantAddress: (selectedRestaurant.address as string | null),
          eventDate: selectedDate.suggested_date as string,
          eventTime: eventTime,
          recipientEmails: usersResult.results.map((u: any) => u.email),
          resendApiKey: resendApiKey || "",
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

    return redirect('/dashboard/admin/polls');
  }

  return { error: 'Invalid action' };
}

export default function AdminPollsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { activePoll, topRestaurant, topDate, allRestaurants, allDates, closedPolls } = loaderData;

  return (
    <AdminLayout>
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Poll Management"
        description="Manage voting polls and close with winners"
      />

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      {/* Active Poll Section */}
      {activePoll ? (
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {activePoll.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Started {formatDateForDisplay(activePoll.created_at)}
              </p>
            </div>
            <Badge variant="success">Active</Badge>
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
            <Form method="post" className="bg-muted border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Close Poll</h3>
              <input type="hidden" name="_action" value="close" />
              <input type="hidden" name="poll_id" value={activePoll.id} />

              {/* Restaurant & Date Override Selects */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Restaurant
                  </label>
                  <select
                    name="winning_restaurant_id"
                    defaultValue={topRestaurant.id}
                    className="w-full px-4 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent bg-card text-foreground"
                    required
                  >
                    {allRestaurants.map((restaurant: any) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name} - {restaurant.vote_count} vote{restaurant.vote_count !== 1 ? 's' : ''}
                        {restaurant.id === topRestaurant.id ? ' (Leader)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Defaulted to vote leader, but you can override
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Date
                  </label>
                  <select
                    name="winning_date_id"
                    defaultValue={topDate.id}
                    className="w-full px-4 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent bg-card text-foreground"
                    required
                  >
                    {allDates.map((date: any) => (
                      <option key={date.id} value={date.id}>
                        {formatDateForDisplay(date.suggested_date, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })} - {date.vote_count} vote{date.vote_count !== 1 ? 's' : ''}
                        {date.id === topDate.id ? ' (Leader)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Defaulted to vote leader, but you can override
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="create_event"
                    value="true"
                    defaultChecked
                    className="w-4 h-4 text-accent rounded focus:ring-accent"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Create event from winners
                  </span>
                </label>
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  This will create an upcoming event with the winning restaurant and date
                </p>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="send_invites"
                    value="true"
                    defaultChecked
                    className="w-4 h-4 text-accent rounded focus:ring-accent"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Send calendar invites to all members
                  </span>
                </label>
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  Sends personalized calendar invites to all active members
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Event Time
                </label>
                <input
                  type="time"
                  name="event_time"
                  defaultValue="18:00"
                  className="w-full px-4 py-2 border border-border rounded-md focus:ring-accent focus:border-accent"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Time for the event (defaults to 6:00 PM)
                </p>
              </div>

              <Button type="submit" className="w-full">
                Close Poll & Finalize Winners
              </Button>
            </Form>
          )}
        </Card>
      ) : (
        <EmptyState
          title="No active poll"
          description="Users can start a new poll from the restaurant or date voting pages."
        />
      )}

      {/* Closed Polls History */}
      <Card className="overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Closed Polls History</h2>
        </div>

        {closedPolls.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No closed polls yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {closedPolls.map((poll: any) => (
              <div key={poll.id} className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{poll.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Closed {formatDateTimeForDisplay(poll.closed_at)} by{' '}
                      {poll.closed_by_name}
                    </p>
                  </div>
                  <Badge variant="muted">Closed</Badge>
                </div>

                {poll.winning_restaurant_name && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Winning Restaurant</p>
                      <p className="font-medium text-foreground">
                        {poll.winning_restaurant_name}
                      </p>
                    </div>

                    {poll.winning_date && (
                      <div className="bg-muted rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Winning Date</p>
                        <p className="font-medium text-foreground">
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
                      className="text-sm text-accent hover:text-accent-strong font-medium"
                    >
                      View Created Event →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
    </AdminLayout>
  );
}
