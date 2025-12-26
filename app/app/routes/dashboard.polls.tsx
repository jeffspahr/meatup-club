import { Form, useSubmit } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.polls";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import { DateCalendar } from "../components/DateCalendar";
import { DoodleView } from "../components/DoodleView";
import { RestaurantAutocomplete } from "../components/RestaurantAutocomplete";
import { isDateInPastUTC } from "../lib/dateUtils";
import { logActivity } from "../lib/activity.server";
import { getComments, createComment, deleteComment } from "../lib/comments.server";

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

  // Get date suggestions for active poll
  const dateSuggestionsResult = await db
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

  // Get restaurant suggestions for active poll
  const restaurantSuggestionsResult = await db
    .prepare(`
      SELECT
        rs.*,
        u.name as suggested_by_name,
        u.email as suggested_by_email,
        (SELECT COUNT(*) FROM restaurant_votes WHERE suggestion_id = rs.id AND poll_id = ?) as vote_count,
        (SELECT COUNT(*) FROM restaurant_votes WHERE suggestion_id = rs.id AND user_id = ? AND poll_id = ?) as user_has_voted
      FROM restaurant_suggestions rs
      JOIN users u ON rs.user_id = u.id
      ORDER BY vote_count DESC, rs.created_at DESC
    `)
    .bind(activePoll?.id || -1, user.id, activePoll?.id || -1)
    .all();

  // Get previous polls with winners
  const previousPollsResult = await db
    .prepare(`
      SELECT
        p.*,
        e.restaurant_name as winner_restaurant,
        e.event_date as winner_date
      FROM polls p
      LEFT JOIN events e ON p.created_event_id = e.id
      WHERE p.status = 'closed'
      ORDER BY p.created_at DESC
      LIMIT 10
    `)
    .all();

  // Get detailed voting data for doodle-style view
  const dateVotesResult = await db
    .prepare(`
      SELECT
        dv.date_suggestion_id,
        dv.user_id,
        ds.suggested_date,
        u.name as user_name,
        u.email as user_email
      FROM date_votes dv
      JOIN date_suggestions ds ON dv.date_suggestion_id = ds.id
      JOIN users u ON dv.user_id = u.id
      WHERE dv.poll_id = ?
      ORDER BY ds.suggested_date ASC, u.name ASC
    `)
    .bind(activePoll?.id || -1)
    .all();

  // Get comments for active poll
  const comments = activePoll
    ? await getComments(db, 'poll', activePoll.id)
    : [];

  return {
    dateSuggestions: dateSuggestionsResult.results || [],
    restaurantSuggestions: restaurantSuggestionsResult.results || [],
    activePoll: activePoll || null,
    previousPolls: previousPollsResult.results || [],
    dateVotes: dateVotesResult.results || [],
    comments,
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

  // Require active poll for all actions
  const activePoll = await db
    .prepare(`SELECT id FROM polls WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .first();

  if (!activePoll) {
    return { error: 'No active poll. Actions require an active poll.' };
  }

  // DATE ACTIONS
  if (action === 'suggest_date') {
    const suggestedDate = formData.get('suggested_date');

    if (!suggestedDate) {
      return { error: 'Date is required' };
    }

    // Prevent adding dates in the past (using UTC for consistency)
    if (isDateInPastUTC(suggestedDate as string)) {
      return { error: 'Cannot add dates in the past' };
    }

    // Check for duplicate
    const existingDate = await db
      .prepare(`SELECT id FROM date_suggestions WHERE suggested_date = ? AND poll_id = ?`)
      .bind(suggestedDate, activePoll.id)
      .first();

    if (existingDate) {
      return { error: 'This date has already been added for the current poll' };
    }

    const result = await db
      .prepare('INSERT INTO date_suggestions (user_id, poll_id, suggested_date) VALUES (?, ?, ?)')
      .bind(user.id, activePoll.id, suggestedDate)
      .run();

    // Auto-vote for the date
    if (result.meta.last_row_id) {
      await db
        .prepare('INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)')
        .bind(activePoll.id, result.meta.last_row_id, user.id)
        .run();
    }

    await logActivity({
      db,
      userId: user.id,
      actionType: 'suggest_date',
      actionDetails: { date: suggestedDate, poll_id: activePoll.id },
      route: '/dashboard/polls',
      request,
    });

    return redirect('/dashboard/polls');
  }

  if (action === 'vote_date') {
    const suggestionId = formData.get('suggestion_id');
    const remove = formData.get('remove') === 'true';

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    if (remove) {
      // Always allow removing votes, even for past dates
      await db
        .prepare('DELETE FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?')
        .bind(activePoll.id, suggestionId, user.id)
        .run();

      await logActivity({
        db,
        userId: user.id,
        actionType: 'unvote_date',
        actionDetails: { suggestion_id: suggestionId, poll_id: activePoll.id },
        route: '/dashboard/polls',
        request,
      });
    } else {
      // Prevent adding NEW votes for past dates
      const suggestion = await db
        .prepare('SELECT suggested_date FROM date_suggestions WHERE id = ?')
        .bind(suggestionId)
        .first();

      if (suggestion && isDateInPastUTC(suggestion.suggested_date as string)) {
        return { error: 'Cannot vote on dates in the past' };
      }

      const existing = await db
        .prepare('SELECT id FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?')
        .bind(activePoll.id, suggestionId, user.id)
        .first();

      if (!existing) {
        await db
          .prepare('INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)')
          .bind(activePoll.id, suggestionId, user.id)
          .run();

        await logActivity({
          db,
          userId: user.id,
          actionType: 'vote_date',
          actionDetails: { suggestion_id: suggestionId, poll_id: activePoll.id },
          route: '/dashboard/polls',
          request,
        });
      }
    }

    return redirect('/dashboard/polls');
  }

  if (action === 'delete_date') {
    const suggestionId = formData.get('suggestion_id');

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    const suggestion = await db
      .prepare('SELECT user_id FROM date_suggestions WHERE id = ?')
      .bind(suggestionId)
      .first();

    if (!suggestion || (suggestion.user_id !== user.id && user.is_admin !== 1)) {
      return { error: 'Permission denied' };
    }

    await db
      .prepare('DELETE FROM date_votes WHERE date_suggestion_id = ?')
      .bind(suggestionId)
      .run();

    await db
      .prepare('DELETE FROM date_suggestions WHERE id = ?')
      .bind(suggestionId)
      .run();

    await logActivity({
      db,
      userId: user.id,
      actionType: 'delete_date',
      actionDetails: { suggestion_id: suggestionId },
      route: '/dashboard/polls',
      request,
    });

    return redirect('/dashboard/polls');
  }

  // RESTAURANT ACTIONS
  if (action === 'suggest_restaurant') {
    const placeId = formData.get('place_id');
    const name = formData.get('name');
    const address = formData.get('address');
    const cuisine = formData.get('cuisine');
    const photoUrl = formData.get('photo_url');

    if (!name) {
      return { error: 'Restaurant name is required' };
    }

    // Check for duplicate by place_id or name
    if (placeId) {
      const existing = await db
        .prepare('SELECT id FROM restaurant_suggestions WHERE place_id = ?')
        .bind(placeId)
        .first();

      if (existing) {
        return { error: 'This restaurant has already been added' };
      }
    }

    await db
      .prepare(`
        INSERT INTO restaurant_suggestions
        (user_id, place_id, name, address, cuisine, photo_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(user.id, placeId || null, name, address || null, cuisine || null, photoUrl || null)
      .run();

    await logActivity({
      db,
      userId: user.id,
      actionType: 'suggest_restaurant',
      actionDetails: { name, place_id: placeId },
      route: '/dashboard/polls',
      request,
    });

    return redirect('/dashboard/polls');
  }

  if (action === 'vote_restaurant') {
    const suggestionId = formData.get('suggestion_id');

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    // Check if user already voted in this poll
    const existingVote = await db
      .prepare('SELECT id, suggestion_id FROM restaurant_votes WHERE poll_id = ? AND user_id = ?')
      .bind(activePoll.id, user.id)
      .first();

    if (existingVote) {
      if (existingVote.suggestion_id === parseInt(suggestionId as string)) {
        // Unvote
        await db
          .prepare('DELETE FROM restaurant_votes WHERE poll_id = ? AND user_id = ?')
          .bind(activePoll.id, user.id)
          .run();

        await logActivity({
          db,
          userId: user.id,
          actionType: 'unvote_restaurant',
          actionDetails: { suggestion_id: suggestionId, poll_id: activePoll.id },
          route: '/dashboard/polls',
          request,
        });
      } else {
        // Change vote
        await db
          .prepare('UPDATE restaurant_votes SET suggestion_id = ? WHERE poll_id = ? AND user_id = ?')
          .bind(suggestionId, activePoll.id, user.id)
          .run();

        await logActivity({
          db,
          userId: user.id,
          actionType: 'vote_restaurant',
          actionDetails: { suggestion_id: suggestionId, poll_id: activePoll.id, changed: true },
          route: '/dashboard/polls',
          request,
        });
      }
    } else {
      // New vote
      await db
        .prepare('INSERT INTO restaurant_votes (poll_id, suggestion_id, user_id) VALUES (?, ?, ?)')
        .bind(activePoll.id, suggestionId, user.id)
        .run();

      await logActivity({
        db,
        userId: user.id,
        actionType: 'vote_restaurant',
        actionDetails: { suggestion_id: suggestionId, poll_id: activePoll.id },
        route: '/dashboard/polls',
        request,
      });
    }

    return redirect('/dashboard/polls');
  }

  if (action === 'delete_restaurant') {
    const suggestionId = formData.get('suggestion_id');

    if (!suggestionId) {
      return { error: 'Suggestion ID is required' };
    }

    const suggestion = await db
      .prepare('SELECT user_id FROM restaurant_suggestions WHERE id = ?')
      .bind(suggestionId)
      .first();

    if (!suggestion || (suggestion.user_id !== user.id && user.is_admin !== 1)) {
      return { error: 'Permission denied' };
    }

    await db
      .prepare('DELETE FROM restaurant_votes WHERE suggestion_id = ?')
      .bind(suggestionId)
      .run();

    await db
      .prepare('DELETE FROM restaurant_suggestions WHERE id = ?')
      .bind(suggestionId)
      .run();

    return redirect('/dashboard/polls');
  }

  // COMMENT ACTIONS
  if (action === 'add_comment') {
    const content = formData.get('content');
    const parentId = formData.get('parent_id');

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return { error: 'Comment content is required' };
    }

    if (content.length > 1000) {
      return { error: 'Comment must be less than 1000 characters' };
    }

    await createComment(
      db,
      user.id,
      'poll',
      activePoll.id,
      content.trim(),
      parentId ? Number(parentId) : null
    );

    await logActivity({
      db,
      userId: user.id,
      actionType: 'comment',
      actionDetails: { type: 'poll', poll_id: activePoll.id },
      route: '/dashboard/polls',
      request,
    });

    return redirect('/dashboard/polls');
  }

  if (action === 'delete_comment') {
    const commentId = formData.get('comment_id');

    if (!commentId) {
      return { error: 'Comment ID is required' };
    }

    const success = await deleteComment(
      db,
      parseInt(commentId as string),
      user.id,
      user.is_admin === 1
    );

    if (!success) {
      return { error: 'Permission denied or comment not found' };
    }

    await logActivity({
      db,
      userId: user.id,
      actionType: 'delete_comment',
      actionDetails: { comment_id: commentId },
      route: '/dashboard/polls',
      request,
    });

    return redirect('/dashboard/polls');
  }

  return { error: 'Invalid action' };
}

// Recursive component for rendering threaded comments
function CommentThread({
  comment,
  currentUser,
  replyingTo,
  setReplyingTo,
  depth = 0,
}: {
  comment: any;
  currentUser: any;
  replyingTo: number | null;
  setReplyingTo: (id: number | null) => void;
  depth?: number;
}) {
  const maxDepth = 5; // Limit nesting depth
  const isReplying = replyingTo === comment.id;

  return (
    <div className={depth > 0 ? "ml-8 mt-4 border-l-2 border-gray-200 dark:border-gray-700 pl-4" : ""}>
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          {comment.user_picture && (
            <img
              src={comment.user_picture}
              alt={comment.user_name || comment.user_email}
              className="w-10 h-10 rounded-full flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {comment.user_name || comment.user_email}
                </span>
                {comment.user_id === currentUser.id && (
                  <span className="text-xs text-blue-600">(you)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                {(comment.user_id === currentUser.id || currentUser.isAdmin) && (
                  <Form method="post" className="inline">
                    <input type="hidden" name="_action" value="delete_comment" />
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:text-red-700"
                      onClick={(e) => {
                        if (!confirm('Delete this comment and all replies?')) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Delete
                    </button>
                  </Form>
                )}
              </div>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {comment.content}
            </p>
            <div className="mt-2 flex gap-3">
              {depth < maxDepth && (
                <button
                  onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                  className="text-xs text-meat-red hover:underline"
                >
                  {isReplying ? 'Cancel' : 'Reply'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reply Form */}
        {isReplying && (
          <div className="mt-4 ml-13">
            <Form
              method="post"
              onSubmit={() => setReplyingTo(null)}
            >
              <input type="hidden" name="_action" value="add_comment" />
              <input type="hidden" name="parent_id" value={comment.id} />
              <textarea
                name="content"
                placeholder="Write a reply..."
                className="w-full border border-border bg-background text-foreground rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-meat-red resize-none"
                rows={3}
                maxLength={1000}
                required
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-sm text-muted-foreground hover:text-foreground px-3 py-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-meat-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm"
                >
                  Reply
                </button>
              </div>
            </Form>
          </div>
        )}
      </div>

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2">
          {comment.replies.map((reply: any) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PollsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { dateSuggestions, restaurantSuggestions, activePoll, previousPolls, dateVotes, comments, currentUser } = loaderData;
  const submit = useSubmit();
  const [showRestaurantSearch, setShowRestaurantSearch] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  // Calendar date click handler
  function handleDateClick(dateStr: string) {
    if (!activePoll) return;

    const existingSuggestion = dateSuggestions.find(
      (s: any) => s.suggested_date === dateStr
    );

    const formData = new FormData();

    if (!existingSuggestion) {
      formData.append('_action', 'suggest_date');
      formData.append('suggested_date', dateStr);
    } else if (existingSuggestion.user_has_voted > 0) {
      if (existingSuggestion.user_id === currentUser.id) {
        formData.append('_action', 'delete_date');
        formData.append('suggestion_id', existingSuggestion.id.toString());
      } else {
        formData.append('_action', 'vote_date');
        formData.append('suggestion_id', existingSuggestion.id.toString());
        formData.append('remove', 'true');
      }
    } else {
      formData.append('_action', 'vote_date');
      formData.append('suggestion_id', existingSuggestion.id.toString());
      formData.append('remove', 'false');
    }

    submit(formData, { method: 'post' });
  }

  // Restaurant selection handler
  function handleRestaurantSelect(place: any) {
    const formData = new FormData();
    formData.append('_action', 'suggest_restaurant');
    formData.append('place_id', place.placeId);
    formData.append('name', place.name);
    formData.append('address', place.address || '');
    formData.append('cuisine', place.cuisine || '');
    formData.append('photo_url', place.photoUrl || '');

    submit(formData, { method: 'post' });
    setShowRestaurantSearch(false);
    setRestaurantName("");
  }

  function handleRestaurantVote(suggestionId: number) {
    const formData = new FormData();
    formData.append('_action', 'vote_restaurant');
    formData.append('suggestion_id', suggestionId.toString());
    submit(formData, { method: 'post' });
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Polls</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Vote on dates and restaurants for upcoming meetups
        </p>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {/* Active Poll */}
      {activePoll ? (
        <div className="space-y-8">
          <div className="bg-white dark:bg-gray-800 border-2 border-meat-red rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 bg-meat-red text-white text-sm font-semibold rounded-full">
                Active Poll
              </span>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{activePoll.name}</h2>
            </div>
            {activePoll.description && (
              <p className="text-gray-600 dark:text-gray-400 mb-6">{activePoll.description}</p>
            )}

            {/* Dates Section */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">📅 Vote on Dates</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Click on calendar dates to add or vote. You can vote for multiple dates.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <DateCalendar
                    suggestions={dateSuggestions as any}
                    activePollId={activePoll.id}
                    currentUserId={currentUser.id}
                    onDateClick={handleDateClick}
                  />
                </div>
                <div>
                  <DoodleView
                    dateSuggestions={dateSuggestions as any}
                    dateVotes={dateVotes as any}
                    currentUserId={currentUser.id}
                  />
                </div>
              </div>
            </div>

            {/* Restaurants Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">🍖 Vote on Restaurants</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    You can vote for one restaurant. Click again to change or remove your vote.
                  </p>
                </div>
                <button
                  onClick={() => setShowRestaurantSearch(true)}
                  className="px-4 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
                >
                  + Add Restaurant
                </button>
              </div>

              {/* Restaurant Search Modal */}
              {showRestaurantSearch && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Search for a Restaurant</h3>

                    <div className="mb-4">
                      <RestaurantAutocomplete
                        value={restaurantName}
                        onChange={setRestaurantName}
                        onSelect={handleRestaurantSelect}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Start typing to search Google Places
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setShowRestaurantSearch(false);
                        setRestaurantName("");
                      }}
                      className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Restaurant Suggestions List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {restaurantSuggestions.map((suggestion: any) => (
                  <div
                    key={suggestion.id}
                    className={`border-2 rounded-lg p-4 transition-all cursor-pointer ${
                      suggestion.user_has_voted > 0
                        ? 'border-meat-red bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-meat-red'
                    }`}
                    onClick={() => handleRestaurantVote(suggestion.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{suggestion.name}</h4>
                        {suggestion.address && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">{suggestion.address}</p>
                        )}
                        {suggestion.cuisine && (
                          <span className="text-xs text-gray-500 dark:text-gray-500">{suggestion.cuisine}</span>
                        )}
                      </div>
                      {suggestion.photo_url && (
                        <img
                          src={suggestion.photo_url}
                          alt={suggestion.name}
                          className="w-16 h-16 object-cover rounded ml-2"
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {suggestion.vote_count} {suggestion.vote_count === 1 ? 'vote' : 'votes'}
                        {suggestion.user_has_voted > 0 && ' · You voted'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-500">
                        by {suggestion.suggested_by_name || suggestion.suggested_by_email}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {restaurantSuggestions.length === 0 && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-500">
                  No restaurant suggestions yet. Be the first to suggest one!
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            No active poll at the moment. Check back soon!
          </p>
        </div>
      )}

      {/* Comments Section */}
      {activePoll && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Discussion</h2>

          {/* Add Comment Form */}
          <Form method="post" className="mb-6">
            <input type="hidden" name="_action" value="add_comment" />
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <textarea
                name="content"
                placeholder="Share your thoughts about this poll..."
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-meat-red focus:border-transparent resize-none"
                rows={3}
                maxLength={1000}
                required
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-500 dark:text-gray-500">Max 1000 characters</span>
                <button
                  type="submit"
                  className="bg-meat-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium"
                >
                  Post Comment
                </button>
              </div>
            </div>
          </Form>

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground bg-muted rounded-lg">
                No comments yet. Be the first to share your thoughts!
              </div>
            ) : (
              comments.map((comment: any) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  currentUser={currentUser}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Previous Polls */}
      {previousPolls.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Previous Polls</h2>
          <div className="space-y-4">
            {previousPolls.map((poll: any) => (
              <div key={poll.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{poll.name}</h3>
                    {poll.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{poll.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    Closed {new Date(poll.created_at).toLocaleDateString()}
                  </span>
                </div>
                {poll.winner_restaurant && poll.winner_date && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Winner:</p>
                    <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
                      <span>🍖 {poll.winner_restaurant}</span>
                      <span>📅 {new Date(poll.winner_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
