import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.admin.setup-resend";
import { requireAdmin } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

function jsonResponse(data: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as never;
}

describe("api.admin.setup-resend route", () => {
  let originalFetch: typeof global.fetch;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      email: "admin@example.com",
      is_admin: 1,
      status: "active",
    } as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("returns a 500 response when the domain lookup fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "invalid api key",
    } as never);

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: { RESEND_API_KEY: "resend-key" },
        },
      } as never,
    });

    expect(requireAdmin).toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Failed to fetch domains from Resend",
      details: "invalid api key",
    });
  });

  it("returns a 404 response when the target domain does not exist", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "dom_1", name: "example.com" },
          { id: "dom_2", name: "meat.example" },
        ],
      })
    );

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: { RESEND_API_KEY: "resend-key" },
        },
      } as never,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Domain mail.meatup.club not found in Resend",
      availableDomains: ["example.com", "meat.example"],
    });
  });

  it("returns success without creating a route when the correct route already exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "dom_1", name: "mail.meatup.club" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "route_1",
              pattern: "rsvp",
              forward_to: "https://meatup.club/api/webhooks/email-rsvp",
            },
          ],
        })
      );
    global.fetch = fetchMock as never;

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: { RESEND_API_KEY: "resend-key" },
        },
      } as never,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Inbound route already configured correctly",
      route: {
        id: "route_1",
        pattern: "rsvp",
        forward_to: "https://meatup.club/api/webhooks/email-rsvp",
      },
    });
  });

  it("replaces a stale route and returns the new route details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "dom_1", name: "mail.meatup.club" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "route_old",
              pattern: "rsvp",
              forward_to: "https://old.example/webhook",
            },
          ],
        })
      )
      .mockResolvedValueOnce({ ok: true } as never)
      .mockResolvedValueOnce(
        jsonResponse({
          id: "route_new",
          pattern: "rsvp",
          forward_to: "https://meatup.club/api/webhooks/email-rsvp",
        })
      );
    global.fetch = fetchMock as never;

    const response = await action({
      request: new Request("http://localhost/api/admin/setup-resend", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: { RESEND_API_KEY: "resend-key" },
        },
      } as never,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.resend.com/domains/dom_1/inbound-routes/route_old",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer resend-key",
        },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.resend.com/domains/dom_1/inbound-routes",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer resend-key",
          "Content-Type": "application/json",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Inbound email route configured successfully!",
      route: {
        id: "route_new",
        pattern: "rsvp",
        forward_to: "https://meatup.club/api/webhooks/email-rsvp",
      },
      details: {
        email: "rsvp@mail.meatup.club",
        forwardsTo: "https://meatup.club/api/webhooks/email-rsvp",
        domain: "mail.meatup.club",
      },
    });
  });
});
