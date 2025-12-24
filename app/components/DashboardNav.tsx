'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardNav() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check if user is admin
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.is_admin) {
          setIsAdmin(true);
        }
      })
      .catch(() => {
        // Ignore errors
      });
  }, []);

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center">
              <h1 className="text-2xl font-bold text-meat-red">🥩 Meatup.Club</h1>
            </Link>
            <div className="hidden md:flex gap-6">
              <Link
                href="/dashboard"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Home
              </Link>
              <Link
                href="/dashboard/rsvp"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/rsvp')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                RSVP
              </Link>
              <Link
                href="/dashboard/restaurants"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/restaurants')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Restaurants
              </Link>
              <Link
                href="/dashboard/dates"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive('/dashboard/dates')
                    ? 'bg-meat-red text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Dates
              </Link>
              {isAdmin && (
                <Link
                  href="/dashboard/members"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                    isActive('/dashboard/members')
                      ? 'bg-meat-red text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Members
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/api/auth/signout"
              className="text-gray-700 hover:text-meat-red transition text-sm font-medium"
            >
              Sign out
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
