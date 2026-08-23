import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";
import {
  buildSelectStagedDeliveryIdsStatement,
  buildStageEventInviteDeliveriesForLastInsertedEventStatement,
  enqueueStagedEventEmailBatch,
  toStagedEventEmailBatchFromQueryResult,
} from "../lib/event-email-delivery.server";
import { sendPollOpenSmsNotification } from "../lib/sms.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/event-email-delivery.server", () => ({
  buildSelectStagedDeliveryIdsStatement: vi.fn(),
  buildStageEventInviteDeliveriesForLastInsertedEventStatement: vi.fn(),
  enqueueStagedEventEmailBatch: vi.fn(),
  toStagedEventEmailBatchFromQueryResult: vi.fn(),
}));

vi.mock("../lib/sms.server", () => ({
  sendPollOpenSmsNotification: vi.fn(),
}));

function createMockDb({
  activePoll = { id: 1, title: "Summer Poll" },
  restaurant = { id: 10, name: "Prime", address: "123 Main", vote_count: 2 },
  date = { id: 20, suggested_date: "2099-06-10", vote_count: 3 },
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
      if (normalizedSql.includes("SELECT id, title FROM polls WHERE id = ? AND status = 'active'")) {
        return activePoll;
      }

      if (normalizedSql.includes("SELECT id FROM polls WHERE id = ? AND status = 'active'")) {
        return activePoll;
      }

      if (normalizedSql.includes("SELECT r.*, COUNT(rv.id) as vote_count")) {
        return restaurant;
      }

      if (normalizedSql.includes("SELECT ds.*, COUNT(dv.id) as vote_count")) {
        return date;
      }

      if (normalizedSql.includes("SELECT email FROM users WHERE status = ?")) {
        return null;
      }

      if (normalizedSql === "SELECT created_event_id FROM polls WHERE id = ?") {
        return { created_event_id: 555 };
      }

      throw new Error(`Unexpected SQL in first(): ${sql}`);
    };

    const allForArgs = async () => {
      if (normalizedSql === "SELECT created_event_id FROM polls WHERE id = ?") {
        return { results: [{ created_event_id: 555 }] };
      }

      if (normalizedSql === "SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC") {
        return { results: [{ id: 41 }, { id: 42 }] };
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

    for (const statement of statements) {
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
    vi.mocked(buildStageEventInviteDeliveriesForLastInsertedEventStatement).mockImplementation((db: any) =>
      db.prepare("INSERT INTO event_email_deliveries /* staged poll invite */").bind("batch-poll-invite")
    );
    vi.mocked(buildSelectStagedDeliveryIdsStatement).mockImplementation((db: any) =>
      db
        .prepare("SELECT id FROM event_email_deliveries WHERE batch_id = ? ORDER BY id ASC")
        .bind("batch-poll-invite")
    );
    vi.mocked(toStagedEventEmailBatchFromQueryResult).mockImplementation((batchId, deliveryType) => ({
      batchId,
      deliveryIds: [41, 42],
      recipientCount: 2,
      deliveryType,
    }));
    vi.mocked(enqueueStagedEventEmailBatch).mockResolvedValue(undefined);
    vi.mocked(sendPollOpenSmsNotification).mockResolvedValue({
      sent: 2,
      matched: 2,
      errors: [],
    });
  });

  it("sends a poll-open SMS to eligible members with no poll activity", async () => {
    const db = createMockDb({});
    const formData = new FormData();
    formData.set("_action", "send_poll_sms");
    formData.set("poll_id", "1");
    formData.set("recipient_scope", "not_voted");
    formData.set("custom_message", "Please vote by Friday.");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: formData,
      }),
      context: {
        cloudflare: {
          env: { DB: db, APP_BASE_URL: "https://meatup.club" },
          ctx: { waitUntil: vi.fn() },
        },
      } as any,
    } as any);

    expect(result).toEqual({ success: "Twilio accepted 2 poll SMS notifications." });
    expect(sendPollOpenSmsNotification).toHaveBeenCalledWith({
      db,
      env: expect.objectContaining({ APP_BASE_URL: "https://meatup.club" }),
      poll: { id: 1, title: "Summer Poll" },
      customMessage: "Please vote by Friday.",
      recipientScope: "not_voted",
      recipientUserId: null,
    });
  });

  it("rejects poll SMS sends when no eligible member matches", async () => {
    vi.mocked(sendPollOpenSmsNotification).mockResolvedValueOnce({
      sent: 0,
      matched: 0,
      errors: [],
    });
    const formData = new FormData();
    formData.set("_action", "send_poll_sms");
    formData.set("poll_id", "1");
    formData.set("recipient_scope", "specific");
    formData.set("recipient_user_id", "99");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: createMockDb({}) } } } as any,
    } as any);

    expect(result).toEqual({
      error: "No SMS-eligible members matched that recipient selection",
    });
  });

  it("rejects poll SMS sends for inactive polls and oversized custom notes", async () => {
    const oversized = new FormData();
    oversized.set("_action", "send_poll_sms");
    oversized.set("poll_id", "1");
    oversized.set("custom_message", "x".repeat(241));

    const oversizedResult = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: oversized,
      }),
      context: { cloudflare: { env: { DB: createMockDb({}) } } } as any,
    } as any);
    expect(oversizedResult).toEqual({
      error: "Custom SMS note must be 240 characters or fewer",
    });

    const inactive = new FormData();
    inactive.set("_action", "send_poll_sms");
    inactive.set("poll_id", "1");

    const inactiveResult = await action({
      request: new Request("http://localhost/dashboard/admin/polls", {
        method: "POST",
        body: inactive,
      }),
      context: { cloudflare: { env: { DB: createMockDb({ activePoll: null }) } } } as any,
    } as any);
    expect(inactiveResult).toEqual({ error: "Poll is not active or does not exist" });
    expect(sendPollOpenSmsNotification).not.toHaveBeenCalled();
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
    expect(buildStageEventInviteDeliveriesForLastInsertedEventStatement).toHaveBeenCalledWith(
      db,
      {
        batchId: expect.any(String),
        details: {
          restaurantName: "Prime",
          restaurantAddress: "123 Main",
          eventDate: "2099-06-10",
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
