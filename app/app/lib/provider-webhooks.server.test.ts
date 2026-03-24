import { describe, expect, it, vi } from "vitest";
import {
  getProviderWebhookConfig,
  upsertProviderWebhookConfig,
} from "./provider-webhooks.server";

describe("provider-webhooks.server", () => {
  it("returns the parsed webhook config when a row exists", async () => {
    const first = vi.fn().mockResolvedValue({
      provider: "resend",
      purpose: "delivery_status",
      webhook_id: "wh_123",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signing_secret: "whsec_123",
      events_json: JSON.stringify(["email.sent", "email.delivered"]),
    });
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({ first })),
    }));

    const result = await getProviderWebhookConfig(
      { prepare } as never,
      "resend",
      "delivery_status"
    );

    expect(result).toEqual({
      provider: "resend",
      purpose: "delivery_status",
      webhookId: "wh_123",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signingSecret: "whsec_123",
      events: ["email.sent", "email.delivered"],
    });
  });

  it("returns null when the provider webhook row does not exist", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({ first })),
    }));

    await expect(
      getProviderWebhookConfig({ prepare } as never, "resend", "delivery_status")
    ).resolves.toBeNull();
  });

  it("returns null when the provider_webhooks table does not exist yet", async () => {
    const first = vi
      .fn()
      .mockRejectedValue(new Error("D1_ERROR: no such table: provider_webhooks"));
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({ first })),
    }));

    await expect(
      getProviderWebhookConfig({ prepare } as never, "resend", "delivery_status")
    ).resolves.toBeNull();
  });

  it("rethrows unexpected database errors", async () => {
    const first = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({ first })),
    }));

    await expect(
      getProviderWebhookConfig({ prepare } as never, "resend", "delivery_status")
    ).rejects.toThrow("database unavailable");
  });

  it("writes the webhook config with serialized events", async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));

    await upsertProviderWebhookConfig(
      { prepare } as never,
      {
        provider: "resend",
        purpose: "delivery_status",
        webhookId: "wh_456",
        endpoint: "https://meatup.club/api/webhooks/email-delivery",
        signingSecret: "whsec_456",
        events: ["email.sent", "email.delivered"],
      }
    );

    expect(bind).toHaveBeenCalledWith(
      "resend",
      "delivery_status",
      "wh_456",
      "https://meatup.club/api/webhooks/email-delivery",
      "whsec_456",
      JSON.stringify(["email.sent", "email.delivered"])
    );
    expect(run).toHaveBeenCalled();
  });
});
