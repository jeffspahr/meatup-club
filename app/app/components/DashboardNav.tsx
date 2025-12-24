import { Link, useLocation } from "react-router";
import { Form } from "react-router";

interface DashboardNavProps {
  isAdmin: boolean;
}

export default function DashboardNav({ isAdmin }: DashboardNavProps) {
  const location = useLocation();
  const pathname = location.pathname;

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center">
              <h1 className="text-2xl font-bold text-meat-red">🥩 Meatup.Club</h1>
            </Link>
            <div className="hidden md:flex gap-6">
              <Link
                to="/dashboard"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Home
              </Link>
              <Link
                to="/dashboard/rsvp"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/rsvp')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                RSVP
              </Link>
              <Link
                to="/dashboard/restaurants"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/restaurants')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Restaurants
              </Link>
              <Link
                to="/dashboard/dates"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/dates')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Dates
              </Link>
              <Link
                to="/dashboard/events"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/events')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Events
              </Link>
              <Link
                to="/dashboard/members"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/members')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Members
              </Link>
              {isAdmin && (
                <Link
                  to="/dashboard/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                    pathname?.startsWith('/dashboard/admin')
                      ? 'bg-meat-red text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="text-gray-700 hover:text-meat-red transition text-sm font-medium"
              >
                Sign out
              </button>
            </Form>
          </div>
        </div>
      </div>
    </nav>
  );
}
