import type { Route } from "./+types/api.places.photo";
import { getUser } from "../lib/auth.server";
import { withCache } from "../lib/cache.server";
import { enforceRateLimit } from "../lib/rate-limit.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  const maxHeightPx = url.searchParams.get("maxHeightPx") || "400";
  const maxWidthPx = url.searchParams.get("maxWidthPx") || "400";
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  if (!name) {
    return Response.json({ error: "Photo name is required" }, { status: 400 });
  }

  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name) || name.length > 255) {
    return Response.json({ error: "Invalid photo name format" }, { status: 400 });
  }

  const parsedHeight = Number(maxHeightPx);
  const parsedWidth = Number(maxWidthPx);
  if (
    !Number.isInteger(parsedHeight) ||
    !Number.isInteger(parsedWidth) ||
    parsedHeight < 1 ||
    parsedHeight > 1600 ||
    parsedWidth < 1 ||
    parsedWidth > 1600
  ) {
    return Response.json({ error: "Invalid photo dimensions" }, { status: 400 });
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
    scope: "places.photo",
    identifier,
    limit: 120,
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
        const response = await fetchPhoto(name, maxHeightPx, maxWidthPx, apiKey);

        if (response.ok) {
          return new Response(response.body, {
            status: response.status,
            headers: new Headers(response.headers),
          });
        }

        // Photo reference may be stale — try to get a fresh one from the place_id
        const placeId = extractPlaceId(name);
        if (placeId) {
          const freshName = await getFreshPhotoName(placeId, apiKey);
          if (freshName && freshName !== name) {
            const freshResponse = await fetchPhoto(freshName, maxHeightPx, maxWidthPx, apiKey);
            if (freshResponse.ok) {
              // Update the stored photo_url in the background
              const db = context.cloudflare.env.DB;
              context.cloudflare.ctx.waitUntil(
                db.prepare('UPDATE restaurants SET photo_url = ? WHERE photo_url LIKE ?')
                  .bind(
                    `/api/places/photo?${new URLSearchParams({ name: freshName, maxHeightPx, maxWidthPx }).toString()}`,
                    `%${encodeURIComponent(name)}%`
                  )
                  .run()
                  .catch((e: unknown) => console.error("Failed to update photo_url:", e))
              );
              return new Response(freshResponse.body, {
                status: freshResponse.status,
                headers: new Headers(freshResponse.headers),
              });
            }
          }
        }

        return Response.json(
          { error: "Failed to fetch place photo" },
          { status: response.status }
        );
      },
      "public, max-age=604800, stale-while-revalidate=2592000"
    );
  } catch (error) {
    console.error("Place photo error:", error);
    return Response.json(
      { error: "Failed to fetch place photo" },
      { status: 500 }
    );
  }
}

async function fetchPhoto(name: string, maxHeightPx: string, maxWidthPx: string, apiKey: string | undefined): Promise<Response> {
  return fetch(
    `https://places.googleapis.com/v1/${name}/media?maxHeightPx=${encodeURIComponent(
      maxHeightPx
    )}&maxWidthPx=${encodeURIComponent(maxWidthPx)}&key=${apiKey}`
  );
}

/** Extract the place_id from a photo name like "places/ChIJ.../photos/Abc" */
function extractPlaceId(name: string): string | null {
  const match = name.match(/^places\/([^/]+)\/photos\//);
  return match ? match[1] : null;
}

/** Fetch a fresh photo name for a place_id from the Places Details API */
async function getFreshPhotoName(placeId: string, apiKey: string | undefined): Promise<string | null> {
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey || "",
          "X-Goog-FieldMask": "photos",
        },
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { photos?: Array<{ name: string }> };
    return data.photos?.[0]?.name || null;
  } catch {
    return null;
  }
}
