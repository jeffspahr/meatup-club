import { Link } from "react-router";
import type { Route } from "./+types/dashboard._index";
import { requireActiveUser } from "../lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

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

  // Get top restaurant for active poll
  let topRestaurant = null;
  if (activePoll) {
    topRestaurant = await db
      .prepare(`
        SELECT rs.name, COUNT(rv.id) as vote_count
        FROM restaurant_suggestions rs
        LEFT JOIN restaurant_votes rv ON rs.id = rv.suggestion_id
        WHERE rs.poll_id = ?
        GROUP BY rs.id
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind((activePoll as any).id)
      .first();
  }

  // Get top date for active poll
  let topDate = null;
  if (activePoll) {
    topDate = await db
      .prepare(`
        SELECT ds.suggested_date, COUNT(dv.id) as vote_count
        FROM date_suggestions ds
        LEFT JOIN date_votes dv ON ds.id = dv.date_suggestion_id
        WHERE ds.poll_id = ?
        GROUP BY ds.id
        ORDER BY vote_count DESC
        LIMIT 1
      `)
      .bind((activePoll as any).id)
      .first();
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

  return { user, memberCount, isAdmin, activePoll, topRestaurant, topDate, nextEvent, userRsvp };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, memberCount, isAdmin, activePoll, topRestaurant, topDate, nextEvent, userRsvp } = loaderData;
  const firstName = user.name?.split(' ')[0] || 'Friend';

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome back, {firstName}!
        </h2>
        <p className="text-gray-600">
          Your quarterly steakhouse meetup headquarters
        </p>
      </div>

      {/* Active Poll Banner */}
      {activePoll ? (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🗳️</span>
              <div>
                <h3 className="text-lg font-bold text-green-900">
                  {(activePoll as any).title}
                </h3>
                <p className="text-sm text-green-700">
                  Active poll • Started {new Date((activePoll as any).created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <span className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-full">
              Voting Open
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topRestaurant && (topRestaurant as any).vote_count > 0 ? (
              <div className="bg-white/60 rounded-lg p-4">
                <p className="text-xs text-green-700 font-medium mb-1">Leading Restaurant</p>
                <p className="font-bold text-green-900">{(topRestaurant as any).name}</p>
                <p className="text-xs text-green-700 mt-1">
                  {(topRestaurant as any).vote_count} vote{(topRestaurant as any).vote_count !== 1 ? 's' : ''}
                </p>
              </div>
            ) : (
              <div className="bg-white/60 rounded-lg p-4">
                <p className="text-sm text-green-700">No restaurant votes yet</p>
              </div>
            )}

            {topDate && (topDate as any).vote_count > 0 ? (
              <div className="bg-white/60 rounded-lg p-4">
                <p className="text-xs text-green-700 font-medium mb-1">Leading Date</p>
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
              </div>
            ) : (
              <div className="bg-white/60 rounded-lg p-4">
                <p className="text-sm text-green-700">No date votes yet</p>
              </div>
            )}
          </div>
        </div>
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link to="/dashboard/events">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Next Meetup</p>
                {nextEvent ? (
                  <>
                    <p className="text-lg font-bold text-gray-900">
                      {(nextEvent as any).restaurant_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date((nextEvent as any).event_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">TBD</p>
                )}
              </div>
              <div className="text-4xl">📅</div>
            </div>
          </div>
        </Link>

        <Link to="/dashboard/rsvp">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Your RSVP</p>
                {userRsvp ? (
                  <p className="text-2xl font-bold text-gray-900 capitalize">
                    {(userRsvp as any).status === 'yes' && '✓ Going'}
                    {(userRsvp as any).status === 'no' && 'Not Going'}
                    {(userRsvp as any).status === 'maybe' && 'Maybe'}
                  </p>
                ) : nextEvent ? (
                  <p className="text-2xl font-bold text-gray-400">Not Set</p>
                ) : (
                  <p className="text-2xl font-bold text-gray-400">-</p>
                )}
              </div>
              <div className="text-4xl">
                {userRsvp && (userRsvp as any).status === 'yes' ? '✅' :
                 userRsvp && (userRsvp as any).status === 'no' ? '❌' :
                 userRsvp && (userRsvp as any).status === 'maybe' ? '❔' : '✅'}
              </div>
            </div>
          </div>
        </Link>

        {isAdmin ? (
          <Link to="/dashboard/members">
            <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Members</p>
                  <p className="text-2xl font-bold text-gray-900">{memberCount}</p>
                </div>
                <div className="text-4xl">👥</div>
              </div>
            </div>
          </Link>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Members</p>
                <p className="text-2xl font-bold text-gray-900">{memberCount}</p>
              </div>
              <div className="text-4xl">👥</div>
            </div>
          </div>
        )}
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/dashboard/rsvp">
          <div className="bg-gradient-to-br from-meat-red to-meat-brown text-white rounded-lg shadow-lg p-8 hover:shadow-xl transition cursor-pointer">
            <h3 className="text-2xl font-bold mb-2">RSVP to Events</h3>
            <p className="text-white/90 mb-4">
              Let us know if you'll be joining the next meetup
            </p>
            <span className="text-white font-semibold">View & RSVP →</span>
          </div>
        </Link>

        <Link to="/dashboard/polls">
          <div className="bg-gradient-to-br from-amber-600 to-orange-700 text-white rounded-lg shadow-lg p-8 hover:shadow-xl transition cursor-pointer">
            <h3 className="text-2xl font-bold mb-2">🗳️ Vote on Polls</h3>
            <p className="text-white/90 mb-4">
              Vote on dates and restaurants for the next meetup
            </p>
            <span className="text-white font-semibold">View Poll →</span>
          </div>
        </Link>

        <Link to="/dashboard/events">
          <div className="bg-gradient-to-br from-purple-600 to-pink-700 text-white rounded-lg shadow-lg p-8 hover:shadow-xl transition cursor-pointer">
            <h3 className="text-2xl font-bold mb-2">📜 Event History</h3>
            <p className="text-white/90 mb-4">
              View all past and upcoming meetups
            </p>
            <span className="text-white font-semibold">View Events →</span>
          </div>
        </Link>

        {isAdmin && (
          <Link to="/dashboard/admin">
            <div className="bg-gradient-to-br from-gray-700 to-gray-900 text-white rounded-lg shadow-lg p-8 hover:shadow-xl transition cursor-pointer">
              <h3 className="text-2xl font-bold mb-2">⚙️ Admin Panel</h3>
              <p className="text-white/90 mb-4">
                Manage polls, events, and members
              </p>
              <span className="text-white font-semibold">Admin Dashboard →</span>
            </div>
          </Link>
        )}
      </div>

      {/* Feedback Section */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Have feedback or found a bug?
          </h3>
          <p className="text-gray-600 mb-4">
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
