import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminContentPage from "./dashboard.admin.content";
import type { Route } from "./+types/dashboard.admin.content";

let navigationState: { state: string; formData: FormData | null } = {
  state: "idle",
  formData: null,
};

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    useNavigation: () => navigationState,
  };
});

vi.mock("../lib/dateUtils", () => ({
  formatDateForDisplay: vi.fn(() => "May 1, 2026"),
}));

function renderPage(
  loaderData: Route.ComponentProps["loaderData"],
  actionData?: Route.ComponentProps["actionData"]
) {
  return render(
    <MemoryRouter initialEntries={["/dashboard/admin/content"]}>
      <AdminContentPage
        {...(({ loaderData, actionData } as unknown) as Route.ComponentProps)}
      />
    </MemoryRouter>
  );
}

describe("dashboard.admin.content route UI state", () => {
  const loaderData = {
    content: [
      {
        id: 1,
        key: "about",
        title: "About",
        content: "# Welcome\n\n- First rule",
        updated_at: "2026-05-01T12:00:00.000Z",
      },
    ],
  } as unknown as Route.ComponentProps["loaderData"];

  beforeEach(() => {
    vi.clearAllMocks();
    navigationState = { state: "idle", formData: null };
  });

  it("submits the edited content while previewing and after returning to edit", () => {
    renderPage(loaderData);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const text = "# Changed\n\nPreview this before saving.";
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const form = screen.getByRole("button", { name: "Save Changes" }).closest("form")!;
    expect(new FormData(form).getAll("content")).toEqual([text]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox")).toHaveValue(text);
    expect(new FormData(form).getAll("content")).toEqual([text]);
  });

  it("closes the editor after a successful update submission cycle", () => {
    const view = renderPage(loaderData);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Updated content" } });

    const formData = new FormData();
    formData.set("_action", "update");
    navigationState = { state: "submitting", formData };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/content"]}>
        <AdminContentPage
          {...(({ loaderData, actionData: undefined } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    navigationState = { state: "idle", formData: null };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/content"]}>
        <AdminContentPage
          {...(({ loaderData, actionData: undefined } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    expect(screen.getByText("Last updated: May 1, 2026")).toBeInTheDocument();
  });

  it("keeps the editor open after an update error and supports preview plus cancel", () => {
    const view = renderPage(loaderData);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("First rule")).toBeInTheDocument();

    const formData = new FormData();
    formData.set("_action", "update");
    navigationState = { state: "submitting", formData };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/content"]}>
        <AdminContentPage
          {...(({ loaderData, actionData: undefined } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    navigationState = { state: "idle", formData: null };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/content"]}>
        <AdminContentPage
          {...(({ loaderData, actionData: { error: "Failed to update content" } } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Failed to update content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  });
});
