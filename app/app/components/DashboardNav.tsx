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
    <nav className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-lg">
                🥩
              </span>
              <div className="leading-tight">
                <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
                  Meatup
                </span>
              <div className="text-lg font-semibold tracking-tight text-foreground">
                Dashboard
              </div>
              </div>
            </Link>
            <div className="hidden md:flex gap-2">
              <Link
                to="/dashboard"
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  isActive('/dashboard')
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                Home
              </Link>
              <Link
                to="/dashboard/about"
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  isActive('/dashboard/about')
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                About
              </Link>
              <Link
                to="/dashboard/polls"
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  isActive('/dashboard/polls')
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                Polls
              </Link>
              <Link
                to="/dashboard/events"
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  isActive('/dashboard/events') || isActive('/dashboard/rsvp')
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                Events
              </Link>
              <Link
                to="/dashboard/restaurants"
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  isActive('/dashboard/restaurants')
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                Restaurants
              </Link>
              <Link
                to="/dashboard/members"
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  isActive('/dashboard/members')
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                Members
              </Link>
              {isAdmin && (
                <Link
                  to="/dashboard/admin"
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                    pathname?.startsWith('/dashboard/admin')
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/profile"
              className="px-4 py-2 rounded-full text-sm font-semibold text-muted-foreground transition hover:text-foreground hover:bg-foreground/5"
            >
              Profile
            </Link>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="px-4 py-2 rounded-full text-sm font-semibold text-muted-foreground transition hover:text-foreground hover:bg-foreground/5"
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
