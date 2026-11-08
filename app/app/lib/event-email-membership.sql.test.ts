// @vitest-environment node
import type { D1Database, MessageBatch } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { deliverEventEmailById, processEventEmailQueueBatch, type EventEmailQueueMessage } from "./event-email-delivery.server";

describe("queued event email membership", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  let db: D1Database;

  beforeEach(() => {
    harness = createSqliteD1Harness();
    db = harness.db as unknown as D1Database;
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (42, 'Steakhouse', '2099-01-01');
      INSERT INTO event_email_deliveries
        (id, event_id, user_id, batch_id, delivery_type, recipient_email, restaurant_name,
         event_date, event_time, dedupe_key)
      VALUES (1, 42, 1, 'membership', 'invite', 'member@example.com', 'Steakhouse',
        '2099-01-01', '18:00', 'invite:42:1:0');
    `);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "membership-email" })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    harness.sqlite.close();
  });

  it.each(["inactive", "pending", "invited"])("acks queued messages for %s recipients without sending or retrying", async (status) => {
    harness.sqlite.prepare("UPDATE users SET status = ? WHERE id = 1").run(status);
    const ack = vi.fn();
    const retry = vi.fn();
    const batch = { messages: [{ body: { deliveryId: 1 }, attempts: 1, ack, retry }] } as unknown as MessageBatch<EventEmailQueueMessage>;
    await processEventEmailQueueBatch({ db, batch, resendApiKey: "synthetic-key" });
    await processEventEmailQueueBatch({ db, batch, resendApiKey: "synthetic-key" });
    expect(ack).toHaveBeenCalledTimes(2);
    expect(retry).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.get("SELECT status, attempt_count FROM event_email_deliveries WHERE id = 1"))
      .toEqual({ status: "failed", attempt_count: 0 });
  });

  it("sends queued mail for active recipients", async () => {
    expect(await deliverEventEmailById({ db, deliveryId: 1, resendApiKey: "synthetic-key" }))
      .toEqual({ outcome: "sent" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("preserves sending for detached historical recipients", async () => {
    harness.sqlite.exec("DELETE FROM users WHERE id = 1");
    expect(await deliverEventEmailById({ db, deliveryId: 1, resendApiKey: "synthetic-key" }))
      .toEqual({ outcome: "sent" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("preserves completed delivery history after deactivation", async () => {
    harness.sqlite.exec("UPDATE users SET status = 'inactive'; UPDATE event_email_deliveries SET status = 'delivered', provider_message_id = 'already-sent'");
    expect(await deliverEventEmailById({ db, deliveryId: 1, resendApiKey: "synthetic-key" }))
      .toEqual({ outcome: "skip" });
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.get("SELECT status FROM event_email_deliveries WHERE id = 1"))
      .toEqual({ status: "delivered" });
  });
});
