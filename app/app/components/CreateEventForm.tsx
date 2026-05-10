import { Form } from "react-router";
import { Button, Card } from "./ui";
import { EventRestaurantFields } from "./EventRestaurantFields";
import type { EventFormState } from "../lib/events-shared";

interface CreateEventFormProps {
  formData: EventFormState;
  onChange: (next: EventFormState) => void;
}

export function CreateEventForm({ formData, onChange }: CreateEventFormProps) {
  return (
    <Card className="mb-8">
      <h2 className="text-xl font-semibold text-foreground">Create Ad Hoc Event</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a restaurant from Google Places, choose the date, and skip the voting flow entirely.
      </p>
      <Form method="post" preventScrollReset className="mt-5 space-y-4">
        <input type="hidden" name="_action" value="event_create" />

        <EventRestaurantFields
          restaurantName={formData.restaurantName}
          restaurantAddress={formData.restaurantAddress}
          onRestaurantNameChange={(value) =>
            onChange({ ...formData, restaurantName: value })
          }
          onRestaurantAddressChange={(value) =>
            onChange({ ...formData, restaurantAddress: value })
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="create-event-date"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Event Date *
            </label>
            <input
              id="create-event-date"
              name="event_date"
              type="date"
              required
              value={formData.eventDate}
              onChange={(event) =>
                onChange({ ...formData, eventDate: event.target.value })
              }
              className="w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label
              htmlFor="create-event-time"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Event Time
            </label>
            <input
              id="create-event-time"
              name="event_time"
              type="time"
              value={formData.eventTime}
              onChange={(event) =>
                onChange({ ...formData, eventTime: event.target.value })
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
  );
}
