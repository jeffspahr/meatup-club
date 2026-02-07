import type { Route } from "./+types/api.places.photo";
import { withCache } from "../lib/cache.server";

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
    return await withCache(
      request,
      context,
      async () => {
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

        return new Response(response.body, {
          status: response.status,
          headers: new Headers(response.headers),
        });
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
