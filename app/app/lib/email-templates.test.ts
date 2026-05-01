import { describe, expect, it } from "vitest";
import {
  generateInviteEmail,
  generateRsvpOverrideEmail,
} from "./email-templates";

describe("email-templates", () => {
  it("generates invite email content with a fallback greeting and join CTA", () => {
    const email = generateInviteEmail({
      inviteeName: null,
      inviterName: "Jeff",
      acceptLink: "https://meatup.club/accept-invite",
    });

    expect(email.subject).toBe("Jeff invited you to Meatup");
    expect(email.text).toContain("Hey there,");
    expect(email.text).toContain("https://meatup.club/accept-invite");
    expect(email.html).toContain("Join the Group");
    expect(email.html).toContain("<strong>Jeff</strong> has invited you");
  });

  it("generates RSVP override email content with capitalized status and fallback recipient name", () => {
    const email = generateRsvpOverrideEmail({
      recipientName: null,
      adminName: "Admin Alex",
      eventName: "Q2 Steak Night",
      eventDate: "2026-06-10",
      eventTime: "7:00 PM",
      rsvpStatus: "maybe",
      eventUrl: "https://meatup.club/dashboard/events/3",
    });

    expect(email.subject).toBe("RSVP Updated: Q2 Steak Night");
    expect(email.text).toContain("Hi there,");
    expect(email.text).toContain("New RSVP status: Maybe");
    expect(email.html).toContain("View Event");
    expect(email.html).toContain("Admin Alex updated your RSVP");
  });
});
