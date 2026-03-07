import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Route } from "./+types/dashboard";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout, { ErrorBoundary, loader } from "./dashboard";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    Outlet: () => <div data-testid="dashboard-outlet" />,
  };
});

describe("dashboard route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 1,
      email: "member@example.com",
      is_admin: 1,
      status: "active",
      name: "Member",
    } as never);
  });

  it("loads the active user for the dashboard shell", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard"),
      context: { cloudflare: { env: {} } } as never,
      params: {},
    } as never);

    expect(requireActiveUser).toHaveBeenCalled();
    expect(result).toEqual({
      user: expect.objectContaining({
        id: 1,
        email: "member@example.com",
        is_admin: 1,
      }),
    });
  });

  it("renders the dashboard shell with the admin nav and nested outlet", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin"]}>
        <DashboardLayout
          {...({
            loaderData: {
              user: {
                id: 1,
                email: "admin@example.com",
                is_admin: 1,
                status: "active",
                name: "Admin",
              },
            },
          } as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-outlet")).toBeInTheDocument();
  });

  it("renders a 404 error boundary state", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/missing"]}>
        <ErrorBoundary
          {...({
            error: {
              status: 404,
              statusText: "Not Found",
              data: null,
              internal: false,
            },
          } as Route.ErrorBoundaryProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("Not Found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  it("renders a generic error boundary state and supports retry", () => {
    const reloadSpy = vi.spyOn(window.location, "reload").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <ErrorBoundary
          {...({
            error: new Error("Something exploded"),
          } as Route.ErrorBoundaryProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(
        import.meta.env.DEV
          ? "Something exploded"
          : "An unexpected error occurred. Please try again."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(reloadSpy).toHaveBeenCalled();
    reloadSpy.mockRestore();
  });
});
