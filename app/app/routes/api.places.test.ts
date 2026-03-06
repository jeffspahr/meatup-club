import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loader as detailsLoader } from "./api.places.details";
import { loader as photoLoader } from "./api.places.photo";
import { loader as searchLoader } from "./api.places.search";
import { getUser } from "../lib/auth.server";
import { enforceRateLimit } from "../lib/rate-limit.server";

vi.mock("../lib/auth.server", () => ({
  getUser: vi.fn(),
}));

vi.mock("../lib/rate-limit.server", () => ({
  enforceRateLimit: vi.fn(),
}));

vi.mock("../lib/cache.server", () => ({
  withCache: async (
    _request: Request,
    _context: unknown,
    fetcher: () => Promise<Response>
  ) => fetcher(),
}));

function createContext() {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];
  const waitUntil = vi.fn();
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...bindArgs: unknown[]) => ({
        run: async () => {
          runCalls.push({ sql, bindArgs });
          return { meta: { changes: 1 } };
        },
      }),
    })),
  };

  return {
    context: {
      cloudflare: {
        env: {
          DB: db,
          GOOGLE_PLACES_API_KEY: "test-places-api-key",
        },
        ctx: {
          waitUntil,
        },
      },
    } as never,
    db,
    runCalls,
    waitUntil,
  };
}

describe("Places API behavior", () => {
  let originalFetch: typeof global.fetch;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({
      id: 1,
      status: "active",
      email: "user@example.com",
    } as never);
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
  });

  it("searches Google Places and returns the upstream payload", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "place-1",
            displayName: { text: "Prime Steakhouse" },
            formattedAddress: "123 Main St",
          },
        ],
      }),
    } as never);

    const { context } = createContext();
    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak", {
        headers: { "CF-Connecting-IP": "203.0.113.5" },
      }),
      context,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      places: [
        {
          id: "place-1",
          displayName: { text: "Prime Steakhouse" },
          formattedAddress: "123 Main St",
        },
      ],
    });

    const [url, requestInit] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toEqual(
      expect.objectContaining({
        "X-Goog-Api-Key": "test-places-api-key",
      })
    );
    expect(JSON.parse(String(requestInit?.body))).toEqual(
      expect.objectContaining({
        textQuery: "steak",
        includedType: "restaurant",
        maxResultCount: 5,
      })
    );
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "places.search",
        identifier: "user:1:ip:203.0.113.5",
      })
    );
  });

  it("returns a 500 when the search upstream request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
    } as never);

    const { context } = createContext();
    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak"),
      context,
      params: {},
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to search places",
    });
  });

  it("transforms place details into the app-specific payload", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "place-1",
        displayName: { text: "Prime Steakhouse" },
        formattedAddress: "123 Main St",
        internationalPhoneNumber: "+1 919-555-0100",
        websiteUri: "https://prime.example.com",
        googleMapsUri: "https://maps.example.com/prime",
        rating: 4.8,
        userRatingCount: 240,
        priceLevel: "PRICE_LEVEL_EXPENSIVE",
        types: ["steak_house", "restaurant"],
        photos: [{ name: "places/place-1/photos/photo-1" }],
        currentOpeningHours: {
          weekdayDescriptions: ["Mon: 5 PM – 9 PM"],
        },
      }),
    } as never);

    const { context } = createContext();
    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details?placeId=place-1"),
      context,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      placeId: "place-1",
      name: "Prime Steakhouse",
      address: "123 Main St",
      phone: "+1 919-555-0100",
      website: "https://prime.example.com",
      googleMapsUrl: "https://maps.example.com/prime",
      rating: 4.8,
      ratingCount: 240,
      priceLevel: 3,
      photoUrl: "/api/places/photo?name=places%2Fplace-1%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400",
      cuisine: "Steakhouse",
      openingHours: JSON.stringify(["Mon: 5 PM – 9 PM"]),
    });
  });

  it("proxies place photos when Google returns media successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("image-bytes", {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=60",
        },
      })
    );

    const { context } = createContext();
    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places/place-1/photos/photo-1&maxHeightPx=500&maxWidthPx=500"
      ),
      context,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    await expect(response.text()).resolves.toBe("image-bytes");
  });

  it("refreshes stale photo references and schedules a background database update", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("stale", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            photos: [{ name: "places/place-1/photos/fresh-photo" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response("fresh-image", {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        })
      );

    const { context, runCalls, waitUntil } = createContext();
    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places/place-1/photos/stale-photo&maxHeightPx=400&maxWidthPx=400"
      ),
      context,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("fresh-image");

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(runCalls).toEqual([
      {
        sql: "UPDATE restaurants SET photo_url = ? WHERE photo_url LIKE ?",
        bindArgs: [
          "/api/places/photo?name=places%2Fplace-1%2Fphotos%2Ffresh-photo&maxHeightPx=400&maxWidthPx=400",
          "%places%2Fplace-1%2Fphotos%2Fstale-photo%",
        ],
      },
    ]);
  });
});
