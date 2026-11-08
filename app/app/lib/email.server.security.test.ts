import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendCalendarUpdate,
  sendEventCancellationEmail,
  sendEventInviteEmail,
  sendEventUpdateEmail,
  sendRsvpOverrideEmail,
} from "./email.server";
import { parseEventMutationFormData } from "./events.server";

interface SentEmail {
  html: string;
  text: string;
  attachments: Array<{ content: string }>;
}

const fetchMock = vi.fn<typeof fetch>();

function memberEvent(restaurantName: string, restaurantAddress: string) {
  const form = new FormData();
  form.set("restaurant_name", restaurantName);
  form.set("restaurant_address", restaurantAddress);
  form.set("event_date", "2027-01-15");
  form.set("event_time", "18:00");
  const parsed = parseEventMutationFormData(form);
  expect(parsed.error).toBeUndefined();
  if (!parsed.value) throw new Error("Expected valid member event input");
  return {
    ...parsed.value,
    eventId: 10,
    userEmail: "recipient@example.invalid",
    resendApiKey: "dummy-key",
    sequence: 1,
    rsvpStatus: "yes" as const,
    calendarTimestamp: new Date("2027-01-01T12:00:00Z"),
  };
}

const senders = [
  {
    name: "invitation",
    send: sendEventInviteEmail,
    heading: "Save the Date!",
    links: ["https://meatup.club/dashboard/events"],
  },
  { name: "RSVP update", send: sendCalendarUpdate, heading: "RSVP Updated", links: [] },
  { name: "event update", send: sendEventUpdateEmail, heading: "Event Updated", links: [] },
  { name: "cancellation", send: sendEventCancellationEmail, heading: "Event Cancelled", links: [] },
];

function sentEmail(): SentEmail {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(typeof request?.body).toBe("string");
  return JSON.parse(request?.body as string) as SentEmail;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "dummy-message" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
});

describe.each(senders)("member event fields in $name", ({ send, heading, links }) => {
  it("renders member-supplied HTML as text without introducing links", async () => {
    const restaurantName = '<a href="https://untrusted.invalid/name">Example & Steak</a>';
    const restaurantAddress = '<a href="https://untrusted.invalid/address">123 Main St</a>';
    const result = await send(memberEvent(restaurantName, restaurantAddress));
    expect(result.success).toBe(true);

    const message = sentEmail();
    const document = new DOMParser().parseFromString(message.html, "text/html");
    expect(document.querySelector('a[href="https://untrusted.invalid/name"]')).toBeNull();
    expect(document.querySelector('a[href="https://untrusted.invalid/address"]')).toBeNull();
    expect(document.querySelector("h2")?.textContent?.trim()).toBe(heading);
    expect(Array.from(document.querySelectorAll("a"), link => link.getAttribute("href"))).toEqual(links);
    expect(document.body.textContent).toContain(restaurantName);
    expect(document.body.textContent).toContain(restaurantAddress);
    expect(message.text).toContain(restaurantName);
    expect(message.text).toContain(restaurantAddress);
  });

  it("keeps calendar line breaks and delimiters inside TEXT property values", async () => {
    const restaurantName = "Meat, A; B\\C\r\nUID:event-1@meatup.club";
    const restaurantAddress = "123 Main St\nX-AUDIT-MARKER:address\rSuite 2";
    const result = await send(memberEvent(restaurantName, restaurantAddress));
    expect(result.success).toBe(true);

    const message = sentEmail();
    const calendar = Buffer.from(message.attachments[0].content, "base64").toString("utf8");
    // Unfold RFC 5545 content lines before inspecting property boundaries.
    const lines = calendar.replace(/\r\n[ \t]/g, "").split(/\r\n|\r|\n/);
    expect(lines.filter(line => line.startsWith("UID:"))).toEqual(["UID:event-10@meatup.club"]);
    expect(lines.some(line => line.startsWith("X-AUDIT-MARKER:"))).toBe(false);
    expect(lines).toContain("SUMMARY:Meatup.Club - Meat\\, A\\; B\\\\C\\nUID:event-1@meatup.club");
    expect(lines).toContain("LOCATION:Meat\\, A\\; B\\\\C\\nUID:event-1@meatup.club\\, 123 Main St\\nX-AUDIT-MARKER:address\\nSuite 2");
  });
});


describe("member event name in administrator RSVP notifications", () => {
  it("preserves the event name as text in the override template", async () => {
    const eventName = '<a href="https://untrusted.invalid/override">Example & Steak</a>';
    const result = await sendRsvpOverrideEmail({
      to: "recipient@example.invalid",
      recipientName: "Recipient",
      adminName: "Administrator",
      eventName,
      eventDate: "2027-01-15",
      eventTime: "18:00",
      rsvpStatus: "yes",
      eventUrl: "https://meatup.club/dashboard/events",
      resendApiKey: "dummy-key",
    });
    expect(result.success).toBe(true);

    const message = sentEmail();
    const document = new DOMParser().parseFromString(message.html, "text/html");
    expect(document.querySelector('a[href="https://untrusted.invalid/override"]')).toBeNull();
    expect(document.querySelector('a[href="https://meatup.club/dashboard/events"]')).not.toBeNull();
    expect(document.body.textContent).toContain(eventName);
    expect(message.text).toContain(eventName);
  });
});
