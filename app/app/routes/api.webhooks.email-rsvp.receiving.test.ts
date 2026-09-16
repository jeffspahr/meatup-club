import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { action, parseCalendarRSVP } from "./api.webhooks.email-rsvp";
import { createLoadContext } from "~/lib/router-context";

const secret = ["wh", "sec", "_"].join("") + btoa("calendar-reply-test-key");
const emailId = "received-email-123";
const attachment = { id: "calendar-attachment", filename: "reply.ics", content_type: "text/calendar; method=REPLY" };
const downloadUrl = "https://inbound-cdn.resend.com/reply.ics?signature=test";
const fetchMock = vi.fn<typeof fetch>();

function calendar(partstat: string) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "METHOD:REPLY", "BEGIN:VEVENT",
    "UID:event-123@meatup.club",
    `ATTENDEE;CN=Member;PARTSTAT=${partstat};RSVP=TRUE:mailto:member@example.com`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

function request(signatureValid = true) {
  const body = JSON.stringify({ type: "email.received", data: {
    email_id: emailId, from: "member@example.com", to: ["rsvp@mail.meatup.club"],
    subject: "Réponse à l’invitation", attachments: [attachment],
  } });
  const timestamp = new Date();
  return new Request("https://meatup.club/api/webhooks/email-rsvp", {
    method: "POST", body, headers: {
      "svix-id": "msg_calendar_reply", "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signatureValid ? new Webhook(secret).sign("msg_calendar_reply", timestamp, body) : "v1,invalid",
    },
  });
}

function database() {
  const deliveries = new Set<string>();
  const writes: unknown[][] = [];
  let lastChanges = 0;
  let failWrite = false;
  const db = {
    batch: async (statements: { run: () => Promise<{ meta: { changes: number } }> }[]) => {
      const snapshot = new Set(deliveries);
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        deliveries.clear();
        snapshot.forEach(key => deliveries.add(key));
        throw error;
      }
    },
    prepare: vi.fn((sql: string) => ({ bind: (...args: unknown[]) => ({
    first: async () => {
      if (sql.includes("FROM webhook_deliveries")) return deliveries.has(args.join(":")) ? { found: 1 } : null;
      if (sql.includes("FROM users")) return { id: 7, email: "member@example.com", name: "Member" };
      if (sql.includes("FROM events")) return { id: 123, restaurant_name: "Steakhouse", event_date: "2026-10-01" };
      if (sql.includes("FROM rsvps")) return { id: 9 };
      return null;
    },
    run: async () => {
      if (sql.startsWith("INSERT OR IGNORE INTO webhook_deliveries")) {
        const key = args.join(":");
        const changes = deliveries.has(key) ? 0 : 1;
        deliveries.add(key);
        lastChanges = changes;
        return { meta: { changes } };
      }
      if (sql.trimStart().startsWith("INSERT INTO rsvps")) {
        if (failWrite) { failWrite = false; throw new Error("Temporary database failure"); }
        if (lastChanges > 0) writes.push(args);
        return { meta: { changes: 1 } };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  }) })) };
  return { db, deliveries, writes, failNextWrite: () => { failWrite = true; } };
}

function context(db: ReturnType<typeof database>["db"], apiKey: string | undefined = "test-api-key") {
  return createLoadContext({ env: { DB: db, RESEND_WEBHOOK_SECRET: secret, RESEND_API_KEY: apiKey } } as never);
}

function providerResponses(partstat = "ACCEPTED") {
  fetchMock
    .mockResolvedValueOnce(Response.json({ text: null, html: "<p>Calendar response</p>", attachments: [attachment] }))
    .mockResolvedValueOnce(Response.json({ ...attachment, download_url: downloadUrl }))
    .mockResolvedValueOnce(new Response(calendar(partstat)));
}

describe("Real calendar replies received through Resend", () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

  it.each([["ACCEPTED", "yes"], ["DECLINED", "no"], ["TENTATIVE", "maybe"]])(
    "persists %s from a metadata-only webhook and ICS attachment", async (partstat, status) => {
      const state = database();
      providerResponses(partstat);
      const response = await action({ request: request(), context: context(state.db) });
      expect(response.status).toBe(200);
      expect(state.writes).toEqual([[123, 7, status]]);
      expect(state.db.prepare).toHaveBeenCalledWith(expect.stringContaining("updated_via_calendar = 1"));
      expect(fetchMock).toHaveBeenNthCalledWith(1, `https://api.resend.com/emails/receiving/${emailId}`, expect.objectContaining({ headers: { Authorization: "Bearer test-api-key" } }));
      expect(fetchMock).toHaveBeenNthCalledWith(2, `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachment.id}`, expect.objectContaining({ headers: { Authorization: "Bearer test-api-key" } }));
      expect(fetchMock).toHaveBeenNthCalledWith(3, downloadUrl, expect.not.objectContaining({ headers: expect.anything() }));
      const duplicate = await action({ request: request(), context: context(state.db) });
      expect(await duplicate.json()).toEqual({ message: "Duplicate webhook ignored" });
      expect(state.writes).toHaveLength(1);
    },
  );

  it("fetches nothing for an invalid signature", async () => {
    const state = database();
    expect((await action({ request: request(false), context: context(state.db) })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.db.prepare).not.toHaveBeenCalled();
  });

  it.each([401, 429, 503])("allows the same delivery to retry after provider HTTP %s", async (status) => {
    const state = database();
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status }));
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(500);
    expect(state.deliveries.size).toBe(0);
    providerResponses();
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(200);
    expect(state.writes).toEqual([[123, 7, "yes"]]);
  });

  it("retries persistence after a transient database failure", async () => {
    const state = database();
    state.failNextWrite();
    providerResponses();
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(500);
    expect(state.deliveries.size).toBe(0);
    providerResponses();
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(200);
    expect(state.writes).toEqual([[123, 7, "yes"]]);
  });

  it("requires a receiving-capable API key for metadata-only notifications", async () => {
    const state = database();
    expect((await action({ request: request(), context: context(state.db, "") })).status).toBe(500);
    expect(state.deliveries.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["metadata", "download", "network"])("does not record the delivery after attachment %s failure", async (stage) => {
    const state = database();
    fetchMock.mockResolvedValueOnce(Response.json({ text: null, html: null, attachments: [attachment] }));
    if (stage === "metadata") {
      fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    } else {
      fetchMock.mockResolvedValueOnce(Response.json({ download_url: downloadUrl }));
      if (stage === "network") fetchMock.mockRejectedValueOnce(new Error("Network failure"));
      else fetchMock.mockResolvedValueOnce(new Response("Expired", { status: 403 }));
    }
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(500);
    expect(state.deliveries.size).toBe(0);
    expect(state.writes).toEqual([]);
    providerResponses();
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(200);
    expect(state.writes).toEqual([[123, 7, "yes"]]);
  });

  it("reads calendar data in the retrieved body and skips unrelated attachments", async () => {
    const state = database();
    fetchMock.mockResolvedValueOnce(Response.json({ text: calendar("DECLINED"), html: null,
      attachments: [{ id: "photo", filename: "photo.png", content_type: "image/png" }] }));
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(200);
    expect(state.writes).toEqual([[123, 7, "no"]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses .ics attachments even when sent as application/octet-stream", async () => {
    const state = database();
    fetchMock.mockResolvedValueOnce(Response.json({ attachments: [{ ...attachment, content_type: "application/octet-stream" }] }))
      .mockResolvedValueOnce(Response.json({ download_url: downloadUrl }))
      .mockResolvedValueOnce(new Response(calendar("ACCEPTED")));
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(200);
    expect(state.writes).toEqual([[123, 7, "yes"]]);
  });

  it("ignores ordinary mail with no calendar data", async () => {
    const state = database();
    fetchMock.mockResolvedValueOnce(Response.json({ text: null, html: "<p>Thanks!</p>", attachments: [] }));
    const response = await action({ request: request(), context: context(state.db) });
    expect(await response.json()).toEqual({ message: "No RSVP data found" });
    expect(state.writes).toEqual([]);
  });

  it("rejects oversized calendar content without persisting an RSVP", async () => {
    const state = database();
    fetchMock.mockResolvedValueOnce(Response.json({ attachments: [attachment] }))
      .mockResolvedValueOnce(Response.json({ download_url: downloadUrl }))
      .mockResolvedValueOnce(new Response("x".repeat(1024 * 1024 + 1)));
    expect((await action({ request: request(), context: context(state.db) })).status).toBe(500);
    expect(state.writes).toEqual([]);
    expect(state.deliveries.size).toBe(0);
  });
});

describe("Standard iCalendar status syntax", () => {
  it.each(["ACCEPTED", "DECLINED", "TENTATIVE"])("parses %s independently of the subject", partstat => {
    expect(parseCalendarRSVP({ subject: "Réponse", text: calendar(partstat) })).toEqual({ eventUid: "event-123@meatup.club", partstat });
  });

  it("unfolds continued UID and attendee parameter lines", () => {
    const text = calendar("ACCEPTED").replace("@meatup.club", "@meatup.\r\n club").replace("PARTSTAT=ACCEPTED", "PARTSTAT=\r\n\tACCEPTED");
    expect(parseCalendarRSVP({ subject: "Réponse", text })).toEqual({ eventUid: "event-123@meatup.club", partstat: "ACCEPTED" });
  });

  it("uses the responding member's status rather than another attendee's", () => {
    const text = calendar("DECLINED").replace("ATTENDEE;CN", "ATTENDEE;PARTSTAT=ACCEPTED:mailto:other@example.com\r\nATTENDEE;CN");
    expect(parseCalendarRSVP({ subject: "Accepted", text, attendeeEmail: "member@example.com" }))
      .toEqual({ eventUid: "event-123@meatup.club", partstat: "DECLINED" });
    expect(parseCalendarRSVP({ subject: "Accepted", text, attendeeEmail: "unknown@example.com" })).toBeNull();
  });

  it.each(["REQUEST", "CANCEL"])("does not turn METHOD:%s into a reply", method => {
    expect(parseCalendarRSVP({ subject: "Accepted", text: calendar("ACCEPTED").replace("METHOD:REPLY", `METHOD:${method}`) })).toBeNull();
  });

  it("rejects lookalike UID domains", () => {
    expect(parseCalendarRSVP({ subject: "Accepted", text: calendar("ACCEPTED").replace("@meatup.club", "@meatup.club.evil.example") })).toBeNull();
  });
});
