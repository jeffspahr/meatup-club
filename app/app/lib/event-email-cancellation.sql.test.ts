// @vitest-environment node

import type { D1Database } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { buildStageEventCancellationDeliveriesForActiveMembersStatement, deliverEventEmailById } from "./event-email-delivery.server";
import { buildDeleteEventStatement } from "./events.server";

describe("calendar cancellation after event deletion", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  let db: D1Database;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    db = harness.db as unknown as D1Database;
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (42, 'Steakhouse', '2099-01-01');
    `);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "cancel-email-42" })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    harness.sqlite.close();
  });

  it("retains the original event UID after ON DELETE SET NULL clears the foreign key", async () => {
    await db.batch([
      buildStageEventCancellationDeliveriesForActiveMembersStatement(db, {
        batchId: "deleted-event",
        details: { eventId: 42, restaurantName: "Steakhouse", restaurantAddress: null,
          eventDate: "2099-01-01", eventTime: "18:00", sequence: 3 },
      }),
      buildDeleteEventStatement(db, 42),
    ]);
    expect(harness.get("SELECT event_id FROM event_email_deliveries")).toEqual({ event_id: null });
    expect(await deliverEventEmailById({ db, resendApiKey: "synthetic-key", deliveryId: 1 })).toEqual({ outcome: "sent" });
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const calendar = Buffer.from(payload.attachments[0].content, "base64").toString("utf8");
    expect(calendar).toContain("UID:event-42@meatup.club");
    expect(calendar).toContain("METHOD:CANCEL");
    expect(calendar).toContain("SEQUENCE:3");
    expect(calendar).not.toContain("UID:event-0@");
  });

  it.each(["cancel:0:1:1", "cancel:invalid:1:1"])("does not send a malformed calendar for an invalid stored key %s", async (dedupeKey) => {
    harness.insert(`INSERT INTO event_email_deliveries (
      batch_id, delivery_type, recipient_email, restaurant_name, event_date, event_time, dedupe_key
    ) VALUES ('broken', 'cancel', 'member@example.com', 'Steakhouse', '2099-01-01', '18:00', ?)`, dedupeKey);
    expect(await deliverEventEmailById({ db, resendApiKey: "synthetic-key", deliveryId: 1 }))
      .toEqual({ outcome: "failed" });
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.get("SELECT status FROM event_email_deliveries")).toEqual({ status: "failed" });
  });
});
