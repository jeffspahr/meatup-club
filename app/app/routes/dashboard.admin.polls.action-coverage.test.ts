import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";
import { getAppTimeZone, isDateInPastInTimeZone } from "../lib/dateUtils";
import { sendEventInvites } from "../lib/email.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    getAppTimeZone: vi.fn(() => "America/New_York"),
    isDateInPastInTimeZone: vi.fn(() => false),
  };
});

vi.mock("../lib/email.server", () => ({
  sendEventInvites: vi.fn(),
}));

type MockDbOptions = {
  activePoll?: Record<string, unknown> | null;
  restaurant?: Record<string, unknown> | null;
  date?: Record<string, unknown> | null;
  users?: Array<Record<string, unknown>>;
  createPollError?: Error | null;
  beginError?: Error | null;
  insertEventError?: Error | null;
  closeUpdateError?: Error | null;
  closeUpdateChanges?: number;
  rollbackError?: Error | null;
};

function createMockDb({
  activePoll = { id: 1 },
  restaurant = { id: 10, name: "Prime Steakhouse", address: "123 Main St", vote_count: 2 },
  date = { id: 20, suggested_date: "2026-06-10", vote_count: 3 },
  users = [],
  createPollError = null,
  beginError = null,
  insertEventError = null,
  closeUpdateError = null,
  closeUpdateChanges = 1,
  rollbackError = null,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async () => {
      if (normalizedSql.includes("SELECT id FROM polls WHERE id = ? AND status = 'active'")) {
        return activePoll;
      }

      if (normalizedSql.includes("SELECT r.*, COUNT(rv.id) as vote_count")) {
        return restaurant;
      }

      if (normalizedSql.includes("SELECT ds.*, COUNT(dv.id) as vote_count")) {
        return date;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const allForArgs = async () => {
      if (normalizedSql === "SELECT email FROM users WHERE status = ?") {
        return { results: users };
      }

      return { results: [] };
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });

      if (normalizedSql === "BEGIN TRANSACTION" && beginError) {
        throw beginError;
      }

      if (
        normalizedSql.includes("INSERT INTO polls (title, status, created_by) VALUES (?, 'active', ?)")
        && createPollError
      ) {
        throw createPollError;
      }

      if (normalizedSql.includes("INSERT INTO events") && insertEventError) {
        throw insertEventError;
      }

      if (
        normalizedSql.includes("UPDATE polls SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP")
        && normalizedSql.includes("winning_restaurant_id = ?")
      ) {
        if (closeUpdateError) {
          throw closeUpdateError;
        }

        return { meta: { changes: closeUpdateChanges } };
      }

      if (normalizedSql === "ROLLBACK" && rollbackError) {
        throw rollbackError;
      }

      return { meta: { changes: 1, last_row_id: 555 } };
    };

    return {
      first: () => firstForArgs(),
      all: () => allForArgs(),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(),
        all: () => allForArgs(),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
}

function createRequest(formEntries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/admin/polls", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.admin.polls action coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
    vi.mocked(getAppTimeZone).mockReturnValue("America/New_York" as never);
    vi.mocked(isDateInPastInTimeZone).mockReturnValue(false as never);
    vi.mocked(sendEventInvites).mockResolvedValue({ sentCount: 2, errors: [] } as never);
  });

  it("rejects non-admin users", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 2,
      is_admin: 0,
      status: "active",
      email: "member@example.com",
      name: "Member",
    } as never);

    const result = await action({
      request: createRequest({ _action: "create", title: "Summer Poll" }),
      context: { cloudflare: { env: { DB: createMockDb() }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Only admins can manage polls" });
  });

  it.each([
    [{ _action: "create", title: "" }, "Poll title is required"],
    [{ _action: "create", title: "x".repeat(121) }, "Poll title must be 120 characters or fewer"],
  ])("validates create input for %o", async (formEntries, expectedError) => {
    const result = await action({
      request: createRequest(formEntries),
      context: { cloudflare: { env: { DB: createMockDb() }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: expectedError });
  });

  it("returns a create error when poll creation fails", async () => {
    const db = createMockDb({ createPollError: new Error("insert failed") });

    const result = await action({
      request: createRequest({ _action: "create", title: "Summer Poll" }),
      context: { cloudflare: { env: { DB: db }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Failed to create poll" });
  });

  it.each([
    [{ _action: "close", event_time: "18:00" }, "Poll ID is required"],
    [{ _action: "close", poll_id: "abc", event_time: "18:00" }, "Invalid poll ID"],
    [{ _action: "close", poll_id: "1", event_time: "25:00" }, "Invalid event time format"],
    [
      { _action: "close", poll_id: "1", winning_restaurant_id: "abc", event_time: "18:00" },
      "Invalid restaurant selection",
    ],
    [
      { _action: "close", poll_id: "1", winning_date_id: "abc", event_time: "18:00" },
      "Invalid date selection",
    ],
  ])("validates close input for %o", async (formEntries, expectedError) => {
    const result = await action({
      request: createRequest(formEntries),
      context: { cloudflare: { env: { DB: createMockDb() }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: expectedError });
  });

  it("rejects closing a poll that is no longer active", async () => {
    const db = createMockDb({ activePoll: null });

    const result = await action({
      request: createRequest({ _action: "close", poll_id: "1", event_time: "18:00" }),
      context: { cloudflare: { env: { DB: db }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Poll is not active or does not exist" });
  });

  it("requires winning selections when creating an event", async () => {
    const result = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        create_event: "true",
        event_time: "18:00",
      }),
      context: { cloudflare: { env: { DB: createMockDb() }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      error: "Winning restaurant and date are required to create an event",
    });
  });

  it.each([
    [{ restaurant: null }, "Selected restaurant not found"],
    [{ restaurant: { id: 10, name: "Prime", address: "123 Main", vote_count: 0 } }, "Cannot select a restaurant with zero votes"],
  ])("validates restaurant winners for %o", async (dbOptions, expectedError) => {
    const db = createMockDb(dbOptions as MockDbOptions);

    const result = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_restaurant_id: "10",
        event_time: "18:00",
      }),
      context: { cloudflare: { env: { DB: db }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: expectedError });
  });

  it("rejects event creation for past dates and invite sending for restaurants without addresses", async () => {
    vi.mocked(isDateInPastInTimeZone).mockReturnValue(true as never);

    const pastDateResult = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_restaurant_id: "10",
        winning_date_id: "20",
        create_event: "true",
        event_time: "18:00",
      }),
      context: { cloudflare: { env: { DB: createMockDb() }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(pastDateResult).toEqual({ error: "Cannot create event for a date in the past" });

    vi.mocked(isDateInPastInTimeZone).mockReturnValue(false as never);
    const db = createMockDb({
      restaurant: { id: 10, name: "Prime", address: null, vote_count: 2 },
    });

    const missingAddressResult = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_restaurant_id: "10",
        winning_date_id: "20",
        create_event: "true",
        send_invites: "true",
        event_time: "18:00",
      }),
      context: { cloudflare: { env: { DB: db }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(missingAddressResult).toEqual({
      error:
        "Cannot send calendar invites: restaurant is missing an address. Please add an address first.",
    });
  });

  it("rolls back and returns an error when the close transaction fails", async () => {
    const db = createMockDb({ closeUpdateChanges: 0 });

    const result = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_restaurant_id: "10",
        winning_date_id: "20",
        create_event: "true",
        event_time: "18:00",
      }),
      context: { cloudflare: { env: { DB: db }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Failed to close poll. Please try again." });
    expect(db.runCalls.some((call) => call.sql === "ROLLBACK")).toBe(true);
  });

  it("queues invite sending when an event is created with invite delivery enabled", async () => {
    const waitUntil = vi.fn();
    const db = createMockDb({
      users: [{ email: "a@example.com" }, { email: "b@example.com" }],
    });

    const response = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_restaurant_id: "10",
        winning_date_id: "20",
        create_event: "true",
        send_invites: "true",
        event_time: "19:30",
      }),
      context: {
        cloudflare: {
          env: { DB: db, APP_TIMEZONE: "America/New_York", RESEND_API_KEY: "test-key" },
          ctx: { waitUntil },
        },
      } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect(sendEventInvites).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 555,
        recipientEmails: ["a@example.com", "b@example.com"],
        eventTime: "19:30",
        resendApiKey: "test-key",
      })
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("returns an invalid action error for unknown actions", async () => {
    const result = await action({
      request: createRequest({ _action: "archive" }),
      context: { cloudflare: { env: { DB: createMockDb() }, ctx: { waitUntil: vi.fn() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Invalid action" });
  });
});
