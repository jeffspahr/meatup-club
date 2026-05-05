import type { Event, RsvpWithUser } from "./types";

export interface EventRow extends Event {
  creator_name: string | null;
  creator_email: string | null;
}

export interface EventMemberRow {
  id: number;
  name: string | null;
  email: string;
  picture: string | null;
}

export interface EventCard extends EventRow {
  canEdit: boolean;
  creatorLabel: string;
  displayStatus?: "completed" | "cancelled";
  userRsvp?: { status: string; comments: string | null } | null;
  allRsvps?: RsvpWithUser[];
  notResponded?: EventMemberRow[];
}

export interface EventFormState {
  restaurantName: string;
  restaurantAddress: string;
  eventDate: string;
  eventTime: string;
}

export const EMPTY_EVENT_FORM: EventFormState = {
  restaurantName: "",
  restaurantAddress: "",
  eventDate: "",
  eventTime: "18:00",
};

function getEventDateTimeKey(event: Pick<Event, "event_date" | "event_time">): string {
  return `${event.event_date}T${event.event_time || "18:00"}`;
}

export function sortEventsBySchedule<T extends Pick<Event, "event_date" | "event_time">>(
  events: T[],
  direction: "asc" | "desc"
): T[] {
  return [...events].sort((left, right) => {
    const comparison = getEventDateTimeKey(left).localeCompare(getEventDateTimeKey(right));
    return direction === "asc" ? comparison : -comparison;
  });
}

export function getEventResponseCounts(
  event: Pick<EventCard, "allRsvps" | "notResponded">
) {
  const allRsvps = event.allRsvps || [];

  return {
    yes: allRsvps.filter((rsvp) => rsvp.status === "yes").length,
    maybe: allRsvps.filter((rsvp) => rsvp.status === "maybe").length,
    no: allRsvps.filter((rsvp) => rsvp.status === "no").length,
    pending: event.notResponded?.length || 0,
  };
}

export function getUserRsvpBadge(status: string | null | undefined) {
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

export function getCreatorLabel(event: EventRow, currentUserId: number): string {
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

export function toEditableState(event: EventCard): EventFormState & { id: number } {
  return {
    id: event.id,
    restaurantName: event.restaurant_name,
    restaurantAddress: event.restaurant_address || "",
    eventDate: event.event_date,
    eventTime: event.event_time || "18:00",
  };
}
