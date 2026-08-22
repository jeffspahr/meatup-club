import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader as searchLoader } from "./api.places.search";
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

describe("Places API route guards", () => {
  const mockContext = {
    cloudflare: {
      env: {
        DB: {},
        GOOGLE_PLACES_API_KEY: "test-places-api-key",
      },
      ctx: {
        waitUntil: vi.fn(),
      },
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
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

  it("returns 401 when unauthenticated on places search", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak"),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns 429 when details endpoint rate limit is exceeded", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30,
    });

    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details?placeId=ChIJ12345"),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 400 for invalid photo resource names", async () => {
    const response = await photoLoader({
      request: new Request("http://localhost/api/places/photo?name=bad-value"),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(400);
  });

  it("forwards valid searches to Google Places and returns the response", async () => {
    const places = [
      {
        id: "ChIJ12345",
        displayName: { text: "Prime Steakhouse" },
        formattedAddress: "123 Main St",
        types: ["restaurant"],
      },
    ];
    vi.mocked(fetch).mockResolvedValue(Response.json({ places }));

    const response = await searchLoader({
      request: new Request(
        "http://localhost/api/places/search?input=Prime%20Steakhouse",
        { headers: { "CF-Connecting-IP": "203.0.113.8" } }
      ),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ places });
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "places.search",
        identifier: "user:1:ip:203.0.113.8",
        limit: 30,
        windowSeconds: 60,
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:searchText",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Goog-Api-Key": "test-places-api-key",
        }),
        body: expect.stringContaining('"textQuery":"Prime Steakhouse"'),
      })
    );
  });

  it("returns a generic 500 response when Google Places fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("upstream unavailable", { status: 503 })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak"),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to search places",
    });
    expect(console.error).toHaveBeenCalledWith("Places search failed", {
      message: "Failed to fetch places",
    });
  });
});
