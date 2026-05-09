import type { Route } from "./+types/api.places.details";
import { getUser } from "../lib/auth.server";
import { withCache } from "../lib/cache.server";
import { fetchPlaceDetails, isValidPlaceId } from "../lib/places.server";
import { enforceRateLimit } from "../lib/rate-limit.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const placeId = url.searchParams.get("placeId")?.trim();
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  if (!placeId) {
    return Response.json({ error: "Place ID is required" }, { status: 400 });
  }

  if (!isValidPlaceId(placeId)) {
    return Response.json({ error: "Invalid place ID format" }, { status: 400 });
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
    scope: "places.details",
    identifier,
    limit: 60,
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
        const placeData = await fetchPlaceDetails(placeId, apiKey);
        return Response.json(placeData);
      },
      "public, max-age=86400, stale-while-revalidate=604800"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Place details failed", { message });
    return Response.json(
      { error: "Failed to fetch place details" },
      { status: 500 }
    );
  }
}
