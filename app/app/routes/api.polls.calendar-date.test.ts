// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./api.polls";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));

describe("poll API calendar date validation", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status, is_admin) VALUES (1, 'admin@example.com', 'active', 1);
      INSERT INTO polls (id, title, status, created_by) VALUES (10, 'Current poll', 'active', 1);
      INSERT INTO restaurants (id, name, created_by) VALUES (20, 'Steakhouse', 1);
    `);
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 1, status: "active" } as never);
  });

  afterEach(() => harness.sqlite.close());

  async function closeWithDate(date: string) {
    harness.insert("INSERT INTO date_suggestions (id, suggested_date, poll_id, user_id) VALUES (30, ?, 10, 1)", date);
    return action({
      request: new Request("https://meatup.club/api/polls", {
        method: "POST",
        body: new URLSearchParams({ _action: "close", poll_id: "10", winning_restaurant_id: "20", winning_date_id: "30", create_event: "true" }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it.each(["2099-02-29", "2099-13-01", "invalid"])("rejects legacy invalid date %s without closing the poll", async (date) => {
    const response = await closeWithDate(date);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Selected date is not a valid calendar date" });
    expect(harness.get("SELECT status FROM polls WHERE id = 10")).toEqual({ status: "active" });
    expect(harness.get("SELECT COUNT(*) AS count FROM events")).toEqual({ count: 0 });
  });

  it("allows a valid leap day and persists the matching event", async () => {
    const response = await closeWithDate("2096-02-29");
    expect(response.status).toBe(200);
    const result = await response.json() as { eventId: number };
    expect(harness.get("SELECT event_date FROM events WHERE id = ?", result.eventId)).toEqual({ event_date: "2096-02-29" });
    expect(harness.get("SELECT status FROM polls WHERE id = 10")).toEqual({ status: "closed" });
  });
});
