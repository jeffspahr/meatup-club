import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";
import {
  enqueueStagedEventEmailBatch,
  stageEventInviteDeliveriesForActiveMembers,
} from "../lib/event-email-delivery.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/event-email-delivery.server", () => ({
  enqueueStagedEventEmailBatch: vi.fn(),
  stageEventInviteDeliveriesForActiveMembers: vi.fn(),
}));

function createMockDb({
  activePoll = { id: 1 },
  restaurant = { id: 10, name: "Prime", address: "123 Main", vote_count: 2 },
  date = { id: 20, suggested_date: "2026-06-10", vote_count: 3 },
  closeChanges = 1,
  failOnRawTransactions = false,
}: {
  activePoll?: any;
  restaurant?: any;
  date?: any;
  closeChanges?: number;
  failOnRawTransactions?: boolean;
}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const isSelectStatement = normalizedSql.startsWith("SELECT");

    const firstForArgs = async () => {
      if (sql.includes("SELECT id FROM polls WHERE id = ? AND status = 'active'")) {
        return activePoll;
      }

      if (sql.includes("SELECT r.*, COUNT(rv.id) as vote_count")) {
        return restaurant;
      }

      if (sql.includes("SELECT ds.*, COUNT(dv.id) as vote_count")) {
        return date;
      }

      if (sql.includes("SELECT email FROM users WHERE status = ?")) {
        return null;
      }

      if (sql.includes("SELECT created_event_id FROM polls WHERE id = ?")) {
        return { created_event_id: 555 };
      }

      throw new Error(`Unexpected SQL in first(): ${sql}`);
    };

    const allForArgs = async () => {
      if (normalizedSql === "SELECT created_event_id FROM polls WHERE id = ?") {
        return { results: [{ created_event_id: 555 }] };
      }

      return { results: [] };
    };

    const run = vi.fn(async (bindArgs: unknown[] = []) => {
      if (
        failOnRawTransactions &&
        (normalizedSql === "BEGIN TRANSACTION" ||
          normalizedSql === "COMMIT" ||
          normalizedSql === "ROLLBACK")
      ) {
        throw new Error("D1 does not support raw SQL transactions");
      }

      runCalls.push({ sql: normalizedSql, bindArgs });
      return { meta: { changes: closeChanges, last_row_id: 555 } };
    });

    return {
      first: () => firstForArgs(),
      ...(isSelectStatement ? {} : { run }),
      all: () => allForArgs(),
      bind: (...args: unknown[]) => ({
        first: () => firstForArgs(),
        ...(isSelectStatement ? {} : { run: () => run(args) }),
        all: () => allForArgs(),
      }),
    };
  });

  const batch = vi.fn(async (statements: Array<{ run?: () => Promise<unknown>; all?: () => Promise<unknown> }>) => {
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

describe("dashboard.admin.polls close action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as any);
    vi.mocked(stageEventInviteDeliveriesForActiveMembers).mockResolvedValue({
      batchId: "batch-poll-invite",
      deliveryIds: [41, 42],
      recipientCount: 2,
      deliveryType: "invite",
    });
    vi.mocked(enqueueStagedEventEmailBatch).mockResolvedValue(undefined);
  });

  it("rejects winning dates that are not in the poll being closed", async () => {
    const db = createMockDb({
      date: null,
    });

    const formData = new FormData();
    formData.set("_action", "close");
    formData.set("poll_id", "1");
    formData.set("winning_restaurant_id", "10");
    formData.set("winning_date_id", "20");
    formData.set("create_event", "true");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "UTC" }, ctx: { waitUntil: vi.fn() } } } as any,
    } as any);

    expect(result).toEqual({ error: "Selected date not found in this poll" });
  });

  it("creates events for poll close without issuing raw SQL transaction statements", async () => {
    const db = createMockDb({ failOnRawTransactions: true });

    const formData = new FormData();
    formData.set("_action", "close");
    formData.set("poll_id", "1");
    formData.set("winning_restaurant_id", "10");
    formData.set("winning_date_id", "20");
    formData.set("create_event", "true");

    const response = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "UTC" }, ctx: { waitUntil: vi.fn() } } } as any,
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/polls");
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.runCalls).not.toContainEqual(
      expect.objectContaining({
        sql: "BEGIN TRANSACTION",
      })
    );
  });

  it("stages invite deliveries durably when poll close creates an event", async () => {
    const db = createMockDb({});

    const formData = new FormData();
    formData.set("_action", "close");
    formData.set("poll_id", "1");
    formData.set("winning_restaurant_id", "10");
    formData.set("winning_date_id", "20");
    formData.set("create_event", "true");
    formData.set("send_invites", "true");
    formData.set("event_time", "18:30");

    const response = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db, APP_TIMEZONE: "UTC" }, ctx: { waitUntil: vi.fn() } } } as any,
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect(stageEventInviteDeliveriesForActiveMembers).toHaveBeenCalledWith(
      db,
      {
        eventId: 555,
        restaurantName: "Prime",
        restaurantAddress: "123 Main",
        eventDate: "2026-06-10",
        eventTime: "18:30",
      }
    );
    expect(enqueueStagedEventEmailBatch).toHaveBeenCalledWith(
      {
        db,
        queue: undefined,
      },
      {
        batchId: expect.any(String),
        deliveryIds: [41, 42],
        recipientCount: 2,
        deliveryType: "invite",
      }
    );
  });

  it("creates a new poll for admins", async () => {
    const db = createMockDb({});
    const formData = new FormData();
    formData.set("_action", "create");
    formData.set("title", "Q3 2026 Meetup Poll");

    const response = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db }, ctx: { waitUntil: vi.fn() } } } as any,
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/polls");

    const statements = db.prepare.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(statements).toContain(
      "UPDATE polls SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP WHERE status = 'active'"
    );
    expect(statements).toContain(
      "INSERT INTO polls (title, status, created_by) VALUES (?, 'active', ?)"
    );
  });
});
