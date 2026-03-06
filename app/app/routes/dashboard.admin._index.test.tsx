import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage, { loader } from "./dashboard.admin._index";
import { requireAdmin } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

describe("dashboard.admin._index route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
  });

  it("requires admin access in the loader", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard/admin"),
      context: { cloudflare: { env: {} } } as never,
      params: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("renders the admin navigation cards and maintenance link", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin"]}>
        <AdminPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Manage voting polls").closest("a")).toHaveAttribute("href", "/dashboard/admin/polls");
    expect(screen.getByText("Manage meetup events").closest("a")).toHaveAttribute("href", "/dashboard/admin/events");
    expect(screen.getByText("Manage invitation emails").closest("a")).toHaveAttribute("href", "/dashboard/admin/email-templates");
    expect(screen.getByRole("link", { name: /Backfill Opening Hours for Existing Restaurants/i })).toHaveAttribute("href", "/dashboard/admin/backfill-hours");
  });
});
