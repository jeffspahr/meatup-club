import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import Link from 'next/link';
import DashboardNav from '@/components/DashboardNav';
import { getDb, getUserByEmail } from '@/lib/db';

export const runtime = 'edge';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  // Get member count
  const db = getDb();
  const memberCountResult = await db
    .prepare('SELECT COUNT(*) as count FROM users')
    .first();
  const memberCount = (memberCountResult as any)?.count || 0;

  // Check if current user is admin
  const currentUser = await getUserByEmail(db, session.user?.email!);
  const isAdmin = currentUser?.is_admin === 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {session.user?.name?.split(' ')[0] || 'Friend'}!
          </h2>
          <p className="text-gray-600">
            Your quarterly steakhouse meetup headquarters
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Next Meetup</p>
                <p className="text-2xl font-bold text-gray-900">TBD</p>
              </div>
              <div className="text-4xl">📅</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Your RSVP</p>
                <p className="text-2xl font-bold text-gray-900">-</p>
              </div>
              <div className="text-4xl">✅</div>
            </div>
          </div>

          {isAdmin ? (
            <Link href="/dashboard/members">
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
          <Link href="/dashboard/rsvp">
            <div className="bg-gradient-to-br from-meat-red to-meat-brown text-white rounded-lg shadow-lg p-8 hover:shadow-xl transition cursor-pointer">
              <h3 className="text-2xl font-bold mb-2">RSVP to Events</h3>
              <p className="text-white/90 mb-4">
                Let us know if you'll be joining the next meetup
              </p>
              <span className="text-white font-semibold">View & RSVP →</span>
            </div>
          </Link>

          <Link href="/dashboard/restaurants">
            <div className="bg-gradient-to-br from-amber-600 to-orange-700 text-white rounded-lg shadow-lg p-8 hover:shadow-xl transition cursor-pointer">
              <h3 className="text-2xl font-bold mb-2">Vote on Restaurants</h3>
              <p className="text-white/90 mb-4">
                Suggest and vote for the next steakhouse destination
              </p>
              <span className="text-white font-semibold">Suggest & Vote →</span>
            </div>
          </Link>

          <Link href="/dashboard/dates">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-lg shadow-lg p-8 hover:shadow-xl transition cursor-pointer">
              <h3 className="text-2xl font-bold mb-2">Suggest Dates</h3>
              <p className="text-white/90 mb-4">
                Propose and vote on the best date for the next gathering
              </p>
              <span className="text-white font-semibold">Suggest & Vote →</span>
            </div>
          </Link>

          <div className="bg-gradient-to-br from-gray-600 to-gray-800 text-white rounded-lg shadow-lg p-8">
            <h3 className="text-2xl font-bold mb-2">Past Meetups</h3>
            <p className="text-white/90 mb-4">
              Browse photos and memories from previous events
              </p>
            <span className="text-white/80 text-sm">Coming soon →</span>
          </div>
        </div>

      </main>
    </div>
  );
}
