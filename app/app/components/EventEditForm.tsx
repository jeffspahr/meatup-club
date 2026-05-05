import { Form } from "react-router";
import { Button } from "./ui";
import { EventRestaurantFields } from "./EventRestaurantFields";
import type { EventCard, EventFormState } from "../lib/events-shared";

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

export function EventEditForm({
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
      <input type="hidden" name="_action" value="event_update" />
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
          <label
            htmlFor={`${idPrefix}-date-${event.id}`}
            className="mb-1 block text-sm font-medium text-foreground"
          >
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
          <label
            htmlFor={`${idPrefix}-time-${event.id}`}
            className="mb-1 block text-sm font-medium text-foreground"
          >
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
