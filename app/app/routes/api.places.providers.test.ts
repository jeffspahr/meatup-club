import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader as detailsLoader } from "./api.places.details";
import { loader as photoLoader } from "./api.places.photo";
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
  const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  const bind = vi.fn(() => ({ run }));
  const prepare = vi.fn(() => ({ bind }));
  const waitUntil = vi.fn();

  return {
    context: {
      cloudflare: {
        env: {
          DB: { prepare },
          GOOGLE_PLACES_API_KEY: "test-places-api-key",
        },
        ctx: { waitUntil },
      },
    } as any,
    prepare,
    bind,
    run,
    waitUntil,
  };
}

describe("Places details provider boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(getUser).mockResolvedValue({
      id: 7,
      status: "active",
      email: "member@example.com",
    } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    });
  });

  it("transforms Google place details into the application response", async () => {
    const { context } = createContext();
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        id: "ChIJPrime123",
        displayName: { text: "Prime Steakhouse" },
        formattedAddress: "123 Main St, Raleigh, NC",
        internationalPhoneNumber: "+1 919-555-0100",
        websiteUri: "https://prime.example.com",
        googleMapsUri: "https://maps.example.com/prime",
        rating: 4.8,
        userRatingCount: 321,
        priceLevel: "PRICE_LEVEL_EXPENSIVE",
        types: ["steak_house", "restaurant"],
        photos: [{ name: "places/ChIJPrime123/photos/photo-old" }],
        currentOpeningHours: {
          weekdayDescriptions: ["Monday: 5:00 PM – 10:00 PM"],
        },
      })
    );

    const response = await detailsLoader({
      request: new Request(
        "http://localhost/api/places/details?placeId=ChIJPrime123"
      ),
      context,
      params: {},
    } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      placeId: "ChIJPrime123",
      name: "Prime Steakhouse",
      address: "123 Main St, Raleigh, NC",
      phone: "+1 919-555-0100",
      website: "https://prime.example.com",
      googleMapsUrl: "https://maps.example.com/prime",
      rating: 4.8,
      ratingCount: 321,
      priceLevel: 3,
      photoUrl:
        "/api/places/photo?name=places%2FChIJPrime123%2Fphotos%2Fphoto-old&maxHeightPx=400&maxWidthPx=400",
      cuisine: "Steakhouse",
      openingHours: JSON.stringify(["Monday: 5:00 PM – 10:00 PM"]),
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places/ChIJPrime123",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Goog-Api-Key": "test-places-api-key",
          "X-Goog-FieldMask": expect.stringContaining("currentOpeningHours"),
        }),
      })
    );
  });

  it("returns a generic error when Google details fails", async () => {
    const { context } = createContext();
    vi.mocked(fetch).mockResolvedValue(
      new Response("upstream unavailable", { status: 503 })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await detailsLoader({
      request: new Request(
        "http://localhost/api/places/details?placeId=ChIJPrime123"
      ),
      context,
      params: {},
    } as any);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch place details",
    });
    expect(console.error).toHaveBeenCalledWith("Place details failed", {
      message: "Places details request failed with status 503",
    });
  });
});

describe("Places photo provider boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(getUser).mockResolvedValue({
      id: 7,
      status: "active",
      email: "member@example.com",
    } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    });
  });

  it("proxies a successful Google photo response and headers", async () => {
    const { context } = createContext();
    vi.mocked(fetch).mockResolvedValue(
      new Response("image-bytes", {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=3600",
        },
      })
    );

    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places%2FChIJPrime123%2Fphotos%2Fphoto-old&maxHeightPx=640&maxWidthPx=800"
      ),
      context,
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    await expect(response.text()).resolves.toBe("image-bytes");
    expect(fetch).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places/ChIJPrime123/photos/photo-old/media?maxHeightPx=640&maxWidthPx=800&key=test-places-api-key"
    );
  });

  it("refreshes a stale photo reference and schedules the stored URL update", async () => {
    const { context, prepare, bind, run, waitUntil } = createContext();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("stale", { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          photos: [{ name: "places/ChIJPrime123/photos/photo-fresh" }],
        })
      )
      .mockResolvedValueOnce(
        new Response("fresh-image", {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        })
      );

    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places%2FChIJPrime123%2Fphotos%2Fphoto-old&maxHeightPx=400&maxWidthPx=400"
      ),
      context,
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    await expect(response.text()).resolves.toBe("fresh-image");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://places.googleapis.com/v1/places/ChIJPrime123",
      {
        headers: {
          "X-Goog-Api-Key": "test-places-api-key",
          "X-Goog-FieldMask": "photos",
        },
      }
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "https://places.googleapis.com/v1/places/ChIJPrime123/photos/photo-fresh/media?maxHeightPx=400&maxWidthPx=400&key=test-places-api-key"
    );
    expect(prepare).toHaveBeenCalledWith(
      "UPDATE restaurants SET photo_url = ? WHERE photo_url LIKE ?"
    );
    expect(bind).toHaveBeenCalledWith(
      "/api/places/photo?name=places%2FChIJPrime123%2Fphotos%2Fphoto-fresh&maxHeightPx=400&maxWidthPx=400",
      "%places%2FChIJPrime123%2Fphotos%2Fphoto-old%"
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    await expect(waitUntil.mock.calls[0][0]).resolves.toEqual({
      meta: { changes: 1 },
    });
  });

  it("returns the original upstream status when a stale photo cannot refresh", async () => {
    const { context } = createContext();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("upstream unavailable", { status: 502 }))
      .mockResolvedValueOnce(new Response("details unavailable", { status: 503 }));

    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places%2FChIJPrime123%2Fphotos%2Fphoto-old"
      ),
      context,
      params: {},
    } as any);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch place photo",
    });
  });
});
