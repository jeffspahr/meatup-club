import type { Route } from "./+types/api.places.search";
import { getUser } from "../lib/auth.server";
import { withCache } from "../lib/cache.server";
import { enforceRateLimit } from "../lib/rate-limit.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const input = url.searchParams.get("input")?.trim();
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  if (!input) {
    return Response.json({ error: "Input is required" }, { status: 400 });
  }

  if (input.length < 2 || input.length > 120) {
    return Response.json(
      { error: "Input must be between 2 and 120 characters" },
      { status: 400 }
    );
  }

  if (/[\u0000-\u001f]/.test(input)) {
    return Response.json({ error: "Input contains invalid characters" }, { status: 400 });
  }

  const user = await getUser(request, context);
  if (!user || user.status !== "active") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey) {
    return Response.json({ error: "Places API is not configured" }, { status: 500 });
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const identifier = `user:${user.id}:ip:${ip}`;
  const rateLimit = await enforceRateLimit({
    db: context.cloudflare.env.DB,
    scope: "places.search",
    identifier,
    limit: 30,
    windowSeconds: 60,
    ctx: context.cloudflare.ctx,
  });

  if (!rateLimit.allowed) {
    const retryAfter = Math.max(rateLimit.resetAt - Math.floor(Date.now() / 1000), 1);
    return Response.json(
      { error: "Rate limit exceeded. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  try {
    return await withCache(
      request,
      context,
      async () => {
        // Use Google Places API (New) - Text Search
        const response = await fetch(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey || "",
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

        const data = (await response.json()) as any;
        return Response.json(data);
      },
      "public, max-age=600, stale-while-revalidate=3600"
    );
  } catch (error) {
    console.error("Places search error:", error);
    return Response.json(
      { error: "Failed to search places" },
      { status: 500 }
    );
  }
}
