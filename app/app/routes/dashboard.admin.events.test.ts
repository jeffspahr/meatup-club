import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.events";
import { requireAdmin } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
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
} from "../lib/event-email-delivery.server";
import { sendRsvpOverrideEmail } from "../lib/email.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/event-email-delivery.server", () => ({
  buildSelectStagedDeliveryIdsStatement: vi.fn(),
  buildStageEventCancellationDeliveriesForActiveMembersStatement: vi.fn(),
  buildStageEventInviteDeliveriesForLastInsertedEventStatement: vi.fn(),
  buildStageEventUpdateDeliveriesForActiveMembersStatement: vi.fn(),
  buildStageEventUpdateDeliveriesStatement: vi.fn(),
  enqueueStagedEventEmailBatch: vi.fn(),
  getActiveMemberIdsWithoutAcceptedEventEmailDelivery: vi.fn(),
  listEventEmailRecipientDeliveryHistory: vi.fn(),
  toStagedEventEmailBatchFromQueryResult: vi.fn(),
}));

vi.mock("../lib/email.server", () => ({
  sendRsvpOverrideEmail: vi.fn(),
}));

vi.mock("../lib/sms.server", () => ({
  sendAdhocSmsReminder: vi.fn(),
}));

type MockDbOptions = {
  createdEventId?: number | null;
  eventRow?: {
    id: number;
    restaurant_name: string;
    restaurant_address?: string | null;
    event_date: string;
    event_time: string | null;
    calendar_sequence?: number | null;
  } | null;
  targetUser?: {
    id: number;
    name: string | null;
    email: string;
  } | null;
  existingRsvp?: { id: number } | null;
  editableEvent?: {
    id: number;
    restaurant_name: string;
    restaurant_address?: string | null;
    event_date: string;
    event_time: string | null;
    status: string;
    calendar_sequence?: number | null;
    created_by?: number | null;
  } | null;
  activeSelectedUserIds?: number[];
  activeUserIds?: number[];
  failOnRawTransactions?: boolean;
};

function createMockDb({
  createdEventId = 101,
  eventRow = {
    id: 42,
    restaurant_name: "Prime Steakhouse",
    restaurant_address: "123 Main St",
    event_date: "2026-04-20",
    event_time: "18:00",
    calendar_sequence: 2,
  },
  targetUser = {
    id: 7,
    name: "Target User",
    email: "target@example.com",
  },
  existingRsvp = null,
  editableEvent = {
    id: 42,
    restaurant_name: "Prime Steakhouse",
    restaurant_address: "123 Main St",
    event_date: "2026-04-20",
    event_time: "18:00",
    status: "upcoming",
    calendar_sequence: 2,
    created_by: 1,
  },
  activeSelectedUserIds = [7],
  activeUserIds = [7, 8, 9],
  failOnRawTransactions = false,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const allCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const isSelectStatement = normalizedSql.startsWith("SELECT");

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("created_by") && normalizedSql.includes("FROM events WHERE id = ?")) {
        return editableEvent;
      }

      if (normalizedSql.includes("FROM events WHERE id = ?")) {
        return eventRow;
      }

      if (normalizedSql.includes("SELECT id, name, email FROM users WHERE id = ?")) {
        return targetUser;
      }

      if (normalizedSql.includes("SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?")) {
        return existingRsvp;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async (bindArgs: unknown[]) => {
      if (
        normalizedSql.includes("SELECT id") &&
        normalizedSql.includes("FROM users") &&
        normalizedSql.includes("status = 'active'") &&
        normalizedSql.includes("id IN (")
      ) {
        return {
          results: activeSelectedUserIds
            .filter((id) => bindArgs.map((value) => Number(value)).includes(id))
            .map((id) => ({ id })),
        };
      }

      if (
        normalizedSql.includes("SELECT id") &&
        normalizedSql.includes("FROM users") &&
        normalizedSql.includes("status = 'active'") &&
        !normalizedSql.includes("id IN (")
      ) {
        return {
          results: activeUserIds.map((id) => ({ id })),
        };
      }

      allCalls.push({ sql: normalizedSql, bindArgs });

      if (normalizedSql === "SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC") {
        return {
          results: [{ id: 21 }, { id: 22 }],
        };
      }

      if (normalizedSql === "SELECT last_insert_rowid() AS id") {
        return {
          results: [{ id: createdEventId }],
        };
      }

      return { results: [] };
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

  return { prepare, runCalls, allCalls, batch };
}

function createRequest(formEntries: Record<string, string | string[]>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        formData.append(key, entry);
      }
      continue;
    }

    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/admin/events", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.admin.events action flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      name: "Admin User",
      email: "admin@example.com",
      is_admin: 1,
      status: "active",
    } as never);
    vi.mocked(logActivity).mockResolvedValue(undefined);
    vi.mocked(getActiveMemberIdsWithoutAcceptedEventEmailDelivery).mockResolvedValue([7, 9]);
    vi.mocked(listEventEmailRecipientDeliveryHistory).mockResolvedValue([]);
    vi.mocked(buildStageEventInviteDeliveriesForLastInsertedEventStatement).mockImplementation((db: any) =>
      db
        .prepare("INSERT INTO event_email_deliveries /* staged invite active members */")
        .bind("mock-invite-batch")
    );
    vi.mocked(buildStageEventCancellationDeliveriesForActiveMembersStatement).mockImplementation((db: any) =>
      db
        .prepare("INSERT INTO event_email_deliveries /* staged cancel active members */")
        .bind("mock-cancel-batch")
    );
    vi.mocked(buildStageEventUpdateDeliveriesForActiveMembersStatement).mockImplementation((db: any) =>
      db
        .prepare("INSERT INTO event_email_deliveries /* staged update active members */")
        .bind("mock-update-batch")
    );
    vi.mocked(toStagedEventEmailBatchFromQueryResult).mockImplementation((batchId, deliveryType) => ({
      batchId,
      deliveryIds:
        deliveryType === "invite" ? [11, 12] : deliveryType === "cancel" ? [31, 32] : [21, 22],
      recipientCount: 2,
      deliveryType,
    }));
    vi.mocked(buildStageEventUpdateDeliveriesStatement).mockImplementation((db: any) =>
      db
        .prepare("INSERT INTO event_email_deliveries /* staged update */")
        .bind("mock-batch")
    );
    vi.mocked(buildSelectStagedDeliveryIdsStatement).mockImplementation((db: any) =>
      db
        .prepare("SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC")
        .bind("mock-batch")
    );
    vi.mocked(enqueueStagedEventEmailBatch).mockResolvedValue(undefined);
    vi.mocked(sendRsvpOverrideEmail).mockResolvedValue({ success: true });
  });

  it("validates required event fields before creation", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "create",
      event_date: "2026-04-20",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Select a restaurant from Google Places." });
    expect(db.runCalls).toEqual([]);
  });

  it("creates an event through D1 batch statements when raw SQL transactions would fail", async () => {
    const db = createMockDb({ failOnRawTransactions: true });
    const request = createRequest({
      _action: "create",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "123 Main St",
      event_date: "2026-04-20",
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
        },
      } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/events");
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO events"),
        bindArgs: ["Prime Steakhouse", "123 Main St", "2026-04-20", "18:30", "upcoming", 1],
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
          eventDate: "2026-04-20",
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
        deliveryIds: [11, 12],
        recipientCount: 2,
        deliveryType: "invite",
      }
    );
  });

  it("returns a generic create error when the inserted event id cannot be determined", async () => {
    const db = createMockDb({ createdEventId: null });
    const request = createRequest({
      _action: "create",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "123 Main St",
      event_date: "2026-04-20",
      event_time: "18:30",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Failed to create event" });
  });

  it("continues creating events when invite enqueueing fails", async () => {
    vi.mocked(enqueueStagedEventEmailBatch).mockRejectedValueOnce("queue offline");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = createMockDb();
    const request = createRequest({
      _action: "create",
      restaurant_name: "Prime Steakhouse",
      restaurant_address: "123 Main St",
      event_date: "2026-04-20",
      event_time: "18:30",
      send_invites: "true",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect((response as Response).status).toBe(302);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to enqueue staged event invite deliveries",
      { eventId: 101, message: "queue offline" }
    );

    errorSpy.mockRestore();
  });

  it("updates an event through D1 batch statements when raw SQL transactions would fail", async () => {
    const db = createMockDb({ failOnRawTransactions: true });
    const request = createRequest({
      _action: "update",
      id: "42",
      restaurant_name: "Updated Prime Steakhouse",
      restaurant_address: "456 Oak Ave",
      event_date: "2026-05-01",
      event_time: "19:15",
      send_updates: "true",
    });

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE events"),
        bindArgs: ["Updated Prime Steakhouse", "456 Oak Ave", "2026-05-01", "19:15", "upcoming", 3, 42],
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
          eventId: 42,
          restaurantName: "Updated Prime Steakhouse",
          restaurantAddress: "456 Oak Ave",
          eventDate: "2026-05-01",
          eventTime: "19:15",
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
        deliveryIds: [21, 22],
        recipientCount: 2,
        deliveryType: "update",
      }
    );
  });

  it("validates updated event input before running mutation statements", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "update",
      id: "42",
      restaurant_name: "",
      restaurant_address: "123 Main St",
      event_date: "",
      event_time: "18:00",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Select a restaurant from Google Places." });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("returns an error when updating an event that no longer exists", async () => {
    const db = createMockDb({ editableEvent: null });
    const request = createRequest({
      _action: "update",
      id: "42",
      restaurant_name: "Updated Grill",
      restaurant_address: "123 Main St",
      event_date: "2026-04-25",
      event_time: "18:15",
      send_updates: "true",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Event not found" });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("requires an event id before updating", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "update",
      restaurant_name: "Updated Prime Steakhouse",
      restaurant_address: "456 Oak Ave",
      event_date: "2026-05-01",
      event_time: "19:15",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Event ID is required" });
    expect(db.runCalls).toEqual([]);
  });

  it("resends only to missing recipients by default", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
    });

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(response).toEqual({ success: "Queued calendar resend for 2 missing active members." });
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("SET calendar_sequence = ?"),
        bindArgs: [3, 42],
      })
    );
    expect(getActiveMemberIdsWithoutAcceptedEventEmailDelivery).toHaveBeenCalledWith(db, 42);
    expect(buildStageEventUpdateDeliveriesStatement).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        batchId: expect.any(String),
        details: {
          eventId: 42,
          restaurantName: "Prime Steakhouse",
          restaurantAddress: "123 Main St",
          eventDate: "2026-04-20",
          eventTime: "18:00",
        },
        userIds: [7, 9],
        calendarSequence: 3,
      })
    );
    expect(enqueueStagedEventEmailBatch).toHaveBeenCalledWith(
      {
        db,
        queue: undefined,
      },
      {
        batchId: expect.any(String),
        deliveryIds: [21, 22],
        recipientCount: 2,
        deliveryType: "update",
      }
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        actionType: "resend_event_calendar",
        actionDetails: expect.objectContaining({
          event_id: 42,
          calendar_sequence: 3,
          recipient_mode: "missing",
          recipient_count: 2,
        }),
      })
    );
  });

  it("supports a selective resend for chosen active members", async () => {
    const db = createMockDb({ activeSelectedUserIds: [7, 9] });
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
      recipient_mode: "selected",
      recipient_user_ids: ["7", "9", "999"],
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ success: "Queued calendar resend for 2 selected active members." });
    expect(buildStageEventUpdateDeliveriesStatement).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        details: expect.objectContaining({
          eventId: 42,
        }),
        userIds: [7, 9],
      })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actionDetails: expect.objectContaining({
          recipient_mode: "selected",
          selected_user_ids: [7, 9],
        }),
      })
    );
  });

  it("rejects invalid calendar resend recipient modes", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
      recipient_mode: "mystery",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Invalid calendar resend recipient selection" });
    expect(buildStageEventUpdateDeliveriesStatement).not.toHaveBeenCalled();
  });

  it("requires at least one selected recipient for a selective resend", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
      recipient_mode: "selected",
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ error: "Select at least one active member for a selective resend" });
    expect(buildStageEventUpdateDeliveriesStatement).not.toHaveBeenCalled();
    expect(enqueueStagedEventEmailBatch).not.toHaveBeenCalled();
  });

  it("returns a success message without bumping sequence when no members are missing", async () => {
    vi.mocked(getActiveMemberIdsWithoutAcceptedEventEmailDelivery).mockResolvedValueOnce([]);
    const db = createMockDb();
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({
      success:
        "All active members already have a provider-accepted or delivered calendar email for this event.",
    });
    expect(db.runCalls).not.toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("SET calendar_sequence = ?"),
      })
    );
    expect(buildStageEventUpdateDeliveriesStatement).not.toHaveBeenCalled();
    expect(enqueueStagedEventEmailBatch).not.toHaveBeenCalled();
  });

  it("returns an error when an all-member resend has no active recipients", async () => {
    const db = createMockDb({ activeUserIds: [] });
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
      recipient_mode: "all",
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ error: "No active members are available for calendar resend" });
    expect(buildStageEventUpdateDeliveriesStatement).not.toHaveBeenCalled();
    expect(enqueueStagedEventEmailBatch).not.toHaveBeenCalled();
  });

  it("returns an error when the staged resend batch has no eligible recipients", async () => {
    vi.mocked(toStagedEventEmailBatchFromQueryResult).mockReturnValueOnce(null);
    const db = createMockDb();
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ error: "No eligible members were available for calendar resend" });
    expect(enqueueStagedEventEmailBatch).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "resend_event_calendar",
      })
    );
  });

  it("rejects calendar resend for cancelled events", async () => {
    const db = createMockDb({
      editableEvent: {
        id: 42,
        restaurant_name: "Prime Steakhouse",
        restaurant_address: "123 Main St",
        event_date: "2026-04-20",
        event_time: "18:00",
        status: "cancelled",
        calendar_sequence: 2,
        created_by: 1,
      },
    });
    const request = createRequest({
      _action: "resend_calendar_request",
      id: "42",
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ error: "Cancelled events cannot be resent" });
    expect(buildStageEventUpdateDeliveriesStatement).not.toHaveBeenCalled();
    expect(enqueueStagedEventEmailBatch).not.toHaveBeenCalled();
  });

  it("rejects invalid RSVP override statuses", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "override_rsvp",
      event_id: "42",
      user_id: "7",
      status: "pending",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Invalid RSVP status" });
    expect(db.runCalls).toEqual([]);
  });

  it("requires event, user, and status for RSVP overrides", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "override_rsvp",
      event_id: "42",
      user_id: "0",
      status: "",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Event, user, and status are required for RSVP overrides" });
    expect(db.runCalls).toEqual([]);
  });

  it("returns an error when the event or target user cannot be found", async () => {
    const db = createMockDb({ eventRow: null });
    const request = createRequest({
      _action: "override_rsvp",
      event_id: "42",
      user_id: "7",
      status: "yes",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Event or user not found" });
    expect(db.runCalls).toEqual([]);
  });

  it("inserts a new RSVP override and notifies the affected user", async () => {
    const db = createMockDb({ existingRsvp: null });
    const request = createRequest({
      _action: "override_rsvp",
      event_id: "42",
      user_id: "7",
      status: "yes",
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ success: "RSVP override saved and user notified." });
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO rsvps"),
        bindArgs: [42, 7, "yes", 1],
      })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        actionType: "admin_override_rsvp",
      })
    );
    expect(sendRsvpOverrideEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "target@example.com",
        recipientName: "Target User",
        adminName: "Admin User",
        eventName: "Prime Steakhouse",
        rsvpStatus: "yes",
        resendApiKey: "test-api-key",
      })
    );
  });

  it("updates an existing RSVP override instead of inserting a duplicate row", async () => {
    const db = createMockDb({ existingRsvp: { id: 999 } });
    const request = createRequest({
      _action: "override_rsvp",
      event_id: "42",
      user_id: "7",
      status: "no",
    });

    const result = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ success: "RSVP override saved and user notified." });
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE rsvps"),
        bindArgs: ["no", 1, 42, 7],
      })
    );
    expect(db.runCalls).not.toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO rsvps"),
      })
    );
  });

  it("queues RSVP override emails with waitUntil when available", async () => {
    const db = createMockDb({ existingRsvp: null });
    const waitUntil = vi.fn();
    vi.mocked(sendRsvpOverrideEmail).mockResolvedValueOnce({ success: true });

    const result = await action({
      request: createRequest({
        _action: "override_rsvp",
        event_id: "42",
        user_id: "7",
        status: "yes",
      }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
          ctx: {
            waitUntil,
          },
        },
      } as never,
    } as never);

    expect(result).toEqual({ success: "RSVP override saved and user notified." });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(sendRsvpOverrideEmail).toHaveBeenCalledTimes(1);
  });

  it("deletes an event through D1 batch statements when raw SQL transactions would fail", async () => {
    const db = createMockDb({ failOnRawTransactions: true });
    const request = createRequest({
      _action: "delete",
      id: "42",
    });

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
          },
        },
      } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(buildStageEventCancellationDeliveriesForActiveMembersStatement).toHaveBeenCalledWith(
      db,
      {
        batchId: expect.any(String),
        details: {
          eventId: 42,
          restaurantName: "Prime Steakhouse",
          restaurantAddress: "123 Main St",
          eventDate: "2026-04-20",
          eventTime: "18:00",
          sequence: 3,
        },
      }
    );
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("DELETE FROM events WHERE id = ?"),
        bindArgs: [42],
      })
    );
    expect(enqueueStagedEventEmailBatch).toHaveBeenCalledWith(
      {
        db,
        queue: undefined,
      },
      {
        batchId: expect.any(String),
        deliveryIds: [31, 32],
        recipientCount: 2,
        deliveryType: "cancel",
      }
    );
  });

  it("requires a custom message body for custom SMS reminders", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_sms_reminder",
      event_id: "42",
      message_type: "custom",
      custom_message: "   ",
      recipient_scope: "all",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Custom SMS message cannot be empty" });
  });

  it("requires a selected recipient when SMS scope is specific", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_sms_reminder",
      event_id: "42",
      message_type: "default",
      recipient_scope: "specific",
      recipient_user_id: "",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Select a specific recipient" });
  });

  it("requires an event id before sending SMS reminders", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_sms_reminder",
      event_id: "0",
      message_type: "default",
      recipient_scope: "all",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Event ID is required for SMS reminders" });
  });

  it("rejects unknown action values", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "mystery",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Invalid action" });
    expect(db.runCalls).toEqual([]);
    expect(enqueueStagedEventEmailBatch).not.toHaveBeenCalled();
  });
});
