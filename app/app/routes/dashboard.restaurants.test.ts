import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.restaurants";
import { requireActiveUser } from "../lib/auth.server";
import {
  createRestaurant,
  deleteRestaurant,
  findRestaurantByPlaceId,
} from "../lib/restaurants.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/restaurants.server", () => ({
  createRestaurant: vi.fn(),
  findRestaurantByPlaceId: vi.fn(),
  deleteRestaurant: vi.fn(),
}));

type MockDbOptions = {
  restaurantOwner?: { created_by: number } | null;
};

function createMockDb({ restaurantOwner = { created_by: 123 } }: MockDbOptions = {}) {
  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT created_by FROM restaurants WHERE id = ?")) {
        return restaurantOwner;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    return {
      first: () => firstForArgs([]),
      all: async () => ({ results: [] }),
      run: vi.fn(async () => ({ meta: { changes: 1 } })),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: async () => ({ results: [] }),
        run: vi.fn(async () => ({ meta: { changes: 1 } })),
      }),
    };
  });

  return { prepare };
}

function createRequest(formEntries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/restaurants", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.restaurants action flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User",
    } as never);
    vi.mocked(findRestaurantByPlaceId).mockResolvedValue(null);
    vi.mocked(createRestaurant).mockResolvedValue(1);
    vi.mocked(deleteRestaurant).mockResolvedValue(undefined);
  });

  it("requires a restaurant name when suggesting a restaurant", async () => {
    const db = createMockDb();
    const request = createRequest({ _action: "suggest" });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Restaurant name is required" });
    expect(createRestaurant).not.toHaveBeenCalled();
  });

  it("rejects duplicate restaurants by Google Place ID", async () => {
    const db = createMockDb();
    vi.mocked(findRestaurantByPlaceId).mockResolvedValue({
      id: 99,
    } as never);
    const request = createRequest({
      _action: "suggest",
      name: "Prime Steakhouse",
      google_place_id: "place-123",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "This restaurant has already been added" });
    expect(findRestaurantByPlaceId).toHaveBeenCalledWith(db, "place-123");
    expect(createRestaurant).not.toHaveBeenCalled();
  });

  it("creates a restaurant with parsed numeric fields and redirects", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "suggest",
      name: "Prime Steakhouse",
      address: "123 Main St",
      cuisine: "Steakhouse",
      url: "https://prime.example.com",
      google_place_id: "place-123",
      google_rating: "4.8",
      rating_count: "321",
      price_level: "4",
      phone_number: "555-1234",
      reservation_url: "https://reserve.example.com",
      menu_url: "https://menu.example.com",
      photo_url: "https://images.example.com/prime.jpg",
      google_maps_url: "https://maps.example.com/prime",
      opening_hours: "Mon-Fri 5pm-10pm",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/restaurants");
    expect(createRestaurant).toHaveBeenCalledWith(db, {
      name: "Prime Steakhouse",
      address: "123 Main St",
      google_place_id: "place-123",
      google_rating: 4.8,
      rating_count: 321,
      price_level: 4,
      cuisine: "Steakhouse",
      phone_number: "555-1234",
      reservation_url: "https://reserve.example.com",
      menu_url: "https://menu.example.com",
      photo_url: "https://images.example.com/prime.jpg",
      google_maps_url: "https://maps.example.com/prime",
      opening_hours: "Mon-Fri 5pm-10pm",
      created_by: 123,
    });
  });

  it("requires a restaurant id for deletions", async () => {
    const db = createMockDb();
    const request = createRequest({ _action: "delete" });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Restaurant ID is required" });
    expect(deleteRestaurant).not.toHaveBeenCalled();
  });

  it("returns an error when deleting a restaurant that does not exist", async () => {
    const db = createMockDb({ restaurantOwner: null });
    const request = createRequest({
      _action: "delete",
      suggestion_id: "55",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "Restaurant not found" });
    expect(deleteRestaurant).not.toHaveBeenCalled();
  });

  it("rejects deletion when the current user does not own the restaurant", async () => {
    const db = createMockDb({ restaurantOwner: { created_by: 999 } });
    const request = createRequest({
      _action: "delete",
      suggestion_id: "55",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({ error: "You do not have permission to delete this restaurant" });
    expect(deleteRestaurant).not.toHaveBeenCalled();
  });

  it("allows admins to delete restaurants they do not own", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 321,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
    const db = createMockDb({ restaurantOwner: { created_by: 999 } });
    const request = createRequest({
      _action: "delete",
      suggestion_id: "55",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/restaurants");
    expect(deleteRestaurant).toHaveBeenCalledWith(db, 55);
  });
});
