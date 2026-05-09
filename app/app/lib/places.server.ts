interface PlacesDetailsResponse {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  photos?: Array<{ name: string }>;
  currentOpeningHours?: {
    weekdayDescriptions?: string[];
  };
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  googleMapsUrl: string;
  rating: number;
  ratingCount: number;
  priceLevel: number;
  photoUrl: string;
  cuisine: string;
  openingHours: string | null;
}

const PLACE_ID_PATTERN = /^[A-Za-z0-9._:-]{3,200}$/;

export function isValidPlaceId(placeId: unknown): placeId is string {
  return typeof placeId === "string" && PLACE_ID_PATTERN.test(placeId);
}

const PLACE_DETAILS_FIELD_MASK = [
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
].join(",");

export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetails> {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Places details request failed with status ${response.status}`);
  }

  const data = (await response.json()) as PlacesDetailsResponse;

  const photoUrl = data.photos?.[0]?.name
    ? `/api/places/photo?${new URLSearchParams({
        name: data.photos[0].name,
        maxHeightPx: "400",
        maxWidthPx: "400",
      }).toString()}`
    : "";

  return {
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
}

/**
 * Maps a PlaceDetails response to the subset of restaurant columns derived
 * from Google. Single source of truth for "what we collect from Google" —
 * both the add-restaurant action and the admin refresh use this. Add a
 * source field once here and both paths pick it up automatically.
 *
 * Fields whose Google value is empty/zero are omitted so a partial response
 * cannot wipe out existing data. The lookup key (google_place_id) and
 * non-Google fields (reservation_url, menu_url) are intentionally excluded.
 */
export interface RestaurantFieldsFromPlace {
  name?: string;
  address?: string;
  google_rating?: number;
  rating_count?: number;
  price_level?: number;
  cuisine?: string;
  phone_number?: string;
  google_maps_url?: string;
  photo_url?: string;
  opening_hours?: string;
}

export function placeDetailsToRestaurantFields(
  details: PlaceDetails
): RestaurantFieldsFromPlace {
  const fields: RestaurantFieldsFromPlace = {};
  if (details.name) fields.name = details.name;
  if (details.address) fields.address = details.address;
  if (details.rating > 0) fields.google_rating = details.rating;
  if (details.ratingCount > 0) fields.rating_count = details.ratingCount;
  if (details.priceLevel > 0) fields.price_level = details.priceLevel;
  if (details.cuisine && details.cuisine !== "Restaurant") {
    fields.cuisine = details.cuisine;
  }
  if (details.phone) fields.phone_number = details.phone;
  if (details.googleMapsUrl) fields.google_maps_url = details.googleMapsUrl;
  if (details.photoUrl) fields.photo_url = details.photoUrl;
  if (details.openingHours) fields.opening_hours = details.openingHours;
  return fields;
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
