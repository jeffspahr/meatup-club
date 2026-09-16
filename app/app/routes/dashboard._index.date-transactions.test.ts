// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { requireActiveUser } from "../lib/auth.server";
import { createLoadContext } from "../lib/router-context";
import { action } from "./dashboard._index";

vi.mock("../lib/auth.server", () => ({ requireActiveUser: vi.fn() }));

describe("dashboard date mutations against the canonical schema", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES
        (1, 'owner@example.com', 'active'), (2, 'voter@example.com', 'active');
      INSERT INTO polls (id, title, status, created_by) VALUES (1, 'Next meetup', 'active', 1);
    `);
    vi.mocked(requireActiveUser).mockResolvedValue({ id: 1, is_admin: 0, status: "active" } as never);
  });

  afterEach(() => {
    harness.sqlite.close();
    vi.clearAllMocks();
  });

  function submit(fields: Record<string, string>) {
    return action({
      request: new Request("https://meatup.club/dashboard", { method: "POST", body: new URLSearchParams(fields) }),
      context: createLoadContext({ env: { DB: harness.db } } as never),
      params: {},
    } as never);
  }

  it("rolls back a nomination if its automatic vote fails and permits retry", async () => {
    harness.sqlite.exec(`CREATE TRIGGER reject_date_vote BEFORE INSERT ON date_votes
      BEGIN SELECT RAISE(ABORT, 'Temporary vote failure'); END;`);
    const fields = { _action: "suggest_date", suggested_date: "2099-04-20" };
    await expect(submit(fields)).rejects.toThrow("Temporary vote failure");
    expect(harness.all("SELECT * FROM date_suggestions")).toEqual([]);
    expect(harness.all("SELECT * FROM date_votes")).toEqual([]);
    expect(harness.all("SELECT * FROM activity_log")).toEqual([]);

    harness.sqlite.exec("DROP TRIGGER reject_date_vote");
    expect(await submit(fields)).toEqual({ ok: true });
    const suggestion = harness.get<{ id: number }>("SELECT id FROM date_suggestions")!;
    expect(harness.all("SELECT poll_id, date_suggestion_id, user_id FROM date_votes"))
      .toEqual([{ poll_id: 1, date_suggestion_id: suggestion.id, user_id: 1 }]);
    expect(harness.all("SELECT action_type FROM activity_log")).toEqual([{ action_type: "suggest_date" }]);
  });

  it("links the automatic vote to the newly nominated date when ID sequences differ", async () => {
    harness.sqlite.exec(`
      INSERT INTO date_suggestions (id, user_id, poll_id, suggested_date) VALUES (10, 2, 1, '2099-04-19');
      INSERT INTO date_votes (id, poll_id, date_suggestion_id, user_id) VALUES (100, 1, 10, 2);
    `);
    expect(await submit({ _action: "suggest_date", suggested_date: "2099-04-20" })).toEqual({ ok: true });
    expect(harness.get("SELECT id, date_suggestion_id, user_id FROM date_votes WHERE id = 101"))
      .toEqual({ id: 101, date_suggestion_id: 11, user_id: 1 });
  });

  it("retains every vote if deleting the nominated date fails, and cascades on retry", async () => {
    harness.sqlite.exec(`
      INSERT INTO date_suggestions (id, user_id, poll_id, suggested_date) VALUES (10, 1, 1, '2099-04-20');
      INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (1, 10, 1), (1, 10, 2);
      CREATE TRIGGER reject_date_delete BEFORE DELETE ON date_suggestions
      BEGIN SELECT RAISE(ABORT, 'Temporary date deletion failure'); END;
    `);
    const votes = harness.all("SELECT * FROM date_votes ORDER BY id");
    const fields = { _action: "delete_date", suggestion_id: "10" };
    await expect(submit(fields)).rejects.toThrow("Temporary date deletion failure");
    expect(harness.get("SELECT id FROM date_suggestions")).toEqual({ id: 10 });
    expect(harness.all("SELECT * FROM date_votes ORDER BY id")).toEqual(votes);
    expect(harness.all("SELECT * FROM activity_log")).toEqual([]);

    harness.sqlite.exec("DROP TRIGGER reject_date_delete");
    expect(await submit(fields)).toEqual({ ok: true });
    expect(harness.all("SELECT * FROM date_suggestions")).toEqual([]);
    expect(harness.all("SELECT * FROM date_votes")).toEqual([]);
    expect(harness.all("SELECT action_type FROM activity_log")).toEqual([{ action_type: "delete_date" }]);
  });

  it("preserves another member's date and votes when deletion is unauthorized", async () => {
    harness.sqlite.exec(`
      INSERT INTO date_suggestions (id, user_id, poll_id, suggested_date) VALUES (10, 2, 1, '2099-04-20');
      INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (1, 10, 2);
    `);
    expect(await submit({ _action: "delete_date", suggestion_id: "10" })).toEqual({ error: "Permission denied" });
    expect(harness.get("SELECT id FROM date_suggestions")).toEqual({ id: 10 });
    expect(harness.all("SELECT user_id FROM date_votes")).toEqual([{ user_id: 2 }]);
  });
});
