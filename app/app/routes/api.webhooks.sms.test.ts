import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.webhooks.sms";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { verifyTwilioSignature } from "../lib/sms.server";
import { upsertRsvp } from "../lib/rsvps.server";

vi.mock("../lib/webhook-idempotency.server", () => ({
  reserveWebhookDelivery: vi.fn(),
}));

vi.mock("../lib/sms.server", () => ({
  buildSmsResponse: (message?: string) =>
    new Response(`<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response>${message ? `<Message>${message}</Message>` : ""}</Response>`, {
      headers: { "Content-Type": "text/xml" },
    }),
  normalizePhoneNumber: vi.fn(() => "+15551234567"),
  parseSmsReply: vi.fn(() => "yes"),
  verifyTwilioSignature: vi.fn(() => true),
}));

vi.mock("../lib/rsvps.server", () => ({
  upsertRsvp: vi.fn(),
}));

describe("api.webhooks.sms idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(upsertRsvp).mockResolvedValue({
      mutation: "updated",
      previousStatus: "maybe",
      status: "yes",
      previousComments: null,
      comments: null,
      previousAdminOverride: 0,
      adminOverride: 0,
      statusChanged: true,
      commentsChanged: false,
      adminOverrideChanged: false,
    });
  });

  it("ignores duplicate Twilio MessageSid deliveries", async () => {
    vi.mocked(verifyTwilioSignature).mockReturnValue(true);
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(false);

    const formData = new FormData();
    formData.set("MessageSid", "SM_DUPLICATE_123");
    formData.set("From", "+15551234567");
    formData.set("Body", "YES");

    const request = new Request("http://localhost/api/webhooks/sms", {
      method: "POST",
      headers: {
        "X-Twilio-Signature": "valid",
      },
      body: formData,
    });

    const db = { prepare: vi.fn() };

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as any,
    } as any);

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("already received that response");
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("records RSVP replies through the shared audited RSVP helper", async () => {
    vi.mocked(verifyTwilioSignature).mockReturnValue(true);
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(true);

    const formData = new FormData();
    formData.set("MessageSid", "SM_123");
    formData.set("From", "+15551234567");
    formData.set("Body", "YES");

    const request = new Request("http://localhost/api/webhooks/sms", {
      method: "POST",
      headers: {
        "X-Twilio-Signature": "valid",
      },
      body: formData,
    });

    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT id, sms_opt_in, sms_opt_out_at FROM users WHERE phone_number = ?")) {
          return {
            bind: () => ({
              first: async () => ({ id: 7, sms_opt_in: 1, sms_opt_out_at: null }),
            }),
          };
        }

        if (sql.includes("SELECT event_id FROM sms_reminders WHERE user_id = ?")) {
          return {
            bind: () => ({
              first: async () => ({ event_id: 42 }),
            }),
          };
        }

        throw new Error(`Unexpected query: ${sql}`);
      }),
    };

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
            APP_TIMEZONE: "America/New_York",
          },
        },
      } as any,
    } as any);

    expect(response.status).toBe(200);
    expect(upsertRsvp).toHaveBeenCalledWith({
      db,
      eventId: 42,
      userId: 7,
      status: "yes",
      source: "sms",
      actorUserId: 7,
    });
  });
});
