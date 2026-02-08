import { Form, redirect } from "react-router";
import type { Route } from "./+types/dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { upsertRsvp } from "../lib/rsvps.server";
import { formatDateForDisplay, formatTimeForDisplay, getAppTimeZone, isEventInPastInTimeZone } from "../lib/dateUtils";
import type { Event, RsvpWithUser } from "../lib/types";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, UserAvatar } from "../components/ui";
import { MapPinIcon, CalendarDaysIcon, CheckIcon, XMarkIcon, ClockIcon } from "@heroicons/react/24/outline";

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

  const result = await upsertRsvp({
    db,
    eventId: parseInt(eventId as string),
    userId: user.id,
    status: status as string,
    comments: (comments as string) || null,
  });

  await logActivity({
    db,
    userId: user.id,
    actionType: result === 'created' ? 'rsvp' : 'update_rsvp',
    actionDetails: { event_id: eventId, status, comments },
    route: '/dashboard/events',
    request,
  });

  return redirect('/dashboard/events');
}

export default function EventsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { upcomingEvents, pastEvents } = loaderData;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Events"
        description="Upcoming and past Meatup.Club events"
      />

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      {/* Upcoming Events */}
      <div className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Upcoming Events</h2>
        {upcomingEvents.length === 0 ? (
          <EmptyState
            title="No upcoming events"
            description="No upcoming events at the moment. Check back soon!"
          />
        ) : (
          <div className="space-y-8">
            {upcomingEvents.map((event: any) => (
              <Card key={event.id} className="p-6">
                <div className="mb-6">
                  <h3 className="text-2xl font-semibold text-foreground mb-2">
                    {event.restaurant_name}
                  </h3>
                  {event.restaurant_address && (
                    <p className="text-muted-foreground mb-1 flex items-center gap-1"><MapPinIcon className="w-4 h-4 inline" /> {event.restaurant_address}</p>
                  )}
                  <p className="text-muted-foreground">
                    <CalendarDaysIcon className="w-4 h-4 inline" />{' '}
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
                                ? 'bg-accent text-white shadow-sm'
                                : 'bg-card border border-border text-foreground hover:bg-muted hover:border-accent/50 active:scale-95 active:shadow-inner'
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
                          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent bg-card text-foreground"
                        />
                        <Button type="submit" size="sm">
                          Update Comments
                        </Button>
                      </div>
                    </div>
                  </Form>
                </div>

                {/* Attendee List */}
                <div>
                  <h4 className="font-semibold text-foreground mb-3">
                    RSVPs ({event.allRsvps.filter((r: RsvpWithUser) => r.status === 'yes').length} yes, {event.allRsvps.filter((r: RsvpWithUser) => r.status === 'maybe').length} maybe, {event.allRsvps.filter((r: RsvpWithUser) => r.status === 'no').length} no, {event.notResponded?.length || 0} pending)
                  </h4>

                  {/* Going */}
                  {event.allRsvps.filter((r: RsvpWithUser) => r.status === 'yes').length > 0 && (
                    <>
                      <h5 className="font-semibold text-green-700 dark:text-green-400 mt-2 mb-2 flex items-center gap-1"><CheckIcon className="w-4 h-4" /> Going</h5>
                      <div className="space-y-2 mb-4">
                        {event.allRsvps
                          .filter((rsvp: RsvpWithUser) => rsvp.status === 'yes')
                          .map((rsvp: RsvpWithUser) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md"
                            >
                              <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
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
                  {event.allRsvps.filter((r: RsvpWithUser) => r.status === 'maybe').length > 0 && (
                    <>
                      <h5 className="font-semibold text-yellow-700 dark:text-yellow-400 mt-2 mb-2">? Maybe</h5>
                      <div className="space-y-2 mb-4">
                        {event.allRsvps
                          .filter((rsvp: RsvpWithUser) => rsvp.status === 'maybe')
                          .map((rsvp: RsvpWithUser) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md"
                            >
                              <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
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
                  {event.allRsvps.filter((r: RsvpWithUser) => r.status === 'no').length > 0 && (
                    <>
                      <h5 className="font-semibold text-red-700 dark:text-red-400 mt-2 mb-2 flex items-center gap-1"><XMarkIcon className="w-4 h-4" /> Not Going</h5>
                      <div className="space-y-2 mb-4">
                        {event.allRsvps
                          .filter((rsvp: RsvpWithUser) => rsvp.status === 'no')
                          .map((rsvp: RsvpWithUser) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md opacity-75"
                            >
                              <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
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
                      <h5 className="font-semibold text-muted-foreground mt-2 mb-2 flex items-center gap-1"><ClockIcon className="w-4 h-4" /> No Response Yet</h5>
                      <div className="space-y-2">
                        {event.notResponded.map((member: any) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-md opacity-50"
                          >
                            <UserAvatar src={member.picture} name={member.name} email={member.email} className="grayscale" />
                            <p className="font-medium text-muted-foreground">
                              {member.name || member.email}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Past Events */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-4">Past Events</h2>
        {pastEvents.length === 0 ? (
          <EmptyState title="No past events yet" />
        ) : (
          <div className="space-y-4">
            {pastEvents.map((event: any) => (
              <Card key={event.id} className="p-6 opacity-75">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-foreground">
                        {event.restaurant_name}
                      </h3>
                      <Badge variant={event.displayStatus === 'completed' ? 'muted' : 'danger'}>
                        {event.displayStatus}
                      </Badge>
                    </div>
                    {event.restaurant_address && (
                      <p className="text-sm text-muted-foreground mb-2">
                        <MapPinIcon className="w-4 h-4 inline" /> {event.restaurant_address}
                      </p>
                    )}
                    <p className="text-base text-foreground">
                      <CalendarDaysIcon className="w-4 h-4 inline" />{' '}
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
