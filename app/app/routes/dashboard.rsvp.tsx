import { Form, useActionData, useNavigate } from "react-router";
import type { Route } from "./+types/dashboard.rsvp";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import { logActivity } from "../lib/activity.server";
import { formatDateForDisplay } from "../lib/dateUtils";

interface Event {
  id: number;
  restaurant_name: string;
  restaurant_address: string;
  event_date: string;
  status: string;
  created_at: string;
}

interface RSVP {
  id: number;
  event_id: number;
  user_id: number;
  status: 'yes' | 'no' | 'maybe';
  comments: string | null;
  created_at: string;
  name?: string;
  email?: string;
  picture?: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  // Fetch all upcoming events
  const eventsResult = await db
    .prepare('SELECT * FROM events WHERE status = ? ORDER BY event_date ASC')
    .bind('upcoming')
    .all();

  const events = eventsResult.results || [];

  // Fetch RSVP data for each event
  const eventsWithRsvps = await Promise.all(
    events.map(async (event: any) => {
      // Get user's RSVP
      const userRsvp = await db
        .prepare('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?')
        .bind(event.id, user.id)
        .first();

      // Get all RSVPs with user details
      const allRsvps = await db
        .prepare(`
          SELECT r.*, u.name, u.email, u.picture
          FROM rsvps r
          JOIN users u ON r.user_id = u.id
          WHERE r.event_id = ?
          ORDER BY r.created_at ASC
        `)
        .bind(event.id)
        .all();

      return {
        ...event,
        userRsvp,
        allRsvps: allRsvps.results || [],
      };
    })
  );

  return { events: eventsWithRsvps };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();

  const eventId = formData.get('event_id');
  const status = formData.get('status');
  const comments = formData.get('comments');

  if (!eventId || !status) {
    return { error: 'Missing required fields' };
  }

  // Get event details for calendar update
  const event = await db
    .prepare('SELECT id, restaurant_name, restaurant_address, event_date FROM events WHERE id = ?')
    .bind(eventId)
    .first();

  if (!event) {
    return { error: 'Event not found' };
  }

  // Check if RSVP exists
  const existing = await db
    .prepare('SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?')
    .bind(eventId, user.id)
    .first();

  if (existing) {
    // Update existing RSVP
    await db
      .prepare('UPDATE rsvps SET status = ?, comments = ? WHERE event_id = ? AND user_id = ?')
      .bind(status, comments || null, eventId, user.id)
      .run();

    await logActivity({
      db,
      userId: user.id,
      actionType: 'update_rsvp',
      actionDetails: { event_id: eventId, status, comments },
      route: '/dashboard/rsvp',
      request,
    });
  } else {
    // Create new RSVP
    await db
      .prepare('INSERT INTO rsvps (event_id, user_id, status, comments) VALUES (?, ?, ?, ?)')
      .bind(eventId, user.id, status, comments || null)
      .run();

    await logActivity({
      db,
      userId: user.id,
      actionType: 'rsvp',
      actionDetails: { event_id: eventId, status, comments },
      route: '/dashboard/rsvp',
      request,
    });
  }

  // Send calendar update to sync their calendar
  const { sendCalendarUpdate } = await import('../lib/email.server');
  const resendApiKey = context.cloudflare.env.RESEND_API_KEY;

  const updatePromise = sendCalendarUpdate({
    eventId: event.id as number,
    restaurantName: event.restaurant_name as string,
    restaurantAddress: event.restaurant_address as string | null,
    eventDate: event.event_date as string,
    eventTime: '18:00', // Default time, consider storing this with events
    userEmail: user.email,
    rsvpStatus: status as 'yes' | 'no' | 'maybe',
    resendApiKey,
  }).then(result => {
    if (result.success) {
      console.log(`Calendar updated for ${user.email}`);
    } else {
      console.error(`Calendar update failed for ${user.email}:`, result.error);
    }
    return result;
  }).catch(err => {
    console.error('Calendar update error:', err);
  });

  // Use waitUntil if available for background processing
  if (context.cloudflare.ctx?.waitUntil) {
    context.cloudflare.ctx.waitUntil(updatePromise);
  } else {
    await updatePromise;
  }

  return redirect('/dashboard/rsvp');
}

export default function RSVPPage({ loaderData, actionData }: Route.ComponentProps) {
  const { events } = loaderData;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-foreground mb-8">RSVP to Events</h1>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-muted border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            No upcoming events at the moment. Check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {events.map((event: any) => (
            <div
              key={event.id}
              className="bg-card border border-border rounded-lg p-6"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground mb-2">
                  {event.restaurant_name}
                </h2>
                {event.restaurant_address && (
                  <p className="text-muted-foreground mb-1">{event.restaurant_address}</p>
                )}
                <p className="text-muted-foreground">
                  Date:{' '}
                  {formatDateForDisplay(event.event_date, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* RSVP Form */}
              <div className="mb-6 bg-muted p-4 rounded-lg">
                <h3 className="font-semibold text-foreground mb-3">Your RSVP</h3>
                <Form method="post" className="space-y-4">
                  <input type="hidden" name="event_id" value={event.id} />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Will you attend?
                    </label>
                    <div className="flex gap-3">
                      {['yes', 'no', 'maybe'].map((option) => (
                        <label
                          key={option}
                          className={`px-4 py-2 rounded-md font-medium transition-colors cursor-pointer ${
                            event.userRsvp?.status === option
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="status"
                            value={option}
                            defaultChecked={event.userRsvp?.status === option}
                            className="sr-only"
                          />
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`comments-${event.id}`}
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Comments (Optional)
                    </label>
                    <textarea
                      id={`comments-${event.id}`}
                      name="comments"
                      defaultValue={event.userRsvp?.comments || ''}
                      placeholder="Any comments or notes about your attendance"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
                  >
                    Save RSVP
                  </button>
                </Form>
              </div>

              {/* Attendee List */}
              {event.allRsvps.length > 0 && (
                <div>
                  <h3 className="font-semibold text-foreground mb-3">
                    Attendees ({event.allRsvps.filter((r: RSVP) => r.status === 'yes').length})
                  </h3>
                  <div className="space-y-2">
                    {event.allRsvps
                      .filter((rsvp: RSVP) => rsvp.status === 'yes')
                      .map((rsvp: RSVP) => (
                        <div
                          key={rsvp.id}
                          className="flex items-center gap-3 p-3 bg-muted rounded-md"
                        >
                          {rsvp.picture && (
                            <img
                              src={rsvp.picture}
                              alt={rsvp.name || ''}
                              className="w-10 h-10 rounded-full"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-foreground">{rsvp.name || rsvp.email}</p>
                            {rsvp.comments && (
                              <p className="text-sm text-muted-foreground">
                                {rsvp.comments}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>

                  {event.allRsvps.filter((r: RSVP) => r.status === 'maybe').length > 0 && (
                    <>
                      <h4 className="font-semibold text-foreground mt-4 mb-2">Maybe</h4>
                      <div className="space-y-2">
                        {event.allRsvps
                          .filter((rsvp: RSVP) => rsvp.status === 'maybe')
                          .map((rsvp: RSVP) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-muted rounded-md opacity-60"
                            >
                              {rsvp.picture && (
                                <img
                                  src={rsvp.picture}
                                  alt={rsvp.name || ''}
                                  className="w-10 h-10 rounded-full"
                                />
                              )}
                              <p className="font-medium text-foreground">
                                {rsvp.name || rsvp.email}
                              </p>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
