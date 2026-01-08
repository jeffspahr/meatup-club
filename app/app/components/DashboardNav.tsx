import { Link, useLocation } from "react-router";
import { Form } from "react-router";
import { useState } from "react";

interface DashboardNavProps {
  isAdmin: boolean;
}

export default function DashboardNav({ isAdmin }: DashboardNavProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;
  const isActivePrefix = (prefix: string) => pathname?.startsWith(prefix);

  const navLinks = [
    { to: "/dashboard", label: "Home", exact: true },
    { to: "/dashboard/about", label: "About", exact: true },
    { to: "/dashboard/polls", label: "Polls", exact: true },
    { to: "/dashboard/events", label: "Events", exact: false },
    { to: "/dashboard/restaurants", label: "Restaurants", exact: true },
    { to: "/dashboard/members", label: "Members", exact: true },
  ];

  return (
    <nav className="nav-shell sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-xl transition-all group-hover:bg-accent/20 group-hover:scale-105">
              🥩
            </span>
            <div className="leading-tight hidden sm:block">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Meatup
              </span>
              <div className="font-display text-lg font-semibold tracking-tight text-foreground">
                Dashboard
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = link.exact
                ? isActive(link.to)
                : isActivePrefix(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`nav-link ${active ? "nav-link-active" : ""}`}
                >
                  {link.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                to="/dashboard/admin"
                className={`nav-link ${
                  isActivePrefix("/dashboard/admin") ? "nav-link-active" : ""
                }`}
              >
                Admin
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/profile"
              className="nav-link hidden sm:flex"
            >
              Profile
            </Link>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="btn-ghost"
              >
                Sign out
              </button>
            </Form>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <span className="sr-only">Open menu</span>
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/50">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const active = link.exact
                  ? isActive(link.to)
                  : isActivePrefix(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-accent/15 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  to="/dashboard/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActivePrefix("/dashboard/admin")
                      ? "bg-accent/15 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  Admin
                </Link>
              )}
              <Link
                to="/dashboard/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Profile
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
