import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { action as deliveryAction } from "./api.webhooks.email-delivery";
import { action as rsvpAction } from "./api.webhooks.email-rsvp";
import { applyResendDeliveryWebhookEvent } from "../lib/event-email-delivery.server";
import { getProviderWebhookConfig } from "../lib/provider-webhooks.server";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/provider-webhooks.server", () => ({
  getProviderWebhookConfig: vi.fn(),
}));

vi.mock("../lib/event-email-delivery.server", () => ({
  applyResendDeliveryWebhookEvent: vi.fn(),
}));

vi.mock("../lib/webhook-idempotency.server", () => ({
  reserveWebhookDelivery: vi.fn(),
}));

vi.mock("../lib/rsvps.server", () => ({
  upsertRsvp: vi.fn(),
}));

const db = { prepare: vi.fn() };

function syntheticSigningSecret(seed: string): string {
  const prefix = ["wh", "sec", "_"].join("");
  return `${prefix}${btoa(`meatup-club-${seed}-contract-key`)}`;
}

function useDeliverySigningSecret(secret: string): void {
  vi.mocked(getProviderWebhookConfig).mockResolvedValue({
    provider: "resend",
    purpose: "delivery_status",
    webhookId: "wh_contract",
    endpoint: "https://meatup.club/api/webhooks/email-delivery",
    signingSecret: secret,
    events: ["email.delivered"],
  });
}

function signedRequest({
  url,
  payload,
  secret,
  messageId,
  timestamp = new Date(),
}: {
  url: string;
  payload: Record<string, unknown> | string;
  secret: string;
  messageId: string;
  timestamp?: Date;
}): Request {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signature = new Webhook(secret).sign(messageId, timestamp, body);

  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": messageId,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
    body,
  });
}

describe("Svix webhook contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(true);
    vi.mocked(applyResendDeliveryWebhookEvent).mockResolvedValue({
      handled: true,
      updated: true,
    });
  });

  it("accepts an RSVP webhook signed by the installed Svix implementation", async () => {
    const secret = syntheticSigningSecret("rsvp");
    const response = await rsvpAction({
      request: signedRequest({
        url: "http://localhost/api/webhooks/email-rsvp",
        payload: { type: "email.bounced", data: {} },
        secret,
        messageId: "msg_rsvp_contract",
      }),
      context: createLoadContext({ env: { DB: db, RESEND_WEBHOOK_SECRET: secret } } as never) as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Ignored: not an email.received event",
    });
  });

  it("rejects an RSVP webhook signed with a different key", async () => {
    const configuredSecret = syntheticSigningSecret("configured-rsvp");
    const response = await rsvpAction({
      request: signedRequest({
        url: "http://localhost/api/webhooks/email-rsvp",
        payload: { type: "email.received", data: {} },
        secret: syntheticSigningSecret("wrong-rsvp"),
        messageId: "msg_rsvp_invalid_contract",
      }),
      context: createLoadContext({ env: { DB: db, RESEND_WEBHOOK_SECRET: configuredSecret } } as never) as never,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(reserveWebhookDelivery).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed RSVP webhook with a stale timestamp", async () => {
    const secret = syntheticSigningSecret("stale-rsvp");
    const response = await rsvpAction({
      request: signedRequest({
        url: "http://localhost/api/webhooks/email-rsvp",
        payload: { type: "email.received", data: {} },
        secret,
        messageId: "msg_rsvp_stale_contract",
        timestamp: new Date(Date.now() - 6 * 60 * 1000),
      }),
      context: createLoadContext({ env: { DB: db, RESEND_WEBHOOK_SECRET: secret } } as never) as never,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(reserveWebhookDelivery).not.toHaveBeenCalled();
  });

  it("accepts a delivery webhook signed by the installed Svix implementation", async () => {
    const secret = syntheticSigningSecret("delivery");
    useDeliverySigningSecret(secret);

    const response = await deliveryAction({
      request: signedRequest({
        url: "http://localhost/api/webhooks/email-delivery",
        payload: {
          type: "email.delivered",
          data: { email_id: "email-contract" },
        },
        secret,
        messageId: "msg_delivery_contract",
      }),
      context: createLoadContext({ env: { DB: db } } as never) as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Delivery state updated",
    });
    expect(reserveWebhookDelivery).toHaveBeenCalledWith(
      db,
      "resend_delivery",
      "msg_delivery_contract"
    );
    expect(applyResendDeliveryWebhookEvent).toHaveBeenCalledWith(db, {
      type: "email.delivered",
      data: { email_id: "email-contract" },
    });
  });

  it("rejects a delivery webhook signed with a different key", async () => {
    const configuredSecret = syntheticSigningSecret("configured-delivery");
    useDeliverySigningSecret(configuredSecret);

    const response = await deliveryAction({
      request: signedRequest({
        url: "http://localhost/api/webhooks/email-delivery",
        payload: {
          type: "email.delivered",
          data: { email_id: "email-contract" },
        },
        secret: syntheticSigningSecret("wrong-delivery"),
        messageId: "msg_delivery_invalid_contract",
      }),
      context: createLoadContext({ env: { DB: db } } as never) as never,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(reserveWebhookDelivery).not.toHaveBeenCalled();
    expect(applyResendDeliveryWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed delivery webhook with malformed JSON", async () => {
    const secret = syntheticSigningSecret("malformed-delivery");
    useDeliverySigningSecret(secret);

    const response = await deliveryAction({
      request: signedRequest({
        url: "http://localhost/api/webhooks/email-delivery",
        payload: "{not-json",
        secret,
        messageId: "msg_delivery_malformed_contract",
      }),
      context: createLoadContext({ env: { DB: db } } as never) as never,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(reserveWebhookDelivery).not.toHaveBeenCalled();
    expect(applyResendDeliveryWebhookEvent).not.toHaveBeenCalled();
  });

  it("ignores a duplicate delivery only after verifying its signature", async () => {
    const secret = syntheticSigningSecret("duplicate-delivery");
    useDeliverySigningSecret(secret);
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(false);

    const response = await deliveryAction({
      request: signedRequest({
        url: "http://localhost/api/webhooks/email-delivery",
        payload: {
          type: "email.delivered",
          data: { email_id: "email-duplicate-contract" },
        },
        secret,
        messageId: "msg_delivery_duplicate_contract",
      }),
      context: createLoadContext({ env: { DB: db } } as never) as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Duplicate webhook ignored",
    });
    expect(reserveWebhookDelivery).toHaveBeenCalledWith(
      db,
      "resend_delivery",
      "msg_delivery_duplicate_contract"
    );
    expect(applyResendDeliveryWebhookEvent).not.toHaveBeenCalled();
  });
});
