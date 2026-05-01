import { Form } from "react-router";
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  MapPinIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Card, UserAvatar } from "./ui";
import { EventEditForm } from "./EventEditForm";
import { formatDateForDisplay, formatTimeForDisplay } from "../lib/dateUtils";
import {
  getEventResponseCounts,
  getUserRsvpBadge,
  type EventCard,
  type EventFormState,
} from "../lib/events-shared";

interface UpcomingEventCardProps {
  event: EventCard;
  isExpanded: boolean;
  isEditing: boolean;
  editFormData: { id: number } & EventFormState;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggleExpand: () => void;
  onEditFieldChange: (
    field: keyof EventFormState,
    value: string
  ) => void;
}

export function UpcomingEventCard({
  event,
  isExpanded,
  isEditing,
  editFormData,
  onStartEdit,
  onCancelEdit,
  onToggleExpand,
  onEditFieldChange,
}: UpcomingEventCardProps) {
  const counts = getEventResponseCounts(event);
  const userRsvpBadge = getUserRsvpBadge(event.userRsvp?.status);
  const goingRsvps = event.allRsvps?.filter((rsvp) => rsvp.status === "yes") || [];
  const maybeRsvps = event.allRsvps?.filter((rsvp) => rsvp.status === "maybe") || [];
  const declinedRsvps = event.allRsvps?.filter((rsvp) => rsvp.status === "no") || [];
  const detailsId = `event-details-${event.id}`;
  const titleId = `event-title-${event.id}`;

  return (
    <Card
      hover
      role="article"
      aria-labelledby={titleId}
      className={`overflow-hidden p-0 ${isExpanded ? "xl:col-span-2" : "h-full"}`}
    >
      <div
        className={`flex flex-col bg-accent/[0.04] p-5 sm:p-6 ${isExpanded ? "" : "h-full"}`}
      >
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
                onClick={onStartEdit}
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
                onClick={onToggleExpand}
              >
                {isExpanded ? "Hide details" : "Open details"}
                <ChevronDownIcon
                  className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-3 pt-5 xl:grid-cols-4">
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
              formData={editFormData}
              idPrefix="edit-event"
              onCancel={onCancelEdit}
              onRestaurantNameChange={(value) => onEditFieldChange("restaurantName", value)}
              onRestaurantAddressChange={(value) =>
                onEditFieldChange("restaurantAddress", value)
              }
              onEventDateChange={(value) => onEditFieldChange("eventDate", value)}
              onEventTimeChange={(value) => onEditFieldChange("eventTime", value)}
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
                  <input type="hidden" name="_action" value="event_rsvp" />
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
                    <label
                      htmlFor={`comments-${event.id}`}
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
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
}
