import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAnnouncementsPage, { loader } from "./dashboard.admin.announcements";
import type { Route } from "./+types/dashboard.admin.announcements";
import { requireAdmin } from "../lib/auth.server";
import { confirmAction } from "../lib/confirm.client";

let navigationState: { state: string } = { state: "idle" };

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    useNavigation: () => navigationState,
  };
});

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/confirm.client", () => ({
  confirmAction: vi.fn(),
}));

function createMockDb(
  members: Array<{ id: number; name: string | null; email: string }> = [
    { id: 1, name: "Alpha", email: "alpha@example.com" },
    { id: 2, name: "Bravo", email: "bravo@example.com" },
  ]
) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    if (
      normalizedSql.includes("SELECT id, name, email") &&
      normalizedSql.includes("FROM users") &&
      normalizedSql.includes("WHERE status = 'active'")
    ) {
      return {
        all: vi.fn().mockResolvedValue({ results: members }),
      };
    }

    throw new Error(`Unexpected query: ${normalizedSql}`);
  });

  return { prepare };
}

function renderPage(
  loaderData: Route.ComponentProps["loaderData"],
  actionData?: Route.ComponentProps["actionData"]
) {
  return render(
    <MemoryRouter initialEntries={["/dashboard/admin/announcements"]}>
      <AdminAnnouncementsPage
        {...(({ loaderData, actionData } as unknown) as Route.ComponentProps)}
      />
    </MemoryRouter>
  );
}

describe("dashboard.admin.announcements loader and UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState = { state: "idle" };
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 99,
      name: "Admin User",
      email: "admin@example.com",
      is_admin: 1,
      status: "active",
    } as never);
    vi.mocked(confirmAction).mockReturnValue(true);
  });

  it("loads the admin identity, drafts, and active members", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/announcements"),
      context: {
        cloudflare: {
          env: {
            DB: createMockDb(),
          },
        },
      } as never,
      params: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(result.admin).toEqual({
      id: 99,
      email: "admin@example.com",
      name: "Admin User",
    });
    expect(result.members).toEqual([
      { id: 1, name: "Alpha", email: "alpha@example.com" },
      { id: 2, name: "Bravo", email: "bravo@example.com" },
    ]);
    expect(result.drafts.length).toBeGreaterThan(0);
  });

  it("loads a draft, toggles preview, and lets the user target selected members", () => {
    renderPage({
      admin: {
        id: 99,
        email: "admin@example.com",
        name: "Admin User",
      },
      drafts: [
        {
          id: "incident",
          title: "Incident Draft",
          description: "Used for postmortems",
          subject: "Incident update",
          messageText: "# Incident\n\nPlease review the details.",
        },
      ],
      members: [
        { id: 1, name: "Alpha", email: "alpha@example.com" },
        { id: 2, name: "Bravo", email: "bravo@example.com" },
      ],
    } as never);

    fireEvent.click(screen.getByRole("button", { name: "Load Draft" }));

    expect(screen.getByLabelText("Subject")).toHaveValue("Incident update");
    expect(screen.getByLabelText("Message")).toHaveValue(
      "# Incident\n\nPlease review the details."
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("heading", { name: "Incident" })).toBeInTheDocument();
    expect(screen.getByText("Please review the details.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Selected members/i }));

    expect(screen.getByText("0 selected members")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Bravo/i }));

    expect(screen.getByText("2 selected members")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to 2 members" })).toBeInTheDocument();
  });

  it("uses the confirmation guard before submit and prevents submission when declined", () => {
    vi.mocked(confirmAction).mockReturnValue(false);

    renderPage(
      {
        admin: {
          id: 99,
          email: "admin@example.com",
          name: "Admin User",
        },
        drafts: [],
        members: [{ id: 1, name: "Alpha", email: "alpha@example.com" }],
      } as never,
      { error: "Something went wrong" } as never
    );

    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Important update" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Hello members" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Just me \(test\)/i }));

    const form = screen.getByRole("button", { name: "Send to 1 member" }).closest("form");
    expect(form).not.toBeNull();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    const submitEvent = createEvent.submit(form!);
    fireEvent(form!, submitEvent);

    expect(confirmAction).toHaveBeenCalledWith("Send this announcement to just you at admin@example.com?");
    expect(submitEvent.defaultPrevented).toBe(true);
  });
});
