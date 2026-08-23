import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loader as searchLoader } from "./api.places.search";
import { loader as detailsLoader } from "./api.places.details";
import { loader as photoLoader } from "./api.places.photo";
import { getUser } from "../lib/auth.server";
import { enforceRateLimit } from "../lib/rate-limit.server";
import { createLoadContext } from "~/lib/router-context";

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

describe("Places API route guards", () => {
  function createMockContext(apiKey: string | undefined = "test-places-api-key") {
    return createLoadContext({
        env: {
          DB: {},
          GOOGLE_PLACES_API_KEY: apiKey,
        },
        ctx: {
          waitUntil: vi.fn(),
        },
      } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("image-bytes", {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
      },
    })));
    vi.mocked(getUser).mockResolvedValue({
      id: 1,
      status: "active",
      email: "user@example.com",
    } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when unauthenticated on places search", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns 400 when places search input is missing", async () => {
    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Input is required" });
  });

  it("returns 400 when places search input is outside the allowed length", async () => {
    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=a"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Input must be between 2 and 120 characters",
    });
  });

  it("returns 400 when places search input contains control characters", async () => {
    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=bad%00value"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Input contains invalid characters",
    });
  });

  it("returns 500 when places search is not configured", async () => {
    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak"),
      context: createMockContext(""),
      params: {},
    } as any);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Places API is not configured",
    });
  });

  it("returns 429 when search endpoint rate limit is exceeded", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 15,
    });

    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 429 when details endpoint rate limit is exceeded", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30,
    });

    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details?placeId=ChIJ12345"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 400 when place details are requested without a place ID", async () => {
    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Place ID is required" });
  });

  it("returns 400 for invalid place ID formats", async () => {
    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details?placeId=bad/value"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid place ID format" });
  });

  it("returns 500 when place details are not configured", async () => {
    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details?placeId=ChIJ12345"),
      context: createMockContext(""),
      params: {},
    } as any);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Places API is not configured",
    });
  });

  it("returns 401 when an inactive user requests place details", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 1,
      status: "inactive",
      email: "user@example.com",
    } as any);

    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details?placeId=ChIJ12345"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns 400 when photo name is missing", async () => {
    const response = await photoLoader({
      request: new Request("http://localhost/api/places/photo"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Photo name is required" });
  });

  it("returns 400 for invalid photo resource names", async () => {
    const response = await photoLoader({
      request: new Request("http://localhost/api/places/photo?name=bad-value"),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid photo dimensions", async () => {
    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places/place-1/photos/photo-1&maxHeightPx=0&maxWidthPx=400"
      ),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid photo dimensions" });
  });

  it("returns 401 when an inactive user requests a photo", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: 1,
      status: "inactive",
      email: "user@example.com",
    } as any);

    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places/place-1/photos/photo-1&maxHeightPx=400&maxWidthPx=400"
      ),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns 500 when place photos are not configured", async () => {
    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places/place-1/photos/photo-1&maxHeightPx=400&maxWidthPx=400"
      ),
      context: createMockContext(""),
      params: {},
    } as any);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Places API is not configured",
    });
  });

  it("returns 429 when photo endpoint rate limit is exceeded", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 10,
    });

    const response = await photoLoader({
      request: new Request(
        "http://localhost/api/places/photo?name=places/place-1/photos/photo-1&maxHeightPx=400&maxWidthPx=400"
      ),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("accepts long Google photo resource names that exceed 255 characters", async () => {
    const longPhotoName = `places/${"A".repeat(320)}/photos/${"B".repeat(140)}`;
    const requestUrl = new URL("http://localhost/api/places/photo");
    requestUrl.search = new URLSearchParams({
      name: longPhotoName,
      maxHeightPx: "400",
      maxWidthPx: "400",
    }).toString();

    const response = await photoLoader({
      request: new Request(requestUrl),
      context: createMockContext(),
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });
});
