import { Form, useSubmit } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.polls";
import { requireActiveUser } from "../lib/auth.server";
import { redirect } from "react-router";
import { formatDateForDisplay, formatDateTimeForDisplay } from "../lib/dateUtils";
import { DateCalendar } from "../components/DateCalendar";
import { DoodleView } from "../components/DoodleView";
import { AddRestaurantModal } from "../components/AddRestaurantModal";
import { isDateInPastUTC } from "../lib/dateUtils";
import { logActivity } from "../lib/activity.server";
import { getComments, createComment, deleteComment } from "../lib/comments.server";
import {
  getRestaurantsForPoll,
  createRestaurant,
  findRestaurantByPlaceId,
  voteForRestaurant,
  removeVote,
  deleteRestaurant,
} from "../lib/restaurants.server";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, UserAvatar } from "../components/ui";
import { CommentSection } from "../components/CommentSection";
import type { Poll } from "../lib/types";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  // Get the current active poll
  const activePoll = (await db
    .prepare(`
      SELECT * FROM polls
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .first()) as Poll | null;

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

  // Get restaurants for active poll (all global restaurants available unless excluded)
  const restaurantSuggestionsRaw = activePoll
    ? await getRestaurantsForPoll(db, activePoll.id, user.id)
    : [];

  // Enrich with user details for UI compatibility
  const restaurantSuggestions = await Promise.all(
    restaurantSuggestionsRaw.map(async (r: any) => {
      const creator = r.created_by
        ? await db.prepare('SELECT name, email FROM users WHERE id = ?').bind(r.created_by).first()
        : null;
      return {
        ...r,
        suggested_by_name: creator?.name || null,
        suggested_by_email: creator?.email || null,
      };
    })
  );

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
    restaurantSuggestions,
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
  const activePoll = (await db
    .prepare(`SELECT id FROM polls WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .first()) as Pick<Poll, 'id'> | null;

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

    // Check for duplicate by google_place_id
    if (placeId) {
      const existing = await findRestaurantByPlaceId(db, placeId as string);
      if (existing) {
        return { error: 'This restaurant has already been added' };
      }
    }

    // Create global restaurant
    await createRestaurant(db, {
      name: name as string,
      address: address as string | undefined,
      google_place_id: placeId as string | undefined,
      cuisine: cuisine as string | undefined,
      photo_url: photoUrl as string | undefined,
      created_by: user.id,
    });

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
    const restaurantId = formData.get('suggestion_id');

    if (!restaurantId) {
      return { error: 'Restaurant ID is required' };
    }

    // Check if user already voted for this restaurant
    const existingVote = await db
      .prepare('SELECT restaurant_id FROM restaurant_votes WHERE poll_id = ? AND user_id = ?')
      .bind(activePoll.id, user.id)
      .first();

    if (existingVote && existingVote.restaurant_id === parseInt(restaurantId as string)) {
      // Unvote - user clicked the same restaurant
      await removeVote(db, activePoll.id, user.id);

      await logActivity({
        db,
        userId: user.id,
        actionType: 'unvote_restaurant',
        actionDetails: { restaurant_id: restaurantId, poll_id: activePoll.id },
        route: '/dashboard/polls',
        request,
      });
    } else {
      // New vote or change vote (voteForRestaurant replaces existing vote)
      await voteForRestaurant(db, activePoll.id, parseInt(restaurantId as string), user.id);

      await logActivity({
        db,
        userId: user.id,
        actionType: 'vote_restaurant',
        actionDetails: { restaurant_id: restaurantId, poll_id: activePoll.id, changed: !!existingVote },
        route: '/dashboard/polls',
        request,
      });
    }

    return redirect('/dashboard/polls');
  }

  if (action === 'delete_restaurant') {
    const restaurantId = formData.get('suggestion_id');

    if (!restaurantId) {
      return { error: 'Restaurant ID is required' };
    }

    const restaurant = await db
      .prepare('SELECT created_by FROM restaurants WHERE id = ?')
      .bind(restaurantId)
      .first();

    if (!restaurant || (restaurant.created_by !== user.id && user.is_admin !== 1)) {
      return { error: 'Permission denied' };
    }

    // Delete restaurant (cascades to votes via foreign key)
    await deleteRestaurant(db, parseInt(restaurantId as string));

    await logActivity({
      db,
      userId: user.id,
      actionType: 'delete_restaurant',
      actionDetails: { restaurant_id: restaurantId },
      route: '/dashboard/polls',
      request,
    });

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

    // Send notification if this is a reply
    if (parentId) {
      const { sendCommentReplyEmail } = await import('../lib/email.server');

      // Get the parent comment and its author
      const parentComment = await db
        .prepare(`
          SELECT c.*, u.email, u.name, u.notify_comment_replies
          FROM comments c
          JOIN users u ON c.user_id = u.id
          WHERE c.id = ?
        `)
        .bind(Number(parentId))
        .first();

      console.log('Parent comment found:', {
        id: parentComment?.id,
        user_id: parentComment?.user_id,
        email: parentComment?.email,
        notify_enabled: parentComment?.notify_comment_replies,
        is_self_reply: parentComment?.user_id === user.id,
      });

      // Send email if parent author wants notifications and isn't replying to themselves
      if (
        parentComment &&
        parentComment.notify_comment_replies === 1 &&
        parentComment.user_id !== user.id
      ) {
        const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
        const url = new URL(request.url);
        const pollUrl = `${url.origin}/dashboard/polls`;

        console.log('Sending comment reply email to:', parentComment.email);

        // Use waitUntil to handle async work properly in Cloudflare Workers
        const emailPromise = sendCommentReplyEmail({
          to: parentComment.email as string,
          recipientName: parentComment.name as string | null,
          replierName: user.name || user.email,
          originalComment: parentComment.content as string,
          replyContent: content.trim(),
          pollUrl,
          resendApiKey: resendApiKey || "",
        }).then(result => {
          console.log('Email send result:', result);
          return result;
        }).catch(err => {
          console.error('Failed to send comment reply email:', err);
          throw err;
        });

        // Use waitUntil if available, otherwise await
        if (context.cloudflare.ctx?.waitUntil) {
          context.cloudflare.ctx.waitUntil(emailPromise);
        } else {
          await emailPromise;
        }
      } else {
        console.log('Skipping email notification:', {
          hasParentComment: !!parentComment,
          notifyEnabled: parentComment?.notify_comment_replies === 1,
          isSelfReply: parentComment?.user_id === user.id,
        });
      }
    }

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

export default function PollsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { dateSuggestions, restaurantSuggestions, activePoll, previousPolls, dateVotes, comments, currentUser } = loaderData;
  const submit = useSubmit();
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);

  // Calendar date click handler
  function handleDateClick(dateStr: string) {
    if (!activePoll) return;

    const existingSuggestion: any = dateSuggestions.find(
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

  // Restaurant submission handler
  function handleRestaurantSubmit(placeDetails: any) {
    const formData = new FormData();
    formData.append('_action', 'suggest_restaurant');
    formData.append('place_id', placeDetails.placeId);
    formData.append('name', placeDetails.name);
    formData.append('address', placeDetails.address || '');
    formData.append('cuisine', placeDetails.cuisine || '');
    formData.append('photo_url', placeDetails.photoUrl || '');

    submit(formData, { method: 'post' });
  }

  function handleRestaurantVote(suggestionId: number) {
    const formData = new FormData();
    formData.append('_action', 'vote_restaurant');
    formData.append('suggestion_id', suggestionId.toString());
    submit(formData, { method: 'post' });
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Polls"
        description="Vote on dates and restaurants for upcoming meetups"
      />

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      {/* Active Poll */}
      {activePoll ? (
        <div className="space-y-8">
          <Card className="border-2 border-accent p-6">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="accent">Active Poll</Badge>
              <h2 className="text-2xl font-bold text-foreground">{activePoll.title}</h2>
            </div>
            {activePoll.description && (
              <p className="text-muted-foreground mb-6">{activePoll.description}</p>
            )}

            {/* Dates Section */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-foreground mb-4">Vote on Dates</h3>
              <p className="text-sm text-muted-foreground mb-4">
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
                  <h3 className="text-xl font-semibold text-foreground">Vote on Restaurants</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    You can vote for one restaurant. Click again to change or remove your vote.
                  </p>
                </div>
                <Button onClick={() => setShowRestaurantModal(true)}>
                  + Add Restaurant
                </Button>
              </div>

              {/* Restaurant Modal */}
              <AddRestaurantModal
                isOpen={showRestaurantModal}
                onClose={() => setShowRestaurantModal(false)}
                onSubmit={handleRestaurantSubmit}
                title="Search for a Restaurant"
              />

              {/* Restaurant Suggestions List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {restaurantSuggestions.map((suggestion: any) => (
                  <div
                    key={suggestion.id}
                    className={`border-2 rounded-lg p-4 transition-all cursor-pointer ${
                      suggestion.user_has_voted > 0
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:border-accent'
                    }`}
                    onClick={() => handleRestaurantVote(suggestion.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg text-foreground">{suggestion.name}</h4>
                        {suggestion.address && (
                          <p className="text-sm text-muted-foreground">{suggestion.address}</p>
                        )}
                        {suggestion.cuisine && (
                          <span className="text-xs text-muted-foreground">{suggestion.cuisine}</span>
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
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                      <span className="text-sm text-muted-foreground">
                        {suggestion.vote_count} {suggestion.vote_count === 1 ? 'vote' : 'votes'}
                        {suggestion.user_has_voted > 0 && ' · You voted'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        by {suggestion.suggested_by_name || suggestion.suggested_by_email}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {restaurantSuggestions.length === 0 && (
                <EmptyState
                  title="No restaurant suggestions yet"
                  description="Be the first to suggest one!"
                />
              )}
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState
          title="No active poll at the moment"
          description="Check back soon!"
        />
      )}

      {/* Comments Section */}
      {activePoll && (
        <CommentSection
          comments={comments}
          currentUser={currentUser}
          placeholder="Share your thoughts about this poll..."
        />
      )}

      {/* Previous Polls */}
      {previousPolls.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">Previous Polls</h2>
          <div className="space-y-4">
            {previousPolls.map((poll: any) => (
              <Card key={poll.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{poll.title}</h3>
                    {poll.description && (
                      <p className="text-sm text-muted-foreground mt-1">{poll.description}</p>
                    )}
                  </div>
                  <Badge variant="muted">
                    Closed {formatDateTimeForDisplay(poll.closed_at)}
                  </Badge>
                </div>
                {poll.winner_restaurant && poll.winner_date && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm font-semibold text-foreground mb-2">Winner:</p>
                    <div className="flex items-center gap-4 text-sm text-foreground">
                      <span>{poll.winner_restaurant}</span>
                      <span>{formatDateForDisplay(poll.winner_date)}</span>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
