import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.announcements";
import { requireAdmin } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { sendAnnouncementEmails } from "../lib/email.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/activity.server", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../lib/email.server", () => ({
  sendAnnouncementEmails: vi.fn(),
}));

function createMockDb(
  members: Array<{ id: number; name: string | null; email: string; status?: string }> = [
    { id: 1, name: "Alpha", email: "alpha@example.com", status: "active" },
    { id: 2, name: "Bravo", email: "bravo@example.com", status: "inactive" },
    { id: 3, name: "Charlie", email: "charlie@example.com", status: "active" },
  ]
) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const allForArgs = async (_bindArgs: unknown[]) => {
      if (
        normalizedSql.includes("SELECT id, name, email") &&
        normalizedSql.includes("FROM users") &&
        normalizedSql.includes("WHERE status = 'active'")
      ) {
        return {
          results: members
            .filter((member) => member.status !== "inactive")
            .map(({ id, name, email }) => ({ id, name, email })),
        };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    return {
      all: () => allForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        all: () => allForArgs(bindArgs),
      }),
    };
  });

  return { prepare };
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

  return new Request("http://localhost/dashboard/admin/announcements", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.admin.announcements action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 99,
      name: "Admin User",
      email: "admin@example.com",
      is_admin: 1,
      status: "active",
    } as never);
    vi.mocked(sendAnnouncementEmails).mockResolvedValue({
      success: true,
      sentCount: 2,
    });
    vi.mocked(logActivity).mockResolvedValue(undefined);
  });

  it("requires a subject", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_announcement",
      message_text: "Hello members",
      recipient_mode: "all_active",
    });

    const result = await action({
      request,
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        } as never) as never,
    } as never);

    expect(result).toEqual({ error: "Subject is required" });
  });

  it("requires a message body", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_announcement",
      subject: "Important update",
      recipient_mode: "all_active",
    });

    const result = await action({
      request,
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        } as never) as never,
    } as never);

    expect(result).toEqual({ error: "Message is required" });
  });

  it("requires a configured Resend API key", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_announcement",
      subject: "Important update",
      message_text: "Hello members",
      recipient_mode: "all_active",
    });

    const result = await action({
      request,
      context: createLoadContext({
          env: {
            DB: db,
          },
        } as never) as never,
    } as never);

    expect(result).toEqual({ error: "RESEND_API_KEY is not configured" });
  });

  it("requires at least one selected active member when using selected mode", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_announcement",
      subject: "Important update",
      message_text: "Hello members",
      recipient_mode: "selected",
    });

    const result = await action({
      request,
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        } as never) as never,
    } as never);

    expect(result).toEqual({ error: "Choose at least one active member" });
  });

  it("sends only to the current admin when using me_only mode", async () => {
    vi.mocked(sendAnnouncementEmails).mockResolvedValue({
      success: true,
      sentCount: 1,
    });
    const db = createMockDb([
      { id: 99, name: "Admin User", email: "admin@example.com", status: "active" },
      { id: 3, name: "Charlie", email: "charlie@example.com", status: "active" },
    ]);
    const request = createRequest({
      _action: "send_announcement",
      subject: "Important update",
      message_text: "Hello members",
      recipient_mode: "me_only",
    });

    const result = await action({
      request,
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        } as never) as never,
    } as never);

    expect(result).toEqual({ success: "Sent announcement to 1 active member." });
    expect(sendAnnouncementEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmails: ["admin@example.com"],
      })
    );
  });

  it("sends to all active members and logs the send", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "send_announcement",
      subject: "Important update",
      message_text: "Hello members",
      recipient_mode: "all_active",
    });

    const result = await action({
      request,
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        } as never) as never,
    } as never);

    expect(result).toEqual({ success: "Sent announcement to 2 active members." });
    expect(sendAnnouncementEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmails: ["alpha@example.com", "charlie@example.com"],
        subject: "Important update",
        messageText: "Hello members",
        resendApiKey: "test-api-key",
      })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        actionType: "send_member_announcement",
        route: "/dashboard/admin/announcements",
      })
    );
  });

  it("sends only to the selected active members", async () => {
    vi.mocked(sendAnnouncementEmails).mockResolvedValue({
      success: true,
      sentCount: 1,
    });
    const db = createMockDb();
    const request = createRequest({
      _action: "send_announcement",
      subject: "Important update",
      message_text: "Hello members",
      recipient_mode: "selected",
      recipient_user_ids: ["3", "999"],
    });

    const result = await action({
      request,
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_API_KEY: "test-api-key",
          },
        } as never) as never,
    } as never);

    expect(result).toEqual({ success: "Sent announcement to 1 active member." });
    expect(sendAnnouncementEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmails: ["charlie@example.com"],
      })
    );
  });
});
