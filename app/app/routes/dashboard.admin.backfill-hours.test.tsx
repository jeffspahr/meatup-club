import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackfillHoursPage, { action, loader } from "./dashboard.admin.backfill-hours";
import { requireAdmin } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  };
});

function createMockDb(restaurants: Array<Record<string, unknown>>) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    return {
      all: async () => ({ results: restaurants }),
      bind: (...bindArgs: unknown[]) => ({
        run: async () => {
          runCalls.push({ sql: normalizedSql, bindArgs });
          return { meta: { changes: 1 } };
        },
      }),
    };
  });

  return { prepare, runCalls };
}

describe("dashboard.admin.backfill-hours route", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: 1,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
    } as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requires admin access in the loader", async () => {
    const result = await loader({
      request: new Request("http://localhost/dashboard/admin/backfill-hours"),
      context: { cloudflare: { env: {} } } as never,
      params: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("backfills opening hours and reports failures", async () => {
    const db = createMockDb([
      { id: 1, name: "Prime Steakhouse", google_place_id: "place-1" },
      { id: 2, name: "Ocean Grill", google_place_id: "place-2" },
    ]);

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          currentOpeningHours: {
            weekdayDescriptions: ["Mon: 5 PM – 9 PM"],
          },
        }),
      } as never)
      .mockResolvedValueOnce({
        ok: false,
      } as never);

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/backfill-hours", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: {
            DB: db,
            GOOGLE_PLACES_API_KEY: "test-places-api-key",
          },
        },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      results: {
        total: 2,
        updated: 1,
        failed: ["Ocean Grill"],
      },
    });
    expect(db.runCalls).toEqual([
      {
        sql: "UPDATE restaurants SET opening_hours = ? WHERE id = ?",
        bindArgs: [JSON.stringify(["Mon: 5 PM – 9 PM"]), 1],
      },
    ]);
  });

  it("renders the backfill summary once results are present", () => {
    const props = {
      loaderData: {},
      actionData: {
        results: {
          total: 3,
          updated: 2,
          failed: ["Ocean Grill"],
        },
      },
    } as any;

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/backfill-hours"]}>
        <BackfillHoursPage {...props} />
      </MemoryRouter>
    );

    expect(screen.getByText("Backfill Complete")).toBeInTheDocument();
    expect(screen.getByText("Ocean Grill")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Polls" })).toHaveAttribute("href", "/dashboard/polls");
    expect(screen.getByRole("button", { name: "Run Backfill" })).toBeDisabled();
  });
});
