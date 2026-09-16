// @vitest-environment node

import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { buildCreateEventStatement } from "./events.server";
import { buildStageEventInviteDeliveriesForLastInsertedEventStatement } from "./event-email-delivery.server";

describe("event invite staging SQL", () => {
  it("keeps every invite linked to the created event as delivery row IDs advance", async () => {
    const harness = createSqliteD1Harness();

    try {
      harness.sqlite.exec(`
        INSERT INTO users (id, email, status) VALUES
          (1, 'alpha@example.com', 'active'),
          (2, 'bravo@example.com', 'active'),
          (3, 'charlie@example.com', 'active'),
          (4, 'inactive@example.com', 'inactive');
        INSERT INTO events (id, restaurant_name, event_date)
          VALUES (7, 'Previous Steakhouse', '2099-01-01');
        INSERT INTO event_email_deliveries (
          id, event_id, user_id, batch_id, delivery_type, recipient_email,
          restaurant_name, event_date, event_time, dedupe_key
        ) VALUES (
          100, 7, 1, 'previous-batch', 'invite', 'alpha@example.com',
          'Previous Steakhouse', '2099-01-01', '18:00', 'invite:7:0:1'
        );
      `);

      const details = {
        restaurantName: "New Steakhouse",
        restaurantAddress: "123 Main St",
        eventDate: "2099-04-20",
        eventTime: "18:30",
      };
      const db = harness.db as unknown as D1Database;

      await harness.db.batch([
        buildCreateEventStatement(db, { ...details, status: "upcoming" }, 1),
        buildStageEventInviteDeliveriesForLastInsertedEventStatement(db, {
          batchId: "new-batch",
          details,
        }),
      ]);

      expect(harness.all(`
        SELECT id, event_id, user_id, dedupe_key
        FROM event_email_deliveries
        WHERE batch_id = 'new-batch'
        ORDER BY user_id
      `)).toEqual([
        { id: 101, event_id: 8, user_id: 1, dedupe_key: "invite:8:0:1" },
        { id: 102, event_id: 8, user_id: 2, dedupe_key: "invite:8:0:2" },
        { id: 103, event_id: 8, user_id: 3, dedupe_key: "invite:8:0:3" },
      ]);
    } finally {
      harness.sqlite.close();
    }
  });
});
