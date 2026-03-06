import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.members";
import { requireAdmin } from "../lib/auth.server";
import { sendInviteEmail } from "../lib/email.server";
import { forceUserReauth } from "../lib/db.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/email.server", () => ({
  sendInviteEmail: vi.fn(),
}));

vi.mock("../lib/db.server", () => ({
  forceUserReauth: vi.fn(),
}));

type MockDbOptions = {
  existingUser?: { id: number } | null;
  selectedTemplate?: {
    subject: string;
    html_body: string;
    text_body: string;
  } | null;
  insertedUserId?: number | null;
};

function createMockDb({
  existingUser = null,
  selectedTemplate = {
    subject: "Welcome to Meatup",
    html_body: "<p>Welcome</p>",
    text_body: "Welcome",
  },
  insertedUserId = 77,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT id FROM users WHERE email = ?")) {
        return existingUser;
      }

      if (normalizedSql.includes("SELECT * FROM email_templates WHERE id = ?")) {
        return selectedTemplate;
      }

      if (normalizedSql.includes("SELECT * FROM email_templates WHERE is_default = 1 LIMIT 1")) {
        return selectedTemplate;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });

      if (normalizedSql.includes("INSERT INTO users (email, name, status)")) {
        return { meta: { last_row_id: insertedUserId } };
      }

      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: async () => ({ results: [] }),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: async () => ({ results: [] }),
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

  return new Request("http://localhost/dashboard/admin/members", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.admin.members action flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      name: "Admin User",
      email: "admin@example.com",
      is_admin: 1,
      status: "active",
    } as never);
    vi.mocked(sendInviteEmail).mockResolvedValue({ success: true });
    vi.mocked(forceUserReauth).mockResolvedValue(undefined);
  });

  it("requires an email address for member invites", async () => {
    const db = createMockDb();
    const request = createRequest({ _action: "invite" });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Email is required" });
  });

  it("rejects invites when the user already exists", async () => {
    const db = createMockDb({ existingUser: { id: 9 } });
    const request = createRequest({
      _action: "invite",
      email: "member@example.com",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "User with this email already exists" });
  });

  it("returns an error when no email template is available", async () => {
    const db = createMockDb({ selectedTemplate: null });
    const request = createRequest({
      _action: "invite",
      email: "member@example.com",
      name: "Member",
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

    expect(result).toEqual({ error: "Email template not found" });
  });

  it("returns a warning and invite link when the email send fails", async () => {
    vi.mocked(sendInviteEmail).mockResolvedValue({
      success: false,
      error: "Resend unavailable",
    });
    const db = createMockDb();
    const request = createRequest({
      _action: "invite",
      email: "member@example.com",
      name: "Member",
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

    expect(result).toEqual({
      success: true,
      warning: "User invited but email failed to send. Share the invite link manually.",
      inviteLink: "http://localhost/accept-invite?email=member%40example.com",
    });
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        inviteeName: "Member",
        inviterName: "Admin User",
      })
    );
  });

  it("redirects after a successful invite email send", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "invite",
      email: "member@example.com",
      name: "Member",
      template_id: "5",
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
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/members");
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptLink: "http://localhost/accept-invite?email=member%40example.com",
      })
    );
  });

  it("requires a user id for member updates", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "update",
      name: "Updated Name",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "User ID is required" });
  });

  it("updates member profile fields and redirects", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "update",
      user_id: "7",
      name: "Updated Name",
      is_admin: "true",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toContainEqual(
      expect.objectContaining({
        sql: "UPDATE users SET name = ?, is_admin = ? WHERE id = ?",
        bindArgs: ["Updated Name", 1, "7"],
      })
    );
  });

  it("deletes a member and their related votes/suggestions before redirecting", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "delete",
      user_id: "7",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: "DELETE FROM restaurant_votes WHERE user_id = ?",
        bindArgs: ["7"],
      }),
      expect.objectContaining({
        sql: "DELETE FROM date_votes WHERE user_id = ?",
        bindArgs: ["7"],
      }),
      expect.objectContaining({
        sql: "DELETE FROM date_suggestions WHERE user_id = ?",
        bindArgs: ["7"],
      }),
      expect.objectContaining({
        sql: "DELETE FROM users WHERE id = ?",
        bindArgs: ["7"],
      }),
    ]);
  });

  it("forces reauthentication for the requested user", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "force_reauth",
      user_id: "7",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({
      success: "User will be forced to re-login on their next page load",
    });
    expect(forceUserReauth).toHaveBeenCalledWith(db, 7);
  });
});
