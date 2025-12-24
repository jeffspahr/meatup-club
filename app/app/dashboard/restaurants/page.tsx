'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export const runtime = 'edge';

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

export default function RestaurantsPage() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [voting, setVoting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    cuisine: '',
    url: '',
  });

  useEffect(() => {
    fetchSuggestions();
  }, []);

  async function fetchSuggestions() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/restaurants');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch restaurant suggestions');
      }

      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Restaurant name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch('/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit suggestion');
      }

      // Reset form and refresh suggestions
      setFormData({ name: '', address: '', cuisine: '', url: '' });
      setShowForm(false);
      await fetchSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(suggestionId: number, currentlyVoted: boolean) {
    try {
      setVoting(suggestionId);
      setError(null);

      const res = await fetch('/api/restaurants/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion_id: suggestionId,
          action: currentlyVoted ? 'remove' : 'add',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to vote');
      }

      // Refresh suggestions
      await fetchSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setVoting(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8">Restaurant Voting</h1>
        <p className="text-gray-600">Loading suggestions...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Restaurant Voting</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Suggest Restaurant'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Suggestion Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Suggest a Restaurant</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Restaurant Name *
              </label>
              <input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Ruth's Chris Steak House"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label
                htmlFor="address"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Address
              </label>
              <input
                id="address"
                type="text"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="e.g., 123 Main St, San Francisco, CA"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label
                htmlFor="cuisine"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Cuisine Type
              </label>
              <input
                id="cuisine"
                type="text"
                value={formData.cuisine}
                onChange={(e) =>
                  setFormData({ ...formData, cuisine: e.target.value })
                }
                placeholder="e.g., Steakhouse, American, Brazilian"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label
                htmlFor="url"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Website URL
              </label>
              <input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) =>
                  setFormData({ ...formData, url: e.target.value })
                }
                placeholder="https://example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Suggestion'}
            </button>
          </form>
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
          {suggestions.map((suggestion) => {
            const hasVoted = suggestion.user_has_voted > 0;
            const isVoting = voting === suggestion.id;

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
                      disabled={isVoting}
                      className={`px-6 py-3 rounded-md font-medium transition-colors min-w-[120px] ${
                        hasVoted
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-white border-2 border-amber-600 text-amber-600 hover:bg-amber-50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isVoting ? '...' : hasVoted ? '✓ Voted' : 'Vote'}
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
    </div>
  );
}
