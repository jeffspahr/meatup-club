import { useSubmit } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.restaurants";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import { AddRestaurantModal } from "../components/AddRestaurantModal";
import {
  createRestaurant,
  findRestaurantByPlaceId,
  deleteRestaurant,
} from "../lib/restaurants.server";
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { ClockIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";

interface RestaurantDisplay {
  id: number;
  created_by: number;
  name: string;
  address: string | null;
  cuisine: string | null;
  url: string | null;
  created_at: string;
  suggested_by_name: string;
  suggested_by_email: string;
  google_place_id: string | null;
  google_rating: number | null;
  rating_count: number | null;
  price_level: number | null;
  phone_number: string | null;
  reservation_url: string | null;
  menu_url: string | null;
  photo_url: string | null;
  google_maps_url: string | null;
  opening_hours: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  // Get all global restaurants
  const restaurantsResult = await db
    .prepare(`
      SELECT
        r.*,
        u.name as suggested_by_name,
        u.email as suggested_by_email
      FROM restaurants r
      LEFT JOIN users u ON r.created_by = u.id
      ORDER BY r.created_at DESC
    `)
    .all();

  const suggestions = (restaurantsResult.results || []).map((suggestion: any) => ({
    ...suggestion,
    photo_url: getProxiedPhotoUrl(suggestion.photo_url),
  }));

  return {
    suggestions,
    currentUser: {
      id: user.id,
      isAdmin: user.is_admin === 1,
    }
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const action = formData.get('_action');

  if (action === 'suggest') {
    const name = formData.get('name');
    const address = formData.get('address');
    const cuisine = formData.get('cuisine');
    const url = formData.get('url');
    const googlePlaceId = formData.get('google_place_id');
    const googleRating = formData.get('google_rating');
    const ratingCount = formData.get('rating_count');
    const priceLevel = formData.get('price_level');
    const phoneNumber = formData.get('phone_number');
    const reservationUrl = formData.get('reservation_url');
    const menuUrl = formData.get('menu_url');
    const photoUrl = formData.get('photo_url');
    const googleMapsUrl = formData.get('google_maps_url');
    const openingHours = formData.get('opening_hours');

    if (!name) {
      return { error: 'Restaurant name is required' };
    }

    // Check for duplicate by google_place_id
    if (googlePlaceId) {
      const existing = await findRestaurantByPlaceId(db, googlePlaceId as string);
      if (existing) {
        return { error: 'This restaurant has already been added' };
      }
    }

    // Create global restaurant
    await createRestaurant(db, {
      name: name as string,
      address: address as string | undefined,
      google_place_id: googlePlaceId as string | undefined,
      google_rating: googleRating ? parseFloat(googleRating as string) : undefined,
      rating_count: ratingCount ? parseInt(ratingCount as string) : undefined,
      price_level: priceLevel ? parseInt(priceLevel as string) : undefined,
      cuisine: cuisine as string | undefined,
      phone_number: phoneNumber as string | undefined,
      reservation_url: reservationUrl as string | undefined,
      menu_url: menuUrl as string | undefined,
      photo_url: photoUrl as string | undefined,
      google_maps_url: googleMapsUrl as string | undefined,
      opening_hours: openingHours as string | undefined,
      created_by: user.id,
    });

    return redirect('/dashboard/restaurants');
  }

  if (action === 'delete') {
    const restaurantId = formData.get('suggestion_id');

    if (!restaurantId) {
      return { error: 'Restaurant ID is required' };
    }

    // Check if user owns this restaurant or is admin
    const restaurant = await db
      .prepare('SELECT created_by FROM restaurants WHERE id = ?')
      .bind(restaurantId)
      .first();

    if (!restaurant) {
      return { error: 'Restaurant not found' };
    }

    // Allow deletion if user is admin or owns the restaurant
    if (user.is_admin || restaurant.created_by === user.id) {
      await deleteRestaurant(db, parseInt(restaurantId as string));
    } else {
      return { error: 'You do not have permission to delete this restaurant' };
    }

    return redirect('/dashboard/restaurants');
  }

  return { error: 'Invalid action' };
}

export default function RestaurantsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { suggestions, currentUser } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const submit = useSubmit();

  function handleDelete(suggestionId: number, restaurantName: string) {
    if (confirm(`Are you sure you want to delete "${restaurantName}"? This action cannot be undone.`)) {
      const formData = new FormData();
      formData.append('_action', 'delete');
      formData.append('suggestion_id', suggestionId.toString());
      submit(formData, { method: 'post' });
    }
  }

  function handleRestaurantSubmit(placeDetails: any) {
    const formData = new FormData();
    formData.append('_action', 'suggest');
    formData.append('name', placeDetails.name);
    formData.append('address', placeDetails.address || '');
    formData.append('cuisine', placeDetails.cuisine || '');
    formData.append('url', placeDetails.website || '');
    formData.append('google_place_id', placeDetails.placeId || '');
    formData.append('google_rating', placeDetails.rating?.toString() || '');
    formData.append('rating_count', placeDetails.ratingCount?.toString() || '');
    formData.append('price_level', placeDetails.priceLevel?.toString() || '');
    formData.append('phone_number', placeDetails.phone || '');
    formData.append('photo_url', placeDetails.photoUrl || '');
    formData.append('google_maps_url', placeDetails.googleMapsUrl || '');
    formData.append('opening_hours', placeDetails.openingHours || '');

    submit(formData, { method: 'post' });
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Restaurants"
        description={
          <>
            Manage the restaurant collection. Visit the <a href="/dashboard/polls" className="text-accent hover:underline">Polls page</a> to vote.
          </>
        }
        actions={
          <Button onClick={() => setShowModal(true)}>
            + Add Restaurant
          </Button>
        }
      />

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      {/* Restaurant Modal */}
      <AddRestaurantModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleRestaurantSubmit}
      />

      {/* Restaurants List */}
      {suggestions.length === 0 ? (
        <EmptyState
          title="No restaurants yet"
          description="Be the first to add one!"
          action={
            <Button onClick={() => setShowModal(true)}>
              Add Restaurant
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">
            All Restaurants ({suggestions.length})
          </h2>
          {suggestions.map((suggestion: any) => (
              <Card key={suggestion.id} className="hover:shadow-lg transition-shadow">
                <div className="flex flex-col md:flex-row">
                  {/* Restaurant Photo */}
                  {suggestion.photo_url && (
                    <div className="md:w-48 h-48 md:h-auto flex-shrink-0 overflow-hidden md:rounded-l-lg">
                      <img
                        src={suggestion.photo_url}
                        alt={suggestion.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex-1 p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Restaurant Name & Rating */}
                        <div className="flex items-start gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-foreground">
                            {suggestion.name}
                          </h3>
                          {suggestion.google_rating && suggestion.google_rating > 0 && (
                            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded">
                              <StarIcon className="w-4 h-4 text-amber-500" />
                              <span className="font-semibold text-amber-900">
                                {suggestion.google_rating.toFixed(1)}
                              </span>
                              {suggestion.rating_count && (
                                <span className="text-xs text-muted-foreground">
                                  ({suggestion.rating_count})
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Cuisine & Price */}
                        <div className="flex items-center gap-3 mb-3">
                          {suggestion.cuisine && (
                            <Badge variant="muted">{suggestion.cuisine}</Badge>
                          )}
                          {suggestion.price_level && suggestion.price_level > 0 && (
                            <span className="text-sm font-medium text-muted-foreground">
                              {"$".repeat(suggestion.price_level)}
                            </span>
                          )}
                        </div>

                        {/* Opening Hours */}
                        {suggestion.opening_hours && (() => {
                          try {
                            const hours = JSON.parse(suggestion.opening_hours);
                            // Extract days from hours like "Monday: 11:00 AM – 10:00 PM"
                            const daysOpen = hours.map((h: string) => {
                              const day = h.split(':')[0];
                              return day.substring(0, 3); // Mon, Tue, Wed, etc.
                            });

                            return (
                              <div className="mb-3 group relative">
                                <p className="text-sm text-muted-foreground flex items-center gap-2 cursor-help">
                                  <ClockIcon className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{daysOpen.join(', ')}</span>
                                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                    (hover for hours)
                                  </span>
                                </p>
                                {/* Tooltip with full hours */}
                                <div className="absolute left-0 top-full mt-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg z-10 min-w-[250px]">
                                  <div className="space-y-1">
                                    {hours.map((h: string, idx: number) => (
                                      <div key={idx} className="flex justify-between gap-3">
                                        <span className="font-medium">{h.split(':')[0]}:</span>
                                        <span className="text-gray-300">{h.split(':').slice(1).join(':').trim()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          } catch {
                            return null;
                          }
                        })()}

                        {/* Address */}
                        {suggestion.address && (
                          <p className="text-muted-foreground mb-3 flex items-start gap-2">
                            <MapPinIcon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <span>{suggestion.address}</span>
                          </p>
                        )}

                        {/* Links */}
                        <div className="flex flex-wrap gap-3 mb-3">
                          {suggestion.google_maps_url && (
                            <a
                              href={suggestion.google_maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              View on Google Maps →
                            </a>
                          )}
                          {suggestion.url && (
                            <a
                              href={suggestion.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-accent hover:text-accent/80 hover:underline"
                            >
                              Website →
                            </a>
                          )}
                          {suggestion.phone_number && (
                            <a
                              href={`tel:${suggestion.phone_number}`}
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {suggestion.phone_number}
                            </a>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          Suggested by {suggestion.suggested_by_name}
                        </p>
                      </div>

                      {/* Delete button - shown if user owns or is admin */}
                      {(currentUser.isAdmin || suggestion.created_by === currentUser.id) && (
                        <div className="ml-6 flex items-start">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(suggestion.id, suggestion.name)}
                            title="Delete suggestion"
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          )}
        </div>
      )}
    </main>
  );
}

function getProxiedPhotoUrl(photoUrl: string | null): string | null {
  if (!photoUrl) {
    return photoUrl;
  }

  try {
    const parsed = new URL(photoUrl);
    if (parsed.hostname !== "places.googleapis.com") {
      return photoUrl;
    }

    const path = parsed.pathname;
    if (!path.startsWith("/v1/") || !path.endsWith("/media")) {
      return photoUrl;
    }

    const name = path.replace(/^\/v1\//, "").replace(/\/media$/, "");
    const maxHeightPx = parsed.searchParams.get("maxHeightPx") || "400";
    const maxWidthPx = parsed.searchParams.get("maxWidthPx") || "400";

    return `/api/places/photo?${new URLSearchParams({
      name,
      maxHeightPx,
      maxWidthPx,
    }).toString()}`;
  } catch {
    return photoUrl;
  }
}
