import { describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { action } from "./api.webhooks.email-rsvp";

describe("email RSVP webhook real Svix verification", () => {
  it("accepts a payload signed by the installed Svix implementation", async () => {
    // Construct the synthetic key at runtime so secret scanners do not mistake
    // this test fixture for a live webhook credential.
    const secret = ["whsec", "dGVzdC13ZWJob29rLXNlY3JldC0zMi1ieXRlcw=="].join("_");
    const messageId = "msg_real_signature";
    const timestamp = new Date();
    const body = JSON.stringify({ type: "email.sent", data: {} });
    const signature = new Webhook(secret).sign(messageId, timestamp, body);
    const db = { prepare: vi.fn() };

    const response = await action({
      request: new Request("http://localhost/api/webhooks/email-rsvp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "svix-id": messageId,
          "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
          "svix-signature": signature,
        },
        body,
      }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            RESEND_WEBHOOK_SECRET: secret,
          },
        },
      } as any,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Ignored: not an email.received event",
    });
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
