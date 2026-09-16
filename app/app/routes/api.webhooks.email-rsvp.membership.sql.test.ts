// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Webhook } from "svix";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "~/lib/router-context";
import { action } from "./api.webhooks.email-rsvp";

const secret = ["wh", "sec", "_"].join("") + btoa("membership-calendar-test-key");

function replyRequest(validSignature = true) {
  const body = JSON.stringify({
    type: "email.received",
    data: {
      from: "Member <MEMBER@example.com>",
      subject: "Accepted",
      text: [
        "BEGIN:VCALENDAR", "METHOD:REPLY", "BEGIN:VEVENT",
        "UID:event-1@meatup.club",
        "ATTENDEE;PARTSTAT=ACCEPTED:mailto:member@example.com",
        "END:VEVENT", "END:VCALENDAR",
      ].join("\r\n"),
    },
  });
  const timestamp = new Date();
  const id = "msg_membership_reply";
  return new Request("https://meatup.club/api/webhooks/email-rsvp", {
    method: "POST", body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": validSignature ? new Webhook(secret).sign(id, timestamp, body) : "v1,invalid",
    },
  });
}

describe("calendar RSVP membership authorization", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (1, 'Steakhouse', '2099-01-01');
      INSERT INTO rsvps (event_id, user_id, status) VALUES (1, 1, 'no');
    `);
  });
  afterEach(() => harness.sqlite.close());

  function context() {
    return createLoadContext({ env: { DB: harness.db, RESEND_WEBHOOK_SECRET: secret } } as never);
  }

  it.each(["inactive", "pending", "invited"])("does not change an RSVP for a %s account", async status => {
    harness.insert("UPDATE users SET status = ? WHERE id = 1", status);
    const response = await action({ request: replyRequest(), context: context() });
    expect(response.status).toBe(404);
    expect(harness.get("SELECT status, updated_via_calendar FROM rsvps"))
      .toEqual({ status: "no", updated_via_calendar: 0 });
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
  });

  it("accepts an active member's signed reply and ignores duplicate deliveries", async () => {
    const response = await action({ request: replyRequest(), context: context() });
    expect(response.status).toBe(200);
    expect(harness.get("SELECT status, updated_via_calendar FROM rsvps"))
      .toEqual({ status: "yes", updated_via_calendar: 1 });
    harness.insert("UPDATE rsvps SET status = 'no'");
    const duplicate = await action({ request: replyRequest(), context: context() });
    expect(await duplicate.json()).toEqual({ message: "Duplicate webhook ignored" });
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "no" });
  });

  it("rejects an invalid signature without changing the response", async () => {
    expect((await action({ request: replyRequest(false), context: context() })).status).toBe(401);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "no" });
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
  });
});
