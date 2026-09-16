// @vitest-environment node

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "../lib/router-context";
import { action } from "./api.webhooks.sms";

describe("SMS webhook persistence", () => {
  let harness: ReturnType<typeof createSqliteD1Harness>;
  const token = "synthetic-sms-contract-token";

  beforeEach(() => {
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status, phone_number, sms_opt_in)
      VALUES (1, 'member@example.com', 'active', '+15551234567', 1);
      INSERT INTO events (id, restaurant_name, event_date, status)
      VALUES (1, 'Steakhouse', '2099-01-01', 'upcoming');
      INSERT INTO sms_reminders (event_id, user_id, reminder_type) VALUES (1, 1, 'invitation');
    `);
  });
  afterEach(() => harness.sqlite.close());

  function receive(body: string, sid: string) {
    const url = "https://meatup.club/api/webhooks/sms";
    const form = new URLSearchParams({ Body: body, From: "+15551234567", MessageSid: sid });
    const signedData = [...form.keys()].sort().reduce((value, key) => value + key + form.get(key), url);
    const signature = createHmac("sha1", token).update(signedData).digest("base64");
    return action({
      request: new Request(url, { method: "POST", headers: { "X-Twilio-Signature": signature }, body: form }),
      context: createLoadContext({ env: { DB: harness.db, TWILIO_AUTH_TOKEN: token } } as never),
      params: {},
    } as never);
  }

  it.each([["YES 1", "yes"], ["NO 1", "no"], ["MAYBE 1", "maybe"]])("retries %s after a failed write without consuming its receipt", async (body, status) => {
    harness.sqlite.exec(`CREATE TRIGGER fail_rsvp BEFORE INSERT ON rsvps
      BEGIN SELECT RAISE(ABORT, 'Temporary RSVP failure'); END;`);
    await expect(receive(body, "reply-1")).rejects.toThrow("Temporary RSVP failure");
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
    harness.sqlite.exec("DROP TRIGGER fail_rsvp");
    expect((await receive(body, "reply-1")).status).toBe(200);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status });
    expect(harness.all("SELECT delivery_id FROM webhook_deliveries")).toEqual([{ delivery_id: "reply-1" }]);
  });

  it.each(["YES 1", "MAYBE 1"])("ignores a replay of %s after a newer answer", async (body) => {
    await receive(body, "reply-1");
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: body.startsWith("MAYBE") ? "maybe" : "yes" });
    await receive("NO 1", "reply-2");
    await receive(body, "reply-1");
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "no" });
  });

  it("preserves comments and clears admin overrides when updating an RSVP", async () => {
    harness.sqlite.exec(`INSERT INTO rsvps
      (event_id, user_id, status, comments, admin_override, admin_override_by, admin_override_at)
      VALUES (1, 1, 'no', 'Keep this comment', 1, 1, '2026-09-01');`);
    await receive("YES", "reply-1");
    expect(harness.get("SELECT status, comments, admin_override, admin_override_by, admin_override_at FROM rsvps"))
      .toEqual({ status: "yes", comments: "Keep this comment", admin_override: 0, admin_override_by: null, admin_override_at: null });
  });

  it("still accepts replies without an optional MessageSid", async () => {
    await receive("YES", "");
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "yes" });
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
  });

  it("cannot undo a later opt-out by replaying an old START", async () => {
    await receive("START", "start-1");
    await receive("STOP", "stop-1");
    await receive("START", "start-1");
    expect(harness.get("SELECT sms_opt_in FROM users")).toEqual({ sms_opt_in: 0 });
    expect(harness.all("SELECT event_type FROM sms_consent_events ORDER BY id")).toEqual([
      { event_type: "opt_in" }, { event_type: "opt_out" },
    ]);
  });

  it("cannot undo a later opt-in by replaying an old STOP", async () => {
    await receive("STOP", "stop-1");
    await receive("START", "start-1");
    await receive("STOP", "stop-1");
    expect(harness.get("SELECT sms_opt_in, sms_opt_out_at FROM users")).toEqual({ sms_opt_in: 1, sms_opt_out_at: null });
  });

  it("rolls back consent evidence when changing consent fails", async () => {
    harness.sqlite.exec(`CREATE TRIGGER fail_consent BEFORE UPDATE ON users
      BEGIN SELECT RAISE(ABORT, 'Temporary consent failure'); END;`);
    await expect(receive("STOP", "stop-1")).rejects.toThrow("Temporary consent failure");
    expect(harness.all("SELECT * FROM sms_consent_events")).toEqual([]);
    harness.sqlite.exec("DROP TRIGGER fail_consent");
    await receive("STOP", "stop-1");
    expect(harness.get("SELECT sms_opt_in FROM users")).toEqual({ sms_opt_in: 0 });
  });

  it("returns a controlled 400 for malformed form bodies", async () => {
    const response = await action({
      request: new Request("https://meatup.club/api/webhooks/sms", { method: "POST", body: "not a form" }),
      context: createLoadContext({ env: { DB: harness.db, TWILIO_AUTH_TOKEN: token } } as never),
      params: {},
    } as never);
    expect(response.status).toBe(400);
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
  });
});
