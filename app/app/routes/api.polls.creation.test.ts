// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./api.polls";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));

describe("API poll replacement", () => {
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

  function createPoll(title = "Next poll") {
    return action({
      request: new Request("https://meatup.club/api/polls", {
        method: "POST",
        body: new URLSearchParams({ _action: "create", title }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it("returns the inserted poll while closing its predecessor and preserving votes", async () => {
    const response = await createPoll();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      poll: { id: 11, title: "Next poll", status: "active", created_by: 1 },
    });
    expect(harness.all("SELECT title, status, closed_by FROM polls ORDER BY id")).toEqual([
      { title: "Current poll", status: "closed", closed_by: 1 },
      { title: "Next poll", status: "active", closed_by: null },
    ]);
    expect(harness.get("SELECT COUNT(*) AS count FROM restaurant_votes WHERE poll_id = 10")).toEqual({ count: 1 });
  });

  it("rolls back closure on insert failure and returns the correct replacement after retry", async () => {
    harness.sqlite.exec(`CREATE TRIGGER reject_new_poll BEFORE INSERT ON polls
      BEGIN SELECT RAISE(ABORT, 'Simulated persistence failure'); END`);

    const response = await createPoll().catch(() => null);
    expect(harness.all("SELECT title, status, closed_by, closed_at FROM polls")).toEqual([
      { title: "Current poll", status: "active", closed_by: null, closed_at: null },
    ]);
    expect(response?.status).toBe(500);
    expect(await response?.json()).toEqual({ error: "Failed to create poll" });
    expect(harness.get("SELECT COUNT(*) AS count FROM restaurant_votes WHERE poll_id = 10")).toEqual({ count: 1 });

    harness.sqlite.exec("DROP TRIGGER reject_new_poll");
    const retry = await createPoll();
    expect(await retry.json()).toMatchObject({ poll: { id: 11, title: "Next poll", status: "active" } });
    expect(harness.get("SELECT COUNT(*) AS count FROM polls WHERE status = 'active'")).toEqual({ count: 1 });
    expect(harness.get("SELECT COUNT(*) AS count FROM polls")).toEqual({ count: 2 });
  });

  it("rejects non-admin creation without changing the current poll", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 0, status: "active" } as never);
    const response = await createPoll();
    expect(response.status).toBe(403);
    expect(harness.all("SELECT title, status FROM polls")).toEqual([{ title: "Current poll", status: "active" }]);
  });

  it("rejects a missing title without closing the current poll", async () => {
    const response = await createPoll("");
    expect(response.status).toBe(400);
    expect(harness.all("SELECT title, status FROM polls")).toEqual([{ title: "Current poll", status: "active" }]);
  });
});
