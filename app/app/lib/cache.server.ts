/**
 * Cloudflare Cache API wrapper.
 *
 * Eliminates the repeated cache-check / fetch / cache-put boilerplate
 * that was duplicated across the three Google Places API routes.
 */

/**
 * Execute `fetcher` with Cloudflare Cache API caching.
 *
 * - Checks the cache for a match keyed on the request URL.
 * - On miss, calls `fetcher()` to produce the Response.
 * - Stores the result in the cache with the supplied `cacheControl` header.
 * - Returns the (possibly cached) Response.
 */
export async function withCache(
  request: Request,
  context: any,
  fetcher: () => Promise<Response>,
  cacheControl: string
): Promise<Response> {
  const cache = (caches as any).default;
  const cacheKey = new Request(request.url, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetcher();

  // Only cache successful responses
  if (response.ok) {
    const cloned = response.clone();
    const headers = new Headers(cloned.headers);
    headers.set("Cache-Control", cacheControl);

    const cacheable = new Response(cloned.body, {
      status: cloned.status,
      statusText: cloned.statusText,
      headers,
    });

    context.cloudflare.ctx.waitUntil(cache.put(cacheKey, cacheable));
  }

  return response;
}
