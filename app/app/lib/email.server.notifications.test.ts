import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendCalendarUpdate,
  sendEventCancellation,
  sendEventInvites,
  sendEventUpdate,
  sendRsvpOverrideEmail,
} from "./email.server";

vi.mock("./email-templates", () => ({
  generateRsvpOverrideEmail: ({
    recipientName,
    adminName,
    eventName,
    eventDate,
    eventTime,
    rsvpStatus,
    eventUrl,
  }: {
    recipientName: string | null;
    adminName: string;
    eventName: string;
    eventDate: string;
    eventTime: string;
    rsvpStatus: string;
    eventUrl: string;
  }) => ({
    subject: `${adminName} updated your RSVP`,
    html: `<p>Hi ${recipientName || "there"}</p><p>${eventName} on ${eventDate} at ${eventTime}: ${rsvpStatus}</p><p>${eventUrl}</p>`,
    text: `Hi ${recipientName || "there"} ${eventName} ${eventDate} ${eventTime} ${rsvpStatus} ${eventUrl}`,
  }),
}));

function decodeAttachmentContent(body: Record<string, unknown>): string {
  const attachments = body.attachments as Array<{ content: string }>;
  return Buffer.from(attachments[0].content, "base64").toString("utf8");
}

describe("email.server advanced notification flows", () => {
  let originalFetch: typeof global.fetch;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-123" }),
      text: async () => "OK",
      statusText: "OK",
    } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("sends RSVP override emails using the generated template metadata", async () => {
    const result = await sendRsvpOverrideEmail({
      to: "member@example.com",
      recipientName: "Member",
      adminName: "Admin",
      eventName: "Prime Steakhouse",
      eventDate: "April 10, 2026",
      eventTime: "6:00 PM",
      rsvpStatus: "yes",
      eventUrl: "https://meatup.club/dashboard/events",
      resendApiKey: "test-api-key",
    });

    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;

    expect(body.from).toBe("Meatup.Club <notifications@mail.meatup.club>");
    expect(body.to).toEqual(["member@example.com"]);
    expect(body.subject).toBe("Admin updated your RSVP");
    expect(String(body.html)).toContain("Prime Steakhouse on April 10, 2026 at 6:00 PM: yes");
    expect(body.tags).toEqual([{ name: "category", value: "rsvp_override" }]);
  });

  it("returns a resend error for RSVP override failures", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Unauthorized",
      text: async () => "invalid key",
    } as unknown as Response);

    const result = await sendRsvpOverrideEmail({
      to: "member@example.com",
      recipientName: null,
      adminName: "Admin",
      eventName: "Prime Steakhouse",
      eventDate: "April 10, 2026",
      eventTime: "6:00 PM",
      rsvpStatus: "no",
      eventUrl: "https://meatup.club/dashboard/events",
      resendApiKey: "bad-key",
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to send email: Unauthorized",
    });
  });

  it("returns early when there are no invite recipients", async () => {
    const result = await sendEventInvites({
      eventId: 7,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "123 Main St",
      eventDate: "2026-04-10",
      eventTime: "18:00",
      recipientEmails: [],
      resendApiKey: "test-api-key",
    });

    expect(result).toEqual({ success: true, sentCount: 0, errors: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends personalized calendar invite emails with ICS attachments", async () => {
    const result = await sendEventInvites({
      eventId: 7,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "123 Main St",
      eventDate: "2026-04-10",
      eventTime: "18:00",
      recipientEmails: ["amy@example.com", "ben@example.com"],
      resendApiKey: "test-api-key",
    });

    expect(result).toEqual({ success: true, sentCount: 2, errors: [] });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const [, firstRequestInit] = vi.mocked(global.fetch).mock.calls[0];
    const firstBody = JSON.parse(String(firstRequestInit?.body)) as Record<string, unknown>;
    const firstIcs = decodeAttachmentContent(firstBody);

    expect(firstBody.to).toEqual(["amy@example.com"]);
    expect(firstBody.reply_to).toBe("rsvp@mail.meatup.club");
    expect(firstBody.tags).toEqual([{ name: "category", value: "event_invite" }]);
    expect(firstIcs).toContain("UID:event-7@meatup.club");
    expect(firstIcs).toContain("SEQUENCE:0");
    expect(firstIcs).toContain("mailto:amy@example.com");

    const [, secondRequestInit] = vi.mocked(global.fetch).mock.calls[1];
    const secondBody = JSON.parse(String(secondRequestInit?.body)) as Record<string, unknown>;
    const secondIcs = decodeAttachmentContent(secondBody);

    expect(secondBody.to).toEqual(["ben@example.com"]);
    expect(secondIcs).toContain("mailto:ben@example.com");
  });

  it("collects redacted invite errors and continues sending remaining recipients", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "email-1" }),
        text: async () => "OK",
        statusText: "OK",
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        statusText: "Rate Limited",
        text: async () => "Too many requests",
      } as unknown as Response);

    const result = await sendEventInvites({
      eventId: 8,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: null,
      eventDate: "2026-04-11",
      eventTime: "18:00",
      recipientEmails: ["amy@example.com", "zoe@example.com"],
      resendApiKey: "test-api-key",
    });

    expect(result.success).toBe(false);
    expect(result.sentCount).toBe(1);
    expect(result.errors).toEqual(["zo***@example.com: Rate Limited"]);
  });

  it("attaches RSVP calendar updates with the mapped PARTSTAT", async () => {
    const result = await sendCalendarUpdate({
      eventId: 9,
      restaurantName: 'Butcher"s Grill',
      restaurantAddress: "456 Oak Ave",
      eventDate: "2026-04-12",
      eventTime: "19:30",
      userEmail: "member@example.com",
      rsvpStatus: "maybe",
      resendApiKey: "test-api-key",
    });

    expect(result).toEqual({ success: true });

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    const ics = decodeAttachmentContent(body);

    expect(body.subject).toBe('RSVP Updated: Butcher"s Grill');
    expect(body.tags).toEqual([{ name: "category", value: "calendar_update" }]);
    expect(ics).toContain("UID:event-9@meatup.club");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("PARTSTAT=TENTATIVE");
  });

  it("returns the thrown error message for calendar update failures", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const result = await sendCalendarUpdate({
      eventId: 9,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "456 Oak Ave",
      eventDate: "2026-04-12",
      eventTime: "19:30",
      userEmail: "member@example.com",
      rsvpStatus: "yes",
      resendApiKey: "test-api-key",
    });

    expect(result).toEqual({ success: false, error: "Connection refused" });
  });

  it("sends event updates with the provided sequence and default NEEDS-ACTION RSVP", async () => {
    const result = await sendEventUpdate({
      eventId: 10,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: "789 Pine Rd",
      eventDate: "2026-04-13",
      eventTime: "18:15",
      userEmail: "member@example.com",
      sequence: 3,
      resendApiKey: "test-api-key",
    });

    expect(result).toEqual({ success: true });

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    const ics = decodeAttachmentContent(body);

    expect(body.tags).toEqual([{ name: "category", value: "event_update" }]);
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("PARTSTAT=NEEDS-ACTION");
  });

  it("sends event cancellation notices with CANCEL calendar attachments", async () => {
    const result = await sendEventCancellation({
      eventId: 11,
      restaurantName: "Prime Steakhouse",
      restaurantAddress: null,
      eventDate: "2026-04-14",
      eventTime: "18:00",
      userEmail: "member@example.com",
      sequence: 4,
      resendApiKey: "test-api-key",
    });

    expect(result).toEqual({ success: true });

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    const ics = decodeAttachmentContent(body);

    expect(body.subject).toBe("Event Cancelled: Prime Steakhouse");
    expect(body.tags).toEqual([{ name: "category", value: "event_cancel" }]);
    expect(body.attachments).toEqual([
      expect.objectContaining({ filename: "event-cancel.ics", content_type: "text/calendar; method=CANCEL" }),
    ]);
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:4");
  });
});
