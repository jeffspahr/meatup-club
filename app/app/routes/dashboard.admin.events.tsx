import { Form, Link, redirect, useNavigation, useSubmit } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { D1Result } from "@cloudflare/workers-types";
import type { Route } from "./+types/dashboard.admin.events";
import { requireAdmin } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import {
  buildCreateEventStatement,
  buildDeleteEventStatement,
  buildSelectLastInsertedEventIdStatement,
  buildUpdateEventStatement,
  getInsertedEventIdFromQueryResult,
  getEditableEventById,
  parseEventMutationFormData,
} from "../lib/events.server";
import {
  buildSelectStagedDeliveryIdsStatement,
  buildStageEventCancellationDeliveriesForActiveMembersStatement,
  buildStageEventInviteDeliveriesForLastInsertedEventStatement,
  buildStageEventUpdateDeliveriesForActiveMembersStatement,
  buildStageEventUpdateDeliveriesStatement,
  enqueueStagedEventEmailBatch,
  getActiveMemberIdsWithoutAcceptedEventEmailDelivery,
  listEventEmailRecipientDeliveryHistory,
  toStagedEventEmailBatchFromQueryResult,
  type EventEmailDeliveryStatus,
  type StagedEventEmailBatch,
} from "../lib/event-email-delivery.server";
import { upsertRsvp } from "../lib/rsvps.server";
import VoteLeadersCard from "../components/VoteLeadersCard";
import { EventRestaurantFields } from "../components/EventRestaurantFields";
import { getActivePollLeaders } from "../lib/polls.server";
import { formatDateForDisplay, formatTimeForDisplay, getAppTimeZone, isEventInPastInTimeZone } from "../lib/dateUtils";
import { sendAdhocSmsReminder } from "../lib/sms.server";
import type { SmsEvent, SmsRecipientScope } from "../lib/sms.server";
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import type { VoteWinner, DateWinner } from "../lib/types";
import { AdminLayout } from "../components/AdminLayout";
import { confirmAction } from "../lib/confirm.client";

interface AdminEventRow {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string | null;
  status: string;
  calendar_sequence?: number | null;
  created_at: string;
  displayStatus?: 'upcoming' | 'completed' | 'cancelled';
}

interface SmsMemberRow {
  id: number;
  name: string | null;
  email: string;
}

interface RsvpLookupRow {
  event_id: number;
  user_id: number;
  status: string | null;
  admin_override: number;
  name: string | null;
  email: string;
}

interface ActiveMemberRow {
  id: number;
  name: string | null;
  email: string;
}

interface EventMembersRow extends ActiveMemberRow {
  rsvp_status: string | null;
  admin_override: number;
  hasAcceptedCalendarDelivery: boolean;
  hasDeliveredCalendarDelivery: boolean;
  lastCalendarDeliveryStatus: EventEmailDeliveryStatus | null;
  lastCalendarDeliveryType: "invite" | "update" | "cancel" | null;
}

interface EventForNotificationRow {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string | null;
  calendar_sequence: number | null;
}

interface TargetUserRow {
  id: number;
  name: string | null;
  email: string;
}

function parseRecipientUserIds(formData: FormData): number[] {
  return Array.from(
    new Set(
      formData
        .getAll("recipient_user_ids")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).sort((left, right) => left - right);
}

function getCalendarDeliveryBadge(member: EventMembersRow): {
  label: string;
  variant: "accent" | "success" | "danger" | "warning" | "muted";
} {
  if (member.hasDeliveredCalendarDelivery) {
    return { label: "Delivered", variant: "success" };
  }

  if (member.hasAcceptedCalendarDelivery) {
    return { label: "Accepted", variant: "accent" };
  }

  switch (member.lastCalendarDeliveryStatus) {
    case "delivery_delayed":
      return { label: "Delayed", variant: "warning" };
    case "retry":
      return { label: "Retrying", variant: "warning" };
    case "failed":
    case "bounced":
    case "complained":
      return { label: "Failed", variant: "danger" };
    case "sending":
      return { label: "Sending", variant: "accent" };
    case "pending":
      return { label: "Pending", variant: "muted" };
    default:
      return { label: "No accepted send", variant: "muted" };
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  // Fetch all events
  const eventsResult = await db
    .prepare('SELECT * FROM events ORDER BY event_date DESC')
    .all();
  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);
  const events = (eventsResult.results || []) as unknown as AdminEventRow[];
  const eventsWithDisplayStatus = events.map((event) => ({
    ...event,
    displayStatus: event.status === 'cancelled'
      ? 'cancelled'
      : isEventInPastInTimeZone(event.event_date, event.event_time || '18:00', appTimeZone)
        ? 'completed'
        : 'upcoming',
  }));

  const [
    smsMembersResult,
    rsvpRowsResult,
    activeMembersResult,
    deliveryHistory,
    voteLeaders,
  ] = await Promise.all([
    db
      .prepare(`
        SELECT id, name, email
        FROM users
        WHERE status = 'active'
          AND sms_opt_in = 1
          AND sms_opt_out_at IS NULL
          AND phone_number IS NOT NULL
        ORDER BY name ASC, email ASC
      `)
      .all(),
    db
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
      .all(),
    db
      .prepare('SELECT id, name, email FROM users WHERE status = ? ORDER BY name ASC, email ASC')
      .bind('active')
      .all(),
    listEventEmailRecipientDeliveryHistory(db),
    getActivePollLeaders(db),
  ]);

  const smsMembers = (smsMembersResult.results || []) as unknown as SmsMemberRow[];
  const rsvpRows = (rsvpRowsResult.results || []) as unknown as RsvpLookupRow[];
  const activeMembers = (activeMembersResult.results || []) as unknown as ActiveMemberRow[];
  const rsvpLookup = new Map<string, RsvpLookupRow>();
  for (const row of rsvpRows) {
    const key = `${row.event_id}:${row.user_id}`;
    rsvpLookup.set(key, row);
  }

  const deliveryHistoryLookup = new Map<
    string,
    {
      hasAcceptedDelivery: boolean;
      hasDeliveredDelivery: boolean;
      latestStatus: EventEmailDeliveryStatus | null;
      latestDeliveryType: "invite" | "update" | "cancel" | null;
    }
  >();
  for (const row of deliveryHistory) {
    const key = `${row.eventId}:${row.userId}`;
    deliveryHistoryLookup.set(key, {
      hasAcceptedDelivery: row.hasAcceptedDelivery,
      hasDeliveredDelivery: row.hasDeliveredDelivery,
      latestStatus: row.latestStatus,
      latestDeliveryType: row.latestDeliveryType,
    });
  }

  const eventMembersById: Record<number, EventMembersRow[]> = {};
  for (const event of events) {
    eventMembersById[event.id] = activeMembers.map((member) => {
      const key = `${event.id}:${member.id}`;
      const rsvp = rsvpLookup.get(key);
      const deliveryHistoryRow = deliveryHistoryLookup.get(key);
      return {
        ...member,
        rsvp_status: rsvp?.status || null,
        admin_override: rsvp?.admin_override || 0,
        hasAcceptedCalendarDelivery: deliveryHistoryRow?.hasAcceptedDelivery || false,
        hasDeliveredCalendarDelivery: deliveryHistoryRow?.hasDeliveredDelivery || false,
        lastCalendarDeliveryStatus: deliveryHistoryRow?.latestStatus || null,
        lastCalendarDeliveryType: deliveryHistoryRow?.latestDeliveryType || null,
      };
    });
  }
  const { topRestaurant, topDate } = voteLeaders;

  return {
    events: eventsWithDisplayStatus,
    topRestaurant,
    topDate,
    smsMembers,
    eventMembersById,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const actionType = formData.get('_action');
  const queueContext = {
    db,
    queue: context.cloudflare.env.EMAIL_DELIVERY_QUEUE,
  };

  if (actionType === 'create') {
    const send_invites = formData.get('send_invites') === 'true';
    const parsed = parseEventMutationFormData(formData);
    if (parsed.error || !parsed.value) {
      return { error: parsed.error || 'Failed to create event' };
    }

    const input = parsed.value;

    try {
      let eventId = 0;
      let stagedInviteBatch: StagedEventEmailBatch | null = null;
      const createBatchId = send_invites ? crypto.randomUUID() : null;
      const createStatements = [
        buildCreateEventStatement(db, input, admin.id),
        buildSelectLastInsertedEventIdStatement(db),
      ];

      if (createBatchId) {
        createStatements.push(
          buildStageEventInviteDeliveriesForLastInsertedEventStatement(db, {
            batchId: createBatchId,
            details: {
              restaurantName: input.restaurantName,
              restaurantAddress: input.restaurantAddress,
              eventDate: input.eventDate,
              eventTime: input.eventTime,
            },
          }),
          buildSelectStagedDeliveryIdsStatement(db, createBatchId)
        );
      }

      const createResults = await db.batch(createStatements);
      eventId = getInsertedEventIdFromQueryResult(
        createResults[1] as D1Result<{ id: number }>
      ) || 0;

      if (!eventId) {
        throw new Error('Failed to determine created event id');
      }

      if (createBatchId) {
        stagedInviteBatch = toStagedEventEmailBatchFromQueryResult(
          createBatchId,
          'invite',
          createResults[createResults.length - 1] as D1Result<{ id: number }>
        );
      }

      try {
        await enqueueStagedEventEmailBatch(queueContext, stagedInviteBatch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Failed to enqueue staged event invite deliveries', { eventId, message });
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
      .first() as Pick<EventForNotificationRow, "id" | "restaurant_name" | "event_date" | "event_time"> | null;

    const targetUser = await db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .bind(userId)
      .first() as TargetUserRow | null;

    if (!event || !targetUser) {
      return { error: 'Event or user not found' };
    }

    const mutation = await upsertRsvp({
      db,
      eventId,
      userId,
      status,
      source: "admin_override",
      actorUserId: admin.id,
      adminOverride: true,
    });

    if (mutation.mutation !== "noop") {
      await logActivity({
        db,
        userId: admin.id,
        actionType: 'admin_override_rsvp',
        actionDetails: { event_id: eventId, user_id: userId, status },
        route: '/dashboard/admin/events',
        request,
      });
    }

    const resendApiKey = context.cloudflare.env.RESEND_API_KEY || "";
    if (resendApiKey && mutation.mutation !== "noop") {
      const { sendRsvpOverrideEmail } = await import('../lib/email.server');
      const emailPromise = sendRsvpOverrideEmail({
        to: targetUser.email,
        recipientName: targetUser.name || null,
        adminName: admin.name || admin.email,
        eventName: event.restaurant_name,
        eventDate: formatDateForDisplay(event.event_date, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        eventTime: formatTimeForDisplay(event.event_time || '18:00'),
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
    const send_updates = formData.get('send_updates') === 'true';
    const parsed = parseEventMutationFormData(formData, { allowCancelled: true });

    if (!id) {
      return { error: 'Event ID is required' };
    }

    if (parsed.error || !parsed.value) {
      return { error: parsed.error || 'Failed to update event' };
    }

    const input = parsed.value;

    try {
      const eventId = Number(id);
      const existingEvent = await getEditableEventById(db, eventId);
      if (!existingEvent) {
        return { error: 'Event not found' };
      }

      const nextSequence = Number(existingEvent.calendar_sequence ?? 0) + 1;
      let stagedUpdateBatch: StagedEventEmailBatch | null = null;
      const updateBatchId = send_updates ? crypto.randomUUID() : null;
      const updateStatements = [
        buildUpdateEventStatement(db, eventId, input, nextSequence),
      ];

      if (updateBatchId) {
        updateStatements.push(
          buildStageEventUpdateDeliveriesForActiveMembersStatement(db, {
            batchId: updateBatchId,
            details: {
              eventId,
              restaurantName: input.restaurantName,
              restaurantAddress: input.restaurantAddress,
              eventDate: input.eventDate,
              eventTime: input.eventTime,
            },
            calendarSequence: nextSequence,
          }),
          buildSelectStagedDeliveryIdsStatement(db, updateBatchId)
        );
      }

      const updateResults = await db.batch(updateStatements);

      if (updateBatchId) {
        stagedUpdateBatch = toStagedEventEmailBatchFromQueryResult(
          updateBatchId,
          'update',
          updateResults[updateResults.length - 1] as D1Result<{ id: number }>
        );
      }

      try {
        await enqueueStagedEventEmailBatch(queueContext, stagedUpdateBatch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Failed to enqueue staged event update deliveries', { eventId, message });
      }

      return redirect('/dashboard/admin/events');
    } catch (err) {
      console.error('Event update error:', err);
      return { error: 'Failed to update event' };
    }
  }

  if (actionType === 'resend_calendar_request') {
    const id = formData.get('id');
    const recipientMode = String(formData.get('recipient_mode') || 'missing');

    if (!id) {
      return { error: 'Event ID is required' };
    }

    const validRecipientModes = new Set(['missing', 'selected', 'all']);
    if (!validRecipientModes.has(recipientMode)) {
      return { error: 'Invalid calendar resend recipient selection' };
    }

    try {
      const eventId = Number(id);
      const event = await getEditableEventById(db, eventId);

      if (!event) {
        return { error: 'Event not found' };
      }

      if (event.status === 'cancelled') {
        return { error: 'Cancelled events cannot be resent' };
      }

      let targetUserIds: number[] = [];
      if (recipientMode === 'missing') {
        targetUserIds = await getActiveMemberIdsWithoutAcceptedEventEmailDelivery(db, eventId);
        if (targetUserIds.length === 0) {
          return {
            success:
              'All active members already have a provider-accepted or delivered calendar email for this event.',
          };
        }
      } else if (recipientMode === 'selected') {
        const selectedUserIds = parseRecipientUserIds(formData);
        if (selectedUserIds.length === 0) {
          return { error: 'Select at least one active member for a selective resend' };
        }

        const activeSelectedResult = await db
          .prepare(
            `
              SELECT id
              FROM users
              WHERE status = 'active'
                AND id IN (${selectedUserIds.map(() => '?').join(', ')})
              ORDER BY id ASC
            `
          )
          .bind(...selectedUserIds)
          .all();

        targetUserIds = ((activeSelectedResult.results || []) as Array<{ id: number }>).map(
          (row) => Number(row.id)
        );

        if (targetUserIds.length === 0) {
          return { error: 'No active members were selected for calendar resend' };
        }
      } else {
        const activeUserIdsResult = await db
          .prepare(
            `
              SELECT id
              FROM users
              WHERE status = 'active'
              ORDER BY id ASC
            `
          )
          .all();

        targetUserIds = ((activeUserIdsResult.results || []) as Array<{ id: number }>).map(
          (row) => Number(row.id)
        );

        if (targetUserIds.length === 0) {
          return { error: 'No active members are available for calendar resend' };
        }
      }

      const nextSequence = Number(event.calendar_sequence ?? 0) + 1;

      const resendBatchId = crypto.randomUUID();
      const resendStatements = await db.batch([
        db
          .prepare(
            `
              UPDATE events
              SET calendar_sequence = ?
              WHERE id = ?
            `
          )
          .bind(nextSequence, eventId),
        buildStageEventUpdateDeliveriesStatement(db, {
          batchId: resendBatchId,
          details: {
            eventId,
            restaurantName: event.restaurant_name,
            restaurantAddress: event.restaurant_address,
            eventDate: event.event_date,
            eventTime: event.event_time || '18:00',
          },
          userIds: targetUserIds,
          calendarSequence: nextSequence,
        }),
        buildSelectStagedDeliveryIdsStatement(db, resendBatchId),
      ]);

      const resendBatch = toStagedEventEmailBatchFromQueryResult(
        resendBatchId,
        'update',
        resendStatements[2] as unknown as D1Result<{ id: number }>
      );

      if (!resendBatch || resendBatch.recipientCount === 0) {
        return { error: 'No eligible members were available for calendar resend' };
      }

      try {
        await enqueueStagedEventEmailBatch(queueContext, resendBatch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Failed to enqueue resent event calendar deliveries', { eventId, message });
      }

      await logActivity({
        db,
        userId: admin.id,
        actionType: 'resend_event_calendar',
        actionDetails: {
          event_id: eventId,
          calendar_sequence: nextSequence,
          recipient_mode: recipientMode,
          recipient_count: resendBatch.recipientCount,
          selected_user_ids: recipientMode === 'selected' ? targetUserIds : undefined,
        },
        route: '/dashboard/admin/events',
        request,
      });

      const memberLabel = resendBatch.recipientCount === 1 ? 'member' : 'members';
      const modeLabel =
        recipientMode === 'missing'
          ? 'missing active'
          : recipientMode === 'selected'
            ? 'selected active'
            : 'active';
      return {
        success: `Queued calendar resend for ${resendBatch.recipientCount} ${modeLabel} ${memberLabel}.`,
      };
    } catch (error) {
      console.error('Event calendar resend error:', error);
      return { error: 'Failed to resend calendar event' };
    }
  }

  if (actionType === 'delete') {
    const id = formData.get('id');

    if (!id) {
      return { error: 'Event ID is required' };
    }

    try {
      const eventId = Number(id);
      let stagedCancellationBatch: StagedEventEmailBatch | null = null;
      const event = await db
        .prepare('SELECT id, restaurant_name, restaurant_address, event_date, event_time, calendar_sequence FROM events WHERE id = ?')
        .bind(eventId)
        .first() as EventForNotificationRow | null;

      const deleteBatchId = event ? crypto.randomUUID() : null;
      const deleteStatements = [];

      if (event && deleteBatchId) {
        deleteStatements.push(
          buildStageEventCancellationDeliveriesForActiveMembersStatement(db, {
            batchId: deleteBatchId,
            details: {
              eventId,
              restaurantName: event.restaurant_name,
              restaurantAddress: event.restaurant_address || null,
              eventDate: event.event_date,
              eventTime: event.event_time || '18:00',
              sequence: Number(event.calendar_sequence ?? 0) + 1,
            },
          })
        );
      }

      deleteStatements.push(buildDeleteEventStatement(db, eventId));

      if (deleteBatchId) {
        deleteStatements.push(buildSelectStagedDeliveryIdsStatement(db, deleteBatchId));
      }

      const deleteResults = await db.batch(deleteStatements);

      if (deleteBatchId) {
        stagedCancellationBatch = toStagedEventEmailBatchFromQueryResult(
          deleteBatchId,
          'cancel',
          deleteResults[deleteResults.length - 1] as D1Result<{ id: number }>
        );
      }

      try {
        await enqueueStagedEventEmailBatch(queueContext, stagedCancellationBatch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Failed to enqueue staged event cancellation deliveries', { eventId, message });
      }

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
      event: event as SmsEvent,
      customMessage: messageType === 'custom' ? customMessage : null,
      recipientScope: recipientScope as SmsRecipientScope,
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
  const [createData, setCreateData] = useState({
    restaurant_name: '',
    restaurant_address: '',
    event_date: '',
    event_time: '18:00',
  });
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

  function resetCreateForm() {
    setCreateData({
      restaurant_name: '',
      restaurant_address: '',
      event_date: '',
      event_time: '18:00',
    });
  }

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
      if (action === 'update' || action === 'create') {
        submittedActionRef.current = String(action);
      }
    }
  }, [navigation.state, navigation.formData]);

  useEffect(() => {
    if (navigation.state === 'idle' && submittedActionRef.current) {
      const submittedAction = submittedActionRef.current;
      submittedActionRef.current = null;
      if (!actionData?.error && submittedAction === 'update') {
        cancelEditing();
      }
      if (!actionData?.error && submittedAction === 'create') {
        setShowCreateForm(false);
        resetCreateForm();
      }
    }
  }, [actionData, navigation.state]);

  function handleDelete(eventId: number, eventName: string, eventDate: string) {
    const dateStr = formatDateForDisplay(eventDate, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (!confirmAction(`Are you sure you want to delete the event "${eventName}" on ${dateStr}? This action cannot be undone.`)) {
      return;
    }
    const formData = new FormData();
    formData.append('_action', 'delete');
    formData.append('id', eventId.toString());
    submit(formData, { method: 'post' });
  }

  return (
    <AdminLayout>
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Event Management"
        description="Create and manage meetup events"
        actions={
          <>
            {topRestaurant && topDate && (
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateForm(true);
                  setCreateData({
                    restaurant_name: topRestaurant.name,
                    restaurant_address: topRestaurant.address || '',
                    event_date: topDate.suggested_date,
                    event_time: '18:00',
                  });
                }}
              >
                Prefill from Vote Leaders
              </Button>
            )}
            <Button
              onClick={() => {
                if (showCreateForm) {
                  setShowCreateForm(false);
                  resetCreateForm();
                  return;
                }

                setShowCreateForm(true);
              }}
            >
              {showCreateForm ? 'Cancel' : '+ Create Event'}
            </Button>
          </>
        }
      />

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      {actionData?.success && (
        <Alert variant="success" className="mb-6">
          {actionData.success}
        </Alert>
      )}

      {/* Vote Winners Summary */}
      <VoteLeadersCard
        topRestaurant={topRestaurant}
        topDate={topDate}
        variant="blue"
      />

      {/* Create Event Form */}
      {showCreateForm && (
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Event</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Creating an event here does not close the active poll. Use Poll Management to finalize winners and close voting.
          </p>
          <Form method="post" id="create-form" className="space-y-4">
            <input type="hidden" name="_action" value="create" />

            <EventRestaurantFields
              restaurantName={createData.restaurant_name}
              restaurantAddress={createData.restaurant_address}
              onRestaurantNameChange={(value) =>
                setCreateData((current) => ({ ...current, restaurant_name: value }))
              }
              onRestaurantAddressChange={(value) =>
                setCreateData((current) => ({ ...current, restaurant_address: value }))
              }
            />

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
                  value={createData.event_date}
                  onChange={(event) =>
                    setCreateData((current) => ({ ...current, event_date: event.target.value }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
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
                  value={createData.event_time}
                  onChange={(event) =>
                    setCreateData((current) => ({ ...current, event_time: event.target.value }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
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
                className="h-4 w-4 text-accent focus:ring-accent border-border rounded"
              />
              <label htmlFor="send_invites" className="ml-2 block text-sm text-foreground">
                Send calendar invites to all active members
              </label>
            </div>

            <Button type="submit">
              Create Event
            </Button>
          </Form>
        </Card>
      )}

      {/* Events List */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">All Events</h2>
        </div>
        {events.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No events created yet"
              description="Create your first event above!"
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((event: any) => {
              const eventMembers = eventMembersById[event.id] || [];
              const missingCalendarMembers = eventMembers.filter(
                (member: EventMembersRow) => !member.hasAcceptedCalendarDelivery
              );

              return (
                <div key={event.id} className="p-6">
                  {editingId === event.id ? (
                    <Form method="post" className="space-y-4">
                      <input type="hidden" name="_action" value="update" />
                      <input type="hidden" name="id" value={editData.id} />

                      <EventRestaurantFields
                        restaurantName={editData.restaurant_name}
                        restaurantAddress={editData.restaurant_address}
                        onRestaurantNameChange={(value) =>
                          setEditData({ ...editData, restaurant_name: value })
                        }
                        onRestaurantAddressChange={(value) =>
                          setEditData({ ...editData, restaurant_address: value })
                        }
                      />

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
                            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
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
                            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Status
                        </label>
                        <p className="text-sm text-muted-foreground">
                          {event.displayStatus} (auto)
                        </p>
                        <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            name="status"
                            value="cancelled"
                            checked={editData.status === 'cancelled'}
                            onChange={(e) =>
                              setEditData({ ...editData, status: e.target.checked ? 'cancelled' : 'upcoming' })
                            }
                            className="h-4 w-4 text-accent focus:ring-accent border-border rounded"
                          />
                          Mark as cancelled
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          id="send_updates"
                          name="send_updates"
                          type="checkbox"
                          value="true"
                          defaultChecked={true}
                          className="h-4 w-4 text-accent focus:ring-accent border-border rounded"
                        />
                        <label htmlFor="send_updates" className="ml-2 block text-sm text-foreground">
                          Send calendar updates to all active members
                        </label>
                      </div>

                      <div className="flex gap-3">
                        <Button type="submit">
                          Save Changes
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                      </div>
                    </Form>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-foreground">
                              {event.restaurant_name}
                            </h3>
                            <Badge
                              variant={
                                event.displayStatus === 'upcoming'
                                  ? 'success'
                                  : event.displayStatus === 'completed'
                                    ? 'muted'
                                    : 'danger'
                              }
                            >
                              {event.displayStatus}
                            </Badge>
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
                            })}{" "}
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
                                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
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
                                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
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
                                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
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
                                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                              </div>
                              <Button type="submit" size="sm">
                                Send SMS Reminder
                              </Button>
                            </Form>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(event)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(event.id, event.restaurant_name, event.event_date)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      {event.displayStatus === 'upcoming' && (
                        <div className="mt-6 rounded-md border border-border bg-muted/20 p-4">
                          <h4 className="text-sm font-semibold text-foreground">Calendar Resend</h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Queue a fresh calendar update using delivery history from the durable email pipeline.
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Currently missing: {missingCalendarMembers.length} of {eventMembers.length} active members.
                          </p>
                          <Form method="post" className="mt-4 space-y-4">
                            <input type="hidden" name="_action" value="resend_calendar_request" />
                            <input type="hidden" name="id" value={event.id} />
                            <div className="space-y-3">
                              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                                <input
                                  type="radio"
                                  name="recipient_mode"
                                  value="missing"
                                  defaultChecked={true}
                                  className="mt-1 h-4 w-4 text-accent focus:ring-accent border-border"
                                />
                                <div>
                                  <div className="text-sm font-medium text-foreground">Missing only</div>
                                  <div className="text-xs text-muted-foreground">
                                    Only active members without any provider-accepted or delivered calendar email for this event.
                                  </div>
                                </div>
                              </label>
                              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                                <input
                                  type="radio"
                                  name="recipient_mode"
                                  value="selected"
                                  className="mt-1 h-4 w-4 text-accent focus:ring-accent border-border"
                                />
                                <div>
                                  <div className="text-sm font-medium text-foreground">Selected members</div>
                                  <div className="text-xs text-muted-foreground">
                                    Choose a subset below, even if they already had a delivered or accepted calendar email.
                                  </div>
                                </div>
                              </label>
                              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                                <input
                                  type="radio"
                                  name="recipient_mode"
                                  value="all"
                                  className="mt-1 h-4 w-4 text-accent focus:ring-accent border-border"
                                />
                                <div>
                                  <div className="text-sm font-medium text-foreground">All active members</div>
                                  <div className="text-xs text-muted-foreground">
                                    Force a full calendar resend to every active member.
                                  </div>
                                </div>
                              </label>
                            </div>
                            <div>
                              <div className="mb-2 text-sm font-medium text-foreground">
                                Member delivery history
                              </div>
                              <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
                                {eventMembers.map((member: EventMembersRow) => {
                                  const deliveryBadge = getCalendarDeliveryBadge(member);
                                  return (
                                    <label
                                      key={member.id}
                                      className="flex items-start gap-3 px-3 py-3"
                                    >
                                      <input
                                        type="checkbox"
                                        name="recipient_user_ids"
                                        value={member.id}
                                        className="mt-1 h-4 w-4 text-accent focus:ring-accent border-border rounded"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-sm font-medium text-foreground">
                                            {member.name || member.email}
                                          </span>
                                          <Badge variant={deliveryBadge.variant}>
                                            {deliveryBadge.label}
                                          </Badge>
                                          {member.admin_override === 1 && (
                                            <Badge variant="warning">Admin override</Badge>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {member.email}
                                        </div>
                                        {member.lastCalendarDeliveryStatus && (
                                          <div className="text-xs text-muted-foreground">
                                            Latest calendar email: {member.lastCalendarDeliveryType || 'unknown'} / {member.lastCalendarDeliveryStatus}
                                          </div>
                                        )}
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Checkbox selections are used only when <span className="font-medium">Selected members</span> is chosen.
                              </p>
                            </div>
                            <Button type="submit" variant="secondary" size="sm">
                              Queue Calendar Resend
                            </Button>
                          </Form>
                        </div>
                      )}
                      {event.status === 'upcoming' && (
                        <div className="mt-6 border-t border-border pt-4">
                          <h4 className="text-sm font-semibold text-foreground mb-3">RSVP Overrides</h4>
                          <div className="space-y-3">
                            {eventMembers.map((member: any) => (
                              <Form key={member.id} method="post" className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input type="hidden" name="_action" value="override_rsvp" />
                                <input type="hidden" name="event_id" value={event.id} />
                                <input type="hidden" name="user_id" value={member.id} />
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-foreground">
                                    {member.name || member.email}
                                    {member.admin_override === 1 && (
                                      <Badge variant="warning" className="ml-2">
                                        Admin override
                                      </Badge>
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
                                    className="px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                  >
                                    <option value="yes">Yes</option>
                                    <option value="no">No</option>
                                    <option value="maybe">Maybe</option>
                                  </select>
                                  <Button type="submit" size="sm">
                                    Override
                                  </Button>
                                </div>
                              </Form>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
    </AdminLayout>
  );
}
