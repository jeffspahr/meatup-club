import type { Route } from "./+types/api.places.search";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const input = url.searchParams.get("input");
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  if (!input) {
    return Response.json({ error: "Input is required" }, { status: 400 });
  }

  try {
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    // Use Google Places API (New) - Text Search
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types",
        },
        body: JSON.stringify({
          textQuery: input,
          locationBias: {
            circle: {
              center: {
                latitude: 35.7796,  // Raleigh, NC
                longitude: -78.6382,
              },
              radius: 50000.0, // 50km radius
            },
          },
          includedType: "restaurant",
          maxResultCount: 5,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch places");
    }

    const data = await response.json();
    const headers = new Headers({
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    });
    const jsonResponse = Response.json(data, { headers });
    context.cloudflare.ctx.waitUntil(cache.put(cacheKey, jsonResponse.clone()));
    return jsonResponse;
  } catch (error) {
    console.error("Places search error:", error);
    return Response.json(
      { error: "Failed to search places" },
      { status: 500 }
    );
  }
}
