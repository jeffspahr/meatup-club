import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.webhooks.email-delivery";
import { applyResendDeliveryWebhookEvent } from "../lib/event-email-delivery.server";
import { getProviderWebhookConfig } from "../lib/provider-webhooks.server";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { createLoadContext } from "~/lib/router-context";

let mockVerify = vi.fn();

vi.mock("svix", () => ({
  Webhook: class MockWebhook {
    constructor(private readonly secret: string) {}

    verify(body: string, headers: Record<string, string>) {
      return mockVerify(body, headers, this.secret);
    }
  },
}));

vi.mock("../lib/provider-webhooks.server", () => ({
  getProviderWebhookConfig: vi.fn(),
}));

vi.mock("../lib/event-email-delivery.server", () => ({
  applyResendDeliveryWebhookEvent: vi.fn(),
}));

vi.mock("../lib/webhook-idempotency.server", () => ({
  reserveWebhookDelivery: vi.fn(),
}));

function createRequest(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/webhooks/email-delivery", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": "msg_123",
      "svix-timestamp": "1234567890",
      "svix-signature": "v1,signature",
    },
    body: JSON.stringify(payload),
  });
}

describe("api.webhooks.email-delivery", () => {
  const db = {
    prepare: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify = vi.fn((body: string) => JSON.parse(body));
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(true);
    vi.mocked(applyResendDeliveryWebhookEvent).mockResolvedValue({
      handled: true,
      updated: true,
    });
  });

  it("returns 500 when no delivery webhook secret is configured", async () => {
    const response = await action({
      request: createRequest({ type: "email.delivered", data: { email_id: "email-123" } }),
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_DELIVERY_WEBHOOK_SECRET: undefined,
          },
        } as never) as never,
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook not configured",
    });
  });

  it("ignores duplicate webhook deliveries", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue({
      provider: "resend",
      purpose: "delivery_status",
      webhookId: "wh_123",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signingSecret: "stored-secret",
      events: ["email.delivered"],
    });
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(false);

    const response = await action({
      request: createRequest({ type: "email.delivered", data: { email_id: "email-123" } }),
      context: createLoadContext({
          env: {
            DB: db,
          },
        } as never) as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Duplicate webhook ignored",
    });
    expect(applyResendDeliveryWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns an ignored message for unsupported events", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue({
      provider: "resend",
      purpose: "delivery_status",
      webhookId: "wh_123",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signingSecret: "stored-secret",
      events: ["email.delivered"],
    });
    vi.mocked(applyResendDeliveryWebhookEvent).mockResolvedValue({
      handled: false,
      updated: false,
    });

    const response = await action({
      request: createRequest({ type: "email.opened", data: { email_id: "email-123" } }),
      context: createLoadContext({
          env: {
            DB: db,
          },
        } as never) as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Ignored: unsupported delivery event type",
    });
  });

  it("verifies with the env fallback secret and records supported events", async () => {
    const response = await action({
      request: createRequest({ type: "email.delivered", data: { email_id: "email-123" } }),
      context: createLoadContext({
          env: {
            DB: db,
            RESEND_DELIVERY_WEBHOOK_SECRET: "env-secret",
          },
        } as never) as never,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Delivery state updated",
    });
    expect(reserveWebhookDelivery).toHaveBeenCalledWith(db, "resend_delivery", "msg_123");
    expect(applyResendDeliveryWebhookEvent).toHaveBeenCalledWith(db, {
      type: "email.delivered",
      data: { email_id: "email-123" },
    });
  });
});
