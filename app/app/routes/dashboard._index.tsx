import { Link, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/dashboard._index";
import { requireActiveUser } from "../lib/auth.server";
import ReactMarkdown from 'react-markdown';
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import {
  formatDateForDisplay,
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  getAppTimeZone,
  isDateInPastUTC,
  isEventInPastInTimeZone,
} from '../lib/dateUtils';
import { Alert, Badge, Button, Card, EmptyState } from "../components/ui";
import { AddRestaurantModal } from "../components/AddRestaurantModal";
import { RestaurantDetailModal, type RestaurantDetail } from "../components/RestaurantDetailModal";
import { DateCalendar } from "../components/DateCalendar";
import { DoodleView } from "../components/DoodleView";
import { RestaurantVotePicker } from "../components/RestaurantVotePicker";
import { CreateEventForm } from "../components/CreateEventForm";
import { UpcomingEventCard } from "../components/UpcomingEventCard";
import {
  createRestaurant,
  deleteRestaurant,
  findRestaurantByPlaceId,
  getRestaurantsForPoll,
  removeVote,
  voteForRestaurant,
} from "../lib/restaurants.server";
import { canEditEvent } from "../lib/events.server";
import {
  runCreateEventAction,
  runRsvpEventAction,
  runUpdateEventAction,
} from "../lib/event-actions.server";
import {
  EMPTY_EVENT_FORM,
  getCreatorLabel,
  sortEventsBySchedule,
  toEditableState,
  type EventCard,
  type EventFormState,
  type EventMemberRow,
  type EventRow as EventLoaderRow,
} from "../lib/events-shared";
import type { RsvpWithUser } from "../lib/types";
import { logActivity } from "../lib/activity.server";
import { normalizeRestaurantPhotoUrl } from "../lib/restaurant-photo-url";
import { parseCityState } from "../lib/addressUtils";
import { confirmAction } from "../lib/confirm.client";
import {
  DevicePhoneMobileIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  ClipboardDocumentCheckIcon,
  MapPinIcon,
  CalendarDaysIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  BugAntIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";

interface SiteContentItem {
  id: number;
  key: string;
  title: string;
  content: string;
}

interface ActivePollRow {
  id: number;
  title: string;
  created_at: string;
}

interface PollDateSuggestion {
  id: number;
  user_id: number;
  poll_id: number;
  suggested_date: string;
  suggested_by_name: string | null;
  suggested_by_email: string;
  vote_count: number;
  user_has_voted: number;
}

interface PollDateVote {
  date_suggestion_id: number;
  user_id: number;
  suggested_date: string;
  user_name: string | null;
  user_email: string;
}

interface PollRestaurantSuggestion {
  id: number;
  name: string;
  vote_count: number;
  user_has_voted: number;
}

interface PreviousPollRow {
  id: number;
  title: string;
  closed_at: string;
  winner_restaurant: string | null;
  winner_date: string | null;
}

interface TopRestaurantRow {
  name: string;
  vote_count: number;
}

interface RestaurantRow {
  id: number;
  created_by: number;
  name: string;
  address: string | null;
  google_rating: number | null;
  price_level: number | null;
  photo_url: string | null;
  google_maps_url: string | null;
  opening_hours: string | null;
  suggested_by_name: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const isAdmin = user.is_admin === 1;
  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);

  // Phase 1: queries that don't depend on each other.
  const [
    contentResult,
    activePoll,
    previousPollsResult,
    allEventsResult,
    allMembersResult,
    restaurantsResult,
  ] = await Promise.all([
    db.prepare('SELECT * FROM site_content ORDER BY id ASC').all(),
    db
      .prepare('SELECT * FROM polls WHERE status = ? ORDER BY created_at DESC LIMIT 1')
      .bind('active')
      .first() as Promise<ActivePollRow | null>,
    db
      .prepare(`
        SELECT
          p.id,
          p.title,
          p.closed_at,
          r.name as winner_restaurant,
          ds.suggested_date as winner_date
        FROM polls p
        LEFT JOIN restaurants r ON p.winning_restaurant_id = r.id
        LEFT JOIN date_suggestions ds ON p.winning_date_id = ds.id
        WHERE p.status = 'closed'
        ORDER BY p.created_at DESC
        LIMIT 10
      `)
      .all(),
    db
      .prepare(`
        SELECT
          e.*,
          u.name as creator_name,
          u.email as creator_email
        FROM events e
        LEFT JOIN users u ON e.created_by = u.id
        ORDER BY e.event_date DESC
      `)
      .all(),
    db
      .prepare('SELECT id, name, email, picture FROM users WHERE status = ? ORDER BY name ASC')
      .bind('active')
      .all(),
    db
      .prepare(`
        SELECT
          r.id,
          r.created_by,
          r.name,
          r.address,
          r.google_rating,
          r.price_level,
          r.photo_url,
          r.google_maps_url,
          r.opening_hours,
          u.name as suggested_by_name
        FROM restaurants r
        LEFT JOIN users u ON r.created_by = u.id
        ORDER BY r.name ASC
      `)
      .all(),
  ]);

  const previousPolls = (previousPollsResult.results || []) as unknown as PreviousPollRow[];
  const allEventRows = (allEventsResult.results || []) as unknown as EventLoaderRow[];
  const allMembers = (allMembersResult.results || []) as unknown as EventMemberRow[];
  const restaurants = ((restaurantsResult.results || []) as unknown as RestaurantRow[]).map((r) => ({
    ...r,
    photo_url: normalizeRestaurantPhotoUrl(r.photo_url, request.url),
  }));

  const upcomingEventsRaw = sortEventsBySchedule(
    allEventRows.filter(
      (event) =>
        event.status !== 'cancelled' &&
        !isEventInPastInTimeZone(event.event_date, event.event_time || '18:00', appTimeZone)
    ),
    'asc'
  ).map((event) => ({
    ...event,
    canEdit: canEditEvent(user, event),
    creatorLabel: getCreatorLabel(event, user.id),
  }));

  const pastEvents = sortEventsBySchedule(
    allEventRows.filter(
      (event) =>
        event.status === 'cancelled' ||
        isEventInPastInTimeZone(event.event_date, event.event_time || '18:00', appTimeZone)
    ),
    'desc'
  ).map((event) => ({
    id: event.id,
    restaurant_name: event.restaurant_name,
    event_date: event.event_date,
    event_time: event.event_time,
    displayStatus: event.status === 'cancelled' ? ('cancelled' as const) : ('completed' as const),
  }));

  // Phase 2 (parallel): poll-scoped queries + per-upcoming-event RSVP details.
  const [dateSuggestionsResult, dateVotesResult, pollRestaurantRows, upcomingEvents] =
    await Promise.all([
      activePoll
        ? db
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
            .bind(activePoll.id, user.id, activePoll.id, activePoll.id)
            .all()
        : Promise.resolve({ results: [] }),
      activePoll
        ? db
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
            .bind(activePoll.id)
            .all()
        : Promise.resolve({ results: [] }),
      activePoll ? getRestaurantsForPoll(db, activePoll.id, user.id) : Promise.resolve([]),
      Promise.all(
        upcomingEventsRaw.map(async (event) => {
          const [userRsvp, allRsvpsResult] = await Promise.all([
            db
              .prepare('SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?')
              .bind(event.id, user.id)
              .first(),
            db
              .prepare(`
                SELECT r.*, u.name, u.email, u.picture
                FROM rsvps r
                JOIN users u ON r.user_id = u.id
                WHERE r.event_id = ?
                ORDER BY r.created_at ASC
              `)
              .bind(event.id)
              .all(),
          ]);

          const allRsvps = (allRsvpsResult.results || []) as unknown as RsvpWithUser[];
          const rsvpdUserIds = new Set(allRsvps.map((rsvp) => rsvp.user_id));
          const notResponded = allMembers.filter((member) => !rsvpdUserIds.has(member.id));

          return {
            ...event,
            userRsvp: userRsvp as EventCard['userRsvp'],
            allRsvps,
            notResponded,
          };
        })
      ),
    ]);

  const dateSuggestions = (dateSuggestionsResult.results || []) as unknown as PollDateSuggestion[];
  const dateVotes = (dateVotesResult.results || []) as unknown as PollDateVote[];
  const restaurantSuggestions: PollRestaurantSuggestion[] = pollRestaurantRows.map((r) => ({
    id: r.id,
    name: r.name,
    vote_count: r.vote_count,
    user_has_voted:
      typeof r.user_has_voted === 'number' ? r.user_has_voted : r.user_has_voted ? 1 : 0,
  }));

  // Derive restaurant leader(s) from already-loaded poll data — no extra query.
  // restaurantSuggestions arrives sorted by vote_count DESC, name ASC.
  const maxVotes = restaurantSuggestions[0]?.vote_count ?? 0;
  const topRestaurants: TopRestaurantRow[] =
    maxVotes > 0
      ? restaurantSuggestions
          .filter((r) => r.vote_count === maxVotes)
          .map((r) => ({ name: r.name, vote_count: r.vote_count }))
      : [];

  return {
    user,
    isAdmin,
    activePoll,
    topRestaurants,
    dateSuggestions,
    dateVotes,
    restaurantSuggestions,
    previousPolls,
    upcomingEvents: upcomingEvents as EventCard[],
    pastEvents,
    content: (contentResult.results || []) as unknown as SiteContentItem[],
    restaurants,
  };
}

// Poll intents return `{ ok: true }` rather than `redirect('/dashboard')` so
// that submissions via `useFetcher` revalidate the loader in place without
// triggering a navigation (which would scroll the page back to the top).
export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const intent = formData.get('_action');

  if (intent === 'event_create' || intent === 'event_update' || intent === 'event_rsvp') {
    const ctx = {
      db,
      queue: context.cloudflare.env.EMAIL_DELIVERY_QUEUE,
      user,
      formData,
      request,
      route: '/dashboard',
    };

    if (intent === 'event_create') return runCreateEventAction(ctx);
    if (intent === 'event_update') return runUpdateEventAction(ctx);
    return runRsvpEventAction(ctx);
  }

  // Poll-scoped actions need an active poll. Look it up once.
  const pollIntents = new Set([
    'suggest_date',
    'vote_date',
    'delete_date',
    'vote_restaurant',
    'unvote_restaurant',
  ]);

  if (pollIntents.has(intent as string)) {
    const activePoll = (await db
      .prepare(`SELECT id FROM polls WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
      .first()) as { id: number } | null;

    if (!activePoll) {
      return { error: 'No active poll. Actions require an active poll.' };
    }

    if (intent === 'suggest_date') {
      const suggestedDate = formData.get('suggested_date');
      if (!suggestedDate) {
        return { error: 'Date is required' };
      }
      if (isDateInPastUTC(suggestedDate as string)) {
        return { error: 'Cannot add dates in the past' };
      }

      const existing = await db
        .prepare('SELECT id FROM date_suggestions WHERE suggested_date = ? AND poll_id = ?')
        .bind(suggestedDate, activePoll.id)
        .first();
      if (existing) {
        return { error: 'This date has already been added for the current poll' };
      }

      const result = await db
        .prepare('INSERT INTO date_suggestions (user_id, poll_id, suggested_date) VALUES (?, ?, ?)')
        .bind(user.id, activePoll.id, suggestedDate)
        .run();

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
        route: '/dashboard',
        request,
      });

      return { ok: true };
    }

    if (intent === 'vote_date') {
      const suggestionId = formData.get('suggestion_id');
      const remove = formData.get('remove') === 'true';
      if (!suggestionId) {
        return { error: 'Suggestion ID is required' };
      }

      const suggestion = await db
        .prepare('SELECT id, poll_id, suggested_date FROM date_suggestions WHERE id = ?')
        .bind(suggestionId)
        .first() as { id: number; poll_id: number; suggested_date: string } | null;

      if (!suggestion || suggestion.poll_id !== activePoll.id) {
        return { error: 'Suggestion not found in active poll' };
      }

      if (remove) {
        await db
          .prepare('DELETE FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?')
          .bind(activePoll.id, suggestionId, user.id)
          .run();

        await logActivity({
          db,
          userId: user.id,
          actionType: 'unvote_date',
          actionDetails: { suggestion_id: suggestionId, poll_id: activePoll.id },
          route: '/dashboard',
          request,
        });
      } else {
        if (isDateInPastUTC(suggestion.suggested_date)) {
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
            route: '/dashboard',
            request,
          });
        }
      }

      return { ok: true };
    }

    if (intent === 'delete_date') {
      const suggestionId = formData.get('suggestion_id');
      if (!suggestionId) {
        return { error: 'Suggestion ID is required' };
      }

      const suggestion = await db
        .prepare('SELECT user_id, poll_id FROM date_suggestions WHERE id = ?')
        .bind(suggestionId)
        .first() as { user_id: number; poll_id: number } | null;

      if (!suggestion || suggestion.poll_id !== activePoll.id) {
        return { error: 'Suggestion not found in active poll' };
      }

      if (suggestion.user_id !== user.id && user.is_admin !== 1) {
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
        route: '/dashboard',
        request,
      });

      return { ok: true };
    }

    if (intent === 'vote_restaurant') {
      const restaurantId = formData.get('suggestion_id');
      if (!restaurantId) {
        return { error: 'Restaurant ID is required' };
      }

      const existingVote = await db
        .prepare('SELECT restaurant_id FROM restaurant_votes WHERE poll_id = ? AND user_id = ?')
        .bind(activePoll.id, user.id)
        .first();

      await voteForRestaurant(db, activePoll.id, parseInt(restaurantId as string), user.id);

      await logActivity({
        db,
        userId: user.id,
        actionType: 'vote_restaurant',
        actionDetails: { restaurant_id: restaurantId, poll_id: activePoll.id, changed: !!existingVote },
        route: '/dashboard',
        request,
      });

      return { ok: true };
    }

    if (intent === 'unvote_restaurant') {
      await removeVote(db, activePoll.id, user.id);

      await logActivity({
        db,
        userId: user.id,
        actionType: 'unvote_restaurant',
        actionDetails: { poll_id: activePoll.id },
        route: '/dashboard',
        request,
      });

      return { ok: true };
    }
  }

  if (intent === 'suggest_restaurant') {
    const name = formData.get('name');
    if (!name) {
      return { error: 'Restaurant name is required' };
    }

    const googlePlaceId = formData.get('google_place_id');
    if (googlePlaceId) {
      const existing = await findRestaurantByPlaceId(db, googlePlaceId as string);
      if (existing) {
        return { error: 'This restaurant has already been added' };
      }
    }

    const googleRating = formData.get('google_rating');
    const ratingCount = formData.get('rating_count');
    const priceLevel = formData.get('price_level');

    await createRestaurant(db, {
      name: name as string,
      address: (formData.get('address') as string | null) || undefined,
      google_place_id: (googlePlaceId as string | null) || undefined,
      google_rating: googleRating ? parseFloat(googleRating as string) : undefined,
      rating_count: ratingCount ? parseInt(ratingCount as string) : undefined,
      price_level: priceLevel ? parseInt(priceLevel as string) : undefined,
      cuisine: (formData.get('cuisine') as string | null) || undefined,
      phone_number: (formData.get('phone_number') as string | null) || undefined,
      reservation_url: (formData.get('reservation_url') as string | null) || undefined,
      menu_url: (formData.get('menu_url') as string | null) || undefined,
      photo_url: (formData.get('photo_url') as string | null) || undefined,
      google_maps_url: (formData.get('google_maps_url') as string | null) || undefined,
      opening_hours: (formData.get('opening_hours') as string | null) || undefined,
      created_by: user.id,
    });

    return { ok: true };
  }

  if (intent === 'delete_restaurant') {
    const restaurantId = formData.get('restaurant_id');
    if (!restaurantId) {
      return { error: 'Restaurant ID is required' };
    }

    const restaurant = await db
      .prepare('SELECT created_by FROM restaurants WHERE id = ?')
      .bind(restaurantId)
      .first() as { created_by: number } | null;

    if (!restaurant) {
      return { error: 'Restaurant not found' };
    }

    if (user.is_admin || restaurant.created_by === user.id) {
      await deleteRestaurant(db, parseInt(restaurantId as string));
      return { ok: true };
    }

    return { error: 'You do not have permission to delete this restaurant' };
  }

  return { error: 'Invalid action' };
}

export default function Dashboard({ loaderData, actionData }: Route.ComponentProps) {
  const {
    user,
    isAdmin,
    activePoll,
    topRestaurants,
    dateSuggestions,
    dateVotes,
    restaurantSuggestions,
    previousPolls,
    upcomingEvents,
    pastEvents,
    content,
    restaurants,
  } = loaderData;
  const firstName = user.name?.split(' ')[0] || 'Friend';
  const [showContent, setShowContent] = useState(false);
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [showPastPolls, setShowPastPolls] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [createEventData, setCreateEventData] = useState<EventFormState>(EMPTY_EVENT_FORM);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(
    upcomingEvents.length === 1 ? upcomingEvents[0].id : null
  );
  const [editEventData, setEditEventData] = useState<{ id: number } & EventFormState>({
    id: 0,
    ...EMPTY_EVENT_FORM,
  });
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantDetail | null>(null);
  const restaurantFetcher = useFetcher<typeof action>();
  const pollFetcher = useFetcher<typeof action>();
  const restaurantError = restaurantFetcher.data && 'error' in restaurantFetcher.data ? restaurantFetcher.data.error : null;
  const pollError = pollFetcher.data && 'error' in pollFetcher.data ? pollFetcher.data.error : null;
  const eventError = actionData && 'error' in actionData ? actionData.error : null;
  const navigation = useNavigation();
  const submittedEventActionRef = useRef<string | null>(null);
  const quickActionsGridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";

  function isUpcomingEvent(eventId: number) {
    return upcomingEvents.some((event) => event.id === eventId);
  }

  function startEditingEvent(event: EventCard) {
    setEditingEventId(event.id);
    setEditEventData(toEditableState(event));
    if (isUpcomingEvent(event.id)) {
      setExpandedEventId(event.id);
    }
  }

  function cancelEditingEvent() {
    setEditingEventId(null);
    setEditEventData({ id: 0, ...EMPTY_EVENT_FORM });
  }

  function toggleUpcomingEvent(eventId: number) {
    setExpandedEventId((current) => (current === eventId ? null : eventId));
  }

  function handleEditEventFieldChange(field: keyof EventFormState, value: string) {
    setEditEventData((current) => ({ ...current, [field]: value }));
  }

  function handleDateClick(dateStr: string) {
    if (!activePoll) return;
    const existing = dateSuggestions.find((s) => s.suggested_date === dateStr);
    const formData = new FormData();

    if (!existing) {
      formData.append('_action', 'suggest_date');
      formData.append('suggested_date', dateStr);
    } else if (existing.user_has_voted > 0) {
      if (existing.user_id === user.id) {
        formData.append('_action', 'delete_date');
        formData.append('suggestion_id', existing.id.toString());
      } else {
        formData.append('_action', 'vote_date');
        formData.append('suggestion_id', existing.id.toString());
        formData.append('remove', 'true');
      }
    } else {
      formData.append('_action', 'vote_date');
      formData.append('suggestion_id', existing.id.toString());
      formData.append('remove', 'false');
    }

    pollFetcher.submit(formData, { method: 'post' });
  }

  function handleDoodleVoteToggle(suggestionId: number, remove: boolean) {
    const formData = new FormData();
    formData.append('_action', 'vote_date');
    formData.append('suggestion_id', suggestionId.toString());
    formData.append('remove', remove ? 'true' : 'false');
    pollFetcher.submit(formData, { method: 'post' });
  }

  function handlePollRestaurantVote(suggestionId: number) {
    const formData = new FormData();
    formData.append('_action', 'vote_restaurant');
    formData.append('suggestion_id', suggestionId.toString());
    pollFetcher.submit(formData, { method: 'post' });
  }

  function handlePollRestaurantUnvote() {
    const formData = new FormData();
    formData.append('_action', 'unvote_restaurant');
    pollFetcher.submit(formData, { method: 'post' });
  }

  function handleRestaurantSubmit(placeDetails: {
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
    openingHours?: string;
  }) {
    const formData = new FormData();
    formData.append('_action', 'suggest_restaurant');
    formData.append('name', placeDetails.name);
    formData.append('address', placeDetails.address || '');
    formData.append('cuisine', placeDetails.cuisine || '');
    formData.append('google_place_id', placeDetails.placeId || '');
    formData.append('google_rating', placeDetails.rating?.toString() || '');
    formData.append('rating_count', placeDetails.ratingCount?.toString() || '');
    formData.append('price_level', placeDetails.priceLevel?.toString() || '');
    formData.append('phone_number', placeDetails.phone || '');
    formData.append('photo_url', placeDetails.photoUrl || '');
    formData.append('google_maps_url', placeDetails.googleMapsUrl || '');
    formData.append('opening_hours', placeDetails.openingHours || '');
    restaurantFetcher.submit(formData, { method: 'post' });
  }

  function handleDeleteRestaurant(restaurant: RestaurantDetail) {
    if (!confirmAction(`Are you sure you want to delete "${restaurant.name}"? This action cannot be undone.`)) {
      return;
    }
    const formData = new FormData();
    formData.append('_action', 'delete_restaurant');
    formData.append('restaurant_id', restaurant.id.toString());
    restaurantFetcher.submit(formData, { method: 'post' });
    setSelectedRestaurant(null);
  }

  // Show content expanded on first visit
  useEffect(() => {
    const hasVisitedDashboard = localStorage.getItem('hasVisitedDashboard');
    if (!hasVisitedDashboard) {
      setShowContent(true);
      localStorage.setItem('hasVisitedDashboard', 'true');
    }
  }, []);

  useEffect(() => {
    if (user.phone_number) {
      return;
    }
    const dismissed = localStorage.getItem('dismissedSmsPrompt');
    if (!dismissed) {
      setShowSmsPrompt(true);
    }
  }, [user.phone_number]);

  useEffect(() => {
    if (navigation.state !== 'submitting' || !navigation.formData) {
      return;
    }
    const submittedAction = navigation.formData.get('_action');
    if (submittedAction === 'event_create' || submittedAction === 'event_update') {
      submittedEventActionRef.current = String(submittedAction);
    }
  }, [navigation.formData, navigation.state]);

  useEffect(() => {
    if (navigation.state !== 'idle' || !submittedEventActionRef.current) {
      return;
    }
    if (actionData && 'error' in actionData && actionData.error) {
      submittedEventActionRef.current = null;
      return;
    }
    if (submittedEventActionRef.current === 'event_create') {
      setShowCreateEventForm(false);
      setCreateEventData(EMPTY_EVENT_FORM);
    }
    if (submittedEventActionRef.current === 'event_update') {
      cancelEditingEvent();
    }
    submittedEventActionRef.current = null;
  }, [actionData, navigation.state]);

  useEffect(() => {
    setExpandedEventId((current) => {
      if (editingEventId && isUpcomingEvent(editingEventId)) {
        return editingEventId;
      }
      if (current && isUpcomingEvent(current)) {
        return current;
      }
      return upcomingEvents.length === 1 ? upcomingEvents[0].id : null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEventId, upcomingEvents]);

  return (
    <main className="dashboard-preview max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero Section */}
      <div className="mb-12 dashboard-hero">
        <div className="dashboard-kicker inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] mb-6">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Quarterly Meetup Hub
        </div>
        <h1 className="dashboard-hero-title text-4xl sm:text-5xl lg:text-6xl tracking-tight">
          Welcome{firstName !== 'Friend' ? `, ${firstName}` : ''}
        </h1>
        <p className="dashboard-hero-subtitle mt-4 text-lg text-muted-foreground">
          Everything you need to plan the next steakhouse meetup.
        </p>
      </div>

      {/* SMS Prompt */}
      {showSmsPrompt && (
        <Card
          className="card-glow mb-8 p-6 dashboard-section border-accent/20"
          style={{ '--section-delay': '40ms' } as CSSProperties}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="icon-container shrink-0"><DevicePhoneMobileIcon className="w-5 h-5" /></span>
              <div>
                <p className="font-semibold text-foreground">Get SMS reminders + RSVP by text</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add your mobile number to receive quick Y/N reminders before each meetup.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <Link to="/dashboard/profile" className="btn-primary">
                Add Number
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowSmsPrompt(false);
                  localStorage.setItem('dismissedSmsPrompt', 'true');
                }}
                className="btn-ghost"
              >
                Not now
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Site Content Section */}
      {content.length > 0 && (
        <Card
          className="mb-8 p-6 sm:p-8 dashboard-section"
          style={{ '--section-delay': '80ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <span className="icon-container-lg"><BuildingStorefrontIcon className="w-6 h-6" /></span>
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">
                  About Meatup.Club
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Everything you need to know about our quarterly steakhouse adventures.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowContent(!showContent)}
              className="btn-ghost"
            >
              {showContent ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {showContent && (
            <div className="space-y-4 mt-8 pt-6 border-t border-border/30">
              {content.map((item) => (
                <Card key={item.id} className="p-5 bg-muted/30">
                  <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-3">
                    <span className="w-5 h-5 text-accent">
                      {item.key === 'description' && <BookOpenIcon className="w-5 h-5" />}
                      {item.key === 'goals' && <RocketLaunchIcon className="w-5 h-5" />}
                      {item.key === 'guidelines' && <ClipboardDocumentListIcon className="w-5 h-5" />}
                      {item.key === 'membership' && <UserGroupIcon className="w-5 h-5" />}
                      {item.key === 'safety' && <ShieldCheckIcon className="w-5 h-5" />}
                    </span>
                    {item.title}
                  </h3>
                  <div className="prose prose-sm max-w-none text-foreground/80">
                    <ReactMarkdown
                      components={{
                        ul: ({ children }) => <ul className="space-y-1 list-disc ml-6">{children}</ul>,
                        ol: ({ children }) => <ol className="space-y-1 list-decimal ml-6">{children}</ol>,
                        li: ({ children }) => <li className="text-foreground/80">{children}</li>,
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        h3: ({ children }) => <h3 className="text-base font-semibold mb-1 text-foreground">{children}</h3>,
                      }}
                    >
                      {item.content}
                    </ReactMarkdown>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Upcoming Events */}
      <Card
        className="mb-8 p-6 sm:p-8 dashboard-section"
        style={{ '--section-delay': '150ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <span className="icon-container-lg"><CalendarDaysIcon className="w-6 h-6" /></span>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">Upcoming Events</h2>
              <p className="text-sm text-muted-foreground mt-1">
                RSVP and see who's in.
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              if (showCreateEventForm) {
                setShowCreateEventForm(false);
                setCreateEventData(EMPTY_EVENT_FORM);
                return;
              }
              setShowCreateEventForm(true);
            }}
          >
            {showCreateEventForm ? 'Cancel' : '+ Create Ad Hoc Event'}
          </Button>
        </div>

        {eventError ? (
          <Alert variant="error" className="mb-4">
            {eventError}
          </Alert>
        ) : null}

        {showCreateEventForm ? (
          <CreateEventForm formData={createEventData} onChange={setCreateEventData} />
        ) : null}

        {upcomingEvents.length === 0 ? (
          <div className="mt-8 pt-6 border-t border-border/30 text-center">
            <p className="text-base font-semibold text-foreground mb-1">No upcoming events</p>
            <p className="text-sm text-muted-foreground">
              Create an ad hoc event or check back after the next poll closes.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 xl:auto-rows-fr xl:grid-cols-2 mt-2">
            {upcomingEvents.map((event) => {
              const isExpanded = expandedEventId === event.id || editingEventId === event.id;
              const isEditing = editingEventId === event.id;
              return (
                <UpcomingEventCard
                  key={event.id}
                  event={event}
                  isExpanded={isExpanded}
                  isEditing={isEditing}
                  editFormData={editEventData}
                  onStartEdit={() => startEditingEvent(event)}
                  onCancelEdit={cancelEditingEvent}
                  onToggleExpand={() => toggleUpcomingEvent(event.id)}
                  onEditFieldChange={handleEditEventFieldChange}
                />
              );
            })}
          </div>
        )}
      </Card>

      {/* Active Poll */}
      {activePoll ? (
        <Card
          className="card-glow mb-8 p-6 sm:p-8 dashboard-section"
          style={{ '--section-delay': '120ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <span className="icon-container-lg"><ClipboardDocumentCheckIcon className="w-6 h-6" /></span>
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">
                  {activePoll.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Active poll • Started {formatDateForDisplay(activePoll.created_at, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <Badge variant="accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Voting Open
            </Badge>
          </div>

          {pollError && (
            <Alert variant="error" className="mb-6">
              {pollError}
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left column: vote on restaurants, then vote on dates (calendar) */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Vote on Restaurants</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Pick a restaurant from the list and submit your vote.
                </p>
                <RestaurantVotePicker
                  suggestions={restaurantSuggestions}
                  onVote={handlePollRestaurantVote}
                  onUnvote={handlePollRestaurantUnvote}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Vote on Dates</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Click a calendar day to add or vote.
                </p>
                <DateCalendar
                  suggestions={dateSuggestions}
                  activePollId={activePoll.id}
                  currentUserId={user.id}
                  onDateClick={handleDateClick}
                />
              </div>
            </div>

            {/* Right column: restaurant leader, then availability grid */}
            <div className="space-y-6">
              <Card className="p-5 bg-muted/20">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Restaurant Leader</p>
                {topRestaurants.length > 0 ? (
                  <>
                    <p className="font-semibold text-foreground">
                      {topRestaurants.length > 1 ? (
                        <>Tied: {topRestaurants.map(r => r.name).join(', ')}</>
                      ) : (
                        topRestaurants[0].name
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {topRestaurants[0].vote_count} vote{topRestaurants[0].vote_count !== 1 ? 's' : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No votes yet</p>
                )}
              </Card>

              <DoodleView
                dateSuggestions={dateSuggestions}
                dateVotes={dateVotes}
                currentUserId={user.id}
                onVoteToggle={handleDoodleVoteToggle}
              />
            </div>
          </div>
        </Card>
      ) : (
        <Card
          className="mb-8 p-6 sm:p-8 dashboard-section border-border/30"
          style={{ '--section-delay': '120ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="icon-container-lg bg-muted"><ClipboardDocumentListIcon className="w-6 h-6" /></span>
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">No Active Poll</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isAdmin
                    ? "Start a new poll to begin voting on the next meetup location and date."
                    : "An admin needs to start the next poll before voting can resume."}
                </p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <Link to="/dashboard/admin/polls" className="btn-primary">
                  Start New Poll
                </Link>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      {isAdmin && (
        <div
          className="mb-12 dashboard-section"
          style={{ '--section-delay': '200ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <h2 className="text-xl font-display font-semibold text-foreground">Quick Actions</h2>
            <p className="text-sm text-muted-foreground">Jump into the workflows you use most.</p>
          </div>
          <div className={quickActionsGridClass}>
            <Link to="/dashboard/admin">
              <Card hover className="card-glow p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="icon-container"><Cog6ToothIcon className="w-5 h-5" /></span>
                  <Badge variant="muted">Admin</Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground">Admin Panel</h3>
                <p className="mt-2 text-sm text-muted-foreground">Manage polls, events, and members</p>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* Restaurants Section */}
      <div
        className="mb-12 dashboard-section"
        style={{ '--section-delay': '220ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div className="flex items-center gap-4">
            <span className="icon-container-lg"><BuildingStorefrontIcon className="w-6 h-6" /></span>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">Restaurants</h2>
              <p className="text-sm text-muted-foreground mt-1">
                The collection — select a row for details.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowAddRestaurant(true)}>+ Add Restaurant</Button>
        </div>

        {restaurantError && (
          <Alert variant="error" className="mb-4">
            {restaurantError}
          </Alert>
        )}

        {restaurants.length === 0 ? (
          <EmptyState
            title="No restaurants yet"
            description="Add the first steakhouse to start the collection."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">City / State</th>
                    <th className="px-4 py-3">$</th>
                    <th className="px-4 py-3">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {restaurants.map((r) => {
                    const cityState = parseCityState(r.address);
                    const openDetails = () =>
                      setSelectedRestaurant({
                        id: r.id,
                        created_by: r.created_by,
                        name: r.name,
                        address: r.address,
                        photo_url: r.photo_url,
                        google_maps_url: r.google_maps_url,
                        opening_hours: r.opening_hours,
                        suggested_by_name: r.suggested_by_name,
                      });
                    return (
                      <tr
                        key={r.id}
                        onClick={openDetails}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetails();
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`View details for ${r.name}`}
                        className="hover:bg-muted/20 focus:bg-muted/20 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {cityState ? `${cityState.city}, ${cityState.state}` : ''}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.price_level && r.price_level > 0 ? '$'.repeat(r.price_level) : ''}
                        </td>
                        <td className="px-4 py-3">
                          {r.google_rating && r.google_rating > 0 ? (
                            <span className="inline-flex items-center gap-1 text-foreground">
                              <StarIcon className="w-4 h-4 text-amber-500" />
                              {r.google_rating.toFixed(1)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <AddRestaurantModal
        isOpen={showAddRestaurant}
        onClose={() => setShowAddRestaurant(false)}
        onSubmit={(details) => {
          handleRestaurantSubmit(details);
          setShowAddRestaurant(false);
        }}
      />

      <RestaurantDetailModal
        restaurant={selectedRestaurant}
        canDelete={
          !!selectedRestaurant && (isAdmin || selectedRestaurant.created_by === user.id)
        }
        onClose={() => setSelectedRestaurant(null)}
        onDelete={handleDeleteRestaurant}
      />

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <div
          className="mb-12 dashboard-section"
          style={{ '--section-delay': '225ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">Past Events</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Where the club has been.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPastEvents((value) => !value)}
              className="btn-ghost"
            >
              {showPastEvents ? 'Hide' : 'Show'} ({pastEvents.length})
            </button>
          </div>

          {showPastEvents && (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border/30 text-sm">
                {pastEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="font-medium text-foreground">{event.restaurant_name}</span>
                    <span className="flex items-center gap-3 text-muted-foreground">
                      <span>
                        {formatDateForDisplay(event.event_date, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {event.displayStatus === 'cancelled' ? (
                        <Badge variant="danger">cancelled</Badge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* Past Polls */}
      {previousPolls.length > 0 && (
        <div
          className="mb-12 dashboard-section"
          style={{ '--section-delay': '230ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">Past Polls</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Recently closed polls and their winners.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPastPolls((value) => !value)}
              className="btn-ghost"
            >
              {showPastPolls ? 'Hide' : 'Show'} ({previousPolls.length})
            </button>
          </div>

          {showPastPolls && (
            <div className="space-y-4">
              {previousPolls.map((poll) => (
                <Card key={poll.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{poll.title}</h3>
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
          )}
        </div>
      )}

      {/* Feedback Section */}
      <div
        className="dashboard-section"
        style={{ '--section-delay': '240ms' } as CSSProperties}
      >
        <div className="divider-accent mb-10" />
        <Card className="p-8 text-center">
          <h3 className="text-xl font-display font-semibold text-foreground mb-3">
            Have feedback or found a bug?
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Help us improve Meatup.Club by reporting issues or suggesting new features
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="https://github.com/jeffspahr/meatup-club/issues/new?template=bug_report.md"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              <BugAntIcon className="w-4 h-4" /> Report a Bug
            </a>
            <a
              href="https://github.com/jeffspahr/meatup-club/issues/new?template=feature_request.md"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              <LightBulbIcon className="w-4 h-4" /> Request a Feature
            </a>
            <a
              href="https://github.com/jeffspahr/meatup-club/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              <ClipboardDocumentListIcon className="w-4 h-4" /> View All Issues
            </a>
          </div>
        </Card>
      </div>
    </main>
  );
}

export function HydrateFallback() {
  return (
    <main className="dashboard-preview max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 card-shell p-8 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-4" />
        <div className="h-10 w-64 bg-muted rounded mb-3" />
        <div className="h-5 w-80 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card-shell p-6 h-36 animate-pulse bg-muted/40" />
        <div className="card-shell p-6 h-36 animate-pulse bg-muted/40" />
        <div className="card-shell p-6 h-36 animate-pulse bg-muted/40" />
      </div>
      <div className="card-shell p-8 h-56 animate-pulse bg-muted/30" />
    </main>
  );
}
