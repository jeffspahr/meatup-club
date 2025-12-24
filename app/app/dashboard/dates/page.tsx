'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardNav from '@/components/DashboardNav';

export const runtime = 'edge';

interface DateSuggestion {
  id: number;
  user_id: number;
  event_id: number;
  suggested_date: string;
  created_at: string;
  suggested_by_name: string;
  suggested_by_email: string;
  vote_count: number;
  user_has_voted: number;
}

export default function DatesPage() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<DateSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [voting, setVoting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    fetchSuggestions();
  }, []);

  async function fetchSuggestions() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/dates');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch date suggestions');
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

    if (!selectedDate) {
      setError('Please select a date');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch('/api/dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggested_date: selectedDate }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit date suggestion');
      }

      // Reset form and refresh suggestions
      setSelectedDate('');
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

      const res = await fetch('/api/dates/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_suggestion_id: suggestionId,
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

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function getMinDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-8">Date Voting</h1>
          <p className="text-gray-600">Loading suggestions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <div className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Date Voting</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Suggest Date'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Date Suggestion Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Suggest a Date</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="date"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Select a Date *
              </label>
              <input
                id="date"
                type="date"
                required
                min={getMinDate()}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
              <p className="text-sm text-gray-500 mt-1">
                Choose a potential date for the next meetup
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Date'}
            </button>
          </form>
        </div>
      )}

      {/* Suggestions List */}
      {suggestions.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            No date suggestions yet. Be the first to suggest one!
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            Suggest Date
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">
            Suggested Dates ({suggestions.length})
          </h2>
          {suggestions.map((suggestion) => {
            const hasVoted = suggestion.user_has_voted > 0;
            const isVoting = voting === suggestion.id;
            const isPast = new Date(suggestion.suggested_date) < new Date();

            return (
              <div
                key={suggestion.id}
                className={`bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow ${
                  isPast ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">
                      {formatDate(suggestion.suggested_date)}
                    </h3>

                    {isPast && (
                      <p className="text-red-600 text-sm mb-2">
                        ⚠️ This date is in the past
                      </p>
                    )}

                    <p className="text-sm text-gray-500">
                      Suggested by {suggestion.suggested_by_name}
                    </p>
                  </div>

                  <div className="ml-6 flex flex-col items-center gap-2">
                    <button
                      onClick={() => handleVote(suggestion.id, hasVoted)}
                      disabled={isVoting || isPast}
                      className={`px-6 py-3 rounded-md font-medium transition-colors min-w-[120px] ${
                        hasVoted
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
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
    </div>
  );
}
