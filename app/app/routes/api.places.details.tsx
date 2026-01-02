import type { Route } from "./+types/api.places.details";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const placeId = url.searchParams.get("placeId");
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  if (!placeId) {
    return Response.json({ error: "Place ID is required" }, { status: 400 });
  }

  try {
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    // Use Google Places API (New) - Place Details
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "id",
            "displayName",
            "formattedAddress",
            "internationalPhoneNumber",
            "websiteUri",
            "googleMapsUri",
            "rating",
            "userRatingCount",
            "priceLevel",
            "types",
            "photos",
            "editorialSummary",
            "currentOpeningHours",
          ].join(","),
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Place details error:", error);
      throw new Error("Failed to fetch place details");
    }

    const data = await response.json();
    const photoUrl = data.photos?.[0]?.name
      ? `/api/places/photo?${new URLSearchParams({
          name: data.photos[0].name,
          maxHeightPx: "400",
          maxWidthPx: "400",
        }).toString()}`
      : "";
    
    // Transform to our format
    const placeData = {
      placeId: data.id,
      name: data.displayName?.text || "",
      address: data.formattedAddress || "",
      phone: data.internationalPhoneNumber || "",
      website: data.websiteUri || "",
      googleMapsUrl: data.googleMapsUri || "",
      rating: data.rating || 0,
      ratingCount: data.userRatingCount || 0,
      priceLevel: data.priceLevel ? getPriceLevelNumber(data.priceLevel) : 0,
      photoUrl,
      cuisine: getCuisineFromTypes(data.types || []),
      openingHours: data.currentOpeningHours?.weekdayDescriptions
        ? JSON.stringify(data.currentOpeningHours.weekdayDescriptions)
        : null,
    };

    const headers = new Headers({
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    });
    const jsonResponse = Response.json(placeData, { headers });
    context.cloudflare.ctx.waitUntil(cache.put(cacheKey, jsonResponse.clone()));
    return jsonResponse;
  } catch (error) {
    console.error("Place details error:", error);
    return Response.json(
      { error: "Failed to fetch place details" },
      { status: 500 }
    );
  }
}

function getPriceLevelNumber(priceLevel: string): number {
  const mapping: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return mapping[priceLevel] || 0;
}

function getCuisineFromTypes(types: string[]): string {
  // Map Google types to cuisine names
  const cuisineMap: Record<string, string> = {
    american_restaurant: "American",
    italian_restaurant: "Italian",
    chinese_restaurant: "Chinese",
    japanese_restaurant: "Japanese",
    mexican_restaurant: "Mexican",
    french_restaurant: "French",
    indian_restaurant: "Indian",
    thai_restaurant: "Thai",
    spanish_restaurant: "Spanish",
    greek_restaurant: "Greek",
    korean_restaurant: "Korean",
    vietnamese_restaurant: "Vietnamese",
    brazilian_restaurant: "Brazilian",
    steak_house: "Steakhouse",
    seafood_restaurant: "Seafood",
    barbecue_restaurant: "BBQ",
    pizza_restaurant: "Pizza",
    hamburger_restaurant: "Burgers",
    sushi_restaurant: "Sushi",
  };

  for (const type of types) {
    if (cuisineMap[type]) {
      return cuisineMap[type];
    }
  }

  return "Restaurant";
}
