import { Form, redirect } from "react-router";
import type { Route } from "./+types/dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { formatDateForDisplay, formatTimeForDisplay, getAppTimeZone, isEventInPastInTimeZone } from "../lib/dateUtils";

interface Event {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time?: string | null;
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

  const eventsResult = await db
    .prepare('SELECT * FROM events ORDER BY event_date DESC')
    .all();

  const events = eventsResult.results || [];

  // Separate upcoming and past events using timezone-aware datetime comparison.
  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);
  const upcomingEventsRaw = events.filter((event: any) =>
    event.status !== 'cancelled' &&
    !isEventInPastInTimeZone(event.event_date, event.event_time || '18:00', appTimeZone)
  );
  const pastEvents = events
    .filter((event: any) =>
      event.status === 'cancelled' ||
      isEventInPastInTimeZone(event.event_date, event.event_time || '18:00', appTimeZone)
    )
    .map((event: any) => ({
      ...event,
      displayStatus: event.status === 'cancelled' ? 'cancelled' : 'completed',
    }));

  // Fetch all active members
  const allMembersResult = await db
    .prepare('SELECT id, name, email, picture FROM users WHERE status = ? ORDER BY name ASC')
    .bind('active')
    .all();
  const allMembers = allMembersResult.results || [];

  // Fetch RSVP data for upcoming events
  const upcomingEvents = await Promise.all(
    upcomingEventsRaw.map(async (event: any) => {
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

      // Find members who haven't RSVPd
      const rsvpdUserIds = new Set((allRsvps.results || []).map((r: any) => r.user_id));
      const notResponded = allMembers.filter((member: any) => !rsvpdUserIds.has(member.id));

      return {
        ...event,
        userRsvp,
        allRsvps: allRsvps.results || [],
        notResponded,
      };
    })
  );

  return { upcomingEvents, pastEvents };
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

  // Check if RSVP exists
  const existing = await db
    .prepare('SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?')
    .bind(eventId, user.id)
    .first();

  if (existing) {
    // Update existing RSVP
    await db
      .prepare('UPDATE rsvps SET status = ?, comments = ?, admin_override = 0, admin_override_by = NULL, admin_override_at = NULL WHERE event_id = ? AND user_id = ?')
      .bind(status, comments || null, eventId, user.id)
      .run();

    await logActivity({
      db,
      userId: user.id,
      actionType: 'update_rsvp',
      actionDetails: { event_id: eventId, status, comments },
      route: '/dashboard/events',
      request,
    });
  } else {
    // Create new RSVP
    await db
      .prepare('INSERT INTO rsvps (event_id, user_id, status, comments, admin_override) VALUES (?, ?, ?, ?, 0)')
      .bind(eventId, user.id, status, comments || null)
      .run();

    await logActivity({
      db,
      userId: user.id,
      actionType: 'rsvp',
      actionDetails: { event_id: eventId, status, comments },
      route: '/dashboard/events',
      request,
    });
  }

  return redirect('/dashboard/events');
}

export default function EventsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { upcomingEvents, pastEvents } = loaderData;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Events</h1>
        <p className="text-muted-foreground mt-1">Upcoming and past Meatup.Club events</p>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {/* Upcoming Events */}
      <div className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Upcoming Events</h2>
        {upcomingEvents.length === 0 ? (
          <div className="bg-muted border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              No upcoming events at the moment. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {upcomingEvents.map((event: any) => (
              <div
                key={event.id}
                className="bg-card border border-border rounded-lg p-6"
              >
                <div className="mb-6">
                  <h3 className="text-2xl font-semibold text-foreground mb-2">
                    {event.restaurant_name}
                  </h3>
                  {event.restaurant_address && (
                    <p className="text-muted-foreground mb-1">📍 {event.restaurant_address}</p>
                  )}
                  <p className="text-muted-foreground">
                    📅{' '}
                    {formatDateForDisplay(event.event_date, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}{' '}
                    at {formatTimeForDisplay(event.event_time || '18:00')}
                  </p>
                </div>

                {/* RSVP Form */}
                <div className="mb-6 bg-muted p-4 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-3">Your RSVP</h4>
                  <Form method="post" className="space-y-4">
                    <input type="hidden" name="event_id" value={event.id} />

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Will you attend?
                      </label>
                      <div className="flex gap-3">
                        {['yes', 'no', 'maybe'].map((option) => (
                          <label
                            key={option}
                            className={`px-4 py-2 rounded-md font-medium transition-all cursor-pointer select-none ${
                              event.userRsvp?.status === option
                                ? 'bg-meat-red text-white shadow-sm'
                                : 'bg-card border border-border text-foreground hover:bg-muted hover:border-meat-red/50 active:scale-95 active:shadow-inner'
                            }`}
                          >
                            <input
                              type="radio"
                              name="status"
                              value={option}
                              defaultChecked={event.userRsvp?.status === option}
                              className="sr-only peer"
                              onChange={(e) => {
                                // Auto-submit on selection for immediate feedback
                                if (e.target.checked) {
                                  e.target.form?.requestSubmit();
                                }
                              }}
                            />
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Click to update • Changes save automatically
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor={`comments-${event.id}`}
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Comments (Optional)
                      </label>
                      <div className="space-y-2">
                        <textarea
                          id={`comments-${event.id}`}
                          name="comments"
                          defaultValue={event.userRsvp?.comments || ''}
                          placeholder="Any comments or notes about your attendance"
                          rows={3}
                          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red bg-card text-foreground"
                        />
                        <button
                          type="submit"
                          className="px-4 py-1.5 text-sm bg-meat-red text-white rounded-md font-medium hover:bg-meat-red/90 transition-colors"
                        >
                          Update Comments
                        </button>
                      </div>
                    </div>
                  </Form>
                </div>

                {/* Attendee List */}
                <div>
                  <h4 className="font-semibold text-foreground mb-3">
                    RSVPs ({event.allRsvps.filter((r: RSVP) => r.status === 'yes').length} yes, {event.allRsvps.filter((r: RSVP) => r.status === 'maybe').length} maybe, {event.allRsvps.filter((r: RSVP) => r.status === 'no').length} no, {event.notResponded?.length || 0} pending)
                  </h4>

                  {/* Going */}
                  {event.allRsvps.filter((r: RSVP) => r.status === 'yes').length > 0 && (
                    <>
                      <h5 className="font-semibold text-green-700 dark:text-green-400 mt-2 mb-2">✓ Going</h5>
                      <div className="space-y-2 mb-4">
                        {event.allRsvps
                          .filter((rsvp: RSVP) => rsvp.status === 'yes')
                          .map((rsvp: RSVP) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md"
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
                    </>
                  )}

                  {/* Maybe */}
                  {event.allRsvps.filter((r: RSVP) => r.status === 'maybe').length > 0 && (
                    <>
                      <h5 className="font-semibold text-yellow-700 dark:text-yellow-400 mt-2 mb-2">? Maybe</h5>
                      <div className="space-y-2 mb-4">
                        {event.allRsvps
                          .filter((rsvp: RSVP) => rsvp.status === 'maybe')
                          .map((rsvp: RSVP) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md"
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
                    </>
                  )}

                  {/* Not Going */}
                  {event.allRsvps.filter((r: RSVP) => r.status === 'no').length > 0 && (
                    <>
                      <h5 className="font-semibold text-red-700 dark:text-red-400 mt-2 mb-2">✗ Not Going</h5>
                      <div className="space-y-2 mb-4">
                        {event.allRsvps
                          .filter((rsvp: RSVP) => rsvp.status === 'no')
                          .map((rsvp: RSVP) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md opacity-75"
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
                    </>
                  )}

                  {/* Not Responded */}
                  {event.notResponded && event.notResponded.length > 0 && (
                    <>
                      <h5 className="font-semibold text-muted-foreground mt-2 mb-2">⏳ No Response Yet</h5>
                      <div className="space-y-2">
                        {event.notResponded.map((member: any) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-md opacity-50"
                          >
                            {member.picture && (
                              <img
                                src={member.picture}
                                alt={member.name || ''}
                                className="w-10 h-10 rounded-full grayscale"
                              />
                            )}
                            <p className="font-medium text-muted-foreground">
                              {member.name || member.email}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Events */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-4">Past Events</h2>
        {pastEvents.length === 0 ? (
          <div className="bg-muted border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No past events yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pastEvents.map((event: any) => (
              <div
                key={event.id}
                className="bg-card border border-border rounded-lg p-6 opacity-75"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-foreground">
                        {event.restaurant_name}
                      </h3>
                      <span
                        className={`px-3 py-1 text-sm font-semibold rounded-full ${
                          event.displayStatus === 'completed'
                            ? 'bg-muted text-foreground'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        {event.displayStatus}
                      </span>
                    </div>
                    {event.restaurant_address && (
                      <p className="text-sm text-muted-foreground mb-2">
                        📍 {event.restaurant_address}
                      </p>
                    )}
                    <p className="text-base text-foreground">
                      📅{' '}
                      {formatDateForDisplay(event.event_date, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}{' '}
                      at {formatTimeForDisplay(event.event_time || '18:00')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
