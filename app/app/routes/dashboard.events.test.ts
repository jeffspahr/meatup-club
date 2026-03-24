import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import {
  buildSelectStagedDeliveryIdsStatement,
  buildStageEventInviteDeliveriesForLastInsertedEventStatement,
  buildStageEventUpdateDeliveriesForActiveMembersStatement,
  enqueueStagedEventEmailBatch,
  toStagedEventEmailBatchFromQueryResult,
} from "../lib/event-email-delivery.server";
import { upsertRsvp } from "../lib/rsvps.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/event-email-delivery.server", () => ({
  buildSelectStagedDeliveryIdsStatement: vi.fn(),
  buildStageEventInviteDeliveriesForLastInsertedEventStatement: vi.fn(),
  buildStageEventUpdateDeliveriesForActiveMembersStatement: vi.fn(),
  enqueueStagedEventEmailBatch: vi.fn(),
  toStagedEventEmailBatchFromQueryResult: vi.fn(),
}));

vi.mock("../lib/rsvps.server", () => ({
  upsertRsvp: vi.fn(),
}));

type EventRow = {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  event_time: string | null;
  status: string;
  created_at: string;
  calendar_sequence: number | null;
  created_by: number | null;
  creator_name: string | null;
  creator_email: string | null;
};

type MockDbOptions = {
  events?: EventRow[];
  activeMembers?: Array<{ id: number; name: string | null; email: string; picture: string | null }>;
  userRsvpsByEvent?: Record<string, { status: string; comments: string | null } | null>;
  allRsvpsByEvent?: Record<number, unknown[]>;
  editableEvent?: {
    id: number;
    restaurant_name: string;
    restaurant_address: string | null;
    event_date: string;
    event_time: string | null;
    status: string;
    calendar_sequence: number | null;
    created_by: number | null;
  } | null;
  createdEventId?: number;
  failOnRawTransactions?: boolean;
};

function createMockDb({
  events = [],
  activeMembers = [],
  userRsvpsByEvent = {},
  allRsvpsByEvent = {},
  editableEvent = null,
  createdEventId = 501,
  failOnRawTransactions = false,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const isSelectStatement = normalizedSql.startsWith("SELECT");

    const firstForArgs = async (bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?")) {
        return userRsvpsByEvent[`${bindArgs[0]}:${bindArgs[1]}`] ?? null;
      }

      if (normalizedSql.includes("FROM events WHERE id = ?")) {
        return editableEvent;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async (bindArgs: unknown[]) => {
      if (normalizedSql.includes("FROM events e LEFT JOIN users u ON e.created_by = u.id")) {
        return { results: events };
      }

      if (normalizedSql === "SELECT id, name, email, picture FROM users WHERE status = ? ORDER BY name ASC") {
        return { results: activeMembers };
      }

      if (normalizedSql.includes("FROM rsvps r JOIN users u ON r.user_id = u.id WHERE r.event_id = ?")) {
        return { results: allRsvpsByEvent[Number(bindArgs[0])] || [] };
      }

      if (normalizedSql === "SELECT last_insert_rowid() AS id") {
        return { results: [{ id: createdEventId }] };
      }

      if (normalizedSql === "SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC") {
        return { results: [{ id: 3 }, { id: 4 }] };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      if (
        failOnRawTransactions &&
        (normalizedSql === "BEGIN TRANSACTION" ||
          normalizedSql === "COMMIT" ||
          normalizedSql === "ROLLBACK")
      ) {
        throw new Error("D1 does not support raw SQL transactions");
      }

      runCalls.push({ sql: normalizedSql, bindArgs });

      if (normalizedSql.includes("INSERT INTO events")) {
        return { meta: { last_row_id: createdEventId } };
      }

      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: () => allForArgs([]),
      ...(isSelectStatement ? {} : { run: () => runForArgs([]) }),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: () => allForArgs(bindArgs),
        ...(isSelectStatement ? {} : { run: () => runForArgs(bindArgs) }),
      }),
    };
  });

  const batch = vi.fn(async (statements: Array<{
    run?: () => Promise<unknown>;
    all?: () => Promise<unknown>;
  }>) => {
    const results = [];

    for (const [index, statement] of statements.entries()) {
      if (index === statements.length - 1 && typeof statement.all === "function") {
        results.push(await statement.all());
        continue;
      }

      if (typeof statement.run === "function") {
        results.push(await statement.run());
        continue;
      }

      if (typeof statement.all === "function") {
        results.push(await statement.all());
        continue;
      }

      results.push({});
    }

    return results;
  });

  return { prepare, runCalls, batch };
}

function createRequest(formEntries?: Record<string, string>) {
  if (!formEntries) {
    return new Request("http://localhost/dashboard/events");
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/events", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "member@example.com",
      name: "Member",
    } as never);
    vi.mocked(logActivity).mockResolvedValue(undefined);
    vi.mocked(buildStageEventInviteDeliveriesForLastInsertedEventStatement).mockImplementation((db: any) =>
      db.prepare("INSERT INTO event_email_deliveries /* staged invite */").bind("batch-invite")
    );
    vi.mocked(buildStageEventUpdateDeliveriesForActiveMembersStatement).mockImplementation((db: any) =>
      db.prepare("INSERT INTO event_email_deliveries /* staged update */").bind("batch-update")
    );
    vi.mocked(buildSelectStagedDeliveryIdsStatement).mockImplementation((db: any) =>
      db
        .prepare("SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC")
        .bind("batch-update")
    );
    vi.mocked(toStagedEventEmailBatchFromQueryResult).mockImplementation((batchId, deliveryType) => ({
      batchId,
      deliveryIds: deliveryType === "invite" ? [1, 2] : [3, 4],
      recipientCount: 2,
      deliveryType,
    }));
    vi.mocked(enqueueStagedEventEmailBatch).mockResolvedValue(undefined);
    vi.mocked(upsertRsvp).mockResolvedValue("created");
  });

  it("returns creator-based edit permissions and separates upcoming from past events", async () => {
    const db = createMockDb({
      events: [
        {
          id: 2,
          restaurant_name: "Someone Else's Spot",
          restaurant_address: "456 Oak",
          event_date: "2099-05-01",
          event_time: "18:30",
          status: "upcoming",
          created_at: "2026-03-01 12:00:00",
          calendar_sequence: 0,
          created_by: 999,
          creator_name: "Other Member",
          creator_email: "other@example.com",
        },
        {
          id: 1,
          restaurant_name: "Creator Spot",
          restaurant_address: "123 Main",
          event_date: "2099-04-20",
          event_time: "18:00",
          status: "upcoming",
          created_at: "2026-03-01 12:00:00",
          calendar_sequence: 0,
          created_by: 123,
          creator_name: "Member",
          creator_email: "member@example.com",
        },
        {
          id: 4,
          restaurant_name: "Cancelled Supper",
          restaurant_address: null,
          event_date: "2001-01-01",
          event_time: "19:00",
          status: "cancelled",
          created_at: "2026-03-01 12:00:00",
          calendar_sequence: 0,
          created_by: 999,
          creator_name: "Other Member",
          creator_email: "other@example.com",
        },
        {
          id: 3,
          restaurant_name: "Legacy Spot",
          restaurant_address: null,
          event_date: "2000-01-01",
          event_time: "18:00",
          status: "upcoming",
          created_at: "2026-03-01 12:00:00",
          calendar_sequence: 0,
          created_by: null,
          creator_name: null,
          creator_email: null,
        },
      ],
      activeMembers: [
        { id: 123, name: "Member", email: "member@example.com", picture: null },
        { id: 999, name: "Other Member", email: "other@example.com", picture: null },
      ],
      allRsvpsByEvent: {
        1: [{ id: 77, user_id: 123, status: "yes", comments: null, name: "Member", email: "member@example.com", picture: null }],
        2: [],
      },
    });

    const result = await loader({
      request: createRequest(),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "America/New_York" } } } as never,
      params: {},
    } as never);

    expect(result.upcomingEvents).toHaveLength(2);
    expect(result.upcomingEvents[0]).toEqual(
      expect.objectContaining({
        id: 1,
        canEdit: true,
        creatorLabel: "Created by you",
      })
    );
    expect(result.upcomingEvents[1]).toEqual(
      expect.objectContaining({
        id: 2,
        canEdit: false,
        creatorLabel: "Created by Other Member",
      })
    );
    expect(result.pastEvents).toEqual([
      expect.objectContaining({
        id: 4,
        canEdit: false,
        displayStatus: "cancelled",
        creatorLabel: "Created by Other Member",
      }),
      expect.objectContaining({
        id: 3,
        canEdit: false,
        displayStatus: "completed",
        creatorLabel: "Created by an admin",
      }),
    ]);
  });

  it("creates an ad hoc event through D1 batch statements when raw SQL transactions would fail", async () => {
    const db = createMockDb({ failOnRawTransactions: true });
    const request = createRequest({
      _action: "create",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "123 Main St",
      event_date: "2099-04-20",
      event_time: "18:30",
      send_invites: "true",
    });

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
          ctx: { waitUntil: vi.fn() },
        },
      } as never,
    } as never);

    expect(response).toEqual({ ok: true, performedAction: "create" });
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO events"),
        bindArgs: ["Prime Steakhouse", "123 Main St", "2099-04-20", "18:30", "upcoming", 123],
      })
    );
    expect(db.runCalls).not.toContainEqual(
      expect.objectContaining({
        sql: "BEGIN TRANSACTION",
      })
    );
    expect(buildStageEventInviteDeliveriesForLastInsertedEventStatement).toHaveBeenCalledWith(
      db,
      {
        batchId: expect.any(String),
        details: {
          restaurantName: "Prime Steakhouse",
          restaurantAddress: "123 Main St",
          eventDate: "2099-04-20",
          eventTime: "18:30",
        },
      }
    );
    expect(enqueueStagedEventEmailBatch).toHaveBeenCalledWith(
      {
        db,
        queue: undefined,
      },
      {
        batchId: expect.any(String),
        deliveryIds: [1, 2],
        recipientCount: 2,
        deliveryType: "invite",
      }
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 123,
        actionType: "create_event",
      })
    );
  });

  it("validates required create fields before attempting an insert", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "create",
      event_date: "2099-04-20",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Select a restaurant from Google Places." });
    expect(db.runCalls).toEqual([]);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("returns a generic create error when the inserted event id cannot be determined", async () => {
    const db = createMockDb({ createdEventId: 0 });
    const request = createRequest({
      _action: "create",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "123 Main St",
      event_date: "2099-04-20",
      event_time: "18:30",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Failed to create event" });
    expect(logActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "create_event",
      })
    );
  });

  it("continues event creation when enqueueing invite deliveries throws a non-Error value", async () => {
    vi.mocked(enqueueStagedEventEmailBatch).mockRejectedValueOnce("queue offline");
    const db = createMockDb();
    const request = createRequest({
      _action: "create",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "123 Main St",
      event_date: "2099-04-20",
      event_time: "18:30",
      send_invites: "true",
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ ok: true, performedAction: "create" });
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to enqueue staged event invite deliveries",
      { eventId: 501, message: "queue offline" }
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "create_event",
      })
    );

    errorSpy.mockRestore();
  });

  it("rejects edits from a non-owner who is not an admin", async () => {
    const db = createMockDb({
      editableEvent: {
        id: 7,
        restaurant_name: "Locked Event",
        restaurant_address: "789 Pine",
        event_date: "2099-05-10",
        event_time: "18:00",
        status: "upcoming",
        calendar_sequence: 2,
        created_by: 999,
      },
    });
    const request = createRequest({
      _action: "update",
      id: "7",
      restaurant_name: "Locked Event",
      restaurant_address: "789 Pine",
      event_date: "2099-05-10",
      event_time: "18:00",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "You do not have permission to edit this event" });
    expect(db.runCalls).toEqual([]);
    expect(buildStageEventUpdateDeliveriesForActiveMembersStatement).not.toHaveBeenCalled();
  });

  it("returns an error when updating an event that no longer exists", async () => {
    const db = createMockDb({ editableEvent: null });
    const request = createRequest({
      _action: "update",
      id: "7",
      restaurant_name: "Missing Event",
      restaurant_address: "789 Pine",
      event_date: "2099-05-10",
      event_time: "18:00",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Event not found" });
    expect(db.runCalls).toEqual([]);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("validates updated event input before running mutation statements", async () => {
    const db = createMockDb({
      editableEvent: {
        id: 7,
        restaurant_name: "Prime Steakhouse",
        restaurant_address: "789 Pine",
        event_date: "2099-05-10",
        event_time: "18:00",
        status: "upcoming",
        calendar_sequence: 2,
        created_by: 123,
      },
    });
    const request = createRequest({
      _action: "update",
      id: "7",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "789 Pine",
      event_date: "05/10/2099",
      event_time: "18:00",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "A valid event date is required." });
    expect(db.runCalls).toEqual([]);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("requires a positive event id before updating", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "update",
      id: "0",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "789 Pine",
      event_date: "2099-05-10",
      event_time: "18:00",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Event ID is required" });
    expect(db.runCalls).toEqual([]);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("updates an event through D1 batch statements when raw SQL transactions would fail", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
      } as never);
    const db = createMockDb({
      failOnRawTransactions: true,
      editableEvent: {
        id: 7,
        restaurant_name: "Legacy Event",
        restaurant_address: "789 Pine",
        event_date: "2099-05-10",
        event_time: "18:00",
        status: "upcoming",
        calendar_sequence: 2,
        created_by: null,
      },
    });
    const request = createRequest({
      _action: "update",
      id: "7",
      restaurant_name: "Updated Legacy Event",
      restaurant_address: "1010 Maple",
      event_date: "2099-06-12",
      event_time: "19:00",
      send_updates: "true",
    });

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
          ctx: { waitUntil: vi.fn() },
        },
      } as never,
    } as never);

    expect(response).toEqual({ ok: true, performedAction: "update" });
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE events"),
        bindArgs: ["Updated Legacy Event", "1010 Maple", "2099-06-12", "19:00", "upcoming", 3, 7],
      })
    );
    expect(db.runCalls).not.toContainEqual(
      expect.objectContaining({
        sql: "BEGIN TRANSACTION",
      })
    );
    expect(buildStageEventUpdateDeliveriesForActiveMembersStatement).toHaveBeenCalledWith(
      db,
      {
        batchId: expect.any(String),
        details: {
          eventId: 7,
          restaurantName: "Updated Legacy Event",
          restaurantAddress: "1010 Maple",
          eventDate: "2099-06-12",
          eventTime: "19:00",
        },
        calendarSequence: 3,
      }
    );
    expect(enqueueStagedEventEmailBatch).toHaveBeenCalledWith(
      {
        db,
        queue: undefined,
      },
      {
        batchId: expect.any(String),
        deliveryIds: [3, 4],
        recipientCount: 2,
        deliveryType: "update",
      }
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        actionType: "update_event",
      })
    );
  });

  it("continues event updates when enqueueing update deliveries throws", async () => {
    vi.mocked(enqueueStagedEventEmailBatch).mockRejectedValueOnce(new Error("queue unavailable"));
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
    const db = createMockDb({
      editableEvent: {
        id: 7,
        restaurant_name: "Legacy Event",
        restaurant_address: "789 Pine",
        event_date: "2099-05-10",
        event_time: "18:00",
        status: "upcoming",
        calendar_sequence: 2,
        created_by: null,
      },
    });
    const request = createRequest({
      _action: "update",
      id: "7",
      restaurant_name: "Updated Legacy Event",
      restaurant_address: "1010 Maple",
      event_date: "2099-06-12",
      event_time: "19:00",
      send_updates: "true",
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toEqual({ ok: true, performedAction: "update" });
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to enqueue staged event update deliveries",
      { eventId: 7, message: "queue unavailable" }
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "update_event",
      })
    );

    errorSpy.mockRestore();
  });

  it("rejects RSVP submissions that omit required fields", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "rsvp",
      event_id: "9",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Missing required fields" });
    expect(upsertRsvp).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "rsvp",
      })
    );
  });

  it("keeps RSVP submissions working through the route action", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "rsvp",
      event_id: "9",
      status: "yes",
      comments: "See you there",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toEqual({ ok: true, performedAction: "rsvp" });
    expect(upsertRsvp).toHaveBeenCalledWith({
      db,
      eventId: 9,
      userId: 123,
      status: "yes",
      comments: "See you there",
    });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 123,
        actionType: "rsvp",
      })
    );
  });

  it("logs RSVP updates separately when the RSVP already exists", async () => {
    vi.mocked(upsertRsvp).mockResolvedValueOnce("updated");
    const db = createMockDb();
    const request = createRequest({
      _action: "rsvp",
      event_id: "9",
      status: "no",
      comments: "",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toEqual({ ok: true, performedAction: "rsvp" });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 123,
        actionType: "update_rsvp",
      })
    );
  });
});
