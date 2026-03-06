import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminContentPage, { action, loader } from "./dashboard.admin.content";
import { requireAdmin } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../lib/dateUtils", () => ({
  formatDateForDisplay: vi.fn(() => "May 1, 2026"),
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
  content = [
    {
      id: 1,
      key: "about",
      title: "About",
      content: "Initial **markdown**",
      updated_at: "2026-05-01T12:00:00.000Z",
    },
  ],
  shouldFail = false,
}: {
  content?: Array<Record<string, unknown>>;
  shouldFail?: boolean;
} = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    return {
      all: async () => ({ results: content }),
      bind: (...bindArgs: unknown[]) => ({
        run: async () => {
          if (shouldFail) {
            throw new Error("DB failure");
          }
          runCalls.push({ sql: normalizedSql, bindArgs });
          return { meta: { changes: 1 } };
        },
      }),
    };
  });

  return { prepare, runCalls };
}

describe("dashboard.admin.content route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 7,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
  });

  it("loads the editable site content", async () => {
    const db = createMockDb();

    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/content"),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          id: 1,
          key: "about",
          title: "About",
          content: "Initial **markdown**",
          updated_at: "2026-05-01T12:00:00.000Z",
        },
      ],
    });
  });

  it("requires an id and content for updates", async () => {
    const formData = new FormData();
    formData.set("_action", "update");
    formData.set("id", "1");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/content", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: createMockDb() } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "ID and content are required" });
  });

  it("updates content and redirects on success", async () => {
    const db = createMockDb();
    const formData = new FormData();
    formData.set("_action", "update");
    formData.set("id", "1");
    formData.set("content", "Updated content");

    const response = await action({
      request: new Request("http://localhost/dashboard/admin/content", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/admin/content");
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE site_content SET content = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?",
        bindArgs: ["Updated content", 7, "1"],
      },
    ]);
  });

  it("returns an error when updating content fails", async () => {
    const db = createMockDb({ shouldFail: true });
    const formData = new FormData();
    formData.set("_action", "update");
    formData.set("id", "1");
    formData.set("content", "Updated content");

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/content", {
        method: "POST",
        body: formData,
      }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Failed to update content" });
  });

  it("renders editing, preview, and cancel states", () => {
    const props = {
      loaderData: {
        content: [
          {
            id: 1,
            key: "about",
            title: "About",
            content: "Initial **markdown**",
            updated_at: "2026-05-01T12:00:00.000Z",
          },
        ],
      },
      actionData: undefined,
    } as any;

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/content"]}>
        <AdminContentPage {...props} />
      </MemoryRouter>
    );

    expect(screen.getByText("Last updated: May 1, 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByDisplayValue("Initial **markdown**")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("markdown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Save Changes")).not.toBeInTheDocument();
  });
});
