import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.admin.polls";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

function createMockDb({
  activePoll = { id: 1 },
  restaurant = { id: 10, name: "Prime", address: "123 Main", vote_count: 2 },
  date = { id: 20, suggested_date: "2026-06-10", vote_count: 3 },
  closeChanges = 1,
}: {
  activePoll?: any;
  restaurant?: any;
  date?: any;
  closeChanges?: number;
}) {
  const run = vi.fn(async () => ({ meta: { changes: closeChanges, last_row_id: 555 } }));

  const prepare = vi.fn((sql: string) => {
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

      throw new Error(`Unexpected SQL in first(): ${sql}`);
    };

    return {
      first: () => firstForArgs(),
      run,
      all: async () => ({ results: [] }),
      bind: (..._args: unknown[]) => ({
        first: () => firstForArgs(),
        run,
        all: async () => ({ results: [] }),
      }),
    };
  });

  return { prepare, run };
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

  it("uses transaction boundaries when closing polls", async () => {
    const db = createMockDb({});

    const formData = new FormData();
    formData.set("_action", "close");
    formData.set("poll_id", "1");
    formData.set("create_event", "false");

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

    const statements = db.prepare.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(statements).toContain("BEGIN TRANSACTION");
    expect(statements).toContain("COMMIT");
  });
});
