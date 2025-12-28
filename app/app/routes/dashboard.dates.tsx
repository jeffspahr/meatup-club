import { Form, useSubmit } from "react-router";
import { formatDateForDisplay } from "../lib/dateUtils";
import { useState } from "react";
import type { Route } from "./+types/dashboard.dates";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import { DateCalendar } from "../components/DateCalendar";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  // Get the current active poll
  const activePoll = await db
    .prepare(`
      SELECT * FROM polls
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first();

  // Get date suggestions for active poll only
  // Only show dates from the active poll (dates require a poll to exist)
  const suggestionsResult = await db
    .prepare(`
      SELECT
        ds.*,
        u.name as suggested_by_name,
        u.email as suggested_by_email,
        (SELECT COUNT(*) FROM date_votes WHERE date_suggestion_id = ds.id AND poll_id = ?) as vote_count,
        (SELECT COUNT(*) FROM date_votes WHERE date_suggestion_id = ds.id AND user_id = ? AND poll_id = ?) as user_has_voted
      FROM date_suggestions ds
      JOIN users u ON ds.user_id = u.id
      WHERE ds.poll_id = ?
      ORDER BY ds.suggested_date ASC
    `)
    .bind(activePoll?.id || -1, user.id, activePoll?.id || -1, activePoll?.id || -1)
    .all();

  return {
    suggestions: suggestionsResult.results || [],
    activePoll: activePoll || null,
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
    const suggestedDate = formData.get('suggested_date');

    if (!suggestedDate) {
      return { error: 'Date is required' };
    }

    // Require active poll for date suggestions
    const activePoll = await db
      .prepare(`SELECT id FROM polls WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
      .first();

    if (!activePoll) {
      return { error: 'No active poll. Date suggestions require an active poll.' };
    }

    // Check for duplicate date in the same poll
    const existingDate = await db
      .prepare(`
        SELECT id FROM date_suggestions
        WHERE suggested_date = ? AND poll_id = ?
      `)
      .bind(suggestedDate, activePoll.id)
      .first();

    if (existingDate) {
      return { error: 'This date has already been suggested for the current poll' };
    }

    const result = await db
      .prepare('INSERT INTO date_suggestions (user_id, poll_id, suggested_date) VALUES (?, ?, ?)')
      .bind(user.id, activePoll.id, suggestedDate)
      .run();

    // Automatically vote for the date you just created
    if (result.meta.last_row_id) {
      await db
        .prepare('INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)')
        .bind(activePoll.id, result.meta.last_row_id, user.id)
        .run();
    }

    return redirect('/dashboard/dates');
  }

  if (action === 'vote') {
    const suggestionId = formData.get('suggestion_id');
    const remove = formData.get('remove') === 'true';

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    // Require active poll for voting
    const activePoll = await db
      .prepare(`SELECT id FROM polls WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
      .first();

    if (!activePoll) {
      return { error: 'No active poll. Voting requires an active poll.' };
    }

    if (remove) {
      // Remove this specific date vote (users can vote for multiple dates)
      await db
        .prepare('DELETE FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?')
        .bind(activePoll.id, suggestionId, user.id)
        .run();
    } else {
      // Add vote for this date (users can vote for multiple dates)
      const existing = await db
        .prepare('SELECT id FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?')
        .bind(activePoll.id, suggestionId, user.id)
        .first();

      if (!existing) {
        await db
          .prepare('INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)')
          .bind(activePoll.id, suggestionId, user.id)
          .run();
      }
    }

    return redirect('/dashboard/dates');
  }

  if (action === 'delete') {
    const suggestionId = formData.get('suggestion_id');

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    // Check if user owns this suggestion or is admin
    const suggestion = await db
      .prepare('SELECT user_id FROM date_suggestions WHERE id = ?')
      .bind(suggestionId)
      .first();

    if (!suggestion) {
      return { error: 'Suggestion not found' };
    }

    // Allow deletion if user is admin or owns the suggestion
    if (user.is_admin || suggestion.user_id === user.id) {
      await db
        .prepare('DELETE FROM date_suggestions WHERE id = ?')
        .bind(suggestionId)
        .run();
    } else {
      return { error: 'You do not have permission to delete this suggestion' };
    }

    return redirect('/dashboard/dates');
  }

  return { error: 'Invalid action' };
}

export default function DatesPage({ loaderData, actionData }: Route.ComponentProps) {
  const { suggestions, activePoll, currentUser } = loaderData;
  const [showForm, setShowForm] = useState(false);
  const [showNewPollForm, setShowNewPollForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const submit = useSubmit();

  function handleStartPoll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    fetch('/api/polls', {
      method: 'POST',
      body: formData,
    }).then(() => {
      window.location.reload();
    });
  }

  function handleVote(suggestionId: number, currentlyVoted: boolean) {
    const formData = new FormData();
    formData.append('_action', 'vote');
    formData.append('suggestion_id', suggestionId.toString());
    formData.append('remove', currentlyVoted.toString());
    submit(formData, { method: 'post' });
  }

  function handleDelete(suggestionId: number, dateStr: string) {
    if (confirm(`Are you sure you want to delete the date suggestion "${dateStr}"? This action cannot be undone.`)) {
      const formData = new FormData();
      formData.append('_action', 'delete');
      formData.append('suggestion_id', suggestionId.toString());
      submit(formData, { method: 'post' });
    }
  }

  function handleDateClick(dateStr: string) {
    // Only allow date interactions when there's an active poll
    if (!activePoll) {
      return;
    }

    // Find if this date already exists as a suggestion
    const existingSuggestion = suggestions.find(
      (s: any) => s.suggested_date === dateStr
    );

    const formData = new FormData();

    if (!existingSuggestion) {
      // Date doesn't exist - create it
      formData.append('_action', 'suggest');
      formData.append('suggested_date', dateStr);
    } else if (existingSuggestion.user_has_voted > 0) {
      // User has voted - remove vote (or delete if they created it)
      if (existingSuggestion.user_id === currentUser.id) {
        // User created this date - delete it
        formData.append('_action', 'delete');
        formData.append('suggestion_id', existingSuggestion.id.toString());
      } else {
        // User voted but didn't create - remove vote
        formData.append('_action', 'vote');
        formData.append('suggestion_id', existingSuggestion.id.toString());
        formData.append('remove', 'true');
      }
    } else {
      // Date exists but user hasn't voted - add vote
      formData.append('_action', 'vote');
      formData.append('suggestion_id', existingSuggestion.id.toString());
      formData.append('remove', 'false');
    }

    submit(formData, { method: 'post' });
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Date Voting</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={!activePoll}
            className={`px-6 py-2 rounded-md font-medium transition-colors ${
              activePoll
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            title={!activePoll ? 'Start a poll to suggest dates' : ''}
          >
            {showForm ? 'Cancel' : '+ Suggest Date'}
          </button>
          <button
            onClick={() => setShowNewPollForm(!showNewPollForm)}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 transition-colors"
          >
            {showNewPollForm ? 'Cancel' : '🗳️ Start New Poll'}
          </button>
        </div>
      </div>

      {/* Poll Status Indicator */}
      {activePoll ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-900">
                🗳️ Active Poll: {activePoll.title}
              </h3>
              <p className="text-sm text-green-700 mt-1">
                Started {formatDateForDisplay(activePoll.created_at)}
              </p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
              Active
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">⚠️</span>
            <p className="text-yellow-800 font-medium">
              No active poll. Start a new poll to begin voting on dates.
            </p>
          </div>
        </div>
      )}

      {/* Start New Poll Form */}
      {showNewPollForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Start New Poll</h2>
          <form onSubmit={handleStartPoll} className="space-y-4">
            <input type="hidden" name="_action" value="create" />
            <div>
              <label htmlFor="poll_title" className="block text-sm font-medium text-gray-700 mb-1">
                Poll Title *
              </label>
              <input
                id="poll_title"
                name="title"
                type="text"
                required
                placeholder="e.g., Q1 2025 Meetup Poll"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {activePoll && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm text-orange-800">
                  ⚠️ Starting a new poll will close the current active poll "{activePoll.title}".
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-6 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 transition-colors"
              >
                Start Poll
              </button>
              <button
                type="button"
                onClick={() => setShowNewPollForm(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {/* Suggestion Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Suggest a Date</h2>
          <Form
            method="post"
            className="space-y-4"
            onSubmit={() => {
              setSelectedDate("");
              setShowForm(false);
            }}
          >
            <input type="hidden" name="_action" value="suggest" />

            <div>
              <label htmlFor="suggested_date" className="block text-sm font-medium text-gray-700 mb-1">
                Proposed Date *
              </label>
              <input
                id="suggested_date"
                name="suggested_date"
                type="date"
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
              >
                Submit Date
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSelectedDate("");
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Grid Layout: Calendar + Suggestions List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar - Takes 1 column */}
        <div className="lg:col-span-1">
          <DateCalendar
            suggestions={suggestions as any}
            activePollId={activePoll?.id || null}
            currentUserId={currentUser.id}
            onDateClick={handleDateClick}
          />
        </div>

        {/* Suggestions List - Takes 2 columns */}
        <div className="lg:col-span-2">
          {suggestions.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            {activePoll
              ? 'No date suggestions yet. Be the first to suggest one!'
              : 'Start a poll to begin suggesting and voting on dates.'}
          </p>
          {activePoll && (
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
            >
              Suggest Date
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">
            Proposed Dates ({suggestions.length})
          </h2>
          {suggestions.map((suggestion: any) => {
            const hasVoted = suggestion.user_has_voted > 0;
            // Parse date as local date to avoid timezone issues
            const [year, month, day] = suggestion.suggested_date.split('-').map(Number);
            const suggestedDate = new Date(year, month - 1, day);
            const isPast = suggestedDate < new Date();

            return (
              <div
                key={suggestion.id}
                className={`bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow ${
                  isPast ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-2xl font-semibold mb-2">
                      {suggestedDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </h3>

                    {isPast && (
                      <p className="text-sm text-red-600 mb-1">
                        ⚠️ This date has passed
                      </p>
                    )}

                    <p className="text-sm text-gray-500 mt-2">
                      Suggested by {suggestion.suggested_by_name}
                    </p>
                  </div>

                  <div className="ml-6 flex flex-col items-center gap-2">
                    {/* Only show vote button if suggestion belongs to active poll */}
                    {activePoll && suggestion.poll_id === activePoll.id ? (
                      <>
                        <button
                          onClick={() => handleVote(suggestion.id, hasVoted)}
                          disabled={isPast}
                          className={`px-6 py-3 rounded-md font-medium transition-colors min-w-[120px] ${
                            hasVoted
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
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
                      </>
                    ) : (
                      <div className="text-center px-4 py-2 bg-gray-100 rounded-md">
                        <p className="text-sm text-gray-600">
                          Not in active poll
                        </p>
                      </div>
                    )}

                    {/* Delete button - shown if user owns or is admin */}
                    {(currentUser.isAdmin || suggestion.user_id === currentUser.id) && (
                      <button
                        onClick={() => handleDelete(
                          suggestion.id,
                          suggestedDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        )}
                        className="mt-2 px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete suggestion"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      </div>
    </main>
  );
}
