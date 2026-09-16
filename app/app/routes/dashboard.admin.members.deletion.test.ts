// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness, type SqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "../lib/router-context";
import { requireAdmin } from "../lib/auth.server";
import { action } from "./dashboard.admin.members";

vi.mock("../lib/auth.server", () => ({ requireAdmin: vi.fn() }));

describe("member removal transaction", () => {
  let harness: SqliteD1Harness;
  let memberId: number;
  let suggestionId: number;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    const adminId = harness.insert("INSERT INTO users (email, is_admin) VALUES ('admin@example.com', 1)");
    memberId = harness.insert("INSERT INTO users (email) VALUES ('member@example.com')");
    const otherId = harness.insert("INSERT INTO users (email) VALUES ('other@example.com')");
    const restaurantId = harness.insert("INSERT INTO restaurants (name, created_by) VALUES ('Steakhouse', ?)", adminId);
    const pollId = harness.insert("INSERT INTO polls (title, created_by) VALUES ('Dinner', ?)", adminId);
    suggestionId = harness.insert("INSERT INTO date_suggestions (user_id, poll_id, suggested_date) VALUES (?, ?, '2099-01-01')", memberId, pollId);
    harness.insert("INSERT INTO restaurant_votes (poll_id, restaurant_id, user_id) VALUES (?, ?, ?)", pollId, restaurantId, memberId);
    harness.insert("INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)", pollId, suggestionId, memberId);
    harness.insert("INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)", pollId, suggestionId, otherId);
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId, is_admin: 1, status: "active" } as never);
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.clearAllMocks();
  });

  function removeMember() {
    return action({
      request: new Request("https://meatup.club/dashboard/admin/members", {
        method: "POST",
        body: new URLSearchParams({ _action: "delete", user_id: String(memberId) }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it("removes a deletable member and their participation together", async () => {
    const response = await removeMember();
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/members");
    expect(harness.get("SELECT id FROM users WHERE id = ?", memberId)).toBeNull();
    expect(harness.all("SELECT * FROM restaurant_votes WHERE user_id = ?", memberId)).toEqual([]);
    expect(harness.get("SELECT id FROM date_suggestions WHERE id = ?", suggestionId)).toBeNull();
    expect(harness.all("SELECT * FROM date_votes WHERE date_suggestion_id = ?", suggestionId)).toEqual([]);
    expect(harness.all("SELECT name FROM restaurants")).toEqual([{ name: "Steakhouse" }]);
  });

  it("preserves votes, suggestions and other members' votes when history prevents removal", async () => {
    harness.insert("INSERT INTO activity_log (user_id, action_type) VALUES (?, 'login')", memberId);
    const before = {
      restaurants: harness.all("SELECT * FROM restaurant_votes"),
      dates: harness.all("SELECT * FROM date_votes"),
      suggestions: harness.all("SELECT * FROM date_suggestions"),
    };
    const response = await removeMember();
    expect(response).toMatchObject({ error: expect.any(String) });
    expect(harness.get("SELECT id FROM users WHERE id = ?", memberId)).toEqual({ id: memberId });
    expect(harness.all("SELECT * FROM restaurant_votes")).toEqual(before.restaurants);
    expect(harness.all("SELECT * FROM date_votes")).toEqual(before.dates);
    expect(harness.all("SELECT * FROM date_suggestions")).toEqual(before.suggestions);
    expect(harness.all("SELECT action_type FROM activity_log")).toEqual([{ action_type: "login" }]);
  });
});
