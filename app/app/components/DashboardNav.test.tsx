import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import DashboardNav from "./DashboardNav";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => (
      <form {...props}>{children}</form>
    ),
  };
});

function renderNav(pathname: string, isAdmin: boolean) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <DashboardNav isAdmin={isAdmin} />
    </MemoryRouter>
  );
}

describe("DashboardNav", () => {
  it("marks the current route as active and shows the admin link for admins", () => {
    renderNav("/dashboard/events/123", true);

    expect(screen.getByRole("link", { name: "Events" })).toHaveClass("nav-link-active");
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });

  it("toggles the mobile menu and closes it after a mobile navigation click", async () => {
    renderNav("/dashboard", false);

    expect(screen.getAllByRole("link", { name: "Profile" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getAllByRole("link", { name: "Profile" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("link", { name: "Profile" })[1]);

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "Profile" })).toHaveLength(1);
    });
  });
});
