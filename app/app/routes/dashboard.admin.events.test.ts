import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.events";
import { requireAdmin } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { sendEventInvites, sendRsvpOverrideEmail } from "../lib/email.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/email.server", () => ({
  sendEventInvites: vi.fn(),
  sendRsvpOverrideEmail: vi.fn(),
}));

vi.mock("../lib/sms.server", () => ({
  sendAdhocSmsReminder: vi.fn(),
}));

type MockDbOptions = {
  createdEventId?: number | null;
  activeUsers?: Array<{ email: string }>;
  eventRow?: {
    id: number;
    restaurant_name: string;
    event_date: string;
    event_time: string | null;
  } | null;
  targetUser?: {
    id: number;
    name: string | null;
    email: string;
  } | null;
  existingRsvp?: { id: number } | null;
};

function createMockDb({
  createdEventId = 101,
  activeUsers = [{ email: "one@example.com" }, { email: "two@example.com" }],
  eventRow = {
    id: 42,
    restaurant_name: "Prime Steakhouse",
    event_date: "2026-04-20",
    event_time: "18:00",
  },
  targetUser = {
    id: 7,
    name: "Target User",
    email: "target@example.com",
  },
  existingRsvp = null,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT id, restaurant_name, event_date, event_time FROM events WHERE id = ?")) {
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

    const allForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql === "SELECT email FROM users WHERE status = 'active'") {
        return { results: activeUsers };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });

      if (normalizedSql.includes("INSERT INTO events")) {
        return { meta: { last_row_id: createdEventId } };
      }

      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: () => allForArgs([]),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: () => allForArgs(bindArgs),
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
    vi.mocked(sendEventInvites).mockResolvedValue({
      success: true,
      sentCount: 2,
      errors: [],
    });
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

    expect(result).toEqual({ error: "Restaurant name and date are required" });
    expect(db.runCalls).toEqual([]);
  });

  it("creates an event and schedules invite sending when requested", async () => {
    const db = createMockDb();
    const waitUntil = vi.fn();
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
          ctx: { waitUntil },
        },
      } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/events");
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO events"),
        bindArgs: ["Prime Steakhouse", "123 Main St", "2026-04-20", "18:30", "upcoming"],
      })
    );
    expect(sendEventInvites).toHaveBeenCalledWith({
      eventId: 101,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "123 Main St",
      eventDate: "2026-04-20",
      eventTime: "18:30",
      recipientEmails: ["one@example.com", "two@example.com"],
      resendApiKey: "test-api-key",
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
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
});
