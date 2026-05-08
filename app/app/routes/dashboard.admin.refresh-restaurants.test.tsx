import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RefreshRestaurantsPage, { action, loader } from "./dashboard.admin.refresh-restaurants";
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

function placeDetailsResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "place-1",
    displayName: { text: "Prime Steakhouse" },
    formattedAddress: "123 Main St, Anytown, USA",
    internationalPhoneNumber: "+1 555-1234",
    googleMapsUri: "https://maps.google.com/?cid=123",
    rating: 4.5,
    userRatingCount: 200,
    priceLevel: "PRICE_LEVEL_EXPENSIVE",
    types: ["steak_house"],
    photos: [{ name: "places/abc/photos/xyz" }],
    currentOpeningHours: {
      weekdayDescriptions: ["Mon: 5 PM – 9 PM"],
    },
    ...overrides,
  };
}

describe("dashboard.admin.refresh-restaurants route", () => {
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
      request: new Request("http://localhost/dashboard/admin/refresh-restaurants"),
      context: { cloudflare: { env: {} } } as never,
      params: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("refreshes all metadata fields and reports per-field changes", async () => {
    const db = createMockDb([
      { id: 1, name: "Prime Steakhouse", google_place_id: "place-1" },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => placeDetailsResponse(),
    } as never);

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/refresh-restaurants", {
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
        total: 1,
        updated: 1,
        unchanged: 0,
        failed: [],
        details: [
          {
            name: "Prime Steakhouse",
            fieldsUpdated: [
              "address",
              "google_rating",
              "rating_count",
              "price_level",
              "cuisine",
              "phone_number",
              "google_maps_url",
              "photo_url",
              "opening_hours",
            ],
          },
        ],
      },
    });

    expect(db.runCalls).toHaveLength(1);
    expect(db.runCalls[0].sql).toMatch(/^UPDATE restaurants SET .* WHERE id = \?$/);
    expect(db.runCalls[0].sql).toContain("address = ?");
    expect(db.runCalls[0].sql).toContain("opening_hours = ?");
    // Restaurant id is the last bound parameter
    expect(db.runCalls[0].bindArgs[db.runCalls[0].bindArgs.length - 1]).toBe(1);
  });

  it("skips fields where Google returned no value", async () => {
    const db = createMockDb([
      { id: 2, name: "Sparse Place", google_place_id: "place-2" },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "place-2",
        formattedAddress: "456 Elm St",
      }),
    } as never);

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/refresh-restaurants", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: { DB: db, GOOGLE_PLACES_API_KEY: "test-places-api-key" },
        },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      results: {
        total: 1,
        updated: 1,
        unchanged: 0,
        failed: [],
        details: [{ name: "Sparse Place", fieldsUpdated: ["address"] }],
      },
    });
    expect(db.runCalls).toHaveLength(1);
    expect(db.runCalls[0].sql).toBe("UPDATE restaurants SET address = ? WHERE id = ?");
    expect(db.runCalls[0].bindArgs).toEqual(["456 Elm St", 2]);
  });

  it("counts unchanged when Google returned no usable fields", async () => {
    const db = createMockDb([
      { id: 3, name: "Empty Place", google_place_id: "place-3" },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "place-3" }),
    } as never);

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/refresh-restaurants", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: { DB: db, GOOGLE_PLACES_API_KEY: "test-places-api-key" },
        },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      results: {
        total: 1,
        updated: 0,
        unchanged: 1,
        failed: [],
        details: [],
      },
    });
    expect(db.runCalls).toHaveLength(0);
  });

  it("records failures when the Places fetch errors", async () => {
    const db = createMockDb([
      { id: 4, name: "Broken Place", google_place_id: "place-4" },
    ]);

    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as never);

    const result = await action({
      request: new Request("http://localhost/dashboard/admin/refresh-restaurants", {
        method: "POST",
      }),
      context: {
        cloudflare: {
          env: { DB: db, GOOGLE_PLACES_API_KEY: "test-places-api-key" },
        },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      results: {
        total: 1,
        updated: 0,
        unchanged: 0,
        failed: ["Broken Place"],
        details: [],
      },
    });
    expect(db.runCalls).toHaveLength(0);
  });

  it("renders the refresh summary with per-restaurant field changes", () => {
    const props = {
      loaderData: {},
      actionData: {
        results: {
          total: 3,
          updated: 1,
          unchanged: 1,
          failed: ["Ocean Grill"],
          details: [
            { name: "Prime Steakhouse", fieldsUpdated: ["address", "google_rating"] },
          ],
        },
      },
    } as any;

    render(
      <MemoryRouter initialEntries={["/dashboard/admin/refresh-restaurants"]}>
        <RefreshRestaurantsPage {...props} />
      </MemoryRouter>
    );

    expect(screen.getByText("Refresh Complete")).toBeInTheDocument();
    expect(screen.getByText(/Prime Steakhouse:/)).toBeInTheDocument();
    expect(screen.getByText(/address, google_rating/)).toBeInTheDocument();
    expect(screen.getByText("Ocean Grill")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Polls" })).toHaveAttribute("href", "/dashboard/polls");
    expect(screen.getByRole("button", { name: "Run Refresh" })).toBeDisabled();
  });
});
