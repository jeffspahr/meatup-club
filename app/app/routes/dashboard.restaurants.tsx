import { Form, useActionData, useSubmit } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.restaurants";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import { RestaurantAutocomplete } from "../components/RestaurantAutocomplete";

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
  vote_count: number;
  user_has_voted: number;
  google_place_id: string | null;
  google_rating: number | null;
  rating_count: number | null;
  price_level: number | null;
  phone_number: string | null;
  reservation_url: string | null;
  menu_url: string | null;
  photo_url: string | null;
  google_maps_url: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  // Get restaurant suggestions with vote counts
  const suggestionsResult = await db
    .prepare(`
      SELECT
        rs.*,
        u.name as suggested_by_name,
        u.email as suggested_by_email,
        (SELECT COUNT(*) FROM restaurant_votes WHERE suggestion_id = rs.id) as vote_count,
        (SELECT COUNT(*) FROM restaurant_votes WHERE suggestion_id = rs.id AND user_id = ?) as user_has_voted
      FROM restaurant_suggestions rs
      JOIN users u ON rs.user_id = u.id
      ORDER BY vote_count DESC, rs.created_at DESC
    `)
    .bind(user.id)
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

    if (!name) {
      return { error: 'Restaurant name is required' };
    }

    await db
      .prepare(`
        INSERT INTO restaurant_suggestions (
          user_id, name, address, cuisine, url,
          google_place_id, google_rating, rating_count, price_level,
          phone_number, reservation_url, menu_url, photo_url, google_maps_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        user.id,
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
        googleMapsUrl || null
      )
      .run();

    return redirect('/dashboard/restaurants');
  }

  if (action === 'vote') {
    const suggestionId = formData.get('suggestion_id');
    const remove = formData.get('remove') === 'true';

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    if (remove) {
      // Remove vote
      await db
        .prepare('DELETE FROM restaurant_votes WHERE suggestion_id = ? AND user_id = ?')
        .bind(suggestionId, user.id)
        .run();
    } else {
      // Add vote (check if already voted)
      const existing = await db
        .prepare('SELECT id FROM restaurant_votes WHERE suggestion_id = ? AND user_id = ?')
        .bind(suggestionId, user.id)
        .first();

      if (!existing) {
        await db
          .prepare('INSERT INTO restaurant_votes (suggestion_id, user_id) VALUES (?, ?)')
          .bind(suggestionId, user.id)
          .run();
      }
    }

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
  const [showForm, setShowForm] = useState(false);
  const submit = useSubmit();
  const [restaurantName, setRestaurantName] = useState("");
  const [placeDetails, setPlaceDetails] = useState<any>(null);

  function handleVote(suggestionId: number, currentlyVoted: boolean) {
    const formData = new FormData();
    formData.append('_action', 'vote');
    formData.append('suggestion_id', suggestionId.toString());
    formData.append('remove', currentlyVoted.toString());
    submit(formData, { method: 'post' });
  }

  function handleDelete(suggestionId: number, restaurantName: string) {
    if (confirm(`Are you sure you want to delete "${restaurantName}"? This action cannot be undone.`)) {
      const formData = new FormData();
      formData.append('_action', 'delete');
      formData.append('suggestion_id', suggestionId.toString());
      submit(formData, { method: 'post' });
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Restaurant Voting</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Suggest Restaurant'}
        </button>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {/* Suggestion Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Suggest a Restaurant</h2>
          <Form method="post" className="space-y-4" onSubmit={() => {
            setShowForm(false);
            setRestaurantName("");
            setPlaceDetails(null);
          }}>
            <input type="hidden" name="_action" value="suggest" />
            <input type="hidden" name="name" value={placeDetails?.name || restaurantName} />
            <input type="hidden" name="address" value={placeDetails?.address || ""} />
            <input type="hidden" name="cuisine" value={placeDetails?.cuisine || ""} />
            <input type="hidden" name="url" value={placeDetails?.website || ""} />
            <input type="hidden" name="google_place_id" value={placeDetails?.placeId || ""} />
            <input type="hidden" name="google_rating" value={placeDetails?.rating || ""} />
            <input type="hidden" name="rating_count" value={placeDetails?.ratingCount || ""} />
            <input type="hidden" name="price_level" value={placeDetails?.priceLevel || ""} />
            <input type="hidden" name="phone_number" value={placeDetails?.phone || ""} />
            <input type="hidden" name="photo_url" value={placeDetails?.photoUrl || ""} />
            <input type="hidden" name="google_maps_url" value={placeDetails?.googleMapsUrl || ""} />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search for Restaurant *
              </label>
              <RestaurantAutocomplete
                value={restaurantName}
                onChange={setRestaurantName}
                onSelect={(details) => {
                  setPlaceDetails(details);
                  setRestaurantName(details.name);
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Start typing to search Google Places
              </p>
            </div>

            {placeDetails && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-2">✓ Restaurant Found</h3>
                <div className="space-y-1 text-sm text-green-800">
                  <p><strong>{placeDetails.name}</strong></p>
                  {placeDetails.address && <p>{placeDetails.address}</p>}
                  {placeDetails.cuisine && <p>Cuisine: {placeDetails.cuisine}</p>}
                  {placeDetails.rating > 0 && (
                    <p>⭐ {placeDetails.rating} ({placeDetails.ratingCount} reviews)</p>
                  )}
                  {placeDetails.priceLevel > 0 && (
                    <p>{"$".repeat(placeDetails.priceLevel)}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!restaurantName}
                className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Suggestion
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setRestaurantName("");
                  setPlaceDetails(null);
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Suggestions List */}
      {suggestions.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            No restaurant suggestions yet. Be the first to suggest one!
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors"
          >
            Suggest Restaurant
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">
            Current Suggestions ({suggestions.length})
          </h2>
          {suggestions.map((suggestion: any) => {
            const hasVoted = suggestion.user_has_voted > 0;

            return (
              <div
                key={suggestion.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="flex flex-col md:flex-row">
                  {/* Restaurant Photo */}
                  {suggestion.photo_url && (
                    <div className="md:w-48 h-48 md:h-auto flex-shrink-0">
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

                      {/* Voting Section */}
                      <div className="ml-6 flex flex-col items-center gap-2">
                        <button
                          onClick={() => handleVote(suggestion.id, hasVoted)}
                          className={`px-6 py-3 rounded-md font-medium transition-colors min-w-[120px] ${
                            hasVoted
                              ? 'bg-amber-600 text-white hover:bg-amber-700'
                              : 'bg-white border-2 border-amber-600 text-amber-600 hover:bg-amber-50'
                          }`}
                        >
                          {hasVoted ? '✓ Voted' : 'Vote'}
                        </button>

                        <div className="text-center">
                          <p className="text-3xl font-bold text-gray-900">
                            {suggestion.vote_count}
                          </p>
                          <p className="text-sm text-gray-600">
                            {suggestion.vote_count === 1 ? 'vote' : 'votes'}
                          </p>
                        </div>

                        {/* Delete button - shown if user owns or is admin */}
                        {(currentUser.isAdmin || suggestion.user_id === currentUser.id) && (
                          <button
                            onClick={() => handleDelete(suggestion.id, suggestion.name)}
                            className="mt-2 px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete suggestion"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
