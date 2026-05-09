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

  const prepare = vi.fn((_sql: string) => {
    return {
      all: async () => ({ results: restaurants }),
      bind: (...bindArgs: unknown[]) => ({
        run: async () => {
          runCalls.push({ sql: _sql.replace(/\s+/g, " ").trim(), bindArgs });
          return { meta: { changes: 1 } };
        },
      }),
    };
  });

  return { prepare, runCalls };
}

function dbRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    google_place_id: "place-1",
    name: null,
    address: null,
    google_rating: null,
    rating_count: null,
    price_level: null,
    cuisine: null,
    phone_number: null,
    google_maps_url: null,
    photo_url: null,
    opening_hours: null,
    ...overrides,
  };
}

const FULL_PLACE_DETAILS = {
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
};

// Mirror of what placeDetailsToRestaurantFields produces from FULL_PLACE_DETAILS,
// in DB-column shape. Used to seed "DB already matches Google" rows.
const FULL_DB_VALUES = {
  name: "Prime Steakhouse",
  address: "123 Main St, Anytown, USA",
  google_rating: 4.5,
  rating_count: 200,
  price_level: 3,
  cuisine: "Steakhouse",
  phone_number: "+1 555-1234",
  google_maps_url: "https://maps.google.com/?cid=123",
  photo_url:
    "/api/places/photo?name=places%2Fabc%2Fphotos%2Fxyz&maxHeightPx=400&maxWidthPx=400",
  opening_hours: JSON.stringify(["Mon: 5 PM – 9 PM"]),
};

function actionRequestContext(db: ReturnType<typeof createMockDb>) {
  return {
    request: new Request("http://localhost/dashboard/admin/refresh-restaurants", {
      method: "POST",
    }),
    context: {
      cloudflare: {
        env: { DB: db, GOOGLE_PLACES_API_KEY: "test-places-api-key" },
      },
    } as never,
    params: {},
  } as never;
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

  it("updates every column when the stored row is empty", async () => {
    const db = createMockDb([dbRow({ id: 1, google_place_id: "place-1" })]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => FULL_PLACE_DETAILS,
    } as never);

    const result = await action(actionRequestContext(db));

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
              "name",
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
    expect(db.runCalls[0].bindArgs[db.runCalls[0].bindArgs.length - 1]).toBe(1);
  });

  it("skips DB write entirely when every stored value already matches Google", async () => {
    const db = createMockDb([
      dbRow({ id: 5, google_place_id: "place-1", ...FULL_DB_VALUES }),
    ]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => FULL_PLACE_DETAILS,
    } as never);

    const result = await action(actionRequestContext(db));

    expect(result).toEqual({
      results: { total: 1, updated: 0, unchanged: 1, failed: [], details: [] },
    });
    expect(db.runCalls).toHaveLength(0);
  });

  it("updates only the column that differs from the stored row", async () => {
    const db = createMockDb([
      dbRow({
        id: 7,
        google_place_id: "place-1",
        ...FULL_DB_VALUES,
        google_rating: 4.0, // outdated rating; everything else matches
      }),
    ]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => FULL_PLACE_DETAILS,
    } as never);

    const result = await action(actionRequestContext(db));

    expect(result).toEqual({
      results: {
        total: 1,
        updated: 1,
        unchanged: 0,
        failed: [],
        details: [{ name: "Prime Steakhouse", fieldsUpdated: ["google_rating"] }],
      },
    });
    expect(db.runCalls).toHaveLength(1);
    expect(db.runCalls[0].sql).toBe("UPDATE restaurants SET google_rating = ? WHERE id = ?");
    expect(db.runCalls[0].bindArgs).toEqual([4.5, 7]);
  });

  it("only writes columns that Google returned and that differ from storage", async () => {
    const db = createMockDb([dbRow({ id: 2, google_place_id: "place-2", name: "Sparse Place" })]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "place-2", formattedAddress: "456 Elm St" }),
    } as never);

    const result = await action(actionRequestContext(db));

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
    const db = createMockDb([dbRow({ id: 3, google_place_id: "place-3", name: "Empty Place" })]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "place-3" }),
    } as never);

    const result = await action(actionRequestContext(db));

    expect(result).toEqual({
      results: { total: 1, updated: 0, unchanged: 1, failed: [], details: [] },
    });
    expect(db.runCalls).toHaveLength(0);
  });

  it("records failures when the Places fetch errors", async () => {
    const db = createMockDb([dbRow({ id: 4, google_place_id: "place-4", name: "Broken Place" })]);
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as never);

    const result = await action(actionRequestContext(db));

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
