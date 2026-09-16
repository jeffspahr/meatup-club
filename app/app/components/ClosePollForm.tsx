import { useState, type FormEvent } from "react";
import { useFetcher } from "react-router";
import { Alert, Button } from "./ui";
import { confirmAction } from "../lib/confirm.client";
import { formatDateForDisplay, formatTimeForDisplay } from "../lib/dateUtils";

interface ClosePollFormProps {
  poll: { id: number; title: string };
  restaurants: { id: number; name: string; vote_count: number }[];
  dates: { id: number; suggested_date: string; vote_count: number }[];
}

export function ClosePollForm({ poll, restaurants, dates }: ClosePollFormProps) {
  const fetcher = useFetcher<{ error?: string }>();
  const restaurantOptions = restaurants.filter((r) => r.vote_count > 0)
    .sort((a, b) => b.vote_count - a.vote_count || a.name.localeCompare(b.name));
  const dateOptions = dates.filter((d) => d.vote_count > 0)
    .sort((a, b) => b.vote_count - a.vote_count || a.suggested_date.localeCompare(b.suggested_date));
  const hasWinners = restaurantOptions.length > 0 && dateOptions.length > 0;
  const [createEvent, setCreateEvent] = useState(hasWinners);
  const pending = fetcher.state !== "idle";
  const inputClass = "w-full rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-hidden focus:ring-2 focus:ring-accent";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const restaurant = restaurantOptions.find((r) => String(r.id) === form.get("winning_restaurant_id"));
    const date = dateOptions.find((d) => String(d.id) === form.get("winning_date_id"));
    const shouldCreateEvent = form.get("create_event") === "true";
    const lines = [`Close poll "${poll.title}"?`];
    if (restaurant && date) {
      lines.push(`Restaurant: ${restaurant.name}`, `Date: ${formatDateForDisplay(date.suggested_date)}`);
    }
    lines.push(shouldCreateEvent
      ? `Create an event at ${formatTimeForDisplay(String(form.get("event_time") || "18:00"))}.`
      : "No event will be created.");
    lines.push(shouldCreateEvent && form.get("send_invites") === "true"
      ? "Calendar invites will be sent to all active members."
      : "Members will not be notified.");
    lines.push("Voting will end. This cannot be undone.");
    if (!confirmAction(lines.join("\n"))) event.preventDefault();
  }

  return (
    <details className="mt-6 rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent">
        Close poll <span className="ml-2 text-xs font-normal text-muted-foreground">Admin only</span>
      </summary>
      <fetcher.Form method="post" action="/dashboard/admin/polls" onSubmit={handleSubmit} className="mt-4 space-y-4" aria-label="Close poll">
        <input type="hidden" name="_action" value="close" />
        <input type="hidden" name="poll_id" value={poll.id} />
        <input type="hidden" name="return_to" value="/dashboard" />
        <p className="text-sm text-muted-foreground">
          Finalize the winners and schedule the meetup here. Selections start with the vote leaders; review ties before closing.
        </p>
        {fetcher.data?.error && !pending ? (
          <div role="alert"><Alert variant="error">{fetcher.data.error}</Alert></div>
        ) : null}
        <fieldset disabled={pending} className="space-y-4">
          {hasWinners ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`close-restaurant-${poll.id}`} className="mb-1 block text-sm font-medium">Winning restaurant</label>
                  <select id={`close-restaurant-${poll.id}`} name="winning_restaurant_id" defaultValue={restaurantOptions[0].id} required className={inputClass}>
                    {restaurantOptions.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.vote_count} {r.vote_count === 1 ? "vote" : "votes"}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`close-date-${poll.id}`} className="mb-1 block text-sm font-medium">Winning date</label>
                  <select id={`close-date-${poll.id}`} name="winning_date_id" defaultValue={dateOptions[0].id} required className={inputClass}>
                    {dateOptions.map((d) => <option key={d.id} value={d.id}>{formatDateForDisplay(d.suggested_date)} · {d.vote_count} {d.vote_count === 1 ? "vote" : "votes"}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="create_event" value="true" checked={createEvent} onChange={(e) => setCreateEvent(e.target.checked)} className="h-4 w-4 rounded-sm border-border" />
                Create event from winners
              </label>
              <fieldset disabled={!createEvent} className="grid gap-4 sm:grid-cols-2 disabled:opacity-50">
                <div>
                  <label htmlFor={`close-time-${poll.id}`} className="mb-1 block text-sm font-medium">Event time</label>
                  <input id={`close-time-${poll.id}`} type="time" name="event_time" defaultValue="18:00" required={createEvent} className={inputClass} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="send_invites" value="true" defaultChecked className="h-4 w-4 shrink-0 rounded-sm border-border" />
                  Send calendar invites to all active members
                </label>
              </fieldset>
            </>
          ) : (
            <Alert variant="info">A restaurant and date both need votes to create an event. You can close this poll without creating one.</Alert>
          )}
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Closing poll…" : hasWinners && createEvent ? "Close poll & create event" : "Close poll without event"}
          </Button>
        </fieldset>
      </fetcher.Form>
    </details>
  );
}
