// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { runUpdateEventAction, type EventActionContext } from "./event-actions.server";

describe("member edits to cancelled events", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'creator@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date, event_time, status, created_by, calendar_sequence)
      VALUES (42, 'Original restaurant', '2099-05-01', '18:00', 'cancelled', 1, 2);
    `);
  });
  afterEach(() => { harness.sqlite.close(); vi.restoreAllMocks(); });

  async function update(sendUpdates = true) {
    const formData = new FormData();
    for (const [key, value] of Object.entries({ id: "42", restaurant_name: "Updated restaurant", event_date: "2099-05-01", event_time: "18:00", send_updates: String(sendUpdates) })) {
      formData.set(key, value);
    }
    return runUpdateEventAction({
      db: harness.db, user: { id: 1, is_admin: 0 }, formData,
      request: new Request("https://meatup.club/dashboard", { method: "POST", body: formData }), route: "/dashboard",
    } as unknown as EventActionContext);
  }

  it.each(["cancelled", "upcoming"])("stages the correct calendar message for a %s event", async status => {
    harness.sqlite.prepare("UPDATE events SET status = ? WHERE id = 42").run(status);
    expect(await update()).toEqual({ ok: true, performedAction: "update" });
    expect(harness.get("SELECT status, calendar_sequence FROM events WHERE id = 42")).toEqual({ status, calendar_sequence: 3 });
    expect(harness.get("SELECT event_id, delivery_type, calendar_sequence FROM event_email_deliveries")).toEqual({
      event_id: 42, delivery_type: status === "cancelled" ? "cancel" : "update", calendar_sequence: 3,
    });
  });

  it("does not stage messages when notifications are disabled", async () => {
    expect(await update(false)).toEqual({ ok: true, performedAction: "update" });
    expect(harness.get("SELECT COUNT(*) AS count FROM event_email_deliveries")).toEqual({ count: 0 });
  });

  it("rolls back the edit when cancellation staging fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    harness.sqlite.exec("CREATE TRIGGER fail_cancellation BEFORE INSERT ON event_email_deliveries BEGIN SELECT RAISE(ABORT, 'Staging failure'); END");
    expect(await update()).toEqual({ error: "Failed to update event" });
    expect(harness.get("SELECT restaurant_name, status, calendar_sequence FROM events WHERE id = 42")).toEqual({ restaurant_name: "Original restaurant", status: "cancelled", calendar_sequence: 2 });
  });
});
