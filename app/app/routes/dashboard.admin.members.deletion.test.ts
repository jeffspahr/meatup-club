// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness, type SqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "../lib/router-context";
import { requireAdmin } from "../lib/auth.server";
import { commitSession, getSession } from "../lib/session.server";
import { ensureUser } from "../lib/db.server";
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

  function removeMember(userId = String(memberId)) {
    return action({
      request: new Request("https://meatup.club/dashboard/admin/members", {
        method: "POST",
        body: new URLSearchParams({ _action: "delete", user_id: userId }),
      }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it("deactivates a member with linked history while preserving all records", async () => {
    harness.insert("INSERT INTO activity_log (user_id, action_type) VALUES (?, 'login')", memberId);
    harness.insert("INSERT INTO comments (user_id, commentable_type, commentable_id, content) VALUES (?, 'poll', 1, 'Keep this')", memberId);
    harness.insert("INSERT INTO events (restaurant_name, created_by) VALUES ('Dinner', ?)", memberId);
    harness.sqlite.prepare("UPDATE polls SET created_by = ?").run(memberId);
    harness.sqlite.prepare("UPDATE restaurants SET created_by = ?").run(memberId);
    harness.sqlite.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(memberId);
    harness.insert("INSERT INTO rsvps (event_id, user_id) VALUES (1, ?)", memberId);
    const tables = ['activity_log', 'comments', 'events', 'polls', 'restaurants', 'rsvps', 'restaurant_votes', 'date_votes', 'date_suggestions'];
    const before = tables.map(table => harness.all(`SELECT * FROM ${table}`));
    const response = await removeMember();
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/members");
    expect(harness.get("SELECT status, is_admin, session_version FROM users WHERE id = ?", memberId))
      .toEqual({ status: 'inactive', is_admin: 0, session_version: 1 });
    expect(tables.map(table => harness.all(`SELECT * FROM ${table}`))).toEqual(before);
    expect(harness.all("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("revokes existing cookies and keeps fresh OAuth logins inactive", async () => {
    const auth = await vi.importActual<typeof import('../lib/auth.server')>('../lib/auth.server');
    const session = await getSession();
    session.set('userId', memberId);
    session.set('email', 'member@example.com');
    session.set('sessionVersion', 0);
    const request = new Request('https://meatup.club/dashboard', {
      headers: { Cookie: (await commitSession(session)).split(';')[0] },
    });
    const context = createLoadContext({ env: { DB: harness.db } } as never);
    expect(await auth.getUser(request, context)).toMatchObject({ id: memberId });
    await removeMember();
    expect(await auth.getUser(request, context)).toBeNull();
    await ensureUser(harness.db, 'member@example.com', 'Member');
    session.set('sessionVersion', 1);
    const freshRequest = new Request('https://meatup.club/dashboard', {
      headers: { Cookie: (await commitSession(session)).split(';')[0] },
    });
    await expect(auth.requireActiveUser(freshRequest, context)).rejects.toMatchObject({ status: 302 });
    expect(await auth.getUser(freshRequest, context)).toMatchObject({ status: 'inactive' });
  });

  it("preserves membership and participation on persistence failure", async () => {
    harness.sqlite.exec("CREATE TRIGGER fail_deactivation BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'Simulated failure'); END");
    const before = harness.all("SELECT * FROM users");
    expect(await removeMember()).toMatchObject({ error: expect.any(String) });
    expect(harness.all("SELECT * FROM users")).toEqual(before);
    expect(harness.get("SELECT id FROM date_suggestions WHERE id = ?", suggestionId)).toEqual({ id: suggestionId });
    expect(harness.all("SELECT * FROM date_votes")).toHaveLength(2);
  });

  it.each(['', 'abc', '-1', '1.2', '9007199254740992'])("rejects invalid member ID %s", async id => {
    expect(await removeMember(id)).toEqual({ error: 'A valid user ID is required' });
    expect(harness.get("SELECT status FROM users WHERE id = ?", memberId)).toEqual({ status: 'active' });
  });

  it("prevents self-deactivation", async () => {
    expect(await removeMember('1')).toEqual({ error: 'You cannot deactivate your own account' });
    expect(harness.get("SELECT status, is_admin FROM users WHERE id = 1")).toEqual({ status: 'active', is_admin: 1 });
  });

  it("reports a missing or already inactive account", async () => {
    expect(await removeMember('999')).toMatchObject({ error: expect.any(String) });
    await removeMember();
    expect(await removeMember()).toMatchObject({ error: expect.any(String) });
    expect(harness.get("SELECT session_version FROM users WHERE id = ?", memberId)).toEqual({ session_version: 1 });
  });

  it("does not mutate membership when admin authorization fails", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Response(null, { status: 403 }));
    await expect(removeMember()).rejects.toMatchObject({ status: 403 });
    expect(harness.get("SELECT status FROM users WHERE id = ?", memberId)).toEqual({ status: 'active' });
  });
});
