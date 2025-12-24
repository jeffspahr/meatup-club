import { Form, useActionData, useSubmit } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.restaurants";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";

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

  return { suggestions: suggestionsResult.results || [] };
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

    if (!name) {
      return { error: 'Restaurant name is required' };
    }

    await db
      .prepare('INSERT INTO restaurant_suggestions (user_id, name, address, cuisine, url) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, name, address || null, cuisine || null, url || null)
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

  return { error: 'Invalid action' };
}

export default function RestaurantsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { suggestions } = loaderData;
  const [showForm, setShowForm] = useState(false);
  const submit = useSubmit();

  function handleVote(suggestionId: number, currentlyVoted: boolean) {
    const formData = new FormData();
    formData.append('_action', 'vote');
    formData.append('suggestion_id', suggestionId.toString());
    formData.append('remove', currentlyVoted.toString());
    submit(formData, { method: 'post' });
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
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="suggest" />

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Restaurant Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g., Ruth's Chris Steak House"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <input
                id="address"
                name="address"
                type="text"
                placeholder="e.g., 123 Main St, San Francisco, CA"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="cuisine" className="block text-sm font-medium text-gray-700 mb-1">
                Cuisine Type
              </label>
              <input
                id="cuisine"
                name="cuisine"
                type="text"
                placeholder="e.g., Steakhouse, American, Brazilian"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
                Website URL
              </label>
              <input
                id="url"
                name="url"
                type="url"
                placeholder="https://example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors"
            >
              Submit Suggestion
            </button>
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
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">
                      {suggestion.name}
                    </h3>

                    {suggestion.cuisine && (
                      <p className="text-gray-600 mb-1">
                        <span className="font-medium">Cuisine:</span>{' '}
                        {suggestion.cuisine}
                      </p>
                    )}

                    {suggestion.address && (
                      <p className="text-gray-600 mb-1">
                        <span className="font-medium">Address:</span>{' '}
                        {suggestion.address}
                      </p>
                    )}

                    {suggestion.url && (
                      <p className="mb-2">
                        <a
                          href={suggestion.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-600 hover:text-amber-700 hover:underline"
                        >
                          Visit Website →
                        </a>
                      </p>
                    )}

                    <p className="text-sm text-gray-500 mt-2">
                      Suggested by {suggestion.suggested_by_name}
                    </p>
                  </div>

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
