import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./api.polls";
import { requireActiveUser } from "../lib/auth.server";
import { closePoll } from "../lib/polls.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/polls.server", async () => {
  const actual = await vi.importActual<typeof import("../lib/polls.server")>("../lib/polls.server");
  return {
    ...actual,
    closePoll: vi.fn(),
  };
});

type MockDbOptions = {
  loaderActivePoll?: Record<string, unknown> | null;
  activePollById?: Record<string, unknown> | null;
  createdPollId?: number;
  pollByIdResponses?: Array<Record<string, unknown> | null>;
  dateInPoll?: Record<string, unknown> | null;
  restaurant?: Record<string, unknown> | null;
  winningDate?: Record<string, unknown> | null;
  closeChanges?: number;
  eventId?: number;
  failOn?: "insert_event" | "close_update" | null;
};

function createMockDb({
  loaderActivePoll = { id: 1, title: "Spring Poll", status: "active" },
  activePollById = { id: 1 },
  createdPollId = 55,
  pollByIdResponses = [{ id: 55, title: "New Poll", status: "active" }],
  dateInPoll = { id: 17 },
  restaurant = { id: 9, name: "Steak House", address: "123 Main" },
  winningDate = { id: 17, suggested_date: "2026-05-01" },
  closeChanges = 1,
  eventId = 222,
  failOn = null,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const pollQueue = [...pollByIdResponses];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT * FROM polls WHERE status = 'active'")) {
        return loaderActivePoll;
      }

      if (normalizedSql.includes("SELECT id FROM polls WHERE id = ? AND status = 'active'")) {
        return activePollById;
      }

      if (normalizedSql.includes("SELECT id FROM date_suggestions WHERE id = ? AND poll_id = ?")) {
        return dateInPoll;
      }

      if (normalizedSql.includes("SELECT * FROM restaurants WHERE id = ?")) {
        return restaurant;
      }

      if (normalizedSql.includes("SELECT * FROM date_suggestions WHERE id = ? AND poll_id = ?")) {
        return winningDate;
      }

      if (normalizedSql.includes("SELECT * FROM polls WHERE id = ?")) {
        return pollQueue.shift() ?? null;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });

      if (normalizedSql === "BEGIN TRANSACTION") {
        return { meta: { changes: 0 } };
      }

      if (normalizedSql === "COMMIT") {
        return { meta: { changes: 0 } };
      }

      if (normalizedSql === "ROLLBACK") {
        return { meta: { changes: 0 } };
      }

      if (normalizedSql.includes("INSERT INTO polls")) {
        return { meta: { last_row_id: createdPollId } };
      }

      if (normalizedSql.includes("INSERT INTO events")) {
        if (failOn === "insert_event") {
          throw new Error("event insert failed");
        }

        return { meta: { last_row_id: eventId } };
      }

      if (normalizedSql.includes("UPDATE polls") && normalizedSql.includes("WHERE id = ? AND status = 'active'")) {
        if (failOn === "close_update") {
          return { meta: { changes: 0 } };
        }

        return { meta: { changes: closeChanges } };
      }

      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
}

function createRequest(formEntries?: Record<string, string>) {
  if (!formEntries) {
    return new Request("http://localhost/api/polls");
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/api/polls", {
    method: "POST",
    body: formData,
  });
}

describe("api.polls route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(closePoll).mockResolvedValue({
      ok: true,
      eventId: null,
    });
  });

  it("returns the active poll from the loader", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 42,
      is_admin: 0,
      status: "active",
      email: "member@example.com",
    } as never);
    const db = createMockDb({
      loaderActivePoll: { id: 7, title: "Weekly Poll", status: "active" },
    });

    const response = await loader({
      request: createRequest(),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(await response.json()).toEqual({
      activePoll: { id: 7, title: "Weekly Poll", status: "active" },
    });
  });

  it("requires a title when creating a poll", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb();

    const response = await action({
      request: createRequest({ _action: "create" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Poll title is required" });
  });

  it("closes any existing poll, creates a new one, and returns it", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb({
      createdPollId: 88,
      pollByIdResponses: [{ id: 88, title: "May Poll", status: "active" }],
    });

    const response = await action({
      request: createRequest({ _action: "create", title: "May Poll" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(await response.json()).toEqual({
      poll: { id: 88, title: "May Poll", status: "active" },
    });
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: "UPDATE polls SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP WHERE status = 'active'",
        bindArgs: [99],
      }),
      expect.objectContaining({
        sql: "INSERT INTO polls (title, status, created_by) VALUES (?, 'active', ?)",
        bindArgs: ["May Poll", 99],
      }),
    ]);
  });

  it("requires a poll id when closing a poll", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb();

    const response = await action({
      request: createRequest({ _action: "close" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Poll ID is required" });
  });

  it("requires winning selections before creating an event", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb();

    const response = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        create_event: "true",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Winning restaurant and date are required to create an event",
    });
  });

  it("rejects a winning date that does not belong to the poll", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb({ dateInPoll: null });

    const response = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_date_id: "17",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Winning date must belong to the poll being closed",
    });
  });

  it("uses the shared close helper when closing a poll with event creation", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    vi.mocked(closePoll).mockResolvedValue({
      ok: true,
      eventId: 333,
    });
    const db = createMockDb({
      pollByIdResponses: [
        {
          id: 1,
          status: "closed",
          winning_restaurant_id: 9,
          winning_date_id: 17,
          created_event_id: 333,
        },
      ],
      eventId: 333,
    });

    const response = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_restaurant_id: "9",
        winning_date_id: "17",
        create_event: "true",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(await response.json()).toEqual({
      poll: {
        id: 1,
        status: "closed",
        winning_restaurant_id: 9,
        winning_date_id: 17,
        created_event_id: 333,
      },
      eventId: 333,
    });
    expect(closePoll).toHaveBeenCalledWith({
      db,
      pollId: 1,
      closedByUserId: 99,
      winningRestaurantId: 9,
      winningDateId: 17,
      event: {
        restaurantName: "Steak House",
        restaurantAddress: "123 Main",
        eventDate: "2026-05-01",
        eventTime: "18:00",
      },
    });
  });

  it("returns a server error when the shared close helper fails", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    vi.mocked(closePoll).mockRejectedValue(new Error("d1 failure"));
    const db = createMockDb({ pollByIdResponses: [] });

    const response = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
        winning_restaurant_id: "9",
        winning_date_id: "17",
        create_event: "true",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to close poll" });
  });

  it("returns a conflict when the shared close helper reports the poll is no longer active", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    vi.mocked(closePoll).mockResolvedValue({
      ok: false,
      reason: "conflict",
    });
    const db = createMockDb();

    const response = await action({
      request: createRequest({
        _action: "close",
        poll_id: "1",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Failed to close poll" });
  });
});
