import { Form, Link, isRouteErrorResponse, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { D1Result } from "@cloudflare/workers-types";
import type { Route } from "./+types/dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import {
  buildCreateEventStatement,
  buildSelectLastInsertedEventIdStatement,
  getInsertedEventIdFromQueryResult,
  buildUpdateEventStatement,
  canEditEvent,
  getEditableEventById,
  parseEventMutationFormData,
} from "../lib/events.server";
import {
  buildSelectStagedDeliveryIdsStatement,
  buildStageEventInviteDeliveriesForLastInsertedEventStatement,
  buildStageEventUpdateDeliveriesForActiveMembersStatement,
  enqueueStagedEventEmailBatch,
  toStagedEventEmailBatchFromQueryResult,
  type StagedEventEmailBatch,
} from "../lib/event-email-delivery.server";
import { upsertRsvp } from "../lib/rsvps.server";
import { EventRestaurantFields } from "../components/EventRestaurantFields";
import { formatDateForDisplay, formatTimeForDisplay, getAppTimeZone, isEventInPastInTimeZone } from "../lib/dateUtils";
import type { Event, RsvpWithUser } from "../lib/types";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, UserAvatar } from "../components/ui";
import { CalendarDaysIcon, CheckIcon, ChevronDownIcon, ClockIcon, MapPinIcon, PencilSquareIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface EventRow extends Event {
  creator_name: string | null;
  creator_email: string | null;
}

interface MemberRow {
  id: number;
  name: string | null;
  email: string;
  picture: string | null;
}

interface EventCard extends EventRow {
  canEdit: boolean;
  creatorLabel: string;
  displayStatus?: "completed" | "cancelled";
  userRsvp?: { status: string; comments: string | null } | null;
  allRsvps?: RsvpWithUser[];
  notResponded?: MemberRow[];
}

interface EventFormState {
  restaurantName: string;
  restaurantAddress: string;
  eventDate: string;
  eventTime: string;
}

type EventMutationAction = "create" | "update" | "rsvp";

const EMPTY_EVENT_FORM: EventFormState = {
  restaurantName: "",
  restaurantAddress: "",
  eventDate: "",
  eventTime: "18:00",
};

function getEventDateTimeKey(event: Pick<Event, "event_date" | "event_time">): string {
  return `${event.event_date}T${event.event_time || "18:00"}`;
}

function sortEventsBySchedule<T extends Pick<Event, "event_date" | "event_time">>(
  events: T[],
  direction: "asc" | "desc"
): T[] {
  return [...events].sort((left, right) => {
    const comparison = getEventDateTimeKey(left).localeCompare(getEventDateTimeKey(right));
    return direction === "asc" ? comparison : -comparison;
  });
}

function getEventResponseCounts(event: Pick<EventCard, "allRsvps" | "notResponded">) {
  const allRsvps = event.allRsvps || [];

  return {
    yes: allRsvps.filter((rsvp) => rsvp.status === "yes").length,
    maybe: allRsvps.filter((rsvp) => rsvp.status === "maybe").length,
    no: allRsvps.filter((rsvp) => rsvp.status === "no").length,
    pending: event.notResponded?.length || 0,
  };
}

function getUserRsvpBadge(status: string | null | undefined) {
  if (status === "yes") {
    return { label: "You're in", variant: "success" as const };
  }

  if (status === "maybe") {
    return { label: "You're maybe", variant: "warning" as const };
  }

  if (status === "no") {
    return { label: "You're out", variant: "danger" as const };
  }

  return { label: "RSVP needed", variant: "muted" as const };
}

function getCreatorLabel(event: EventRow, currentUserId: number): string {
  if (event.created_by === currentUserId) {
    return "Created by you";
  }

  if (event.creator_name) {
    return `Created by ${event.creator_name}`;
  }

  if (event.creator_email) {
    return `Created by ${event.creator_email}`;
  }

  return "Created by an admin";
}

function toEditableState(event: EventCard): EventFormState & { id: number } {
  return {
    id: event.id,
    restaurantName: event.restaurant_name,
    restaurantAddress: event.restaurant_address || "",
    eventDate: event.event_date,
    eventTime: event.event_time || "18:00",
  };
}

interface EventEditFormProps {
  event: EventCard;
  formData: { id: number } & EventFormState;
  idPrefix: string;
  onCancel: () => void;
  onRestaurantNameChange: (value: string) => void;
  onRestaurantAddressChange: (value: string) => void;
  onEventDateChange: (value: string) => void;
  onEventTimeChange: (value: string) => void;
}

function EventEditForm({
  event,
  formData,
  idPrefix,
  onCancel,
  onRestaurantNameChange,
  onRestaurantAddressChange,
  onEventDateChange,
  onEventTimeChange,
}: EventEditFormProps) {
  return (
    <Form method="post" preventScrollReset className="space-y-4">
      <input type="hidden" name="_action" value="update" />
      <input type="hidden" name="id" value={formData.id} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Edit Event</h3>
          <p className="mt-1 text-sm text-muted-foreground">{event.creatorLabel}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <EventRestaurantFields
        restaurantName={formData.restaurantName}
        restaurantAddress={formData.restaurantAddress}
        onRestaurantNameChange={onRestaurantNameChange}
        onRestaurantAddressChange={onRestaurantAddressChange}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-date-${event.id}`} className="mb-1 block text-sm font-medium text-foreground">
            Event Date *
          </label>
          <input
            id={`${idPrefix}-date-${event.id}`}
            name="event_date"
            type="date"
            required
            value={formData.eventDate}
            onChange={(currentEvent) => onEventDateChange(currentEvent.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-time-${event.id}`} className="mb-1 block text-sm font-medium text-foreground">
            Event Time
          </label>
          <input
            id={`${idPrefix}-time-${event.id}`}
            name="event_time"
            type="time"
            value={formData.eventTime}
            onChange={(currentEvent) => onEventTimeChange(currentEvent.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          id={`${idPrefix}-send-updates-${event.id}`}
          name="send_updates"
          type="checkbox"
          value="true"
          defaultChecked={true}
          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        Send calendar updates to all active members
      </label>

      <Button type="submit">Save Changes</Button>
    </Form>
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  const [eventsResult, allMembersResult] = await Promise.all([
    db
      .prepare(`
        SELECT
          e.*,
          u.name as creator_name,
          u.email as creator_email
        FROM events e
        LEFT JOIN users u ON e.created_by = u.id
        ORDER BY e.event_date DESC
      `)
      .all(),
    db
      .prepare("SELECT id, name, email, picture FROM users WHERE status = ? ORDER BY name ASC")
      .bind("active")
      .all(),
  ]);

  const events = (eventsResult.results || []) as unknown as EventRow[];
  const allMembers = (allMembersResult.results || []) as unknown as MemberRow[];
  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);

  const upcomingEventsRaw = sortEventsBySchedule(
    events.filter(
      (event) =>
        event.status !== "cancelled" &&
        !isEventInPastInTimeZone(event.event_date, event.event_time || "18:00", appTimeZone)
    ),
    "asc"
  )
    .map((event) => ({
      ...event,
      canEdit: canEditEvent(user, event),
      creatorLabel: getCreatorLabel(event, user.id),
    }));

  const pastEvents = sortEventsBySchedule(
    events.filter(
      (event) =>
        event.status === "cancelled" ||
        isEventInPastInTimeZone(event.event_date, event.event_time || "18:00", appTimeZone)
    ),
    "desc"
  ).map((event) => ({
      ...event,
      canEdit: canEditEvent(user, event),
      creatorLabel: getCreatorLabel(event, user.id),
      displayStatus: event.status === "cancelled" ? "cancelled" : "completed",
    })) as EventCard[];

  const upcomingEvents = (await Promise.all(
    upcomingEventsRaw.map(async (event) => {
      const [userRsvp, allRsvpsResult] = await Promise.all([
        db
          .prepare("SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?")
          .bind(event.id, user.id)
          .first(),
        db
          .prepare(`
            SELECT r.*, u.name, u.email, u.picture
            FROM rsvps r
            JOIN users u ON r.user_id = u.id
            WHERE r.event_id = ?
            ORDER BY r.created_at ASC
          `)
          .bind(event.id)
          .all(),
      ]);

      const allRsvps = (allRsvpsResult.results || []) as unknown as RsvpWithUser[];
      const rsvpdUserIds = new Set(allRsvps.map((rsvp) => rsvp.user_id));
      const notResponded = allMembers.filter((member) => !rsvpdUserIds.has(member.id));

      return {
        ...event,
        userRsvp: userRsvp as EventCard["userRsvp"],
        allRsvps,
        notResponded,
      };
    })
  )) as EventCard[];

  return {
    currentUser: {
      id: user.id,
      isAdmin: user.is_admin === 1,
    },
    upcomingEvents,
    pastEvents,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const actionType = String(formData.get("_action") || "rsvp");
  const queueContext = {
    db,
    queue: context.cloudflare.env.EMAIL_DELIVERY_QUEUE,
  };

  if (actionType === "create") {
    const sendInvites = formData.get("send_invites") === "true";
    const parsed = parseEventMutationFormData(formData);

    if (parsed.error || !parsed.value) {
      return { error: parsed.error || "Failed to create event" };
    }

    const input = parsed.value;

    try {
      let eventId = 0;
      let stagedInviteBatch: StagedEventEmailBatch | null = null;
      const createBatchId = sendInvites ? crypto.randomUUID() : null;
      const createStatements = [
        buildCreateEventStatement(db, input, user.id),
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
        throw new Error("Failed to determine created event id");
      }

      if (createBatchId) {
        stagedInviteBatch = toStagedEventEmailBatchFromQueryResult(
          createBatchId,
          "invite",
          createResults[createResults.length - 1] as D1Result<{ id: number }>
        );
      }

      try {
        await enqueueStagedEventEmailBatch(queueContext, stagedInviteBatch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to enqueue staged event invite deliveries", { eventId, message });
      }

      await logActivity({
        db,
        userId: user.id,
        actionType: "create_event",
        actionDetails: { event_id: eventId, send_invites: sendInvites },
        route: "/dashboard/events",
        request,
      });

      return { ok: true as const, performedAction: "create" as EventMutationAction };
    } catch (error) {
      console.error("Event creation error:", error);
      return { error: "Failed to create event" };
    }
  }

  if (actionType === "update") {
    const eventId = Number(formData.get("id"));
    const sendUpdates = formData.get("send_updates") === "true";

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return { error: "Event ID is required" };
    }

    const existingEvent = await getEditableEventById(db, eventId);
    if (!existingEvent) {
      return { error: "Event not found" };
    }

    if (!canEditEvent(user, existingEvent)) {
      return { error: "You do not have permission to edit this event" };
    }

    const parsed = parseEventMutationFormData(formData);
    if (parsed.error || !parsed.value) {
      return { error: parsed.error || "Failed to update event" };
    }

    try {
      const input = {
        ...parsed.value,
        status: existingEvent.status === "cancelled" ? "cancelled" : "upcoming",
      } as const;

      const nextSequence = Number(existingEvent.calendar_sequence ?? 0) + 1;
      let stagedUpdateBatch: StagedEventEmailBatch | null = null;
      const updateBatchId = sendUpdates ? crypto.randomUUID() : null;
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
          "update",
          updateResults[updateResults.length - 1] as D1Result<{ id: number }>
        );
      }

      try {
        await enqueueStagedEventEmailBatch(queueContext, stagedUpdateBatch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to enqueue staged event update deliveries", { eventId, message });
      }

      await logActivity({
        db,
        userId: user.id,
        actionType: "update_event",
        actionDetails: { event_id: eventId, send_updates: sendUpdates },
        route: "/dashboard/events",
        request,
      });

      return { ok: true as const, performedAction: "update" as EventMutationAction };
    } catch (error) {
      console.error("Event update error:", error);
      return { error: "Failed to update event" };
    }
  }

  const eventId = formData.get("event_id");
  const status = formData.get("status");
  const comments = formData.get("comments");

  if (!eventId || !status) {
    return { error: "Missing required fields" };
  }

  const result = await upsertRsvp({
    db,
    eventId: Number(eventId),
    userId: user.id,
    status: String(status),
    comments: (comments as string) || null,
  });

  await logActivity({
    db,
    userId: user.id,
    actionType: result === "created" ? "rsvp" : "update_rsvp",
    actionDetails: { event_id: eventId, status, comments },
    route: "/dashboard/events",
    request,
  });

  return { ok: true as const, performedAction: "rsvp" as EventMutationAction };
}

export default function EventsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { upcomingEvents, pastEvents } = loaderData;
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createData, setCreateData] = useState(EMPTY_EVENT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(
    upcomingEvents.length === 1 ? upcomingEvents[0].id : null
  );
  const [editData, setEditData] = useState<{ id: number } & EventFormState>({
    id: 0,
    ...EMPTY_EVENT_FORM,
  });
  const navigation = useNavigation();
  const submittedActionRef = useRef<string | null>(null);
  const nextUpcomingEvent = upcomingEvents[0] || null;

  function isUpcomingEvent(eventId: number) {
    return upcomingEvents.some((event) => event.id === eventId);
  }

  function resetCreateForm() {
    setCreateData(EMPTY_EVENT_FORM);
  }

  function startEditing(event: EventCard) {
    setEditingId(event.id);
    setEditData(toEditableState(event));

    if (isUpcomingEvent(event.id)) {
      setExpandedEventId(event.id);
    }
  }

  function cancelEditing() {
    setEditingId(null);
    setEditData({ id: 0, ...EMPTY_EVENT_FORM });
  }

  function toggleUpcomingEvent(eventId: number) {
    setExpandedEventId((current) => (current === eventId ? null : eventId));
  }

  useEffect(() => {
    if (navigation.state !== "submitting" || !navigation.formData) {
      return;
    }

    const submittedAction = navigation.formData.get("_action");
    if (submittedAction === "create" || submittedAction === "update") {
      submittedActionRef.current = String(submittedAction);
    }
  }, [navigation.formData, navigation.state]);

  useEffect(() => {
    if (navigation.state !== "idle" || !submittedActionRef.current) {
      return;
    }

    if (actionData?.error) {
      submittedActionRef.current = null;
      return;
    }

    if (submittedActionRef.current === "create") {
      setShowCreateForm(false);
      resetCreateForm();
    }

    if (submittedActionRef.current === "update") {
      cancelEditing();
    }

    submittedActionRef.current = null;
  }, [actionData, navigation.state]);

  useEffect(() => {
    setExpandedEventId((current) => {
      if (editingId && isUpcomingEvent(editingId)) {
        return editingId;
      }

      if (current && isUpcomingEvent(current)) {
        return current;
      }

      return upcomingEvents.length === 1 ? upcomingEvents[0].id : null;
    });
  }, [editingId, upcomingEvents]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Events"
        description="Upcoming and past Meatup.Club events, including ad hoc meetups created without a voting poll."
        actions={
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
            {showCreateForm ? "Cancel" : "+ Create Ad Hoc Event"}
          </Button>
        }
      />

      {actionData?.error ? (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      ) : null}

      {showCreateForm ? (
        <Card className="mb-8 p-6">
          <h2 className="text-xl font-semibold text-foreground">Create Ad Hoc Event</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a restaurant from Google Places, choose the date, and skip the voting flow entirely.
          </p>
          <Form method="post" preventScrollReset className="mt-5 space-y-4">
            <input type="hidden" name="_action" value="create" />

            <EventRestaurantFields
              restaurantName={createData.restaurantName}
              restaurantAddress={createData.restaurantAddress}
              onRestaurantNameChange={(value) =>
                setCreateData((current) => ({ ...current, restaurantName: value }))
              }
              onRestaurantAddressChange={(value) =>
                setCreateData((current) => ({ ...current, restaurantAddress: value }))
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="create-event-date" className="block text-sm font-medium text-foreground mb-1">
                  Event Date *
                </label>
                <input
                  id="create-event-date"
                  name="event_date"
                  type="date"
                  required
                  value={createData.eventDate}
                  onChange={(event) =>
                    setCreateData((current) => ({ ...current, eventDate: event.target.value }))
                  }
                  className="w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label htmlFor="create-event-time" className="block text-sm font-medium text-foreground mb-1">
                  Event Time
                </label>
                <input
                  id="create-event-time"
                  name="event_time"
                  type="time"
                  value={createData.eventTime}
                  onChange={(event) =>
                    setCreateData((current) => ({ ...current, eventTime: event.target.value }))
                  }
                  className="w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                id="create-send-invites"
                name="send_invites"
                type="checkbox"
                value="true"
                defaultChecked={true}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              Send calendar invites to all active members
            </label>

            <Button type="submit">Create Event</Button>
          </Form>
        </Card>
      ) : null}

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Upcoming Events</h2>
        {upcomingEvents.length === 0 ? (
          <EmptyState
            title="No upcoming events"
            description="Create an ad hoc event or check back after the next poll closes."
          />
        ) : (
          <div className="space-y-6">
            <Card className="border-accent/20 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Upcoming schedule
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    {upcomingEvents.length} upcoming event{upcomingEvents.length === 1 ? "" : "s"}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Each tile shows the date, your RSVP status, and response counts so multiple meetups stay easy to scan.
                  </p>
                </div>
                {nextUpcomingEvent ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Next up
                    </p>
                    <p className="mt-1 font-semibold">{nextUpcomingEvent.restaurant_name}</p>
                    <p className="mt-1 text-muted-foreground">
                      {formatDateForDisplay(nextUpcomingEvent.event_date, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      at {formatTimeForDisplay(nextUpcomingEvent.event_time || "18:00")}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
            {upcomingEvents.map((event) => {
                const counts = getEventResponseCounts(event);
                const userRsvpBadge = getUserRsvpBadge(event.userRsvp?.status);
                const goingRsvps = event.allRsvps?.filter((rsvp) => rsvp.status === "yes") || [];
                const maybeRsvps = event.allRsvps?.filter((rsvp) => rsvp.status === "maybe") || [];
                const declinedRsvps = event.allRsvps?.filter((rsvp) => rsvp.status === "no") || [];
                const isExpanded = expandedEventId === event.id || editingId === event.id;
                const isEditing = editingId === event.id;
                const detailsId = `event-details-${event.id}`;
                const titleId = `event-title-${event.id}`;

                return (
                  <Card
                    key={event.id}
                    hover
                    role="article"
                    aria-labelledby={titleId}
                    className={`overflow-hidden p-0 ${isExpanded ? "xl:col-span-2" : ""}`}
                  >
                    <div className="bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          <div className="min-w-24 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-center shadow-sm">
                            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                              {formatDateForDisplay(event.event_date, { month: "short" })}
                            </p>
                            <p className="mt-1 text-3xl font-semibold leading-none text-foreground">
                              {formatDateForDisplay(event.event_date, { day: "numeric" })}
                            </p>
                            <p className="mt-1 text-xs font-medium text-muted-foreground">
                              {formatDateForDisplay(event.event_date, { weekday: "short" })}
                            </p>
                          </div>

                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="success">Upcoming</Badge>
                              <Badge variant={userRsvpBadge.variant}>{userRsvpBadge.label}</Badge>
                            </div>

                            <div>
                              <h3 id={titleId} className="text-2xl font-semibold text-foreground">
                                {event.restaurant_name}
                              </h3>
                              {event.restaurant_address ? (
                                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <MapPinIcon className="h-4 w-4" />
                                  {event.restaurant_address}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDaysIcon className="h-4 w-4" />
                                {formatDateForDisplay(event.event_date, {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <ClockIcon className="h-4 w-4" />
                                {formatTimeForDisplay(event.event_time || "18:00")}
                              </span>
                            </div>

                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              {event.creatorLabel}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {event.canEdit ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${event.restaurant_name}`}
                              onClick={() => startEditing(event)}
                            >
                              <PencilSquareIcon className="mr-1 h-4 w-4" />
                              Edit
                            </Button>
                          ) : null}
                          {!isEditing ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              aria-controls={detailsId}
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? "Hide" : "Open"} details for ${event.restaurant_name}`}
                              onClick={() => toggleUpcomingEvent(event.id)}
                            >
                              {isExpanded ? "Hide details" : "Open details"}
                              <ChevronDownIcon
                                className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Going
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.yes}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Maybe
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.maybe}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Out
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.no}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Pending
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.pending}</p>
                        </div>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div id={detailsId} className="border-t border-border/60 bg-card/80 p-5 sm:p-6">
                        {isEditing ? (
                          <EventEditForm
                            event={event}
                            formData={editData}
                            idPrefix="edit-event"
                            onCancel={cancelEditing}
                            onRestaurantNameChange={(value) =>
                              setEditData((current) => ({ ...current, restaurantName: value }))
                            }
                            onRestaurantAddressChange={(value) =>
                              setEditData((current) => ({ ...current, restaurantAddress: value }))
                            }
                            onEventDateChange={(value) =>
                              setEditData((current) => ({ ...current, eventDate: value }))
                            }
                            onEventTimeChange={(value) =>
                              setEditData((current) => ({ ...current, eventTime: value }))
                            }
                          />
                        ) : (
                          <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <h4 className="font-semibold text-foreground">Your RSVP</h4>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Update your response here without losing your place on the page.
                                  </p>
                                </div>
                                <Badge variant={userRsvpBadge.variant}>{userRsvpBadge.label}</Badge>
                              </div>

                              <Form method="post" preventScrollReset className="mt-5 space-y-4">
                                <input type="hidden" name="_action" value="rsvp" />
                                <input type="hidden" name="event_id" value={event.id} />

                                <div>
                                  <label className="mb-2 block text-sm font-medium text-foreground">
                                    Will you attend?
                                  </label>
                                  <div className="flex flex-wrap gap-3">
                                    {["yes", "no", "maybe"].map((option) => (
                                      <label
                                        key={option}
                                        className={`cursor-pointer select-none rounded-md px-4 py-2 font-medium transition-all ${
                                          event.userRsvp?.status === option
                                            ? "bg-accent text-background shadow-sm"
                                            : "border border-border bg-card text-foreground hover:border-accent/50 hover:bg-muted active:scale-95 active:shadow-inner"
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name="status"
                                          value={option}
                                          defaultChecked={event.userRsvp?.status === option}
                                          className="sr-only"
                                          onChange={(currentEvent) => {
                                            if (currentEvent.target.checked) {
                                              currentEvent.target.form?.requestSubmit();
                                            }
                                          }}
                                        />
                                        {option.charAt(0).toUpperCase() + option.slice(1)}
                                      </label>
                                    ))}
                                  </div>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Click a response to save it immediately.
                                  </p>
                                </div>

                                <div>
                                  <label htmlFor={`comments-${event.id}`} className="mb-2 block text-sm font-medium text-foreground">
                                    Comments (Optional)
                                  </label>
                                  <div className="space-y-2">
                                    <textarea
                                      id={`comments-${event.id}`}
                                      name="comments"
                                      defaultValue={event.userRsvp?.comments || ""}
                                      placeholder="Any notes about your attendance"
                                      rows={3}
                                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                                    />
                                    <Button type="submit" size="sm">
                                      Update Comments
                                    </Button>
                                  </div>
                                </div>
                              </Form>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <h4 className="font-semibold text-foreground">Member responses</h4>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {counts.yes} going, {counts.maybe} maybe, {counts.no} out, {counts.pending} pending.
                                </p>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                {goingRsvps.length > 0 ? (
                                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <Badge variant="success" className="inline-flex items-center gap-1">
                                        <CheckIcon className="h-4 w-4" />
                                        Going
                                      </Badge>
                                      <span className="text-sm text-muted-foreground">{goingRsvps.length}</span>
                                    </div>
                                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                      {goingRsvps.map((rsvp) => (
                                        <div
                                          key={rsvp.id}
                                          className="flex items-center gap-3 rounded-md border border-border/80 bg-muted/40 p-3"
                                        >
                                          <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
                                          <div className="flex-1">
                                            <p className="font-medium text-foreground">{rsvp.name || rsvp.email}</p>
                                            {rsvp.comments ? (
                                              <p className="text-sm text-muted-foreground">{rsvp.comments}</p>
                                            ) : null}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {maybeRsvps.length > 0 ? (
                                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <Badge variant="warning" className="inline-flex items-center gap-1">
                                        ? Maybe
                                      </Badge>
                                      <span className="text-sm text-muted-foreground">{maybeRsvps.length}</span>
                                    </div>
                                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                      {maybeRsvps.map((rsvp) => (
                                        <div
                                          key={rsvp.id}
                                          className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/30 p-3"
                                        >
                                          <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
                                          <div className="flex-1">
                                            <p className="font-medium text-foreground">{rsvp.name || rsvp.email}</p>
                                            {rsvp.comments ? (
                                              <p className="text-sm text-muted-foreground">{rsvp.comments}</p>
                                            ) : null}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {declinedRsvps.length > 0 ? (
                                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <Badge variant="danger" className="inline-flex items-center gap-1">
                                        <XMarkIcon className="h-4 w-4" />
                                        Not Going
                                      </Badge>
                                      <span className="text-sm text-muted-foreground">{declinedRsvps.length}</span>
                                    </div>
                                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                      {declinedRsvps.map((rsvp) => (
                                        <div
                                          key={rsvp.id}
                                          className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3 opacity-80"
                                        >
                                          <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
                                          <div className="flex-1">
                                            <p className="font-medium text-foreground">{rsvp.name || rsvp.email}</p>
                                            {rsvp.comments ? (
                                              <p className="text-sm text-muted-foreground">{rsvp.comments}</p>
                                            ) : null}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {event.notResponded && event.notResponded.length > 0 ? (
                                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                                        <ClockIcon className="h-4 w-4" />
                                        No Response Yet
                                      </div>
                                      <span className="text-sm text-muted-foreground">{event.notResponded.length}</span>
                                    </div>
                                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                      {event.notResponded.map((member) => (
                                        <div
                                          key={member.id}
                                          className="flex items-center gap-3 rounded-md border border-border bg-muted/50 p-3 opacity-60"
                                        >
                                          <UserAvatar
                                            src={member.picture}
                                            name={member.name}
                                            email={member.email}
                                            className="grayscale"
                                          />
                                          <p className="font-medium text-muted-foreground">
                                            {member.name || member.email}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </Card>
                );
            })}
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Past Events</h2>
        {pastEvents.length === 0 ? (
          <EmptyState title="No past events yet" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pastEvents.map((event) => (
              <Card
                key={event.id}
                role="article"
                aria-labelledby={`past-event-title-${event.id}`}
                className="p-5 opacity-80 transition-opacity hover:opacity-100"
              >
                {editingId === event.id ? (
                  <EventEditForm
                    event={event}
                    formData={editData}
                    idPrefix="past-edit-event"
                    onCancel={cancelEditing}
                    onRestaurantNameChange={(value) =>
                      setEditData((current) => ({ ...current, restaurantName: value }))
                    }
                    onRestaurantAddressChange={(value) =>
                      setEditData((current) => ({ ...current, restaurantAddress: value }))
                    }
                    onEventDateChange={(value) =>
                      setEditData((current) => ({ ...current, eventDate: value }))
                    }
                    onEventTimeChange={(value) =>
                      setEditData((current) => ({ ...current, eventTime: value }))
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <h3 id={`past-event-title-${event.id}`} className="text-xl font-semibold text-foreground">
                          {event.restaurant_name}
                        </h3>
                        <Badge variant={event.displayStatus === "completed" ? "muted" : "danger"}>
                          {event.displayStatus}
                        </Badge>
                      </div>
                      {event.restaurant_address ? (
                        <p className="mb-2 text-sm text-muted-foreground">
                          <MapPinIcon className="inline h-4 w-4" /> {event.restaurant_address}
                        </p>
                      ) : null}
                      <p className="text-base text-foreground">
                        <CalendarDaysIcon className="mr-1 inline h-4 w-4" />
                        {formatDateForDisplay(event.event_date, {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}{" "}
                        at {formatTimeForDisplay(event.event_time || "18:00")}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">{event.creatorLabel}</p>
                    </div>
                    {event.canEdit ? (
                      <Button variant="ghost" size="sm" onClick={() => startEditing(event)}>
                        <PencilSquareIcon className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export function HydrateFallback() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Events"
        description="Upcoming and past Meatup.Club events"
      />
      <div className="space-y-6">
        <Card className="animate-pulse bg-muted/30 p-6">
          <div className="mb-4 h-6 w-56 rounded bg-muted" />
          <div className="mb-2 h-4 w-80 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </Card>
        <Card className="animate-pulse bg-muted/30 p-6">
          <div className="mb-4 h-6 w-48 rounded bg-muted" />
          <div className="mb-2 h-4 w-72 rounded bg-muted" />
          <div className="h-4 w-52 rounded bg-muted" />
        </Card>
      </div>
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong loading events.";
  let details = "Please refresh and try again.";

  if (isRouteErrorResponse(error)) {
    message = `Unable to load events (${error.status})`;
    details = error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader title="Events" description="Upcoming and past Meatup.Club events" />
      <Card className="p-6">
        <Alert variant="error">
          <div className="space-y-3">
            <p className="font-semibold">{message}</p>
            <p className="text-sm">{details}</p>
            <div className="pt-1">
              <Link to="/dashboard" className="btn-primary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </Alert>
      </Card>
    </main>
  );
}
