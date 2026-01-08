import { Link } from "react-router";
import type { Route } from "./+types/dashboard._index";
import { requireActiveUser } from "../lib/auth.server";
import ReactMarkdown from 'react-markdown';
import { useState, useEffect, type CSSProperties } from 'react';
import { formatDateForDisplay, formatTimeForDisplay, getAppTimeZone, isEventInPastInTimeZone } from '../lib/dateUtils';

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  // Get site content
  const contentResult = await db
    .prepare('SELECT * FROM site_content ORDER BY id ASC')
    .all();

  // Get member count
  const memberCountResult = await db
    .prepare('SELECT COUNT(*) as count FROM users WHERE status = ?')
    .bind('active')
    .first();
  const memberCount = (memberCountResult as any)?.count || 0;

  const isAdmin = user.is_admin === 1;

  // Get active poll
  const activePoll = await db
    .prepare('SELECT * FROM polls WHERE status = ? ORDER BY created_at DESC LIMIT 1')
    .bind('active')
    .first();

  // Get top restaurant(s) for active poll and user's vote
  let topRestaurants: any[] = [];
  let userRestaurantVote = null;
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
      .bind((activePoll as any).id, (activePoll as any).id)
      .first();

    const maxVotes = (maxVoteResult as any)?.max_votes || 0;

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
        .bind((activePoll as any).id, (activePoll as any).id, maxVotes)
        .all();
      topRestaurants = topRestaurantsResult.results || [];
    }

    // Get user's restaurant vote for this poll
    userRestaurantVote = await db
      .prepare(`
        SELECT r.name
        FROM restaurant_votes rv
        JOIN restaurants r ON rv.restaurant_id = r.id
        WHERE rv.poll_id = ? AND rv.user_id = ?
      `)
      .bind((activePoll as any).id, user.id)
      .first();
  }

  // Get top date(s) for active poll and user's vote count
  let topDates: any[] = [];
  let userDateVoteCount = 0;
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
      .bind((activePoll as any).id)
      .first();

    const maxDateVotes = (maxDateVoteResult as any)?.max_votes || 0;

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
        .bind((activePoll as any).id, maxDateVotes)
        .all();
      topDates = topDatesResult.results || [];
    }

    // Get count of user's date votes for this poll
    const userDateVoteResult = await db
      .prepare(`
        SELECT COUNT(*) as count
        FROM date_votes
        WHERE poll_id = ? AND user_id = ?
      `)
      .bind((activePoll as any).id, user.id)
      .first();
    userDateVoteCount = (userDateVoteResult as any)?.count || 0;
  }

  // Get next upcoming event (ignore cancelled, filter by datetime in app timezone)
  const eventsForNext = await db
    .prepare('SELECT * FROM events WHERE status != ? ORDER BY event_date ASC')
    .bind('cancelled')
    .all();
  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);
  const nextEvent = (eventsForNext.results || []).find((event: any) =>
    !isEventInPastInTimeZone(event.event_date, event.event_time || '18:00', appTimeZone)
  ) || null;

  // Get user's RSVP for the next event
  let userRsvp = null;
  if (nextEvent) {
    userRsvp = await db
      .prepare('SELECT status FROM rsvps WHERE event_id = ? AND user_id = ?')
      .bind((nextEvent as any).id, user.id)
      .first();
  }

  return {
    user,
    memberCount,
    isAdmin,
    activePoll,
    topRestaurants,
    topDates,
    nextEvent,
    userRsvp,
    content: contentResult.results || [],
    userRestaurantVote,
    userDateVoteCount
  };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, memberCount, isAdmin, activePoll, topRestaurants, topDates, nextEvent, userRsvp, content, userRestaurantVote, userDateVoteCount } = loaderData;
  const firstName = user.name?.split(' ')[0] || 'Friend';
  const [showContent, setShowContent] = useState(false);
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);

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
        <div
          className="card-shell card-glow mb-8 p-6 dashboard-section border-accent/20"
          style={{ '--section-delay': '40ms' } as CSSProperties}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="icon-container shrink-0">📱</span>
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
        </div>
      )}

      {/* Site Content Section */}
      {content.length > 0 && (
        <div
          className="card-shell mb-8 p-6 sm:p-8 dashboard-section"
          style={{ '--section-delay': '80ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <span className="icon-container-lg">🥩</span>
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
              {content.map((item: any) => (
                <div key={item.id} className="card-shell p-5 bg-muted/30">
                  <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-3">
                    <span className="text-lg">
                      {item.key === 'description' && '📖'}
                      {item.key === 'goals' && '🎯'}
                      {item.key === 'guidelines' && '📋'}
                      {item.key === 'membership' && '👥'}
                      {item.key === 'safety' && '🚗'}
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Poll Banner */}
      {activePoll ? (
        <Link to="/dashboard/polls">
          <div
            className="card-shell card-hover card-glow mb-8 p-6 sm:p-8 dashboard-section"
            style={{ '--section-delay': '120ms' } as CSSProperties}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <span className="icon-container-lg">🗳️</span>
                <div>
                  <h3 className="text-xl font-display font-semibold text-foreground">
                    {(activePoll as any).title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Active poll • Started {new Date((activePoll as any).created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <span className="badge badge-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Voting Open
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card-shell p-5 bg-muted/20">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Restaurant</p>
                {userRestaurantVote ? (
                  <>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <span className="text-accent">✓</span>
                      You voted: {(userRestaurantVote as any).name}
                    </p>
                    {topRestaurants.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {topRestaurants.length > 1 ? (
                          <>Tied ({topRestaurants[0].vote_count} vote{topRestaurants[0].vote_count !== 1 ? 's' : ''} each): {topRestaurants.map(r => r.name).join(', ')}</>
                        ) : (
                          <>Leading: {topRestaurants[0].name} ({topRestaurants[0].vote_count} vote{topRestaurants[0].vote_count !== 1 ? 's' : ''})</>
                        )}
                      </p>
                    )}
                  </>
                ) : topRestaurants.length > 0 ? (
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
                    <p className="text-sm text-accent mt-2 font-medium">Vote now →</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No votes yet - be the first!</p>
                )}
              </div>

              <div className="card-shell p-5 bg-muted/20">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Dates</p>
                {userDateVoteCount > 0 ? (
                  <>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <span className="text-accent">✓</span>
                      You voted on {userDateVoteCount} date{userDateVoteCount !== 1 ? 's' : ''}
                    </p>
                    {topDates.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {topDates.length > 1 ? (
                          <>Tied ({topDates[0].vote_count} vote{topDates[0].vote_count !== 1 ? 's' : ''} each): {topDates.map(d => formatDateForDisplay(d.suggested_date, { month: 'short', day: 'numeric' })).join(', ')}</>
                        ) : (
                          <>Leading: {formatDateForDisplay(topDates[0].suggested_date, { month: 'short', day: 'numeric' })} ({topDates[0].vote_count} vote{topDates[0].vote_count !== 1 ? 's' : ''})</>
                        )}
                      </p>
                    )}
                  </>
                ) : topDates.length > 0 ? (
                  <>
                    <p className="font-semibold text-foreground">
                      {topDates.length > 1 ? (
                        <>Tied: {topDates.map(d => formatDateForDisplay(d.suggested_date)).join(', ')}</>
                      ) : (
                        formatDateForDisplay(topDates[0].suggested_date)
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {topDates[0].vote_count} vote{topDates[0].vote_count !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-accent mt-2 font-medium">Vote now →</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No votes yet - be the first!</p>
                )}
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <div
          className="card-shell mb-8 p-6 sm:p-8 dashboard-section border-border/30"
          style={{ '--section-delay': '120ms' } as CSSProperties}
        >
          <div className="flex items-center gap-4">
            <span className="icon-container-lg bg-muted">📋</span>
            <div>
              <h3 className="text-xl font-display font-semibold text-foreground">No Active Poll</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Start a new poll to begin voting on the next meetup location and date.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Next Meetup */}
      {nextEvent && (
        <div
          className="card-shell mb-8 p-6 sm:p-8 dashboard-section"
          style={{ '--section-delay': '160ms' } as CSSProperties}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="icon-container-lg">📍</span>
            <h2 className="text-xl font-display font-semibold text-foreground">Next Meetup</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Restaurant</p>
              <p className="text-lg font-semibold text-foreground">{(nextEvent as any).restaurant_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Date & Time</p>
              <p className="text-lg font-semibold text-foreground">
                {formatDateForDisplay((nextEvent as any).event_date, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                <span className="text-muted-foreground font-normal">at</span>{' '}
                {formatTimeForDisplay((nextEvent as any).event_time || '18:00')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Your RSVP</p>
              <div className="flex items-center gap-2">
                {userRsvp ? (
                  <>
                    {(userRsvp as any).status === 'yes' && (
                      <span className="badge badge-success">Going</span>
                    )}
                    {(userRsvp as any).status === 'no' && (
                      <span className="badge badge-danger">Not Going</span>
                    )}
                    {(userRsvp as any).status === 'maybe' && (
                      <span className="badge badge-warning">Maybe</span>
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
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePoll && (
            <Link to="/dashboard/polls">
              <div className="card-shell card-hover card-glow p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="icon-container">🗳️</span>
                  <span className="badge badge-accent">Active</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">Vote on Polls</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {topRestaurants[0]?.vote_count || 0} restaurant votes, {topDates[0]?.vote_count || 0} date votes
                </p>
              </div>
            </Link>
          )}

          {nextEvent && (
            <Link to="/dashboard/events">
              <div className="card-shell card-hover card-glow p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="icon-container">✋</span>
                  {!userRsvp && (
                    <span className="badge badge-warning">Action Needed</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-foreground">RSVP</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {userRsvp ? 'Update your response' : 'Let us know if you can make it'}
                </p>
              </div>
            </Link>
          )}

          <Link to="/dashboard/restaurants">
            <div className="card-shell card-hover card-glow p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="icon-container">🍖</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Restaurants</h3>
              <p className="mt-2 text-sm text-muted-foreground">Browse and add steakhouses</p>
            </div>
          </Link>

          <Link to="/dashboard/events">
            <div className="card-shell card-hover card-glow p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="icon-container">📜</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Events</h3>
              <p className="mt-2 text-sm text-muted-foreground">View past and upcoming meetups</p>
            </div>
          </Link>

          <Link to="/dashboard/members">
            <div className="card-shell card-hover card-glow p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="icon-container">👥</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Members</h3>
              <p className="mt-2 text-sm text-muted-foreground">{memberCount} active members</p>
            </div>
          </Link>

          {isAdmin && (
            <Link to="/dashboard/admin">
              <div className="card-shell card-hover card-glow p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="icon-container">⚙️</span>
                  <span className="badge badge-muted">Admin</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">Admin Panel</h3>
                <p className="mt-2 text-sm text-muted-foreground">Manage polls, events, and members</p>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Feedback Section */}
      <div
        className="dashboard-section"
        style={{ '--section-delay': '240ms' } as CSSProperties}
      >
        <div className="divider-accent mb-10" />
        <div className="card-shell p-8 text-center">
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
              🐛 Report a Bug
            </a>
            <a
              href="https://github.com/jeffspahr/meatup-club/issues/new?template=feature_request.md"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              💡 Request a Feature
            </a>
            <a
              href="https://github.com/jeffspahr/meatup-club/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              📋 View All Issues
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
