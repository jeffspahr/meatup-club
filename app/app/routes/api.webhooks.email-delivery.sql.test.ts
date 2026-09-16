// @vitest-environment node

import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "../lib/router-context";
import { action } from "./api.webhooks.email-delivery";

describe("delivery status webhook persistence", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  const secret = ["whsec", Buffer.from("synthetic-delivery-key").toString("base64")].join("_");

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (1, 'Steakhouse', '2099-01-01');
      INSERT INTO event_email_deliveries (
        event_id, user_id, batch_id, delivery_type, recipient_email,
        restaurant_name, event_date, event_time, dedupe_key, status, provider_message_id
      ) VALUES (1, 1, 'batch-1', 'invite', 'member@example.com',
        'Steakhouse', '2099-01-01', '18:00', 'invite:1:0:1', 'provider_accepted', 'email-1');
    `);
  });
  afterEach(() => harness.sqlite.close());

  function receive(type: string, id = type) {
    const body = JSON.stringify({ type, data: { email_id: "email-1" } });
    const timestamp = new Date();
    return action({
      request: new Request("https://meatup.club/api/webhooks/email-delivery", {
        method: "POST", body,
        headers: {
          "svix-id": id,
          "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
          "svix-signature": new Webhook(secret).sign(id, timestamp, body),
        },
      }),
      context: createLoadContext({ env: { DB: harness.db, RESEND_DELIVERY_WEBHOOK_SECRET: secret } } as never),
    });
  }

  it("rolls back the webhook receipt after a status write failure and accepts the retry", async () => {
    harness.sqlite.exec(`CREATE TRIGGER fail_delivery BEFORE UPDATE ON event_email_deliveries
      BEGIN SELECT RAISE(ABORT, 'Temporary delivery update failure'); END;`);
    expect((await receive("email.delivered")).status).toBe(500);
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
    harness.sqlite.exec("DROP TRIGGER fail_delivery");
    expect((await receive("email.delivered")).status).toBe(200);
    expect(harness.get("SELECT status FROM event_email_deliveries")).toEqual({ status: "delivered" });
  });

  it.each(["delivered", "bounced", "complained", "failed"])("does not downgrade %s when older sent/delayed callbacks arrive", async (status) => {
    await receive(`email.${status}`);
    await receive("email.sent");
    await receive("email.delivery_delayed");
    expect(harness.get("SELECT status FROM event_email_deliveries")).toEqual({ status });
  });

  it("records a complaint after delivery and ignores duplicate receipts", async () => {
    await receive("email.delivered");
    await receive("email.complained");
    const response = await receive("email.delivered");
    expect(await response.json()).toEqual({ message: "Duplicate webhook ignored" });
    expect(harness.get("SELECT status FROM event_email_deliveries")).toEqual({ status: "complained" });
    expect(harness.all("SELECT delivery_id FROM webhook_deliveries")).toHaveLength(2);
  });
});
