import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminEmailTemplatesPage, { action, loader } from "./dashboard.admin.email-templates";
import { requireAdmin } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    useNavigation: () => ({ state: "idle", formData: null }),
  };
});

function createMockDb({
  templates = [
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
      text_body: "Custom",
      is_default: 0,
      updated_at: "2026-05-02T12:00:00.000Z",
    },
  ],
  deleteTemplate = { is_default: 0 },
  shouldFail = false,
}: {
  templates?: Array<Record<string, unknown>>;
  deleteTemplate?: Record<string, unknown> | null;
  shouldFail?: boolean;
} = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async () => {
      if (normalizedSql === "SELECT is_default FROM email_templates WHERE id = ?") {
        return deleteTemplate;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      if (shouldFail) {
        throw new Error("DB failure");
      }

      runCalls.push({ sql: normalizedSql, bindArgs });
      return { meta: { changes: 1 } };
    };

    return {
      all: async () => ({ results: templates }),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
}

describe("dashboard.admin.email-templates route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
  });

  it("loads templates ordered by default status", async () => {
    const db = createMockDb();

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/email-templates"),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result.templates).toHaveLength(2);
    expect(result.templates[0]).toEqual(expect.objectContaining({ is_default: 1 }));
  });

  it("requires all fields when creating or updating a template", async () => {
    const formData = new FormData();
    formData.set("_action", "create");
    formData.set("name", "Template");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/email-templates", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: createMockDb() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "All fields are required" });
  });

  it("creates a default template after clearing existing defaults", async () => {
    const db = createMockDb();
    const formData = new FormData();
    formData.set("_action", "create");
    formData.set("name", "New Template");
    formData.set("subject", "Hello");
    formData.set("html_body", "<p>Hello</p>");
    formData.set("text_body", "Hello");
    formData.set("is_default", "true");

    const response = await action({
      request: new Request("http://localhost/dashboard/admin/email-templates", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE email_templates SET is_default = 0",
        bindArgs: [],
      },
      {
        sql: "INSERT INTO email_templates (name, subject, html_body, text_body, is_default) VALUES (?, ?, ?, ?, ?)",
        bindArgs: ["New Template", "Hello", "<p>Hello</p>", "Hello", 1],
      },
    ]);
  });

  it("prevents deleting the default template", async () => {
    const db = createMockDb({ deleteTemplate: { is_default: 1 } });
    const formData = new FormData();
    formData.set("_action", "delete");
    formData.set("id", "1");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/email-templates", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Cannot delete the default template" });
  });

  it("sets a new default template", async () => {
    const db = createMockDb();
    const formData = new FormData();
    formData.set("_action", "set_default");
    formData.set("id", "2");

    const response = await action({
      request: new Request("http://localhost/dashboard/admin/email-templates", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE email_templates SET is_default = 0",
        bindArgs: [],
      },
      {
        sql: "UPDATE email_templates SET is_default = 1 WHERE id = ?",
        bindArgs: ["2"],
      },
    ]);
  });

  it("renders the create and edit template forms", () => {
    const props = {
      loaderData: {
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
        ],
      },
      actionData: undefined,
    } as any;

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/email-templates"]}>
        <AdminEmailTemplatesPage {...props} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ New Template/i }));
    expect(screen.getByRole("heading", { name: "Create New Template" })).toBeInTheDocument();
    expect(screen.getByLabelText("Template Name *")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Create New Template" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit Template" })).toBeInTheDocument();
    expect(screen.getByLabelText("Template Name *")).toHaveValue("Default Invite");
    expect(screen.getByLabelText("Email Subject *")).toHaveValue("Welcome");
  });
});
