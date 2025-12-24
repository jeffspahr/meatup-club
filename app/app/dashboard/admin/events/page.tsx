'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardNav from '@/components/DashboardNav';

export const runtime = 'edge';

interface Event {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  status: string;
  created_at: string;
}

interface VoteWinner {
  name: string;
  address: string | null;
  vote_count: number;
}

interface DateWinner {
  suggested_date: string;
  vote_count: number;
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [topRestaurant, setTopRestaurant] = useState<VoteWinner | null>(null);
  const [topDate, setTopDate] = useState<DateWinner | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newEvent, setNewEvent] = useState({
    restaurant_name: '',
    restaurant_address: '',
    event_date: '',
  });

  const [editEvent, setEditEvent] = useState({
    id: 0,
    restaurant_name: '',
    restaurant_address: '',
    event_date: '',
    status: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Check if user is admin
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (!meData.is_admin) {
          router.push('/dashboard');
          return;
        }
      } else {
        router.push('/dashboard');
        return;
      }

      // Fetch events
      const eventsRes = await fetch('/api/events');
      if (!eventsRes.ok) {
        if (eventsRes.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch events');
      }

      const eventsData = await eventsRes.json();
      setEvents(eventsData.events || []);

      // Fetch top restaurant
      const restaurantsRes = await fetch('/api/restaurants');
      if (restaurantsRes.ok) {
        const restaurantsData = await restaurantsRes.json();
        if (restaurantsData.suggestions?.length > 0) {
          const sorted = restaurantsData.suggestions.sort(
            (a: any, b: any) => b.vote_count - a.vote_count
          );
          setTopRestaurant(sorted[0]);
        }
      }

      // Fetch top date
      const datesRes = await fetch('/api/dates');
      if (datesRes.ok) {
        const datesData = await datesRes.json();
        if (datesData.suggestions?.length > 0) {
          const sorted = datesData.suggestions.sort(
            (a: any, b: any) => b.vote_count - a.vote_count
          );
          setTopDate(sorted[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  function useVoteWinners() {
    if (topRestaurant && topDate) {
      setNewEvent({
        restaurant_name: topRestaurant.name,
        restaurant_address: topRestaurant.address || '',
        event_date: topDate.suggested_date,
      });
      setShowCreateForm(true);
    }
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();

    if (!newEvent.restaurant_name || !newEvent.event_date) {
      setError('Restaurant name and date are required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newEvent,
          status: 'upcoming',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create event');
      }

      setNewEvent({ restaurant_name: '', restaurant_address: '', event_date: '' });
      setShowCreateForm(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setCreating(false);
    }
  }

  function startEditing(event: Event) {
    setEditingId(event.id);
    setEditEvent({
      id: event.id,
      restaurant_name: event.restaurant_name,
      restaurant_address: event.restaurant_address || '',
      event_date: event.event_date,
      status: event.status,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditEvent({
      id: 0,
      restaurant_name: '',
      restaurant_address: '',
      event_date: '',
      status: '',
    });
  }

  async function handleUpdateEvent(e: React.FormEvent) {
    e.preventDefault();

    if (!editEvent.restaurant_name || !editEvent.event_date) {
      setError('Restaurant name and date are required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const res = await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editEvent),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update event');
      }

      cancelEditing();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-8">Event Management</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-8">Event Management</h1>
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <div className="max-w-6xl mx-auto p-8">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center text-meat-red hover:text-meat-brown mb-6 font-medium"
        >
          ← Back to Admin
        </Link>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Event Management</h1>
            <p className="text-gray-600 mt-1">Create and manage meetup events</p>
          </div>
          <div className="flex gap-3">
            {topRestaurant && topDate && (
              <button
                onClick={useVoteWinners}
                className="px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors"
              >
                Create from Vote Winners
              </button>
            )}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
            >
              {showCreateForm ? 'Cancel' : '+ Create Event'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Vote Winners Summary */}
        {(topRestaurant || topDate) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-blue-900 mb-4">
              Current Vote Leaders
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topRestaurant && (
                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">
                      Restaurant
                    </span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                      {topRestaurant.vote_count} votes
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {topRestaurant.name}
                  </p>
                  {topRestaurant.address && (
                    <p className="text-sm text-gray-600 mt-1">
                      {topRestaurant.address}
                    </p>
                  )}
                </div>
              )}
              {topDate && (
                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Date</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                      {topDate.vote_count} votes
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {new Date(topDate.suggested_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Event Form */}
        {showCreateForm && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Create New Event</h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label
                  htmlFor="restaurant_name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Restaurant Name *
                </label>
                <input
                  id="restaurant_name"
                  type="text"
                  required
                  value={newEvent.restaurant_name}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, restaurant_name: e.target.value })
                  }
                  placeholder="e.g., Ruth's Chris Steak House"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                />
              </div>

              <div>
                <label
                  htmlFor="restaurant_address"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Restaurant Address (Optional)
                </label>
                <input
                  id="restaurant_address"
                  type="text"
                  value={newEvent.restaurant_address}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, restaurant_address: e.target.value })
                  }
                  placeholder="e.g., 123 Main St, San Francisco, CA"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                />
              </div>

              <div>
                <label
                  htmlFor="event_date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Event Date *
                </label>
                <input
                  id="event_date"
                  type="date"
                  required
                  value={newEvent.event_date}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, event_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creating Event...' : 'Create Event'}
              </button>
            </form>
          </div>
        )}

        {/* Events List */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">All Events</h2>
          </div>
          {events.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No events created yet. Create your first event above!
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {events.map((event) => (
                <div key={event.id} className="p-6">
                  {editingId === event.id ? (
                    <form onSubmit={handleUpdateEvent} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Restaurant Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={editEvent.restaurant_name}
                          onChange={(e) =>
                            setEditEvent({ ...editEvent, restaurant_name: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Restaurant Address
                        </label>
                        <input
                          type="text"
                          value={editEvent.restaurant_address}
                          onChange={(e) =>
                            setEditEvent({ ...editEvent, restaurant_address: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Event Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={editEvent.event_date}
                          onChange={(e) =>
                            setEditEvent({ ...editEvent, event_date: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status *
                        </label>
                        <select
                          value={editEvent.status}
                          onChange={(e) =>
                            setEditEvent({ ...editEvent, status: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                        >
                          <option value="upcoming">Upcoming</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={creating}
                          className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          {creating ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {event.restaurant_name}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              event.status === 'upcoming'
                                ? 'bg-green-100 text-green-800'
                                : event.status === 'completed'
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {event.status}
                          </span>
                        </div>
                        {event.restaurant_address && (
                          <p className="text-sm text-gray-600 mb-1">
                            {event.restaurant_address}
                          </p>
                        )}
                        <p className="text-sm text-gray-600">
                          {new Date(event.event_date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Created {new Date(event.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => startEditing(event)}
                        className="px-4 py-2 text-sm font-medium text-meat-red hover:bg-red-50 rounded-md transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
