// @vitest-environment node

import type { D1Database } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { persistCalendarRsvp } from "./calendar-rsvp.server";

describe("atomic calendar RSVP persistence", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  let db: D1Database;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    db = harness.db as unknown as D1Database;
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date)
      VALUES (123, 'Steakhouse', '2099-01-01');
    `);
  });

  afterEach(() => harness.sqlite.close());

  it("creates the RSVP and records the delivery in the same batch", async () => {
    expect(await persistCalendarRsvp({ db, deliveryId: "reply-1", eventId: 123, userId: 1, status: "yes" })).toBe(true);
    expect(harness.get("SELECT status, updated_via_calendar, admin_override FROM rsvps")).toEqual({
      status: "yes", updated_via_calendar: 1, admin_override: 0,
    });
    expect(harness.all("SELECT provider, delivery_id FROM webhook_deliveries")).toEqual([
      { provider: "resend", delivery_id: "reply-1" },
    ]);
  });

  it("updates an existing RSVP, clears the override, and preserves comments", async () => {
    harness.sqlite.exec(`
      INSERT INTO rsvps (event_id, user_id, status, comments, admin_override, admin_override_by, admin_override_at)
      VALUES (123, 1, 'no', 'Keep this comment', 1, 1, '2026-09-01');
    `);
    expect(await persistCalendarRsvp({ db, deliveryId: "reply-1", eventId: 123, userId: 1, status: "maybe" })).toBe(true);
    expect(harness.get("SELECT status, comments, admin_override, admin_override_by, admin_override_at, updated_via_calendar FROM rsvps")).toEqual({
      status: "maybe", comments: "Keep this comment", admin_override: 0,
      admin_override_by: null, admin_override_at: null, updated_via_calendar: 1,
    });
  });

  it("rolls back the delivery when RSVP persistence fails and permits the same delivery to retry", async () => {
    harness.sqlite.exec(`
      CREATE TRIGGER fail_calendar_rsvp BEFORE INSERT ON rsvps
      BEGIN SELECT RAISE(ABORT, 'Temporary RSVP write failure'); END;
    `);
    const params = { db, deliveryId: "reply-1", eventId: 123, userId: 1, status: "yes" as const };
    await expect(persistCalendarRsvp(params)).rejects.toThrow("Temporary RSVP write failure");
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
    expect(harness.all("SELECT * FROM rsvps")).toEqual([]);

    harness.sqlite.exec("DROP TRIGGER fail_calendar_rsvp");
    expect(await persistCalendarRsvp(params)).toBe(true);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "yes" });
    expect(harness.all("SELECT delivery_id FROM webhook_deliveries")).toEqual([{ delivery_id: "reply-1" }]);
  });

  it("ignores a repeated delivery without overwriting a later calendar response", async () => {
    const params = { db, eventId: 123, userId: 1 };
    expect(await persistCalendarRsvp({ ...params, deliveryId: "reply-1", status: "yes" })).toBe(true);
    expect(await persistCalendarRsvp({ ...params, deliveryId: "reply-2", status: "no" })).toBe(true);
    expect(await persistCalendarRsvp({ ...params, deliveryId: "reply-1", status: "yes" })).toBe(false);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "no" });
    expect(harness.all("SELECT delivery_id FROM webhook_deliveries ORDER BY id")).toEqual([
      { delivery_id: "reply-1" }, { delivery_id: "reply-2" },
    ]);
  });
});
