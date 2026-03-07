import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminEmailTemplatesPage from "./dashboard.admin.email-templates";
import type { Route } from "./+types/dashboard.admin.email-templates";

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

function renderPage(
  loaderData: Route.ComponentProps["loaderData"],
  actionData?: Route.ComponentProps["actionData"]
) {
  return render(
    <MemoryRouter initialEntries={["/dashboard/admin/email-templates"]}>
      <AdminEmailTemplatesPage
        {...(({ loaderData, actionData } as unknown) as Route.ComponentProps)}
      />
    </MemoryRouter>
  );
}

describe("dashboard.admin.email-templates route UI state", () => {
  const loaderData = {
    templates: [
      {
        id: 1,
        name: "Default Invite",
        subject: "Welcome",
        html_body: "<p>Hello</p>",
        text_body: "Hello",
        is_default: 1,
        updated_at: "2026-05-01T12:00:00.000Z",
      },
      {
        id: 2,
        name: "Alternate Invite",
        subject: "Custom",
        html_body: "<p>Custom</p>",
        text_body: "Custom text",
        is_default: 0,
        updated_at: "2026-05-02T12:00:00.000Z",
      },
    ],
  } as unknown as Route.ComponentProps["loaderData"];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    navigationState = { state: "idle", formData: null };
  });

  it("closes the create form after a successful create submission cycle", () => {
    const view = renderPage(loaderData);

    fireEvent.click(screen.getByRole("button", { name: /\+ New Template/i }));
    fireEvent.change(screen.getByLabelText("Template Name *"), {
      target: { value: "Fresh Template" },
    });
    fireEvent.change(screen.getByLabelText("Email Subject *"), {
      target: { value: "Fresh Subject" },
    });

    const formData = new FormData();
    formData.set("_action", "create");
    navigationState = { state: "submitting", formData };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/email-templates"]}>
        <AdminEmailTemplatesPage
          {...(({ loaderData, actionData: undefined } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    navigationState = { state: "idle", formData: null };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/email-templates"]}>
        <AdminEmailTemplatesPage
          {...(({ loaderData, actionData: undefined } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole("heading", { name: "Create New Template" })).not.toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("keeps the edit form open after an update error and respects delete confirmation", () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);

    const view = renderPage(loaderData);

    expect(screen.getAllByRole("button", { name: "Set as Default" })).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    fireEvent.change(screen.getByLabelText("Template Name *"), {
      target: { value: "Alternate Invite Updated" },
    });
    fireEvent.change(screen.getByLabelText("HTML Body *"), {
      target: { value: "<p>Alternate Invite Updated</p>" },
    });
    fireEvent.change(screen.getByLabelText("Plain Text Body *"), {
      target: { value: "Alternate Invite Updated" },
    });
    fireEvent.click(screen.getByLabelText("Set as default template"));
    expect(screen.getByLabelText("Set as default template")).toBeChecked();

    const formData = new FormData();
    formData.set("_action", "update");
    navigationState = { state: "submitting", formData };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/email-templates"]}>
        <AdminEmailTemplatesPage
          {...(({ loaderData, actionData: undefined } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    navigationState = { state: "idle", formData: null };
    view.rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/email-templates"]}>
        <AdminEmailTemplatesPage
          {...(({ loaderData, actionData: { error: "Failed to save template" } } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Failed to save template")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Template" })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Alternate Invite Updated")).toHaveLength(2);
    expect(screen.getByDisplayValue("<p>Alternate Invite Updated</p>")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Preview Template")[1]!);
    expect(screen.getAllByText("Plain Text:")).toHaveLength(2);
    expect(screen.getByText("Alternate Invite Updated")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith("Are you sure you want to delete this template?");
  });
});
