// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { upsertRsvp } from "./rsvps.server";

describe("shared RSVP persistence", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (123, 'Steakhouse', '2099-01-01');
    `);
  });
  afterEach(() => harness.sqlite.close());

  it.each([false, true])("creates an RSVP with calendar origin %s", async updatedViaCalendar => {
    expect(await upsertRsvp({ db: harness.db, eventId: 123, userId: 1, status: "yes", updatedViaCalendar })).toBe("created");
    expect(harness.get("SELECT status, admin_override, updated_via_calendar FROM rsvps")).toEqual({
      status: "yes", admin_override: 0, updated_via_calendar: Number(updatedViaCalendar),
    });
  });

  it("preserves comments and calendar origin while clearing an admin override", async () => {
    harness.sqlite.exec(`INSERT INTO rsvps (event_id, user_id, status, comments, admin_override, admin_override_by, admin_override_at, updated_via_calendar)
      VALUES (123, 1, 'yes', 'Keep my comment', 1, 1, '2026-09-01', 1)`);
    expect(await upsertRsvp({ db: harness.db, eventId: 123, userId: 1, status: "no" })).toBe("updated");
    expect(harness.get("SELECT status, comments, admin_override, admin_override_by, admin_override_at, updated_via_calendar FROM rsvps")).toEqual({
      status: "no", comments: "Keep my comment", admin_override: 0, admin_override_by: null, admin_override_at: null, updated_via_calendar: 1,
    });
  });

  it.each(["New comment", null])("updates an explicitly supplied comment (%s)", async comments => {
    harness.sqlite.exec("INSERT INTO rsvps (event_id, user_id, status, comments) VALUES (123, 1, 'yes', 'Old comment')");
    expect(await upsertRsvp({ db: harness.db, eventId: 123, userId: 1, status: "maybe", comments, updatedViaCalendar: true })).toBe("updated");
    expect(harness.get("SELECT status, comments, updated_via_calendar FROM rsvps")).toEqual({ status: "maybe", comments, updated_via_calendar: 1 });
  });
});
