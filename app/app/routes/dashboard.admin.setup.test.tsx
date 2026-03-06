import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminSetupPage, { action, loader } from "./dashboard.admin.setup";
import { requireAdmin } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  };
});

describe("dashboard.admin.setup route", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requires admin access in the loader", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/setup"),
      context: { cloudflare: { env: {} } } as never,
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("requires admin access and forwards setup requests to the API endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        message: "Configured",
      }),
    } as never);

    const formData = new FormData();
    formData.set("_action", "setup-resend");

    const request = new Request("http://localhost/dashboard/admin/setup", {
      method: "POST",
      body: formData,
      headers: { Cookie: "session=abc" },
    });

    const result = await action({
      request,
      context: { cloudflare: { env: {} } } as never,
    } as never);

    expect(requireAdmin).toHaveBeenCalledWith(request, expect.anything());
    expect(global.fetch).toHaveBeenCalledWith(
      new URL("/api/admin/setup-resend", request.url),
      {
        method: "POST",
        headers: request.headers,
      }
    );
    expect(result).toEqual({ success: true, message: "Configured" });
  });

  it("returns an error for unknown actions", async () => {
    const formData = new FormData();
    formData.set("_action", "nope");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/setup", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: {} } } as never,
    } as never);

    expect(result).toEqual({ error: "Invalid action" });
  });

  it("renders success details and toggles the loading button state on submit", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/setup"]}>
        <AdminSetupPage
          actionData={{
            success: true,
            message: "Configured",
            details: {
              email: "rsvp@mail.meatup.club",
              forwardsTo: "https://meatup.club/api/webhook",
              domain: "mail.meatup.club",
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getAllByText("rsvp@mail.meatup.club")).toHaveLength(2);

    fireEvent.submit(screen.getByRole("button", { name: "Configure Resend Inbound Email" }).closest("form")!);

    expect(screen.getByRole("button", { name: "Configuring..." })).toBeDisabled();
  });

  it("renders error details and available domains", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/setup"]}>
        <AdminSetupPage
          actionData={{
            success: false,
            error: "Setup failed",
            details: { code: 500 },
            availableDomains: ["mail.meatup.club", "example.com"],
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Setup failed")).toBeInTheDocument();
    expect(screen.getByText("mail.meatup.club")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });
});
