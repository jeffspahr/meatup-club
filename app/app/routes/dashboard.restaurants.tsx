import { useSubmit } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.restaurants";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import { AddRestaurantModal } from "../components/AddRestaurantModal";

interface Suggestion {
  id: number;
  user_id: number;
  event_id: number;
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

  // Get all restaurants
  const suggestionsResult = await db
    .prepare(`
      SELECT
        rs.*,
        u.name as suggested_by_name,
        u.email as suggested_by_email
      FROM restaurant_suggestions rs
      JOIN users u ON rs.user_id = u.id
      ORDER BY rs.created_at DESC
    `)
    .all();

  return {
    suggestions: suggestionsResult.results || [],
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

    // Get active poll (optional - suggestions can exist without a poll)
    const activePoll = await db
      .prepare(`SELECT id FROM polls WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
      .first();

    await db
      .prepare(`
        INSERT INTO restaurant_suggestions (
          user_id, poll_id, name, address, cuisine, url,
          google_place_id, google_rating, rating_count, price_level,
          phone_number, reservation_url, menu_url, photo_url, google_maps_url, opening_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        user.id,
        activePoll?.id || null,
        name,
        address || null,
        cuisine || null,
        url || null,
        googlePlaceId || null,
        googleRating ? parseFloat(googleRating as string) : null,
        ratingCount ? parseInt(ratingCount as string) : null,
        priceLevel ? parseInt(priceLevel as string) : null,
        phoneNumber || null,
        reservationUrl || null,
        menuUrl || null,
        photoUrl || null,
        googleMapsUrl || null,
        openingHours || null
      )
      .run();

    return redirect('/dashboard/restaurants');
  }

  if (action === 'delete') {
    const suggestionId = formData.get('suggestion_id');

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    // Check if user owns this suggestion or is admin
    const suggestion = await db
      .prepare('SELECT user_id FROM restaurant_suggestions WHERE id = ?')
      .bind(suggestionId)
      .first();

    if (!suggestion) {
      return { error: 'Suggestion not found' };
    }

    // Allow deletion if user is admin or owns the suggestion
    if (user.is_admin || suggestion.user_id === user.id) {
      await db
        .prepare('DELETE FROM restaurant_suggestions WHERE id = ?')
        .bind(suggestionId)
        .run();
    } else {
      return { error: 'You do not have permission to delete this suggestion' };
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
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold">Restaurants</h1>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors"
          >
            + Add Restaurant
          </button>
        </div>
        <p className="text-gray-600">
          Manage the restaurant collection. Visit the <a href="/dashboard/polls" className="text-meat-red hover:underline">Polls page</a> to vote.
        </p>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {/* Restaurant Modal */}
      <AddRestaurantModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleRestaurantSubmit}
      />

      {/* Restaurants List */}
      {suggestions.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            No restaurants yet. Be the first to add one!
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors"
          >
            Add Restaurant
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">
            All Restaurants ({suggestions.length})
          </h2>
          {suggestions.map((suggestion: any) => (
              <div
                key={suggestion.id}
                className="bg-white border border-gray-200 rounded-lg hover:shadow-lg transition-shadow"
              >
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
                          <h3 className="text-xl font-semibold text-gray-900">
                            {suggestion.name}
                          </h3>
                          {suggestion.google_rating && suggestion.google_rating > 0 && (
                            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded">
                              <span className="text-amber-600">⭐</span>
                              <span className="font-semibold text-amber-900">
                                {suggestion.google_rating.toFixed(1)}
                              </span>
                              {suggestion.rating_count && (
                                <span className="text-xs text-gray-600">
                                  ({suggestion.rating_count})
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Cuisine & Price */}
                        <div className="flex items-center gap-3 mb-3">
                          {suggestion.cuisine && (
                            <span className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-700">
                              {suggestion.cuisine}
                            </span>
                          )}
                          {suggestion.price_level && suggestion.price_level > 0 && (
                            <span className="text-sm font-medium text-gray-600">
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
                                <p className="text-sm text-gray-600 flex items-center gap-2 cursor-help">
                                  <span className="text-gray-400">🕒</span>
                                  <span className="font-medium">{daysOpen.join(', ')}</span>
                                  <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
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
                          <p className="text-gray-600 mb-3 flex items-start gap-2">
                            <span className="text-gray-400">📍</span>
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
                              className="text-sm text-amber-600 hover:text-amber-700 hover:underline"
                            >
                              Website →
                            </a>
                          )}
                          {suggestion.phone_number && (
                            <a
                              href={`tel:${suggestion.phone_number}`}
                              className="text-sm text-gray-600 hover:text-gray-700"
                            >
                              {suggestion.phone_number}
                            </a>
                          )}
                        </div>

                        <p className="text-sm text-gray-500">
                          Suggested by {suggestion.suggested_by_name}
                        </p>
                      </div>

                      {/* Delete button - shown if user owns or is admin */}
                      {(currentUser.isAdmin || suggestion.user_id === currentUser.id) && (
                        <div className="ml-6 flex items-start">
                          <button
                            onClick={() => handleDelete(suggestion.id, suggestion.name)}
                            className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete suggestion"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </main>
  );
}
