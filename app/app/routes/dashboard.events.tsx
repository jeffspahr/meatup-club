import { Link, isRouteErrorResponse, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { canEditEvent } from "../lib/events.server";
import {
  runCreateEventAction,
  runRsvpEventAction,
  runUpdateEventAction,
} from "../lib/event-actions.server";
import {
  EMPTY_EVENT_FORM,
  getCreatorLabel,
  sortEventsBySchedule,
  toEditableState,
  type EventCard,
  type EventFormState,
  type EventMemberRow,
  type EventRow,
} from "../lib/events-shared";
import { CreateEventForm } from "../components/CreateEventForm";
import { EventEditForm } from "../components/EventEditForm";
import { UpcomingEventCard } from "../components/UpcomingEventCard";
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  getAppTimeZone,
  isEventInPastInTimeZone,
} from "../lib/dateUtils";
import type { RsvpWithUser } from "../lib/types";
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { CalendarDaysIcon, MapPinIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

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
  const allMembers = (allMembersResult.results || []) as unknown as EventMemberRow[];
  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);

  const upcomingEventsRaw = sortEventsBySchedule(
    events.filter(
      (event) =>
        event.status !== "cancelled" &&
        !isEventInPastInTimeZone(event.event_date, event.event_time || "18:00", appTimeZone)
    ),
    "asc"
  ).map((event) => ({
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
  const actionType = String(formData.get("_action") || "event_rsvp");
  const ctx = {
    db,
    queue: context.cloudflare.env.EMAIL_DELIVERY_QUEUE,
    user,
    formData,
    request,
    route: "/dashboard/events",
  };

  if (actionType === "event_create") {
    return runCreateEventAction(ctx);
  }

  if (actionType === "event_update") {
    return runUpdateEventAction(ctx);
  }

  return runRsvpEventAction(ctx);
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

  function handleEditFieldChange(field: keyof EventFormState, value: string) {
    setEditData((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    if (navigation.state !== "submitting" || !navigation.formData) {
      return;
    }

    const submittedAction = navigation.formData.get("_action");
    if (submittedAction === "event_create" || submittedAction === "event_update") {
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

    if (submittedActionRef.current === "event_create") {
      setShowCreateForm(false);
      resetCreateForm();
    }

    if (submittedActionRef.current === "event_update") {
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
        <CreateEventForm formData={createData} onChange={setCreateData} />
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
            <Card className="border-accent/25 bg-accent/[0.06] p-5 shadow-sm sm:p-6">
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
                  <div className="rounded-2xl border border-accent/15 bg-background/95 px-4 py-3 text-sm text-foreground shadow-sm">
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

            <div className="grid gap-5 xl:auto-rows-fr xl:grid-cols-2">
              {upcomingEvents.map((event) => {
                const isExpanded = expandedEventId === event.id || editingId === event.id;
                const isEditing = editingId === event.id;
                return (
                  <UpcomingEventCard
                    key={event.id}
                    event={event}
                    isExpanded={isExpanded}
                    isEditing={isEditing}
                    editFormData={editData}
                    onStartEdit={() => startEditing(event)}
                    onCancelEdit={cancelEditing}
                    onToggleExpand={() => toggleUpcomingEvent(event.id)}
                    onEditFieldChange={handleEditFieldChange}
                  />
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
                    onRestaurantNameChange={(value) => handleEditFieldChange("restaurantName", value)}
                    onRestaurantAddressChange={(value) =>
                      handleEditFieldChange("restaurantAddress", value)
                    }
                    onEventDateChange={(value) => handleEditFieldChange("eventDate", value)}
                    onEventTimeChange={(value) => handleEditFieldChange("eventTime", value)}
                  />
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <h3
                          id={`past-event-title-${event.id}`}
                          className="text-xl font-semibold text-foreground"
                        >
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
      <PageHeader title="Events" description="Upcoming and past Meatup.Club events" />
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
