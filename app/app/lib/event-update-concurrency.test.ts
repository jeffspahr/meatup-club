// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { runUpdateEventAction, type EventActionContext } from "./event-actions.server";
import { requireAdmin } from "./auth.server";
import { createLoadContext } from "./router-context";
import { action as adminAction } from "../routes/dashboard.admin.events";

vi.mock("./auth.server", () => ({ requireAdmin: vi.fn() }));

describe.each(["member", "admin"])("%s event update concurrency", route => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status, is_admin) VALUES (1, 'creator@example.com', 'active', 1);
      INSERT INTO events (id, restaurant_name, event_date, status, created_by, calendar_sequence)
      VALUES (42, 'Original restaurant', '2099-05-01', 'upcoming', 1, 2);
    `);
    vi.mocked(requireAdmin).mockResolvedValue({ id: 1, is_admin: 1, status: "active" } as never);
  });
  afterEach(() => { harness.sqlite.close(); vi.restoreAllMocks(); });

  async function update(sendUpdates = true, status = "upcoming", actionType = "update") {
    const formData = new FormData();
    for (const [key, value] of Object.entries({ _action: actionType, recipient_mode: "all", id: "42", restaurant_name: "My edit", event_date: "2099-05-01", event_time: "18:00", status, send_updates: String(sendUpdates) })) {
      formData.set(key, value);
    }
    const request = new Request("https://meatup.club/dashboard", { method: "POST", body: formData });
    if (route === "admin") {
      return adminAction({ request, context: createLoadContext({ env: { DB: harness.db } } as never), params: {} } as never);
    }
    return runUpdateEventAction({ db: harness.db, user: { id: 1, is_admin: 0 }, formData, request, route: "/dashboard" } as unknown as EventActionContext);
  }

  it.each([true, false])("rejects a stale edit without overwriting another edit (notifications %s)", async sendUpdates => {
    const batch = harness.db.batch.bind(harness.db);
    vi.spyOn(harness.db, "batch").mockImplementationOnce(statements => {
      harness.sqlite.exec("UPDATE events SET restaurant_name = 'Concurrent edit', calendar_sequence = 3 WHERE id = 42");
      return batch(statements);
    });
    expect(await update(sendUpdates)).toEqual({ error: "This event changed while you were saving. Please reload and try again." });
    expect(harness.get("SELECT restaurant_name, calendar_sequence FROM events WHERE id = 42")).toEqual({ restaurant_name: "Concurrent edit", calendar_sequence: 3 });
    expect(harness.get("SELECT COUNT(*) AS count FROM event_email_deliveries")).toEqual({ count: 0 });
    const retry = await update(sendUpdates);
    expect(route === "admin" ? retry instanceof Response : retry).toEqual(route === "admin" ? true : { ok: true, performedAction: "update" });
    expect(harness.get("SELECT restaurant_name, calendar_sequence FROM events WHERE id = 42")).toEqual({ restaurant_name: "My edit", calendar_sequence: 4 });
    if (sendUpdates) expect(harness.get("SELECT calendar_sequence FROM event_email_deliveries")).toEqual({ calendar_sequence: 4 });
  });

  it("does not stage a cancellation when its event update loses a race", async () => {
    harness.sqlite.exec("UPDATE events SET status = 'cancelled' WHERE id = 42");
    const batch = harness.db.batch.bind(harness.db);
    vi.spyOn(harness.db, "batch").mockImplementationOnce(statements => {
      harness.sqlite.exec("UPDATE events SET status = 'upcoming', calendar_sequence = 3 WHERE id = 42");
      return batch(statements);
    });
    expect(await update(true, "cancelled")).toEqual({ error: "This event changed while you were saving. Please reload and try again." });
    expect(harness.get("SELECT status, calendar_sequence FROM events WHERE id = 42")).toEqual({ status: "upcoming", calendar_sequence: 3 });
    expect(harness.get("SELECT COUNT(*) AS count FROM event_email_deliveries")).toEqual({ count: 0 });
  });
  if (route === "admin") {
    it("rejects deletion when the cancellation snapshot is stale", async () => {
      const batch = harness.db.batch.bind(harness.db);
      vi.spyOn(harness.db, "batch").mockImplementationOnce(statements => {
        harness.sqlite.exec("UPDATE events SET restaurant_name = 'Concurrent edit', calendar_sequence = 5 WHERE id = 42");
        return batch(statements);
      });
      expect(await update(true, "upcoming", "delete")).toEqual({ error: "This event changed while you were saving. Please reload and try again." });
      expect(harness.get("SELECT restaurant_name, calendar_sequence FROM events WHERE id = 42")).toEqual({ restaurant_name: "Concurrent edit", calendar_sequence: 5 });
      expect(harness.get("SELECT COUNT(*) AS count FROM event_email_deliveries")).toEqual({ count: 0 });
      expect(await update(true, "upcoming", "delete")).toBeInstanceOf(Response);
      expect(harness.get("SELECT id FROM events WHERE id = 42")).toBeNull();
      expect(harness.get("SELECT event_id, delivery_type, calendar_sequence FROM event_email_deliveries")).toEqual({ event_id: null, delivery_type: "cancel", calendar_sequence: 6 });
    });

    it.each(["upcoming", "cancelled"])("rejects a resend after a concurrent change to %s", async status => {
      const batch = harness.db.batch.bind(harness.db);
      vi.spyOn(harness.db, "batch").mockImplementationOnce(statements => {
        harness.sqlite.prepare("UPDATE events SET restaurant_name = 'Concurrent edit', status = ?, calendar_sequence = 5 WHERE id = 42").run(status);
        return batch(statements);
      });
      expect(await update(true, "upcoming", "resend_calendar_request")).toEqual({ error: "This event changed while you were saving. Please reload and try again." });
      expect(harness.get("SELECT restaurant_name, status, calendar_sequence FROM events WHERE id = 42")).toEqual({ restaurant_name: "Concurrent edit", status, calendar_sequence: 5 });
      expect(harness.get("SELECT COUNT(*) AS count FROM event_email_deliveries")).toEqual({ count: 0 });
    });
  }

});
