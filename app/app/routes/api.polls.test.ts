import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./api.polls";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

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
  failOnRawTransactions?: boolean;
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
  failOnRawTransactions = false,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const pollQueue = [...pollByIdResponses];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const isSelectStatement = normalizedSql.startsWith("SELECT");

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

    const allForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT created_event_id FROM polls WHERE id = ?") {
        return { results: [{ created_event_id: eventId }] };
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

      if (normalizedSql.includes("INSERT INTO polls")) {
        return { meta: { last_row_id: createdPollId } };
      }

      if (normalizedSql.includes("INSERT INTO events")) {
        if (failOn === "insert_event") {
          throw new Error("event insert failed");
        }

        return { meta: { changes: 1, last_row_id: eventId } };
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

  it("creates an event through D1 batch statements when closing a poll", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb({
      failOnRawTransactions: true,
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
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO events"),
        bindArgs: ["Steak House", "123 Main", "2026-05-01", "18:00", "upcoming", 99, 1],
      }),
      expect.objectContaining({
        sql: "UPDATE polls SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP, winning_restaurant_id = ?, winning_date_id = ?, created_event_id = last_insert_rowid() WHERE id = ? AND status = 'active'",
        bindArgs: [99, 9, 17, 1],
      }),
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO rsvps"),
        bindArgs: [17, 1],
      }),
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO rsvp_events"),
        bindArgs: [99, 17, 1],
      }),
    ]);
    expect(db.runCalls).not.toContainEqual(
      expect.objectContaining({ sql: "BEGIN TRANSACTION" })
    );
  });

  it("returns a server error when batch-based event close cannot claim the poll", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb({
      failOn: "close_update",
      pollByIdResponses: [],
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

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to close poll" });
    expect(db.runCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: "UPDATE polls SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP, winning_restaurant_id = ?, winning_date_id = ?, created_event_id = last_insert_rowid() WHERE id = ? AND status = 'active'",
          bindArgs: [99, 9, 17, 1],
        }),
      ])
    );
    expect(db.runCalls).not.toContainEqual(
      expect.objectContaining({ sql: "ROLLBACK" })
    );
  });

  it("returns a conflict when a non-transactional close updates no rows", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 99,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
    const db = createMockDb({ closeChanges: 0 });

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
