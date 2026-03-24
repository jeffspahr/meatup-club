import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELIVERY_WEBHOOK_EVENTS,
  ensureResendEmailSetup,
  maybeEnsureResendEmailSetup,
} from "./resend-setup.server";
import {
  getProviderWebhookConfig,
  upsertProviderWebhookConfig,
} from "./provider-webhooks.server";

vi.mock("./provider-webhooks.server", () => ({
  getProviderWebhookConfig: vi.fn(),
  upsertProviderWebhookConfig: vi.fn(),
}));

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("resend-setup.server", () => {
  const db = { prepare: vi.fn() } as never;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("skips bootstrap when the Resend API key is unavailable", async () => {
    const result = await maybeEnsureResendEmailSetup({
      db,
      resendApiKey: undefined,
    });

    expect(result).toEqual({
      configured: false,
      reason: "missing_api_key",
    });
    expect(getProviderWebhookConfig).not.toHaveBeenCalled();
  });

  it("skips bootstrap when delivery tracking is already configured", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue({
      provider: "resend",
      purpose: "delivery_status",
      webhookId: "wh_existing",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signingSecret: "whsec_existing",
      events: [...DELIVERY_WEBHOOK_EVENTS],
    });

    const result = await maybeEnsureResendEmailSetup({
      db,
      resendApiKey: "re_test",
    });

    expect(result).toEqual({
      configured: false,
      reason: "already_configured",
    });
  });

  it("creates the missing delivery webhook for the configured domain", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);
    const requests: Array<{ url: string; method: string; body: string | null }> = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      requests.push({
        url,
        method,
        body: typeof init?.body === "string" ? init.body : null,
      });

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "mail.meatup.club" }],
        });
      }

      if (url === "https://api.resend.com/webhooks" && method === "GET") {
        return jsonResponse({ data: [] });
      }

      if (url === "https://api.resend.com/webhooks" && method === "POST") {
        return jsonResponse({
          id: "wh_123",
          url: "https://meatup.club/api/webhooks/email-delivery",
          events: [...DELIVERY_WEBHOOK_EVENTS],
          signing_secret: "whsec_123",
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    const result = await ensureResendEmailSetup({
      db,
      resendApiKey: "re_test",
    });

    expect(result).toEqual({
      deliveryWebhookUrl: "https://meatup.club/api/webhooks/email-delivery",
      deliveryWebhookEvents: [...DELIVERY_WEBHOOK_EVENTS],
      domain: "mail.meatup.club",
    });
    expect(upsertProviderWebhookConfig).toHaveBeenCalledWith(db, {
      provider: "resend",
      purpose: "delivery_status",
      webhookId: "wh_123",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signingSecret: "whsec_123",
      events: [...DELIVERY_WEBHOOK_EVENTS],
    });
    expect(
      requests.find(
        (request) =>
          request.url === "https://api.resend.com/webhooks" &&
          request.method === "POST"
      )
    ).toMatchObject({
      body: JSON.stringify({
        endpoint: "https://meatup.club/api/webhooks/email-delivery",
        enabled: true,
        events: [...DELIVERY_WEBHOOK_EVENTS],
      }),
    });
  });

  it("reuses an existing matching webhook and falls back to the persisted signing secret", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue({
      provider: "resend",
      purpose: "delivery_status",
      webhookId: "wh_existing",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signingSecret: "whsec_existing",
      events: [...DELIVERY_WEBHOOK_EVENTS],
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "mail.meatup.club" }],
        });
      }

      if (url === "https://api.resend.com/webhooks" && method === "GET") {
        return jsonResponse({
          data: [
            {
              id: "wh_existing",
              endpoint: "https://meatup.club/api/webhooks/email-delivery",
              events: [...DELIVERY_WEBHOOK_EVENTS],
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    const result = await ensureResendEmailSetup({
      db,
      resendApiKey: "re_test",
    });

    expect(result).toEqual({
      deliveryWebhookUrl: "https://meatup.club/api/webhooks/email-delivery",
      deliveryWebhookEvents: [...DELIVERY_WEBHOOK_EVENTS],
      domain: "mail.meatup.club",
    });
    expect(upsertProviderWebhookConfig).toHaveBeenCalledWith(db, {
      provider: "resend",
      purpose: "delivery_status",
      webhookId: "wh_existing",
      endpoint: "https://meatup.club/api/webhooks/email-delivery",
      signingSecret: "whsec_existing",
      events: [...DELIVERY_WEBHOOK_EVENTS],
    });
  });

  it("deletes duplicate matching delivery webhooks before creating a replacement", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);
    const requests: Array<{ url: string; method: string }> = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      requests.push({ url, method });

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "mail.meatup.club" }],
        });
      }

      if (url === "https://api.resend.com/webhooks" && method === "GET") {
        return jsonResponse({
          data: [
            {
              id: "wh_old_1",
              endpoint: "https://meatup.club/api/webhooks/email-delivery",
              events: ["email.sent"],
            },
            {
              id: "wh_old_2",
              url: "https://meatup.club/api/webhooks/email-delivery",
              events: ["email.failed"],
            },
          ],
        });
      }

      if (
        (url === "https://api.resend.com/webhooks/wh_old_1" ||
          url === "https://api.resend.com/webhooks/wh_old_2") &&
        method === "DELETE"
      ) {
        return new Response(null, { status: 204 });
      }

      if (url === "https://api.resend.com/webhooks" && method === "POST") {
        return jsonResponse({
          id: "wh_new",
          endpoint: "https://meatup.club/api/webhooks/email-delivery",
          events: [...DELIVERY_WEBHOOK_EVENTS],
          signing_secret: "whsec_new",
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    await ensureResendEmailSetup({
      db,
      resendApiKey: "re_test",
    });

    expect(
      requests.filter((request) => request.method === "DELETE").map((request) => request.url)
    ).toEqual([
      "https://api.resend.com/webhooks/wh_old_1",
      "https://api.resend.com/webhooks/wh_old_2",
    ]);
    expect(
      requests.some(
        (request) =>
          request.url === "https://api.resend.com/webhooks" && request.method === "POST"
      )
    ).toBe(true);
  });

  it("throws a helpful error when the webhook list cannot be loaded", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "mail.meatup.club" }],
        });
      }

      if (url === "https://api.resend.com/webhooks" && method === "GET") {
        return new Response("gateway timeout", {
          status: 504,
          statusText: "Gateway Timeout",
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    await expect(
      ensureResendEmailSetup({
        db,
        resendApiKey: "re_test",
      })
    ).rejects.toThrow("Failed to load webhooks: gateway timeout");
  });

  it("throws when deleting a duplicate webhook fails", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "mail.meatup.club" }],
        });
      }

      if (url === "https://api.resend.com/webhooks" && method === "GET") {
        return jsonResponse({
          data: [
            {
              id: "wh_old_1",
              endpoint: "https://meatup.club/api/webhooks/email-delivery",
              events: ["email.sent"],
            },
          ],
        });
      }

      if (url === "https://api.resend.com/webhooks/wh_old_1" && method === "DELETE") {
        return new Response("", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    await expect(
      ensureResendEmailSetup({
        db,
        resendApiKey: "re_test",
      })
    ).rejects.toThrow("Failed to delete webhook wh_old_1: Internal Server Error");
  });

  it("throws a helpful error when the expected resend domain is missing", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "example.com" }],
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    await expect(
      ensureResendEmailSetup({
        db,
        resendApiKey: "re_test",
      })
    ).rejects.toThrow("Domain mail.meatup.club not found in Resend");
  });

  it("throws when Resend creates a webhook without a signing secret", async () => {
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "mail.meatup.club" }],
        });
      }

      if (url === "https://api.resend.com/webhooks" && method === "GET") {
        return jsonResponse({ data: [] });
      }

      if (url === "https://api.resend.com/webhooks" && method === "POST") {
        return jsonResponse({
          id: "wh_missing_secret",
          endpoint: "https://meatup.club/api/webhooks/email-delivery",
          events: [...DELIVERY_WEBHOOK_EVENTS],
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    await expect(
      ensureResendEmailSetup({
        db,
        resendApiKey: "re_test",
      })
    ).rejects.toThrow("Resend created a webhook without returning an id and signing secret");
  });

  it("retries rate-limited Resend calls before failing", async () => {
    vi.useFakeTimers();
    vi.mocked(getProviderWebhookConfig).mockResolvedValue(null);

    let createAttempts = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url === "https://api.resend.com/domains" && method === "GET") {
        return jsonResponse({
          data: [{ id: "dom_123", name: "mail.meatup.club" }],
        });
      }

      if (url === "https://api.resend.com/webhooks" && method === "GET") {
        return jsonResponse({ data: [] });
      }

      if (url === "https://api.resend.com/webhooks" && method === "POST") {
        createAttempts += 1;

        if (createAttempts === 1) {
          return new Response(
            JSON.stringify({
              statusCode: 429,
              message: "Too many requests",
              name: "rate_limit_exceeded",
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "retry-after": "1",
              },
            }
          );
        }

        return jsonResponse({
          id: "wh_retry",
          url: "https://meatup.club/api/webhooks/email-delivery",
          events: [...DELIVERY_WEBHOOK_EVENTS],
          signing_secret: "whsec_retry",
        });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }) as typeof fetch;

    const setupPromise = ensureResendEmailSetup({
      db,
      resendApiKey: "re_test",
    });

    await vi.advanceTimersByTimeAsync(1_000);

    const result = await setupPromise;

    expect(createAttempts).toBe(2);
    expect(result).toEqual({
      deliveryWebhookUrl: "https://meatup.club/api/webhooks/email-delivery",
      deliveryWebhookEvents: [...DELIVERY_WEBHOOK_EVENTS],
      domain: "mail.meatup.club",
    });
  });
});
