import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCache } from "./cache.server";
import { createLoadContext } from "~/lib/router-context";

const matchSpy = vi.fn();
const putSpy = vi.fn();

describe("withCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("caches", {
      default: {
        match: matchSpy,
        put: putSpy,
      },
    });
  });

  it("returns a cached response without calling the fetcher", async () => {
    const cachedResponse = new Response("cached", { status: 200 });
    const waitUntil = vi.fn();

    matchSpy.mockResolvedValue(cachedResponse);

    const fetcher = vi.fn();
    const response = await withCache(
      new Request("https://meatup.club/api/places/search?q=steak"),
      createLoadContext({ ctx: { waitUntil } } as never),
      fetcher,
      "public, max-age=60"
    );

    expect(await response.text()).toBe("cached");
    expect(fetcher).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("caches successful fetch responses with the provided cache-control header", async () => {
    const waitUntil = vi.fn();

    matchSpy.mockResolvedValue(undefined);
    putSpy.mockResolvedValue(undefined);

    const fetcher = vi.fn(async () => new Response("fresh", { status: 200 }));

    const response = await withCache(
      new Request("https://meatup.club/api/places/details?id=abc"),
      createLoadContext({ ctx: { waitUntil } } as never),
      fetcher,
      "public, s-maxage=300"
    );

    expect(await response.text()).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(putSpy).toHaveBeenCalledTimes(1);

    const [cacheKey, cacheable] = putSpy.mock.calls[0] as [Request, Response];
    expect(cacheKey.method).toBe("GET");
    expect(cacheKey.url).toBe("https://meatup.club/api/places/details?id=abc");
    expect(cacheable.headers.get("Cache-Control")).toBe("public, s-maxage=300");
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("does not cache unsuccessful responses", async () => {
    const waitUntil = vi.fn();

    matchSpy.mockResolvedValue(undefined);

    const fetcher = vi.fn(async () => new Response("error", { status: 500 }));

    const response = await withCache(
      new Request("https://meatup.club/api/places/photo?name=test"),
      createLoadContext({ ctx: { waitUntil } } as never),
      fetcher,
      "public, max-age=3600"
    );

    expect(response.status).toBe(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(putSpy).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
