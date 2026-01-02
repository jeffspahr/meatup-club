import { Form, Link, redirect, useNavigation, useSubmit } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/dashboard.admin.events";
import { requireAdmin } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import VoteLeadersCard from "../components/VoteLeadersCard";
import { getActivePollLeaders } from "../lib/polls.server";
import { formatDateForDisplay, formatTimeForDisplay } from "../lib/dateUtils";
import { sendAdhocSmsReminder } from "../lib/sms.server";

interface Event {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string;
  status: string;
  created_at: string;
}

interface VoteWinner {
  name: string;
  address: string | null;
  vote_count: number;
}

interface DateWinner {
  suggested_date: string;
  vote_count: number;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  // Fetch all events
  const eventsResult = await db
    .prepare('SELECT * FROM events ORDER BY event_date DESC')
    .all();

  const smsMembersResult = await db
    .prepare(`
      SELECT id, name, email
      FROM users
      WHERE status = 'active'
        AND sms_opt_in = 1
        AND sms_opt_out_at IS NULL
        AND phone_number IS NOT NULL
      ORDER BY name ASC, email ASC
    `)
    .all();

  const rsvpRowsResult = await db
    .prepare(`
      SELECT
        r.event_id,
        r.user_id,
        r.status,
        r.admin_override,
        u.name,
        u.email
      FROM rsvps r
      JOIN users u ON r.user_id = u.id
    `)
    .all();

  const activeMembersResult = await db
    .prepare('SELECT id, name, email FROM users WHERE status = ? ORDER BY name ASC, email ASC')
    .bind('active')
    .all();

  const activeMembers = activeMembersResult.results || [];
  const rsvpLookup = new Map<string, any>();
  for (const row of rsvpRowsResult.results || []) {
    const key = `${(row as any).event_id}:${(row as any).user_id}`;
    rsvpLookup.set(key, row);
  }

  const eventMembersById: Record<number, any[]> = {};
  for (const event of eventsResult.results || []) {
    eventMembersById[(event as any).id] = activeMembers.map((member: any) => {
      const key = `${(event as any).id}:${member.id}`;
      const rsvp = rsvpLookup.get(key) as any;
      return {
        ...member,
        rsvp_status: rsvp?.status || null,
        admin_override: rsvp?.admin_override || 0,
      };
    });
  }

  // Get vote leaders from shared utility
  const { topRestaurant, topDate } = await getActivePollLeaders(db);

  return {
    events: eventsResult.results || [],
    topRestaurant,
    topDate,
    smsMembers: smsMembersResult.results || [],
    eventMembersById,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create') {
    const restaurant_name = formData.get('restaurant_name');
    const restaurant_address = formData.get('restaurant_address');
    const event_date = formData.get('event_date');
    const event_time = formData.get('event_time') || '18:00'; // Default to 6 PM
    const send_invites = formData.get('send_invites') === 'true';

    if (!restaurant_name || !event_date) {
      return { error: 'Restaurant name and date are required' };
    }

    try {
      const result = await db
        .prepare('INSERT INTO events (restaurant_name, restaurant_address, event_date, event_time, status) VALUES (?, ?, ?, ?, ?)')
        .bind(restaurant_name, restaurant_address || null, event_date, event_time, 'upcoming')
        .run();

      const eventId = result.meta.last_row_id;

      // Send calendar invites if requested
      if (send_invites && eventId) {
        const { sendEventInvites } = await import('../lib/email.server');

        // Get all active users
        const usersResult = await db
          .prepare("SELECT email FROM users WHERE status = 'active'")
          .all();

        const recipientEmails = (usersResult.results || []).map((u: any) => u.email);

        if (recipientEmails.length > 0) {
          const resendApiKey = context.cloudflare.env.RESEND_API_KEY;

          // Use waitUntil if available for background processing
          const invitePromise = sendEventInvites({
            eventId: Number(eventId),
            restaurantName: restaurant_name as string,
            restaurantAddress: restaurant_address as string | null,
            eventDate: event_date as string,
            eventTime: event_time as string,
            recipientEmails,
            resendApiKey,
          }).then(result => {
            console.log(`Calendar invites sent: ${result.sentCount}/${recipientEmails.length}`);
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

      return redirect('/dashboard/admin/events');
    } catch (err) {
      console.error('Event creation error:', err);
      return { error: 'Failed to create event' };
    }
  }

  if (actionType === 'override_rsvp') {
    const eventId = Number(formData.get('event_id'));
    const userId = Number(formData.get('user_id'));
    const status = String(formData.get('status') || '');

    if (!eventId || !userId || !status) {
      return { error: 'Event, user, and status are required for RSVP overrides' };
    }

    const validStatuses = new Set(['yes', 'no', 'maybe']);
    if (!validStatuses.has(status)) {
      return { error: 'Invalid RSVP status' };
    }

    const event = await db
      .prepare('SELECT id, restaurant_name, event_date, event_time FROM events WHERE id = ?')
      .bind(eventId)
      .first();

    const targetUser = await db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!event || !targetUser) {
      return { error: 'Event or user not found' };
    }

    const existing = await db
      .prepare('SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?')
      .bind(eventId, userId)
      .first();

    if (existing) {
      await db
        .prepare(`
          UPDATE rsvps
          SET status = ?,
              admin_override = 1,
              admin_override_by = ?,
              admin_override_at = CURRENT_TIMESTAMP
          WHERE event_id = ? AND user_id = ?
        `)
        .bind(status, admin.id, eventId, userId)
        .run();
    } else {
      await db
        .prepare(`
          INSERT INTO rsvps (event_id, user_id, status, admin_override, admin_override_by, admin_override_at)
          VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
        `)
        .bind(eventId, userId, status, admin.id)
        .run();
    }

    await logActivity({
      db,
      userId: admin.id,
      actionType: 'admin_override_rsvp',
      actionDetails: { event_id: eventId, user_id: userId, status },
      route: '/dashboard/admin/events',
      request,
    });

    const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
    if (resendApiKey) {
      const { sendRsvpOverrideEmail } = await import('../lib/email.server');
      const emailPromise = sendRsvpOverrideEmail({
        to: (targetUser as any).email,
        recipientName: (targetUser as any).name || null,
        adminName: admin.name || admin.email,
        eventName: (event as any).restaurant_name,
        eventDate: formatDateForDisplay((event as any).event_date, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        eventTime: formatTimeForDisplay((event as any).event_time || '18:00'),
        rsvpStatus: status,
        eventUrl: 'https://meatup.club/dashboard/events',
        resendApiKey,
      }).catch((error: Error) => {
        console.error('RSVP override email failed:', error);
        return { success: false, error: error.message };
      });

      if (context.cloudflare.ctx?.waitUntil) {
        context.cloudflare.ctx.waitUntil(emailPromise);
      } else {
        await emailPromise;
      }
    }

    return { success: 'RSVP override saved and user notified.' };
  }

  if (actionType === 'update') {
    const id = formData.get('id');
    const restaurant_name = formData.get('restaurant_name');
    const restaurant_address = formData.get('restaurant_address');
    const event_date = formData.get('event_date');
    const event_time = (formData.get('event_time') as string) || '18:00';
    const status = formData.get('status');
    const send_updates = formData.get('send_updates') === 'true';

    if (!id || !restaurant_name || !event_date) {
      return { error: 'ID, restaurant name and date are required' };
    }

    try {
      // Update the event and increment calendar sequence for updates
      const eventId = Number(id);
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
        .bind(restaurant_name, restaurant_address || null, event_date, event_time, status, eventId)
        .run();

      // Send calendar updates if requested
      if (send_updates) {
        const { sendEventUpdate } = await import('../lib/email.server');

        // Get all active users and their RSVP status for this event
        const usersResult = await db
          .prepare(`
            SELECT u.email, r.status as rsvp_status
            FROM users u
            LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
            WHERE u.status = 'active'
          `)
          .bind(eventId)
          .all();

        if (usersResult.results && usersResult.results.length > 0) {
          const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
          const eventMeta = await db
            .prepare('SELECT calendar_sequence FROM events WHERE id = ?')
            .bind(eventId)
            .first();
          const calendarSequence = Number((eventMeta as any)?.calendar_sequence ?? 1);

          const updatePromises = usersResult.results.map((user: any) =>
            sendEventUpdate({
              eventId,
              restaurantName: restaurant_name as string,
              restaurantAddress: restaurant_address as string | null,
              eventDate: event_date as string,
              eventTime: event_time,
              userEmail: user.email,
              rsvpStatus: user.rsvp_status || undefined,
              sequence: calendarSequence,
              resendApiKey,
            }).catch(err => {
              console.error(`Failed to send event update to ${user.email}:`, err);
              return { success: false, error: err.message };
            })
          );

          // Use waitUntil if available for background processing
          const allUpdates = Promise.all(updatePromises).then(results => {
            const successCount = results.filter((r: { success: boolean }) => r.success).length;
            const failureCount = results.filter((r: { success: boolean }) => !r.success).length;
            console.log(`Calendar updates sent: ${successCount} succeeded, ${failureCount} failed`);
            return results;
          });

          if (context.cloudflare.ctx?.waitUntil) {
            context.cloudflare.ctx.waitUntil(allUpdates);
          } else {
            await allUpdates;
          }
        }
      }

      return redirect('/dashboard/admin/events');
    } catch (err) {
      console.error('Event update error:', err);
      return { error: 'Failed to update event' };
    }
  }

  if (actionType === 'delete') {
    const id = formData.get('id');

    if (!id) {
      return { error: 'Event ID is required' };
    }

    try {
      const eventId = Number(id);
      const event = await db
        .prepare('SELECT id, restaurant_name, restaurant_address, event_date, event_time, calendar_sequence FROM events WHERE id = ?')
        .bind(eventId)
        .first();

      if (event) {
        const { sendEventCancellation } = await import('../lib/email.server');
        const usersResult = await db
          .prepare(`
            SELECT u.email
            FROM users u
            WHERE u.status = 'active'
          `)
          .all();

        if (usersResult.results && usersResult.results.length > 0) {
          const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
          const calendarSequence = Number((event as any).calendar_sequence ?? 0) + 1;
          const eventTime = (event as any).event_time || '18:00';

          const cancelPromises = usersResult.results.map((user: any) =>
            sendEventCancellation({
              eventId,
              restaurantName: (event as any).restaurant_name,
              restaurantAddress: (event as any).restaurant_address || null,
              eventDate: (event as any).event_date,
              eventTime,
              userEmail: user.email,
              sequence: calendarSequence,
              resendApiKey,
            }).catch(err => {
              console.error(`Failed to send cancellation to ${user.email}:`, err);
              return { success: false, error: err.message };
            })
          );

          const allCancellations = Promise.all(cancelPromises).then(results => {
            const successCount = results.filter((r: { success: boolean }) => r.success).length;
            const failureCount = results.filter((r: { success: boolean }) => !r.success).length;
            console.log(`Event cancellations sent: ${successCount} succeeded, ${failureCount} failed`);
            return results;
          });

          if (context.cloudflare.ctx?.waitUntil) {
            context.cloudflare.ctx.waitUntil(allCancellations);
          } else {
            await allCancellations;
          }
        }
      }

      await db
        .prepare('DELETE FROM events WHERE id = ?')
        .bind(eventId)
        .run();

      return redirect('/dashboard/admin/events');
    } catch (err) {
      return { error: 'Failed to delete event' };
    }
  }

  if (actionType === 'send_sms_reminder') {
    const eventId = Number(formData.get('event_id'));
    const messageType = formData.get('message_type');
    const customMessage = String(formData.get('custom_message') || '').trim();
    const recipientScope = String(formData.get('recipient_scope') || 'all');
    const recipientUserIdRaw = String(formData.get('recipient_user_id') || '').trim();
    const recipientUserId = recipientUserIdRaw ? Number(recipientUserIdRaw) : null;

    if (!eventId) {
      return { error: 'Event ID is required for SMS reminders' };
    }

    if (messageType === 'custom' && !customMessage) {
      return { error: 'Custom SMS message cannot be empty' };
    }

    const event = await db
      .prepare('SELECT id, restaurant_name, restaurant_address, event_date, event_time FROM events WHERE id = ?')
      .bind(eventId)
      .first();

    if (!event) {
      return { error: 'Event not found' };
    }

    const validScopes = new Set(['all', 'yes', 'no', 'maybe', 'pending', 'specific']);
    if (!validScopes.has(recipientScope)) {
      return { error: 'Invalid recipient selection' };
    }

    if (recipientScope === 'specific' && !recipientUserId) {
      return { error: 'Select a specific recipient' };
    }

    const sendPromise = sendAdhocSmsReminder({
      db,
      env: context.cloudflare.env,
      event: event as any,
      customMessage: messageType === 'custom' ? customMessage : null,
      recipientScope: recipientScope as any,
      recipientUserId,
    });

    if (context.cloudflare.ctx?.waitUntil) {
      context.cloudflare.ctx.waitUntil(sendPromise);
      return { success: 'SMS reminder sending in the background.' };
    }

    const result = await sendPromise;
    if (result.errors.length > 0) {
      return { error: `Some SMS messages failed: ${result.errors[0]}` };
    }

    return { success: `Sent ${result.sent} SMS reminders.` };
  }

  return { error: 'Invalid action' };
}

export default function AdminEventsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { events, topRestaurant, topDate, smsMembers, eventMembersById } = loaderData;
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [smsScopeByEvent, setSmsScopeByEvent] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    id: 0,
    restaurant_name: '',
    restaurant_address: '',
    event_date: '',
    event_time: '18:00',
    status: '',
  });
  const submit = useSubmit();
  const navigation = useNavigation();
  const submittedActionRef = useRef<string | null>(null);

  function startEditing(event: any) {
    setEditingId(event.id);
    setEditData({
      id: event.id,
      restaurant_name: event.restaurant_name,
      restaurant_address: event.restaurant_address || '',
      event_date: event.event_date,
      event_time: event.event_time || '18:00',
      status: event.status,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditData({
      id: 0,
      restaurant_name: '',
      restaurant_address: '',
      event_date: '',
      event_time: '18:00',
      status: '',
    });
  }

  useEffect(() => {
    if (navigation.state === 'submitting' && navigation.formData) {
      const action = navigation.formData.get('_action');
      if (action === 'update') {
        submittedActionRef.current = 'update';
      }
    }
  }, [navigation.state, navigation.formData]);

  useEffect(() => {
    if (navigation.state === 'idle' && submittedActionRef.current === 'update') {
      submittedActionRef.current = null;
      if (!actionData?.error) {
        cancelEditing();
      }
    }
  }, [actionData, navigation.state]);

  function handleDelete(eventId: number, eventName: string, eventDate: string) {
    const dateStr = formatDateForDisplay(eventDate, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (confirm(`Are you sure you want to delete the event "${eventName}" on ${dateStr}? This action cannot be undone.`)) {
      const formData = new FormData();
      formData.append('_action', 'delete');
      formData.append('id', eventId.toString());
      submit(formData, { method: 'post' });
    }
  }

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
          <h1 className="text-3xl font-bold">Event Management</h1>
          <p className="text-muted-foreground mt-1">Create and manage meetup events</p>
        </div>
        <div className="flex gap-3">
          {topRestaurant && topDate && (
            <button
              onClick={() => {
                setShowCreateForm(true);
                // Auto-fill form with vote winners
                const form = document.getElementById('create-form') as HTMLFormElement;
                if (form) {
                  setTimeout(() => {
                    (form.elements.namedItem('restaurant_name') as HTMLInputElement).value = topRestaurant.name;
                    (form.elements.namedItem('restaurant_address') as HTMLInputElement).value = topRestaurant.address || '';
                    (form.elements.namedItem('event_date') as HTMLInputElement).value = topDate.suggested_date;
                  }, 0);
                }
              }}
              className="px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors"
            >
              Create from Vote Winners
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
          >
            {showCreateForm ? 'Cancel' : '+ Create Event'}
          </button>
        </div>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {actionData?.success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-6">
          {actionData.success}
        </div>
      )}

      {/* Vote Winners Summary */}
      <VoteLeadersCard
        topRestaurant={topRestaurant}
        topDate={topDate}
        variant="blue"
      />

      {/* Create Event Form */}
      {showCreateForm && (
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Event</h2>
          <Form method="post" id="create-form" className="space-y-4">
            <input type="hidden" name="_action" value="create" />

            <div>
              <label
                htmlFor="restaurant_name"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Restaurant Name *
              </label>
              <input
                id="restaurant_name"
                name="restaurant_name"
                type="text"
                required
                placeholder="e.g., Ruth's Chris Steak House"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
              />
            </div>

            <div>
              <label
                htmlFor="restaurant_address"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Restaurant Address (Optional)
              </label>
              <input
                id="restaurant_address"
                name="restaurant_address"
                type="text"
                placeholder="e.g., 123 Main St, San Francisco, CA"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="event_date"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Event Date *
                </label>
                <input
                  id="event_date"
                  name="event_date"
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                />
              </div>

              <div>
                <label
                  htmlFor="event_time"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Event Time
                </label>
                <input
                  id="event_time"
                  name="event_time"
                  type="time"
                  defaultValue="18:00"
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="send_invites"
                name="send_invites"
                type="checkbox"
                value="true"
                defaultChecked={true}
                className="h-4 w-4 text-meat-red focus:ring-meat-red border-border rounded"
              />
              <label htmlFor="send_invites" className="ml-2 block text-sm text-foreground">
                Send calendar invites to all active members
              </label>
            </div>

            <button
              type="submit"
              className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
            >
              Create Event
            </button>
          </Form>
        </div>
      )}

      {/* Events List */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">All Events</h2>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No events created yet. Create your first event above!
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((event: any) => (
              <div key={event.id} className="p-6">
                {editingId === event.id ? (
                  <Form method="post" className="space-y-4">
                    <input type="hidden" name="_action" value="update" />
                    <input type="hidden" name="id" value={editData.id} />

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Restaurant Name *
                      </label>
                      <input
                        name="restaurant_name"
                        type="text"
                        required
                        value={editData.restaurant_name}
                        onChange={(e) =>
                          setEditData({ ...editData, restaurant_name: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Restaurant Address
                      </label>
                      <input
                        name="restaurant_address"
                        type="text"
                        value={editData.restaurant_address}
                        onChange={(e) =>
                          setEditData({ ...editData, restaurant_address: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Event Date *
                        </label>
                        <input
                          name="event_date"
                          type="date"
                          required
                          value={editData.event_date}
                          onChange={(e) =>
                            setEditData({ ...editData, event_date: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Event Time
                        </label>
                        <input
                          name="event_time"
                          type="time"
                          value={editData.event_time}
                          onChange={(e) =>
                            setEditData({ ...editData, event_time: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Status *
                      </label>
                      <select
                        name="status"
                        value={editData.status}
                        onChange={(e) =>
                          setEditData({ ...editData, status: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div className="flex items-center">
                      <input
                        id="send_updates"
                        name="send_updates"
                        type="checkbox"
                        value="true"
                        defaultChecked={true}
                        className="h-4 w-4 text-meat-red focus:ring-meat-red border-border rounded"
                      />
                      <label htmlFor="send_updates" className="ml-2 block text-sm text-foreground">
                        Send calendar updates to all active members
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="submit"
                        className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-6 py-2 bg-muted text-foreground rounded-md font-medium hover:bg-muted/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </Form>
                ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {event.restaurant_name}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            event.status === 'upcoming'
                              ? 'bg-green-100 text-green-800'
                              : event.status === 'completed'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {event.status}
                        </span>
                      </div>
                      {event.restaurant_address && (
                        <p className="text-sm text-muted-foreground mb-1">
                          {event.restaurant_address}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {formatDateForDisplay(event.event_date, {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}{' '}
                        at {formatTimeForDisplay(event.event_time || '18:00')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Created {formatDateForDisplay(event.created_at)}
                      </p>
                      <div className="mt-4">
                        <Form method="post" className="space-y-3">
                          <input type="hidden" name="_action" value="send_sms_reminder" />
                          <input type="hidden" name="event_id" value={event.id} />
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                              SMS Reminder
                            </label>
                            <select
                              name="message_type"
                              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                              defaultValue="default"
                            >
                              <option value="default">Use default reminder template</option>
                              <option value="custom">Send custom message</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                              Recipients
                            </label>
                            <select
                              name="recipient_scope"
                              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                              value={smsScopeByEvent[event.id] || 'all'}
                              onChange={(eventScope) =>
                                setSmsScopeByEvent((prev) => ({
                                  ...prev,
                                  [event.id]: eventScope.target.value,
                                }))
                              }
                            >
                              <option value="all">All SMS-opted members</option>
                              <option value="pending">No RSVP yet</option>
                              <option value="yes">RSVP Yes</option>
                              <option value="no">RSVP No</option>
                              <option value="maybe">RSVP Maybe</option>
                              <option value="specific">Specific member</option>
                            </select>
                          </div>
                          {(smsScopeByEvent[event.id] || 'all') === 'specific' && (
                            <div>
                              <label className="block text-sm font-medium text-foreground mb-1">
                                Specific Recipient
                              </label>
                              <select
                                name="recipient_user_id"
                                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                                defaultValue=""
                              >
                                <option value="">Select a member</option>
                                {smsMembers.map((member: any) => (
                                  <option key={member.id} value={member.id}>
                                    {member.name || member.email}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                              Custom Message (Optional)
                            </label>
                            <textarea
                              name="custom_message"
                              rows={3}
                              placeholder="Add a custom note (RSVP + opt-out instructions are appended automatically)."
                              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                            />
                          </div>
                          <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-meat-red rounded-md hover:bg-meat-brown transition-colors"
                          >
                            Send SMS Reminder
                          </button>
                        </Form>
                      </div>
                    </div>
                      <div className="flex gap-2">
                        <button
                        onClick={() => startEditing(event)}
                        className="px-4 py-2 text-sm font-medium text-meat-red hover:bg-red-50 rounded-md transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(event.id, event.restaurant_name, event.event_date)}
                        className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                    {event.status === 'upcoming' && (
                      <div className="mt-6 border-t border-border pt-4">
                        <h4 className="text-sm font-semibold text-foreground mb-3">RSVP Overrides</h4>
                        <div className="space-y-3">
                          {(eventMembersById[event.id] || []).map((member: any) => (
                            <Form key={member.id} method="post" className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input type="hidden" name="_action" value="override_rsvp" />
                              <input type="hidden" name="event_id" value={event.id} />
                              <input type="hidden" name="user_id" value={member.id} />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-foreground">
                                  {member.name || member.email}
                                  {member.admin_override === 1 && (
                                    <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                      Admin override
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Current RSVP: {member.rsvp_status || 'pending'}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <select
                                  name="status"
                                  defaultValue={member.rsvp_status || 'maybe'}
                                  className="px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-meat-red"
                                >
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                  <option value="maybe">Maybe</option>
                                </select>
                                <button
                                  type="submit"
                                  className="px-4 py-2 text-sm font-medium text-white bg-meat-red rounded-md hover:bg-meat-brown transition-colors"
                                >
                                  Override
                                </button>
                              </div>
                            </Form>
                          ))}
                        </div>
                      </div>
                    )}
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
