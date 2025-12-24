'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export const runtime = 'edge';

export default function AcceptInvitePage() {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    try {
      setAccepting(true);
      setError(null);

      const res = await fetch('/api/accept-invite', {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to accept invitation');
      }

      // Redirect to dashboard after accepting
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-meat-red mb-2">
            🥩 Welcome to Meatup.Club!
          </h1>
          <p className="text-gray-600">
            You've been invited to join our exclusive quarterly steakhouse meetup group.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">
            What you'll get access to:
          </h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="text-meat-red mr-2">✓</span>
              <span>RSVP to upcoming quarterly meetups</span>
            </li>
            <li className="flex items-start">
              <span className="text-meat-red mr-2">✓</span>
              <span>Vote on restaurant selections</span>
            </li>
            <li className="flex items-start">
              <span className="text-meat-red mr-2">✓</span>
              <span>Suggest and vote on meetup dates</span>
            </li>
            <li className="flex items-start">
              <span className="text-meat-red mr-2">✓</span>
              <span>Connect with fellow steak enthusiasts</span>
            </li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full px-6 py-3 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {accepting ? 'Activating Account...' : 'Accept Invitation & Join'}
        </button>

        <p className="text-xs text-gray-500 text-center mt-4">
          By accepting, you agree to participate in quarterly steakhouse meetups.
        </p>
      </div>
    </div>
  );
}
