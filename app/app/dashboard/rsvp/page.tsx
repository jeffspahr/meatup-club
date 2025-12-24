'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardNav from '@/components/DashboardNav';

export const runtime = 'edge';

interface Event {
  id: number;
  restaurant_name: string;
  restaurant_address: string;
  event_date: string;
  status: string;
  created_at: string;
}

interface RSVP {
  id: number;
  event_id: number;
  user_id: number;
  status: 'yes' | 'no' | 'maybe';
  comments: string | null;
  created_at: string;
  name?: string;
  email?: string;
  picture?: string;
}

interface RSVPData {
  userRsvp: RSVP | null;
  allRsvps: RSVP[];
}

export default function RSVPPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [rsvpData, setRsvpData] = useState<Record<number, RSVPData>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state for each event
  const [formData, setFormData] = useState<
    Record<number, { status: string; comments: string }>
  >({});

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    try {
      setLoading(true);
      setError(null);

      // Fetch all upcoming events
      const res = await fetch('/api/events?status=upcoming');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch events');
      }

      const data = await res.json();
      setEvents(data.events || []);

      // Fetch RSVP data for each event
      const rsvpPromises = (data.events || []).map((event: Event) =>
        fetch(`/api/rsvp?event_id=${event.id}`).then((r) => r.json())
      );

      const rsvpResults = await Promise.all(rsvpPromises);
      const rsvpDataMap: Record<number, RSVPData> = {};
      const formDataMap: Record<
        number,
        { status: string; comments: string }
      > = {};

      (data.events || []).forEach((event: Event, index: number) => {
        rsvpDataMap[event.id] = rsvpResults[index];
        // Initialize form with existing RSVP data or defaults
        const userRsvp = rsvpResults[index].userRsvp;
        formDataMap[event.id] = {
          status: userRsvp?.status || '',
          comments: userRsvp?.comments || '',
        };
      });

      setRsvpData(rsvpDataMap);
      setFormData(formDataMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(eventId: number) {
    try {
      setSubmitting(eventId);
      setError(null);

      const data = formData[eventId];
      if (!data.status) {
        setError('Please select an RSVP status');
        return;
      }

      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          status: data.status,
          comments: data.comments || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save RSVP');
      }

      // Refresh RSVP data for this event
      const rsvpRes = await fetch(`/api/rsvp?event_id=${eventId}`);
      const rsvpResult = await rsvpRes.json();
      setRsvpData((prev) => ({ ...prev, [eventId]: rsvpResult }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(null);
    }
  }

  function updateFormData(
    eventId: number,
    field: 'status' | 'comments',
    value: string
  ) {
    setFormData((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        [field]: value,
      },
    }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-8">RSVP to Events</h1>
          <p className="text-gray-600">Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <div className="max-w-6xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8">RSVP to Events</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">
            No upcoming events at the moment. Check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white border border-gray-200 rounded-lg p-6"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">
                  {event.restaurant_name}
                </h2>
                {event.restaurant_address && (
                  <p className="text-gray-600 mb-1">{event.restaurant_address}</p>
                )}
                <p className="text-gray-600">
                  Date:{' '}
                  {new Date(event.event_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* RSVP Form */}
              <div className="mb-6 bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3">Your RSVP</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Will you attend?
                    </label>
                    <div className="flex gap-3">
                      {['yes', 'no', 'maybe'].map((option) => (
                        <button
                          key={option}
                          onClick={() =>
                            updateFormData(event.id, 'status', option)
                          }
                          className={`px-4 py-2 rounded-md font-medium transition-colors ${
                            formData[event.id]?.status === option
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`comments-${event.id}`}
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Comments (Optional)
                    </label>
                    <textarea
                      id={`comments-${event.id}`}
                      value={formData[event.id]?.comments || ''}
                      onChange={(e) =>
                        updateFormData(
                          event.id,
                          'comments',
                          e.target.value
                        )
                      }
                      placeholder="Any comments or notes about your attendance"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={() => handleSubmit(event.id)}
                    disabled={
                      !formData[event.id]?.status || submitting === event.id
                    }
                    className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting === event.id ? 'Saving...' : 'Save RSVP'}
                  </button>
                </div>
              </div>

              {/* Attendee List */}
              {rsvpData[event.id] && rsvpData[event.id].allRsvps.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">
                    Attendees ({rsvpData[event.id].allRsvps.filter((r) => r.status === 'yes').length})
                  </h3>
                  <div className="space-y-2">
                    {rsvpData[event.id].allRsvps
                      .filter((rsvp) => rsvp.status === 'yes')
                      .map((rsvp) => (
                        <div
                          key={rsvp.id}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-md"
                        >
                          {rsvp.picture && (
                            <img
                              src={rsvp.picture}
                              alt={rsvp.name || ''}
                              className="w-10 h-10 rounded-full"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">{rsvp.name || rsvp.email}</p>
                            {rsvp.comments && (
                              <p className="text-sm text-gray-600">
                                {rsvp.comments}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>

                  {rsvpData[event.id].allRsvps.filter(
                    (r) => r.status === 'maybe'
                  ).length > 0 && (
                    <>
                      <h4 className="font-semibold mt-4 mb-2">Maybe</h4>
                      <div className="space-y-2">
                        {rsvpData[event.id].allRsvps
                          .filter((rsvp) => rsvp.status === 'maybe')
                          .map((rsvp) => (
                            <div
                              key={rsvp.id}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-md opacity-60"
                            >
                              {rsvp.picture && (
                                <img
                                  src={rsvp.picture}
                                  alt={rsvp.name || ''}
                                  className="w-10 h-10 rounded-full"
                                />
                              )}
                              <p className="font-medium">
                                {rsvp.name || rsvp.email}
                              </p>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
