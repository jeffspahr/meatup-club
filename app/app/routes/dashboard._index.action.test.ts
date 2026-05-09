import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard._index";
import { requireActiveUser } from "../lib/auth.server";
import { enforceRateLimit } from "../lib/rate-limit.server";
import {
  createRestaurant,
  deleteRestaurant,
  findRestaurantByPlaceId,
} from "../lib/restaurants.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("../lib/rate-limit.server", () => ({
  enforceRateLimit: vi.fn(),
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

    const firstForArgs = async () => {
      if (normalizedSql.includes("SELECT created_by FROM restaurants WHERE id = ?")) {
        return restaurantOwner;
      }
      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    return {
      first: () => firstForArgs(),
      bind: (..._bindArgs: unknown[]) => ({
        first: () => firstForArgs(),
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

  return new Request("http://localhost/dashboard", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard._index action — suggest_restaurant", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User Test",
    } as never);
    vi.mocked(findRestaurantByPlaceId).mockResolvedValue(null as never);
    vi.mocked(createRestaurant).mockResolvedValue({} as never);
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockPlacesFetch(payload: Record<string, unknown>) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as never);
  }

  it("creates a restaurant by re-fetching place details server-side", async () => {
    mockPlacesFetch({
      id: "place123",
      displayName: { text: "Prime Cut" },
      formattedAddress: "1 Main St, New York, NY 10001, USA",
      rating: 4.6,
      userRatingCount: 150,
      priceLevel: "PRICE_LEVEL_EXPENSIVE",
      types: ["steak_house"],
    });
    const db = createMockDb();

    const result = await action({
      request: createRequest({
        _action: "suggest_restaurant",
        place_id: "place123",
      }),
      context: {
        cloudflare: { env: { DB: db, GOOGLE_PLACES_API_KEY: "test-key" } },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ ok: true });
    expect(createRestaurant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Prime Cut",
        address: "1 Main St, New York, NY 10001, USA",
        google_place_id: "place123",
        google_rating: 4.6,
        rating_count: 150,
        price_level: 3,
        cuisine: "Steakhouse",
        created_by: 123,
      }),
    );
  });

  it("rejects when place_id is missing", async () => {
    const db = createMockDb();
    const result = await action({
      request: createRequest({ _action: "suggest_restaurant" }),
      context: {
        cloudflare: { env: { DB: db, GOOGLE_PLACES_API_KEY: "test-key" } },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Place ID is required" });
    expect(createRestaurant).not.toHaveBeenCalled();
  });

  it("rejects place_id that fails the format check before hitting Google", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    const db = createMockDb();
    const result = await action({
      request: createRequest({
        _action: "suggest_restaurant",
        place_id: "bad/value",
      }),
      context: {
        cloudflare: { env: { DB: db, GOOGLE_PLACES_API_KEY: "test-key" } },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Invalid place ID format" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createRestaurant).not.toHaveBeenCalled();
  });

  it("rejects duplicates by google_place_id", async () => {
    vi.mocked(findRestaurantByPlaceId).mockResolvedValue({ id: 7 } as never);
    const db = createMockDb();

    const result = await action({
      request: createRequest({
        _action: "suggest_restaurant",
        place_id: "exists",
      }),
      context: {
        cloudflare: { env: { DB: db, GOOGLE_PLACES_API_KEY: "test-key" } },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "This restaurant has already been added" });
    expect(createRestaurant).not.toHaveBeenCalled();
  });

  it("rejects when Google does not return a name", async () => {
    mockPlacesFetch({ id: "place123" });
    const db = createMockDb();

    const result = await action({
      request: createRequest({
        _action: "suggest_restaurant",
        place_id: "place123",
      }),
      context: {
        cloudflare: { env: { DB: db, GOOGLE_PLACES_API_KEY: "test-key" } },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Google did not return a name for that place" });
    expect(createRestaurant).not.toHaveBeenCalled();
  });

  it("rejects with a rate-limit error and skips Google when the limiter denies", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30,
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    const db = createMockDb();

    const result = await action({
      request: createRequest({
        _action: "suggest_restaurant",
        place_id: "place123",
      }),
      context: {
        cloudflare: { env: { DB: db, GOOGLE_PLACES_API_KEY: "test-key" } },
      } as never,
      params: {},
    } as never);

    expect(result).toEqual({ error: "Rate limit exceeded. Please try again shortly." });
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "places.suggest" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createRestaurant).not.toHaveBeenCalled();
  });
});

describe("dashboard._index action — delete_restaurant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteRestaurant).mockResolvedValue({} as never);
  });

  it("allows the suggester to delete their own restaurant", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User Test",
    } as never);
    const db = createMockDb({ restaurantOwner: { created_by: 123 } });

    const result = await action({
      request: createRequest({ _action: "delete_restaurant", restaurant_id: "5" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ ok: true });
    expect(deleteRestaurant).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it("allows admins to delete any restaurant", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 999,
      is_admin: 1,
      status: "active",
      email: "admin@example.com",
      name: "Admin",
    } as never);
    const db = createMockDb({ restaurantOwner: { created_by: 123 } });

    const result = await action({
      request: createRequest({ _action: "delete_restaurant", restaurant_id: "5" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({ ok: true });
    expect(deleteRestaurant).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it("blocks a non-admin, non-owner from deleting", async () => {
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 456,
      is_admin: 0,
      status: "active",
      email: "other@example.com",
      name: "Other",
    } as never);
    const db = createMockDb({ restaurantOwner: { created_by: 123 } });

    const result = await action({
      request: createRequest({ _action: "delete_restaurant", restaurant_id: "5" }),
      context: { cloudflare: { env: { DB: db } } } as never,
      params: {},
    } as never);

    expect(result).toEqual({
      error: "You do not have permission to delete this restaurant",
    });
    expect(deleteRestaurant).not.toHaveBeenCalled();
  });
});
