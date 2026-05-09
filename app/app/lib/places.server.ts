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
 * Single source of truth for "what we collect from Google."
 *
 * Each entry maps a restaurants-table column name to a function that pulls
 * the corresponding value from a PlaceDetails response, returning undefined
 * for missing/empty data. The mapper, the typed result shape, and the
 * column list exported for the admin refresh all derive from this object —
 * adding a new field is a single edit here.
 *
 * The lookup key (google_place_id) and non-Google fields (reservation_url,
 * menu_url) are intentionally excluded.
 */
type FieldExtractor<T extends string | number> = (details: PlaceDetails) => T | undefined;

const PLACE_FIELD_EXTRACTORS = {
  name: (d) => d.name || undefined,
  address: (d) => d.address || undefined,
  google_rating: (d) => (d.rating > 0 ? d.rating : undefined),
  rating_count: (d) => (d.ratingCount > 0 ? d.ratingCount : undefined),
  price_level: (d) => (d.priceLevel > 0 ? d.priceLevel : undefined),
  cuisine: (d) => (d.cuisine && d.cuisine !== "Restaurant" ? d.cuisine : undefined),
  phone_number: (d) => d.phone || undefined,
  google_maps_url: (d) => d.googleMapsUrl || undefined,
  photo_url: (d) => d.photoUrl || undefined,
  opening_hours: (d) => d.openingHours || undefined,
} satisfies Record<string, FieldExtractor<string | number>>;

export type RestaurantFieldsFromPlace = Partial<{
  [K in keyof typeof PLACE_FIELD_EXTRACTORS]: NonNullable<
    ReturnType<typeof PLACE_FIELD_EXTRACTORS[K]>
  >;
}>;

export const PLACE_MAPPER_COLUMNS = Object.keys(
  PLACE_FIELD_EXTRACTORS,
) as Array<keyof RestaurantFieldsFromPlace>;

export function placeDetailsToRestaurantFields(
  details: PlaceDetails,
): RestaurantFieldsFromPlace {
  const fields = {} as Record<string, string | number>;
  for (const column of PLACE_MAPPER_COLUMNS) {
    const value = PLACE_FIELD_EXTRACTORS[column](details);
    if (value !== undefined) {
      fields[column] = value;
    }
  }
  return fields as RestaurantFieldsFromPlace;
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
