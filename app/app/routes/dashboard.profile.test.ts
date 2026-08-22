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

const user = {
  id: 7,
  email: "member@example.com",
  status: "active",
  is_admin: 0,
};

function createDb({ existingPhone = null }: { existingPhone?: unknown } = {}) {
  const calls: Array<{ sql: string; bindArgs: unknown[]; method: "first" | "run" }> = [];
  return {
    calls,
    prepare: vi.fn((sql: string) => ({
      bind: (...bindArgs: unknown[]) => ({
        first: async () => {
          calls.push({ sql, bindArgs, method: "first" });
          return existingPhone;
        },
        run: async () => {
          calls.push({ sql, bindArgs, method: "run" });
          return { meta: { changes: 1 } };
        },
      }),
    })),
  };
}

function createRequest(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return new Request("http://localhost/dashboard/profile", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue(user as any);
    vi.mocked(normalizePhoneNumber).mockReturnValue("+15551234567");
  });

  it("returns the authenticated user from the loader", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard/profile"),
      context: { cloudflare: { env: { DB: createDb() } } } as any,
    } as any);

    expect(result).toEqual({ user });
  });

  it("persists all notification checkbox values explicitly", async () => {
    const db = createDb();
    const result = await action({
      request: createRequest({
        _action: "update_notifications",
        notify_comment_replies: "on",
        notify_event_updates: "on",
      }),
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toEqual({ success: "Notification preferences updated successfully" });
    expect(db.calls).toContainEqual(
      expect.objectContaining({
        bindArgs: [1, 0, 1, user.id],
        method: "run",
      })
    );
  });

  it("rejects invalid phone numbers before querying the database", async () => {
    const db = createDb();
    vi.mocked(normalizePhoneNumber).mockReturnValue(null);

    const result = await action({
      request: createRequest({
        _action: "update_sms",
        phone_number: "not-a-number",
      }),
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toEqual({
      error: "Please enter a valid US phone number (e.g. 555-123-4567).",
    });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejects phone numbers already assigned to another member", async () => {
    const db = createDb({ existingPhone: { id: 99 } });

    const result = await action({
      request: createRequest({
        _action: "update_sms",
        phone_number: "555-123-4567",
        sms_opt_in: "on",
      }),
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toEqual({
      error: "That phone number is already linked to another account.",
    });
    expect(db.calls.filter(({ method }) => method === "run")).toHaveLength(0);
  });

  it("normalizes and persists valid SMS consent", async () => {
    const db = createDb();

    const result = await action({
      request: createRequest({
        _action: "update_sms",
        phone_number: "555-123-4567",
        sms_opt_in: "on",
      }),
      context: { cloudflare: { env: { DB: db } } } as any,
    } as any);

    expect(result).toEqual({ success: "SMS preferences updated successfully" });
    expect(db.calls).toContainEqual(
      expect.objectContaining({
        bindArgs: ["+15551234567", 1, 1, user.id],
        method: "run",
      })
    );
  });
});
