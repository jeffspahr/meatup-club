import { Link } from "react-router";
import type { Route } from "./+types/dashboard._index";
import { requireActiveUser } from "../lib/auth.server";
import ReactMarkdown from 'react-markdown';
import { useState, useEffect } from 'react';

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

  // Get top restaurant for active poll and user's vote
  let topRestaurant = null;
  let userRestaurantVote = null;
  if (activePoll) {
    topRestaurant = await db
      .prepare(`
        SELECT rs.name, COUNT(rv.id) as vote_count
        FROM restaurant_suggestions rs
        LEFT JOIN restaurant_votes rv ON rs.id = rv.suggestion_id AND rv.poll_id = ?
        GROUP BY rs.id
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind((activePoll as any).id)
      .first();

    // Get user's restaurant vote for this poll
    userRestaurantVote = await db
      .prepare(`
        SELECT rs.name
        FROM restaurant_votes rv
        JOIN restaurant_suggestions rs ON rv.suggestion_id = rs.id
        WHERE rv.poll_id = ? AND rv.user_id = ?
      `)
      .bind((activePoll as any).id, user.id)
      .first();
  }

  // Get top date for active poll and user's vote count
  let topDate = null;
  let userDateVoteCount = 0;
  if (activePoll) {
    topDate = await db
      .prepare(`
        SELECT ds.suggested_date, COUNT(dv.id) as vote_count
        FROM date_suggestions ds
        LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id AND dv.poll_id = ?
        GROUP BY ds.id
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind((activePoll as any).id)
      .first();

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

  // Get next upcoming event
  const nextEvent = await db
    .prepare('SELECT * FROM events WHERE status = ? AND event_date >= date("now") ORDER BY event_date ASC LIMIT 1')
    .bind('upcoming')
    .first();

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
    topRestaurant,
    topDate,
    nextEvent,
    userRsvp,
    content: contentResult.results || [],
    userRestaurantVote,
    userDateVoteCount
  };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, memberCount, isAdmin, activePoll, topRestaurant, topDate, nextEvent, userRsvp, content, userRestaurantVote, userDateVoteCount } = loaderData;
  const firstName = user.name?.split(' ')[0] || 'Friend';
  const [showContent, setShowContent] = useState(false);

  // Show content expanded on first visit
  useEffect(() => {
    const hasVisitedDashboard = localStorage.getItem('hasVisitedDashboard');
    if (!hasVisitedDashboard) {
      setShowContent(true);
      localStorage.setItem('hasVisitedDashboard', 'true');
    }
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Welcome{firstName !== 'Friend' ? `, ${firstName}` : ''}!
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Your quarterly steakhouse meetup headquarters
        </p>
      </div>

      {/* Site Content Section - Front and Center */}
      {content.length > 0 && (
        <div className="mb-8 bg-gradient-to-r from-meat-red/10 to-meat-brown/10 border-2 border-meat-red/30 rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🥩</span>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  About Meatup.Club
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Everything you need to know about our quarterly steakhouse adventures
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowContent(!showContent)}
              className="px-4 py-2 text-sm font-medium text-meat-red hover:bg-meat-red/10 rounded-lg transition"
            >
              {showContent ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {showContent && (
            <div className="space-y-4 mt-6">
              {content.map((item: any) => (
                <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg p-5 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    {item.key === 'description' && '📖'}
                    {item.key === 'goals' && '🎯'}
                    {item.key === 'guidelines' && '📋'}
                    {item.key === 'membership' && '👥'}
                    {item.key === 'safety' && '🚗'}
                    {item.title}
                  </h3>
                  <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
                    <ReactMarkdown
                      components={{
                        ul: ({ children }) => <ul className="space-y-1 list-disc ml-6">{children}</ul>,
                        ol: ({ children }) => <ol className="space-y-1 list-decimal ml-6">{children}</ol>,
                        li: ({ children }) => <li className="text-gray-700 dark:text-gray-300">{children}</li>,
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        h3: ({ children }) => <h3 className="text-base font-semibold mb-1 text-gray-900 dark:text-gray-100">{children}</h3>,
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
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6 mb-8 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🗳️</span>
                <div>
                  <h3 className="text-lg font-bold text-green-900">
                    {(activePoll as any).title}
                  </h3>
                  <p className="text-sm text-green-700">
                    Active poll • Started {new Date((activePoll as any).created_at).toLocaleDateString()} • Click to vote
                  </p>
                </div>
              </div>
              <span className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-full">
                Voting Open
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/60 rounded-lg p-4">
                <p className="text-xs text-green-700 font-medium mb-1">Restaurant</p>
                {userRestaurantVote ? (
                  <>
                    <p className="font-bold text-green-900">✓ You voted: {(userRestaurantVote as any).name}</p>
                    {topRestaurant && (topRestaurant as any).vote_count > 0 && (
                      <p className="text-xs text-green-700 mt-1">
                        Leading: {(topRestaurant as any).name} ({(topRestaurant as any).vote_count} vote{(topRestaurant as any).vote_count !== 1 ? 's' : ''})
                      </p>
                    )}
                  </>
                ) : topRestaurant && (topRestaurant as any).vote_count > 0 ? (
                  <>
                    <p className="font-bold text-green-900">{(topRestaurant as any).name}</p>
                    <p className="text-xs text-green-700 mt-1">
                      {(topRestaurant as any).vote_count} vote{(topRestaurant as any).vote_count !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">⚠️ You haven't voted yet</p>
                  </>
                ) : (
                  <p className="text-sm text-green-700">No votes yet - be the first!</p>
                )}
              </div>

              <div className="bg-white/60 rounded-lg p-4">
                <p className="text-xs text-green-700 font-medium mb-1">Dates</p>
                {userDateVoteCount > 0 ? (
                  <>
                    <p className="font-bold text-green-900">✓ You voted on {userDateVoteCount} date{userDateVoteCount !== 1 ? 's' : ''}</p>
                    {topDate && (topDate as any).vote_count > 0 && (
                      <p className="text-xs text-green-700 mt-1">
                        Leading: {new Date((topDate as any).suggested_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })} ({(topDate as any).vote_count} vote{(topDate as any).vote_count !== 1 ? 's' : ''})
                      </p>
                    )}
                  </>
                ) : topDate && (topDate as any).vote_count > 0 ? (
                  <>
                    <p className="font-bold text-green-900">
                      {new Date((topDate as any).suggested_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      {(topDate as any).vote_count} vote{(topDate as any).vote_count !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">⚠️ You haven't voted yet</p>
                  </>
                ) : (
                  <p className="text-sm text-green-700">No votes yet - be the first!</p>
                )}
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-yellow-900">No Active Poll</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Start a new poll to begin voting on the next meetup location and date.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* At a Glance - Compact Stats */}
      {nextEvent && (
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">📍 Next Meetup</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-1">Restaurant</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{(nextEvent as any).restaurant_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-1">Date</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {new Date((nextEvent as any).event_date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-1">Your RSVP</p>
              <div className="flex items-center gap-2">
                {userRsvp ? (
                  <>
                    {(userRsvp as any).status === 'yes' && (
                      <>
                        <span className="text-2xl">✅</span>
                        <span className="text-xl font-bold text-green-600">Going</span>
                      </>
                    )}
                    {(userRsvp as any).status === 'no' && (
                      <>
                        <span className="text-2xl">❌</span>
                        <span className="text-xl font-bold text-red-600">Not Going</span>
                      </>
                    )}
                    {(userRsvp as any).status === 'maybe' && (
                      <>
                        <span className="text-2xl">❔</span>
                        <span className="text-xl font-bold text-yellow-600">Maybe</span>
                      </>
                    )}
                  </>
                ) : (
                  <Link to="/dashboard/rsvp" className="text-meat-red hover:text-meat-brown font-semibold">
                    Set RSVP →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">🎯 Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePoll && (
            <Link to="/dashboard/polls">
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-lg p-6 hover:shadow-lg transition cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">🗳️</span>
                  <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Active</span>
                </div>
                <h3 className="text-lg font-bold mb-1">Vote on Polls</h3>
                <p className="text-sm text-white/80">
                  {activePoll && `${(topRestaurant as any)?.vote_count || 0} restaurant votes, ${(topDate as any)?.vote_count || 0} date votes`}
                </p>
              </div>
            </Link>
          )}

          {nextEvent && (
            <Link to="/dashboard/rsvp">
              <div className="bg-gradient-to-br from-meat-red to-meat-brown text-white rounded-lg p-6 hover:shadow-lg transition cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">✋</span>
                  {!userRsvp && <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Action Needed</span>}
                </div>
                <h3 className="text-lg font-bold mb-1">RSVP</h3>
                <p className="text-sm text-white/80">
                  {userRsvp ? 'Update your response' : 'Let us know if you can make it'}
                </p>
              </div>
            </Link>
          )}

          <Link to="/dashboard/restaurants">
            <div className="bg-gradient-to-br from-green-600 to-emerald-700 text-white rounded-lg p-6 hover:shadow-lg transition cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl">🍖</span>
              </div>
              <h3 className="text-lg font-bold mb-1">Restaurants</h3>
              <p className="text-sm text-white/80">Browse and add steakhouses</p>
            </div>
          </Link>

          <Link to="/dashboard/events">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-lg p-6 hover:shadow-lg transition cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl">📜</span>
              </div>
              <h3 className="text-lg font-bold mb-1">Events</h3>
              <p className="text-sm text-white/80">View past and upcoming meetups</p>
            </div>
          </Link>

          <Link to="/dashboard/members">
            <div className="bg-gradient-to-br from-blue-600 to-cyan-700 text-white rounded-lg p-6 hover:shadow-lg transition cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl">👥</span>
              </div>
              <h3 className="text-lg font-bold mb-1">Members</h3>
              <p className="text-sm text-white/80">{memberCount} active members</p>
            </div>
          </Link>

          {isAdmin && (
            <Link to="/dashboard/admin">
              <div className="bg-gradient-to-br from-gray-700 to-gray-900 text-white rounded-lg p-6 hover:shadow-lg transition cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">⚙️</span>
                  <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Admin</span>
                </div>
                <h3 className="text-lg font-bold mb-1">Admin Panel</h3>
                <p className="text-sm text-white/80">Manage polls, events, and members</p>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Feedback Section */}
      <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Have feedback or found a bug?
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Help us improve Meatup.Club by reporting issues or suggesting new features
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="https://github.com/jspahr/meatup-club/issues/new?template=bug_report.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              🐛 Report a Bug
            </a>
            <a
              href="https://github.com/jspahr/meatup-club/issues/new?template=feature_request.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              💡 Request a Feature
            </a>
            <a
              href="https://github.com/jspahr/meatup-club/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              📋 View All Issues
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
