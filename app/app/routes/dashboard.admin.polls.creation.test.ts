// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./dashboard.admin.polls";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));

describe("admin poll replacement", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status, is_admin) VALUES (1, 'admin@example.com', 'active', 1);
      INSERT INTO polls (id, title, status, created_by) VALUES (10, 'Current poll', 'active', 1);
      INSERT INTO restaurants (id, name, created_by) VALUES (20, 'Steakhouse', 1);
      INSERT INTO restaurant_votes (poll_id, restaurant_id, user_id) VALUES (10, 20, 1);
    `);
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 1, status: "active" } as never);
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.restoreAllMocks();
  });

  function createPoll() {
    return action({
      request: new Request("https://meatup.club/dashboard/admin/polls", {
        method: "POST",
        body: new URLSearchParams({ _action: "create", title: "Next poll" }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it("closes the previous poll and opens its replacement while preserving votes", async () => {
    const result = await createPoll();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/dashboard/admin/polls");
    expect(harness.all("SELECT title, status, closed_by FROM polls ORDER BY id")).toEqual([
      { title: "Current poll", status: "closed", closed_by: 1 },
      { title: "Next poll", status: "active", closed_by: null },
    ]);
    expect(harness.get("SELECT COUNT(*) AS count FROM restaurant_votes WHERE poll_id = 10")).toEqual({ count: 1 });
  });

  it("keeps the current poll active when insertion fails, then safely retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    harness.sqlite.exec(`CREATE TRIGGER reject_new_poll BEFORE INSERT ON polls
      BEGIN SELECT RAISE(ABORT, 'Simulated persistence failure'); END`);

    expect(await createPoll()).toEqual({ error: "Failed to create poll" });
    expect(harness.all("SELECT title, status, closed_by, closed_at FROM polls")).toEqual([
      { title: "Current poll", status: "active", closed_by: null, closed_at: null },
    ]);
    expect(harness.get("SELECT COUNT(*) AS count FROM restaurant_votes WHERE poll_id = 10")).toEqual({ count: 1 });

    harness.sqlite.exec("DROP TRIGGER reject_new_poll");
    expect(await createPoll()).toBeInstanceOf(Response);
    expect(harness.get("SELECT COUNT(*) AS count FROM polls WHERE status = 'active'")).toEqual({ count: 1 });
    expect(harness.get("SELECT COUNT(*) AS count FROM polls")).toEqual({ count: 2 });
  });

  it("rejects non-admin members before replacing the poll", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 0, status: "active" } as never);
    expect(await createPoll()).toEqual({ error: "Only admins can manage polls" });
    expect(harness.all("SELECT title, status FROM polls")).toEqual([{ title: "Current poll", status: "active" }]);
  });
});
