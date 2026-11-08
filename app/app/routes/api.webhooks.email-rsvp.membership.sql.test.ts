// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { createSqliteD1Harness } from "../../test/support/sqlite-d1";
import { createLoadContext } from "~/lib/router-context";
import { action } from "./api.webhooks.email-rsvp";

const secret = ["wh", "sec", "_"].join("") + btoa("membership-calendar-test-key");

const calendar = [
  "BEGIN:VCALENDAR", "METHOD:REPLY", "BEGIN:VEVENT", "UID:event-1@meatup.club",
  "ATTENDEE;PARTSTAT=ACCEPTED:mailto:member@example.com", "END:VEVENT", "END:VCALENDAR",
].join("\r\n");
const fetchMock = vi.fn<typeof fetch>();
function receivedEmail(overrides: Record<string, unknown> = {}) {
  return { from: "member@example.com", subject: "Accepted", text: calendar,
    authentication: { spf: "pass", dkim: "pass", dmarc: "gray" }, ...overrides };
}

function replyRequest(validSignature = true, rawBody?: string) {
  const body = rawBody ?? JSON.stringify({
    type: "email.received",
    data: {
      email_id: "received-member-reply",
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
    fetchMock.mockReset().mockImplementation(async () => Response.json(receivedEmail()));
    vi.stubGlobal("fetch", fetchMock);
    harness = createSqliteD1Harness();
    harness.sqlite.exec(`
      INSERT INTO users (id, email, status) VALUES (1, 'member@example.com', 'active');
      INSERT INTO events (id, restaurant_name, event_date) VALUES (1, 'Steakhouse', '2099-01-01');
      INSERT INTO rsvps (event_id, user_id, status) VALUES (1, 1, 'no');
    `);
  });
  afterEach(() => { harness.sqlite.close(); vi.unstubAllGlobals(); });

  function context() {
    return createLoadContext({ env: { DB: harness.db, RESEND_WEBHOOK_SECRET: secret, RESEND_API_KEY: "test-receiving-key" } } as never);
  }

  function expectUnchanged() {
    expect(harness.get("SELECT status, updated_via_calendar FROM rsvps"))
      .toEqual({ status: "no", updated_via_calendar: 0 });
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
  }

  it.each([
    undefined, null, {}, { spf: "fail", dkim: "fail", dmarc: "fail" },
    { spf: "pass", dkim: "fail", dmarc: "fail" },
    { spf: "pass", dkim: "gray", dmarc: "gray" },
    { dkim: "unknown", dmarc: "processing_failed" },
  ])("rejects unauthenticated sender results %j before fetching attachments", async authentication => {
    fetchMock.mockResolvedValueOnce(Response.json(receivedEmail({ authentication,
      attachments: [{ id: "calendar", filename: "reply.ics", content_type: "text/calendar" }],
    })));
    expect((await action({ request: replyRequest(), context: context() })).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectUnchanged();
  });

  it.each(["", null, {}, "Member <member@example.com>", '"<member@example.com>" <attacker@example.net>',
    "member@example.com,attacker@example.net", "member@example.com\r\nBcc: victim@example.net"])(
    "rejects malformed canonical sender %j", async from => {
      fetchMock.mockResolvedValueOnce(Response.json(receivedEmail({ from })));
      expect((await action({ request: replyRequest(), context: context() })).status).toBe(403);
      expectUnchanged();
    },
  );

  it.each([{ dkim: "pass", dmarc: "gray" }, { dkim: "fail", dmarc: "pass" }])(
    "accepts authenticated sender results %j", async authentication => {
      fetchMock.mockResolvedValueOnce(Response.json(receivedEmail({ authentication })));
      expect((await action({ request: replyRequest(), context: context() })).status).toBe(200);
      expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "yes" });
      expect(harness.all("SELECT * FROM webhook_deliveries")).toHaveLength(1);
    },
  );

  it("uses the retrieved sender rather than a member named in the webhook display name", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(receivedEmail({ from: "attacker@example.net" })));
    const body = JSON.stringify({ type: "email.received", data: {
      email_id: "received-member-reply", from: '\"<member@example.com>\" <attacker@example.net>', subject: "Accepted",
    } });
    expect((await action({ request: replyRequest(true, body), context: context() })).status).toBe(200);
    expectUnchanged();
  });

  it("uses the canonical sender and subject even when webhook metadata disagrees", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(receivedEmail({ from: "MEMBER@example.com",
      subject: "Declined", text: "UID:event-1@meatup.club" })));
    const body = JSON.stringify({ type: "email.received", data: {
      email_id: "received-member-reply", from: "other@example.net", subject: "Accepted",
    } });
    expect((await action({ request: replyRequest(true, body), context: context() })).status).toBe(200);
    expect(harness.get("SELECT status, updated_via_calendar FROM rsvps"))
      .toEqual({ status: "no", updated_via_calendar: 1 });
  });

  it("rejects legacy inline-only replies without a receiving API identifier", async () => {
    const body = JSON.stringify({ type: "email.received", data: {
      from: "member@example.com", subject: "Accepted", text: calendar,
    } });
    expect((await action({ request: replyRequest(true, body), context: context() })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expectUnchanged();
  });

  it("leaves a provider failure retryable", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    expect((await action({ request: replyRequest(), context: context() })).status).toBe(500);
    expectUnchanged();
    expect((await action({ request: replyRequest(), context: context() })).status).toBe(200);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "yes" });
  });

  it("rolls back the delivery receipt when the RSVP write fails and permits retry", async () => {
    harness.sqlite.exec("CREATE TRIGGER fail_rsvp BEFORE UPDATE ON rsvps BEGIN SELECT RAISE(ABORT, 'temporary failure'); END;");
    expect((await action({ request: replyRequest(), context: context() })).status).toBe(500);
    expectUnchanged();
    harness.sqlite.exec("DROP TRIGGER fail_rsvp");
    expect((await action({ request: replyRequest(), context: context() })).status).toBe(200);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "yes" });
    expect(harness.all("SELECT * FROM webhook_deliveries")).toHaveLength(1);
  });

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

  it.each([
    "not-json", "null", "[]", JSON.stringify({ type: 123 }),
    JSON.stringify({ type: "email.received", data: null }),
    JSON.stringify({ type: "email.received", data: { from: 12, subject: "Accepted" } }),
    JSON.stringify({ type: "email.received", data: { from: "member@example.com", subject: "Accepted", text: {} } }),
    JSON.stringify({ type: "email.received", data: { from: "member@example.com", subject: "Accepted", attachments: [null] } }),
  ])("rejects signed malformed payload %s without recording or changing an RSVP", async body => {
    expect((await action({ request: replyRequest(true, body), context: context() })).status).toBe(400);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "no" });
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
  });

  it("rejects an invalid signature without changing the response", async () => {
    expect((await action({ request: replyRequest(false), context: context() })).status).toBe(401);
    expect(harness.get("SELECT status FROM rsvps")).toEqual({ status: "no" });
    expect(harness.all("SELECT * FROM webhook_deliveries")).toEqual([]);
  });
});
