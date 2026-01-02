import type { Route } from "./+types/api.places.photo";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const maxHeightPx = url.searchParams.get("maxHeightPx") || "400";
  const maxWidthPx = url.searchParams.get("maxWidthPx") || "400";
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  if (!name) {
    return Response.json({ error: "Photo name is required" }, { status: 400 });
  }

  try {
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetch(
      `https://places.googleapis.com/v1/${name}/media?maxHeightPx=${encodeURIComponent(
        maxHeightPx
      )}&maxWidthPx=${encodeURIComponent(maxWidthPx)}&key=${apiKey}`
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Place photo error:", error);
      return Response.json(
        { error: "Failed to fetch place photo" },
        { status: response.status }
      );
    }

    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=604800, stale-while-revalidate=2592000"
    );
    const cachedResponse = new Response(response.body, {
      status: response.status,
      headers,
    });
    context.cloudflare.ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
    return cachedResponse;
  } catch (error) {
    console.error("Place photo error:", error);
    return Response.json(
      { error: "Failed to fetch place photo" },
      { status: 500 }
    );
  }
}
