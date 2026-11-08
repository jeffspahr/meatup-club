import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "./+types/pending";
import PendingPage, { loader } from "./pending";
import { getUser } from "../lib/auth.server";
import { createLoadContext } from "~/lib/router-context";

vi.mock("../lib/auth.server", () => ({
  getUser: vi.fn(),
}));

describe("pending route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current user from the loader", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 12,
      email: "pending@example.com",
      name: "Pending User",
      status: "invited",
    } as never);

    const result = await loader({
      request: new Request("http://localhost/pending"),
      context: createLoadContext({ env: {} } as never) as never,
      params: {},
    } as never);

    expect(getUser).toHaveBeenCalled();
    expect(result).toEqual({
      user: {
        id: 12,
        email: "pending@example.com",
        name: "Pending User",
        status: "invited",
      },
    });
  });

  it("renders personalized pending copy and a sign-out button", () => {
    render(
      <MemoryRouter initialEntries={["/pending"]}>
        <PendingPage
          {...({
            loaderData: {
              user: {
                id: 12,
                email: "pending@example.com",
                name: "Pending User",
                status: "invited",
              },
            },
          } as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Account Pending")).toBeInTheDocument();
    expect(
      screen.getByText(/Thanks for signing in, Pending User! Your account is currently pending approval\./)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("explains inactive membership without promising approval", () => {
    render(
      <MemoryRouter initialEntries={["/pending"]}>
        <PendingPage
          {...({
            loaderData: {
              user: {
                id: 12,
                email: "inactive@example.com",
                name: "Inactive User",
                status: "inactive",
              },
            },
          } as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Account Inactive" })).toBeInTheDocument();
    expect(screen.getByText("Your club membership has been deactivated.")).toBeInTheDocument();
    expect(screen.getByText("Contact a club admin if you believe this was a mistake.")).toBeInTheDocument();
    expect(screen.queryByText(/pending approval/)).not.toBeInTheDocument();
    expect(screen.queryByText(/activate your account soon/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("renders fallback copy when the user has no name", () => {
    render(
      <MemoryRouter initialEntries={["/pending"]}>
        <PendingPage
          {...({
            loaderData: {
              user: {
                id: 13,
                email: "pending@example.com",
                name: null,
                status: "invited",
              },
            },
          } as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Thanks for signing in! Your account is currently pending approval\./)
    ).toBeInTheDocument();
  });
});
