import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "./dashboard.profile";
import { requireActiveUser } from "../lib/auth.server";
import { normalizePhoneNumber } from "../lib/sms.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/sms.server", () => ({
  normalizePhoneNumber: vi.fn(),
}));

function createMockDb({
  existingPhoneUser = null,
}: {
  existingPhoneUser?: { id: number } | null;
} = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async () => {
      if (normalizedSql === "SELECT id FROM users WHERE phone_number = ? AND id != ?") {
        return existingPhoneUser;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });
      return { meta: { changes: 1 } };
    };

    return {
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
}

function createRequest(formEntries?: Record<string, string>) {
  if (!formEntries) {
    return new Request("http://localhost/dashboard/profile");
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/profile", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 1,
      status: "active",
      email: "user@example.com",
      name: "User",
      picture: "https://example.com/user.jpg",
      notify_comment_replies: 1,
      notify_poll_updates: 0,
      notify_event_updates: 1,
      phone_number: null,
      sms_opt_in: 0,
      sms_opt_out_at: null,
    } as never);
    vi.mocked(normalizePhoneNumber).mockImplementation((value: string) =>
      value === "555-123-4567" ? "+15551234567" : null
    );
  });

  it("returns the active user from the loader", async () => {
    const result = await loader({
      request: createRequest(),
      context: { cloudflare: { env: {} } } as never,
      params: {},
    } as never);

    expect(result.user).toEqual(
      expect.objectContaining({
        id: 123,
        email: "user@example.com",
      })
    );
  });

  it("updates notification preferences", async () => {
    const db = createMockDb();

    const result = await action({
      request: createRequest({
        _action: "update_notifications",
        notify_comment_replies: "on",
        notify_event_updates: "on",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ success: "Notification preferences updated successfully" });
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE users SET notify_comment_replies = ?"),
        bindArgs: [1, 0, 1, 123],
      }),
    ]);
  });

  it("rejects invalid SMS numbers", async () => {
    const db = createMockDb();

    const result = await action({
      request: createRequest({
        _action: "update_sms",
        phone_number: "invalid",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      error: "Please enter a valid US phone number (e.g. 555-123-4567).",
    });
  });

  it("rejects duplicate SMS phone numbers", async () => {
    const db = createMockDb({
      existingPhoneUser: { id: 999 },
    });

    const result = await action({
      request: createRequest({
        _action: "update_sms",
        phone_number: "555-123-4567",
        sms_opt_in: "on",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      error: "That phone number is already linked to another account.",
    });
  });

  it("updates SMS preferences with a normalized phone number", async () => {
    const db = createMockDb();

    const result = await action({
      request: createRequest({
        _action: "update_sms",
        phone_number: "555-123-4567",
        sms_opt_in: "on",
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ success: "SMS preferences updated successfully" });
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE users SET phone_number = ?"),
        bindArgs: ["+15551234567", 1, 1, 123],
      }),
    ]);
  });

  it("rejects unknown action types", async () => {
    const db = createMockDb();

    const result = await action({
      request: createRequest({ _action: "nope" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Invalid action" });
  });
});
