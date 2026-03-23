import { describe, expect, it, vi } from "vitest";
import {
  buildCreateEventStatementForActivePoll,
  buildDeleteEventStatement,
  buildSelectLastInsertedEventIdStatement,
  buildUpdateEventStatement,
  canEditEvent,
  createEvent,
  getEditableEventById,
  getInsertedEventIdFromQueryResult,
  incrementEventCalendarSequence,
  parseEventMutationFormData,
  updateEvent,
} from "./events.server";

function createMockDb() {
  const first = vi.fn().mockResolvedValue({
    id: 7,
    restaurant_name: "Prime Steakhouse",
    restaurant_address: "123 Main St",
    event_date: "2026-06-20",
    event_time: "18:30",
    status: "upcoming",
    calendar_sequence: 2,
    created_by: 5,
  });
  const run = vi.fn().mockResolvedValue({
    meta: {
      last_row_id: 44,
      changes: 1,
    },
  });
  const bind = vi.fn(() => ({ first, run }));
  const prepare = vi.fn(() => ({ bind, first, run }));

  return { db: { prepare }, bind, first, run };
}

function createFormData(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("events.server", () => {
  it("parses a valid mutation payload, trimming values and defaulting the time", () => {
    const result = parseEventMutationFormData(
      createFormData({
        restaurant_name: "  Prime Steakhouse  ",
        restaurant_address: "   ",
        event_date: "2026-06-20",
        event_time: "",
      })
    );

    expect(result).toEqual({
      value: {
        restaurantName: "Prime Steakhouse",
        restaurantAddress: null,
        eventDate: "2026-06-20",
        eventTime: "18:00",
        status: "upcoming",
      },
    });
  });

  it("allows cancelled status only when explicitly enabled", () => {
    const result = parseEventMutationFormData(
      createFormData({
        restaurant_name: "Prime Steakhouse",
        restaurant_address: "123 Main St",
        event_date: "2026-06-20",
        event_time: "19:15",
        status: "cancelled",
      }),
      { allowCancelled: true }
    );

    expect(result.value?.status).toBe("cancelled");
  });

  it("rejects missing restaurant, invalid dates, and invalid times", () => {
    expect(parseEventMutationFormData(createFormData({}))).toEqual({
      error: "Select a restaurant from Google Places.",
    });

    expect(
      parseEventMutationFormData(
        createFormData({
          restaurant_name: "Prime Steakhouse",
          event_date: "06/20/2026",
        })
      )
    ).toEqual({ error: "A valid event date is required." });

    expect(
      parseEventMutationFormData(
        createFormData({
          restaurant_name: "Prime Steakhouse",
          event_date: "2026-06-20",
          event_time: "7pm",
        })
      )
    ).toEqual({ error: "A valid event time is required." });
  });

  it("allows admins and owners to edit events", () => {
    expect(canEditEvent({ id: 1, is_admin: 1 } as never, { created_by: 99 })).toBe(true);
    expect(canEditEvent({ id: 5, is_admin: 0 } as never, { created_by: 5 })).toBe(true);
    expect(canEditEvent({ id: 5, is_admin: 0 } as never, { created_by: null })).toBe(false);
    expect(canEditEvent({ id: 5, is_admin: 0 } as never, { created_by: 8 })).toBe(false);
  });

  it("builds poll-aware insert, update, delete, and last-insert statements with the expected bindings", () => {
    const { db, bind } = createMockDb();

    buildCreateEventStatementForActivePoll(db as never, {
      input: {
        restaurantName: "Prime Steakhouse",
        restaurantAddress: "123 Main St",
        eventDate: "2026-06-20",
        eventTime: "18:30",
        status: "upcoming",
      },
      createdBy: 5,
      pollId: 12,
    });
    buildUpdateEventStatement(
      db as never,
      44,
      {
        restaurantName: "Updated Grill",
        restaurantAddress: "500 Market St",
        eventDate: "2026-07-01",
        eventTime: "19:00",
        status: "cancelled",
      },
      7
    );
    buildDeleteEventStatement(db as never, 44);
    buildSelectLastInsertedEventIdStatement(db as never);

    expect(bind).toHaveBeenNthCalledWith(
      1,
      "Prime Steakhouse",
      "123 Main St",
      "2026-06-20",
      "18:30",
      "upcoming",
      5,
      12
    );
    expect(bind).toHaveBeenNthCalledWith(
      2,
      "Updated Grill",
      "500 Market St",
      "2026-07-01",
      "19:00",
      "cancelled",
      7,
      44
    );
    expect(bind).toHaveBeenNthCalledWith(3, 44);
  });

  it("creates, fetches, updates, and increments event rows through the db wrappers", async () => {
    const { db, run } = createMockDb();

    await expect(
      createEvent(
        db as never,
        {
          restaurantName: "Prime Steakhouse",
          restaurantAddress: "123 Main St",
          eventDate: "2026-06-20",
          eventTime: "18:30",
          status: "upcoming",
        },
        5
      )
    ).resolves.toBe(44);

    await expect(getEditableEventById(db as never, 7)).resolves.toEqual(
      expect.objectContaining({ id: 7, restaurant_name: "Prime Steakhouse" })
    );

    await updateEvent(
      db as never,
      7,
      {
        restaurantName: "Updated Grill",
        restaurantAddress: "500 Market St",
        eventDate: "2026-07-01",
        eventTime: "19:00",
        status: "cancelled",
      }
    );

    await incrementEventCalendarSequence(db as never, 7);

    expect(run).toHaveBeenCalled();
  });

  it("extracts inserted event ids safely from query results", () => {
    expect(getInsertedEventIdFromQueryResult({ results: [{ id: 55 }] } as never)).toBe(55);
    expect(getInsertedEventIdFromQueryResult({ results: [{ id: 0 }] } as never)).toBeNull();
    expect(getInsertedEventIdFromQueryResult({ results: [] } as never)).toBeNull();
  });
});
