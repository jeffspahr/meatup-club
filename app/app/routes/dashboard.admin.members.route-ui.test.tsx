import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminMembersPage, { loader } from "./dashboard.admin.members";
import type { Route } from "./+types/dashboard.admin.members";
import { requireAdmin } from "../lib/auth.server";

let navigationState: { state: string; formData: FormData | null } = {
  state: "idle",
  formData: null,
};
const submitSpy = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    useNavigation: () => navigationState,
    useSubmit: () => submitSpy,
  };
});

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    formatDateForDisplay: vi.fn((value: string) => `formatted:${value}`),
  };
});

type MockDbOptions = {
  members?: Array<Record<string, unknown>>;
  templates?: Array<Record<string, unknown>>;
};

function createMockDb({
  members = [],
  templates = [],
}: MockDbOptions = {}) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const allForArgs = async () => {
      if (normalizedSql === "SELECT * FROM users ORDER BY created_at DESC") {
        return { results: members };
      }

      if (normalizedSql === "SELECT id, name, is_default FROM email_templates ORDER BY is_default DESC, name ASC") {
        return { results: templates };
      }

      throw new Error(`Unexpected all() query: ${normalizedSql}`);
    };

    return {
      all: () => allForArgs(),
    };
  });

  return { prepare };
}

describe("dashboard.admin.members loader and UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitSpy.mockReset();
    navigationState = { state: "idle", formData: null };
    vi.unstubAllGlobals();

    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin User",
    } as never);
  });

  it("loads members and invite templates for admins", async () => {
    const db = createMockDb({
      members: [
        { id: 7, email: "member@example.com", created_at: "2026-03-01T00:00:00.000Z" },
      ],
      templates: [{ id: 1, name: "Default Invite", is_default: 1 }],
    });

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/members"),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(result.members).toEqual([
      expect.objectContaining({ id: 7, email: "member@example.com" }),
    ]);
    expect(result.templates).toEqual([
      expect.objectContaining({ id: 1, name: "Default Invite", is_default: 1 }),
    ]);
  });

  it("renders invite warnings and toggles the invite form with the default template selected", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin/members"]}>
        <AdminMembersPage
          {...(({
            loaderData: {
              members: [],
              templates: [
                { id: 1, name: "Default Invite", is_default: 1 },
                { id: 2, name: "Alternate Invite", is_default: 0 },
              ],
            },
            actionData: {
              warning: "User invited but email failed to send. Share the invite link manually.",
              inviteLink: "http://localhost/accept-invite?email=member%40example.com",
            },
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/User invited but email failed to send/i)).toBeInTheDocument();
    expect(screen.getByText("http://localhost/accept-invite?email=member%40example.com")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invite New User" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\+ Invite User/i }));

    expect(screen.getByRole("heading", { name: "Invite New User" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email *")).toHaveValue("");
    expect(screen.getByLabelText("Name (Optional)")).toHaveValue("");
    expect(screen.getByLabelText("Email Template")).toHaveValue("1");
    expect(screen.getByRole("link", { name: "Manage templates" })).toHaveAttribute(
      "href",
      "/dashboard/admin/email-templates"
    );
  });

  it("supports edit reset plus re-login and delete submit wiring", () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    const baseProps = {
      loaderData: {
        members: [
          {
            id: 7,
            name: "Member One",
            email: "member@example.com",
            picture: null,
            is_admin: 1,
            status: "active",
            phone_number: "+15551234567",
            sms_opt_in: 1,
            sms_opt_out_at: null,
            sms_opt_out_source: null,
            created_at: "2026-03-01T00:00:00.000Z",
          },
          {
            id: 8,
            name: null,
            email: "invitee@example.com",
            picture: null,
            is_admin: 0,
            status: "invited",
            phone_number: "+15557654321",
            sms_opt_in: 0,
            sms_opt_out_at: "2026-03-03T00:00:00.000Z",
            sms_opt_out_source: "sms",
            created_at: "2026-03-02T00:00:00.000Z",
          },
        ],
        templates: [{ id: 1, name: "Default Invite", is_default: 1 }],
      },
      actionData: undefined,
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={["/dashboard/admin/members"]}>
        <AdminMembersPage {...((baseProps as unknown) as Route.ComponentProps)} />
      </MemoryRouter>
    );

    expect(screen.getByText("Member One")).toBeInTheDocument();
    expect(screen.getByText("No name")).toBeInTheDocument();
    expect(screen.getByText("formatted:2026-03-01T00:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("formatted:2026-03-02T00:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);

    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Member One")).toBeInTheDocument();
    const roleSelect = document.querySelector('select[name="is_admin"]');
    expect(roleSelect).not.toBeNull();
    expect(roleSelect as unknown as HTMLSelectElement).toHaveValue("true");

    const updateFormData = new FormData();
    updateFormData.set("_action", "update");
    navigationState = { state: "submitting", formData: updateFormData };

    rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/members"]}>
        <AdminMembersPage {...((baseProps as unknown) as Route.ComponentProps)} />
      </MemoryRouter>
    );

    navigationState = { state: "idle", formData: null };

    rerender(
      <MemoryRouter initialEntries={["/dashboard/admin/members"]}>
        <AdminMembersPage {...((baseProps as unknown) as Route.ComponentProps)} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Re-login" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);

    expect(confirmSpy).toHaveBeenNthCalledWith(
      1,
      "Force Member One to re-login? Their session will be invalidated and they'll need to sign in again with Google OAuth."
    );
    expect(confirmSpy).toHaveBeenNthCalledWith(
      2,
      "Are you sure you want to remove this member? This will also delete all their votes and suggestions."
    );
    expect(submitSpy).toHaveBeenNthCalledWith(
      1,
      expect.any(FormData),
      { method: "post" }
    );
    expect((submitSpy.mock.calls[0]?.[0] as FormData).get("_action")).toBe("force_reauth");
    expect((submitSpy.mock.calls[0]?.[0] as FormData).get("user_id")).toBe("7");
    expect((submitSpy.mock.calls[1]?.[0] as FormData).get("_action")).toBe("delete");
    expect((submitSpy.mock.calls[1]?.[0] as FormData).get("user_id")).toBe("7");
  });

  it("shows each member's operational SMS eligibility without exposing phone numbers", () => {
    const memberDefaults = {
      picture: null,
      is_admin: 0,
      status: "active",
      created_at: "2026-03-01T00:00:00.000Z",
    };

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/members"]}>
        <AdminMembersPage
          {...(({
            loaderData: {
              members: [
                {
                  ...memberDefaults,
                  id: 1,
                  name: "Enabled Member",
                  email: "enabled@example.com",
                  phone_number: "+15550000001",
                  sms_opt_in: 1,
                  sms_opt_out_at: null,
                  sms_opt_out_source: null,
                },
                {
                  ...memberDefaults,
                  id: 2,
                  name: "Text Opt Out",
                  email: "text-opt-out@example.com",
                  phone_number: "+15550000002",
                  sms_opt_in: 0,
                  sms_opt_out_at: "2026-03-02T00:00:00.000Z",
                  sms_opt_out_source: "sms",
                },
                {
                  ...memberDefaults,
                  id: 3,
                  name: "Profile Opt Out",
                  email: "profile-opt-out@example.com",
                  phone_number: "+15550000003",
                  sms_opt_in: 0,
                  sms_opt_out_at: "2026-03-02T00:00:00.000Z",
                  sms_opt_out_source: "profile",
                },
                {
                  ...memberDefaults,
                  id: 4,
                  name: "No Consent",
                  email: "no-consent@example.com",
                  phone_number: "+15550000004",
                  sms_opt_in: 0,
                  sms_opt_out_at: null,
                  sms_opt_out_source: null,
                },
                {
                  ...memberDefaults,
                  id: 5,
                  name: "No Number",
                  email: "no-number@example.com",
                  phone_number: null,
                  sms_opt_in: 0,
                  sms_opt_out_at: null,
                  sms_opt_out_source: null,
                },
              ],
              templates: [],
            },
            actionData: undefined,
          } as unknown) as Route.ComponentProps)}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("SMS: Enabled. Eligible.")).toBeInTheDocument();
    expect(screen.getByLabelText("SMS: Opted out. By text.")).toBeInTheDocument();
    expect(screen.getByLabelText("SMS: Opted out. In profile.")).toBeInTheDocument();
    expect(screen.getByLabelText("SMS: Not enabled. No consent.")).toBeInTheDocument();
    expect(screen.getByLabelText("SMS: No number. Not eligible.")).toBeInTheDocument();
    expect(screen.queryByText("+15550000001")).not.toBeInTheDocument();

    const main = screen.getByRole("main");
    const table = screen.getByRole("table");
    expect(main).toHaveClass("page-main-wide");
    expect(table).toHaveClass("w-full", "min-w-[72rem]");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
  });
});
