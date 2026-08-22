import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.admin.setup-resend";
import { requireAdmin } from "../lib/auth.server";
import { ensureResendEmailSetup } from "../lib/resend-setup.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/resend-setup.server", () => ({
  ensureResendEmailSetup: vi.fn(),
}));

function createContext(resendApiKey: string | undefined) {
  return {
    cloudflare: {
      env: {
        DB: { prepare: vi.fn() },
        RESEND_API_KEY: resendApiKey,
      },
    },
  } as any;
}

describe("admin Resend setup action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      email: "admin@example.com",
      status: "active",
      is_admin: 1,
    } as any);
  });

  it("propagates the admin authorization boundary before reading configuration", async () => {
    const unauthorized = new Response(null, {
      status: 302,
      headers: { Location: "/dashboard" },
    });
    vi.mocked(requireAdmin).mockRejectedValue(unauthorized);

    await expect(
      action({
        request: new Request("http://localhost/api/admin/setup-resend", {
          method: "POST",
        }),
        context: createContext("re_test_key"),
      })
    ).rejects.toBe(unauthorized);
    expect(ensureResendEmailSetup).not.toHaveBeenCalled();
  });

  it("returns a configuration error when the Resend API key is missing", async () => {
    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: createContext(undefined),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "RESEND_API_KEY is not configured",
    });
    expect(ensureResendEmailSetup).not.toHaveBeenCalled();
  });

  it("returns a stable error response when the provider setup fails", async () => {
    const context = createContext("re_test_key");
    vi.mocked(ensureResendEmailSetup).mockRejectedValue(
      new Error("Resend returned 503")
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context,
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Failed to configure Resend",
      details: "Resend returned 503",
    });
    expect(ensureResendEmailSetup).toHaveBeenCalledWith({
      db: context.cloudflare.env.DB,
      resendApiKey: "re_test_key",
    });
    expect(console.error).toHaveBeenCalledWith("Resend setup error", {
      message: "Resend returned 503",
    });
  });

  it("returns provider setup details on success", async () => {
    const context = createContext("re_test_key");
    const details = {
      domainId: "domain_123",
      webhookId: "webhook_123",
    };
    vi.mocked(ensureResendEmailSetup).mockResolvedValue(details as any);

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Resend delivery tracking configured successfully.",
      details,
    });
  });
});
