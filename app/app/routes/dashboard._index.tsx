import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/dashboard._index";
import { requireActiveUser } from "../lib/auth.server";
import ReactMarkdown from 'react-markdown';
import { useState, useEffect, type CSSProperties } from 'react';
import { formatDateForDisplay, formatTimeForDisplay, getAppTimeZone, isEventInPastInTimeZone } from '../lib/dateUtils';
import { Alert, Badge, Button, Card, EmptyState } from "../components/ui";
import { AddRestaurantModal } from "../components/AddRestaurantModal";
import { RestaurantDetailModal, type RestaurantDetail } from "../components/RestaurantDetailModal";
import { createRestaurant, deleteRestaurant, findRestaurantByPlaceId } from "../lib/restaurants.server";
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
  HandRaisedIcon,
  BuildingStorefrontIcon,
  TicketIcon,
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

interface MaxVotesRow {
  max_votes: number | null;
}

interface TopRestaurantRow {
  name: string;
  vote_count: number;
}

interface TopDateRow {
  suggested_date: string;
  vote_count: number;
}

interface EventRow {
  id: number;
  restaurant_name: string;
  event_date: string;
  event_time: string | null;
  status: string;
}

interface UserRsvpRow {
  status: "yes" | "no" | "maybe";
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

  // Get site content
  const contentResult = await db
    .prepare('SELECT * FROM site_content ORDER BY id ASC')
    .all();

  const isAdmin = user.is_admin === 1;

  // Get active poll
  const activePoll = await db
    .prepare('SELECT * FROM polls WHERE status = ? ORDER BY created_at DESC LIMIT 1')
    .bind('active')
    .first() as ActivePollRow | null;

  // Get top restaurant(s) for active poll
  let topRestaurants: TopRestaurantRow[] = [];
  if (activePoll) {
    // First get the max vote count
    const maxVoteResult = await db
      .prepare(`
        SELECT MAX(vote_count) as max_votes
        FROM (
          SELECT COUNT(rv.id) as vote_count
          FROM restaurants r
          LEFT JOIN restaurant_votes rv ON r.id = rv.restaurant_id AND rv.poll_id = ?
          LEFT JOIN poll_excluded_restaurants per ON per.restaurant_id = r.id AND per.poll_id = ?
          WHERE per.id IS NULL
          GROUP BY r.id
        )
      `)
      .bind(activePoll.id, activePoll.id)
      .first() as MaxVotesRow | null;

    const maxVotes = maxVoteResult?.max_votes || 0;

    // Get all restaurants with the max vote count
    if (maxVotes > 0) {
      const topRestaurantsResult = await db
        .prepare(`
          SELECT r.name, COUNT(rv.id) as vote_count
          FROM restaurants r
          LEFT JOIN restaurant_votes rv ON r.id = rv.restaurant_id AND rv.poll_id = ?
          LEFT JOIN poll_excluded_restaurants per ON per.restaurant_id = r.id AND per.poll_id = ?
          WHERE per.id IS NULL
          GROUP BY r.id
          HAVING vote_count = ?
          ORDER BY r.name ASC
        `)
        .bind(activePoll.id, activePoll.id, maxVotes)
        .all();
      topRestaurants = (topRestaurantsResult.results || []) as unknown as TopRestaurantRow[];
    }
  }

  // Get top date(s) for active poll
  let topDates: TopDateRow[] = [];
  if (activePoll) {
    // First get the max vote count
    const maxDateVoteResult = await db
      .prepare(`
        SELECT MAX(vote_count) as max_votes
        FROM (
          SELECT COUNT(dv.id) as vote_count
          FROM date_suggestions ds
          LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id AND dv.poll_id = ?
          GROUP BY ds.id
        )
      `)
      .bind(activePoll.id)
      .first() as MaxVotesRow | null;

    const maxDateVotes = maxDateVoteResult?.max_votes || 0;

    // Get all dates with the max vote count
    if (maxDateVotes > 0) {
      const topDatesResult = await db
        .prepare(`
          SELECT ds.suggested_date, COUNT(dv.id) as vote_count
          FROM date_suggestions ds
          LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id AND dv.poll_id = ?
          GROUP BY ds.id
          HAVING vote_count = ?
          ORDER BY ds.suggested_date ASC
        `)
        .bind(activePoll.id, maxDateVotes)
        .all();
      topDates = (topDatesResult.results || []) as unknown as TopDateRow[];
    }
  }

  // Get next upcoming event (ignore cancelled, filter by datetime in app timezone)
  const eventsForNext = await db
    .prepare('SELECT * FROM events WHERE status != ? ORDER BY event_date ASC')
    .bind('cancelled')
    .all();
  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);
  const eventRows = (eventsForNext.results || []) as unknown as EventRow[];
  const nextEvent = eventRows.find((event) =>
    !isEventInPastInTimeZone(event.event_date, event.event_time || '18:00', appTimeZone)
  ) || null;

  // Get user's RSVP for the next event
  let userRsvp: UserRsvpRow | null = null;
  if (nextEvent) {
    userRsvp = await db
      .prepare('SELECT status FROM rsvps WHERE event_id = ? AND user_id = ?')
      .bind(nextEvent.id, user.id)
      .first() as UserRsvpRow | null;
  }

  // Get all restaurants for the dashboard table
  const restaurantsResult = await db
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
    .all();
  const restaurants = ((restaurantsResult.results || []) as unknown as RestaurantRow[]).map((r) => ({
    ...r,
    photo_url: normalizeRestaurantPhotoUrl(r.photo_url, request.url),
  }));

  return {
    user,
    isAdmin,
    activePoll,
    topRestaurants,
    topDates,
    nextEvent,
    userRsvp,
    content: (contentResult.results || []) as unknown as SiteContentItem[],
    restaurants,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const intent = formData.get('_action');

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

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, isAdmin, activePoll, topRestaurants, topDates, nextEvent, userRsvp, content, restaurants } = loaderData;
  const firstName = user.name?.split(' ')[0] || 'Friend';
  const [showContent, setShowContent] = useState(false);
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantDetail | null>(null);
  const restaurantFetcher = useFetcher<typeof action>();
  const restaurantError = restaurantFetcher.data && 'error' in restaurantFetcher.data ? restaurantFetcher.data.error : null;
  const quickActionsGridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <Card className="p-5 bg-muted/20">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Date Leader</p>
              {topDates.length > 0 ? (
                <>
                  <p className="font-semibold text-foreground">
                    {topDates.length > 1 ? (
                      <>Tied: {topDates.map(d => formatDateForDisplay(d.suggested_date, { month: 'short', day: 'numeric' })).join(', ')}</>
                    ) : (
                      formatDateForDisplay(topDates[0].suggested_date)
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {topDates[0].vote_count} vote{topDates[0].vote_count !== 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No votes yet</p>
              )}
            </Card>
          </div>

          <div className="mt-6">
            <Link to="/dashboard/polls" className="btn-primary">
              Vote on this poll →
            </Link>
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

      {/* Next Meetup */}
      {nextEvent && (
        <Card
          className="mb-8 p-6 sm:p-8 dashboard-section"
          style={{ '--section-delay': '160ms' } as CSSProperties}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="icon-container-lg"><MapPinIcon className="w-6 h-6" /></span>
            <h2 className="text-xl font-display font-semibold text-foreground">Next Meetup</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Restaurant</p>
              <p className="text-lg font-semibold text-foreground">{nextEvent.restaurant_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Date & Time</p>
              <p className="text-lg font-semibold text-foreground">
                {formatDateForDisplay(nextEvent.event_date, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                <span className="text-muted-foreground font-normal">at</span>{' '}
                {formatTimeForDisplay(nextEvent.event_time || '18:00')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Your RSVP</p>
              <div className="flex items-center gap-2">
                {userRsvp ? (
                  <>
                    {userRsvp.status === 'yes' && (
                      <Badge variant="success">Going</Badge>
                    )}
                    {userRsvp.status === 'no' && (
                      <Badge variant="danger">Not Going</Badge>
                    )}
                    {userRsvp.status === 'maybe' && (
                      <Badge variant="warning">Maybe</Badge>
                    )}
                  </>
                ) : (
                  <Link to="/dashboard/events" className="text-accent hover:text-accent-strong font-semibold transition-colors">
                    Set RSVP →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <div
        className="mb-12 dashboard-section"
        style={{ '--section-delay': '200ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <h2 className="text-xl font-display font-semibold text-foreground">Quick Actions</h2>
          <p className="text-sm text-muted-foreground">Jump into the workflows you use most.</p>
        </div>
        <div className={quickActionsGridClass}>
          {nextEvent && (
            <Link to="/dashboard/events">
              <Card hover className="card-glow p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="icon-container"><HandRaisedIcon className="w-5 h-5" /></span>
                  {!userRsvp && (
                    <Badge variant="warning">Action Needed</Badge>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-foreground">RSVP</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {userRsvp ? 'Update your response' : 'Let us know if you can make it'}
                </p>
              </Card>
            </Link>
          )}

          <Link to="/dashboard/events">
            <Card hover className="card-glow p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="icon-container"><TicketIcon className="w-5 h-5" /></span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Events</h3>
              <p className="mt-2 text-sm text-muted-foreground">View past and upcoming meetups</p>
            </Card>
          </Link>

          {isAdmin && (
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
          )}
        </div>
      </div>

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
                The collection — click a row for details.
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
                    return (
                      <tr
                        key={r.id}
                        onClick={() =>
                          setSelectedRestaurant({
                            id: r.id,
                            created_by: r.created_by,
                            name: r.name,
                            address: r.address,
                            photo_url: r.photo_url,
                            google_maps_url: r.google_maps_url,
                            opening_hours: r.opening_hours,
                            suggested_by_name: r.suggested_by_name,
                          })
                        }
                        className="hover:bg-muted/20 cursor-pointer transition-colors"
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
