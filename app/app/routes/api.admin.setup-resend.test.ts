import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.admin.setup-resend";
import { requireAdmin } from "../lib/auth.server";
import { ensureResendEmailSetup } from "../lib/resend-setup.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/resend-setup.server", () => ({
  ensureResendEmailSetup: vi.fn(),
}));

describe("api.admin.setup-resend route", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      email: "admin@example.com",
      is_admin: 1,
      status: "active",
    } as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns a 500 response when the API key is missing", async () => {
    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: createLoadContext({
          env: {},
        } as never) as never,
    });

    expect(requireAdmin).toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "RESEND_API_KEY is not configured",
    });
    expect(ensureResendEmailSetup).not.toHaveBeenCalled();
  });

  it("returns the configured webhook details on success", async () => {
    vi.mocked(ensureResendEmailSetup).mockResolvedValue({
      deliveryWebhookUrl: "https://meatup.club/api/webhooks/email-delivery",
      deliveryWebhookEvents: ["email.sent", "email.delivered"],
      domain: "mail.meatup.club",
    });

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: createLoadContext({
          env: { RESEND_API_KEY: "resend-key" },
        } as never) as never,
    });

    expect(requireAdmin).toHaveBeenCalled();
    expect(ensureResendEmailSetup).toHaveBeenCalledWith({
      db: undefined,
      resendApiKey: "resend-key",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Resend delivery tracking configured successfully.",
      details: {
        deliveryWebhookUrl: "https://meatup.club/api/webhooks/email-delivery",
        deliveryWebhookEvents: ["email.sent", "email.delivered"],
        domain: "mail.meatup.club",
      },
    });
  });

  it("returns a 500 response when setup fails", async () => {
    vi.mocked(ensureResendEmailSetup).mockRejectedValue(
      new Error("Failed to fetch domains from Resend: invalid api key")
    );

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: createLoadContext({
          env: { RESEND_API_KEY: "resend-key" },
        } as never) as never,
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Failed to configure Resend",
      details: "Failed to fetch domains from Resend: invalid api key",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "resend_setup_failed",
      errorName: "Error",
    });
  });
});
