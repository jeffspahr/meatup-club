import { Form, Link, redirect } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.admin.events";
import { requireAdmin } from "../lib/auth.server";

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

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  // Fetch all events
  const eventsResult = await db
    .prepare('SELECT * FROM events ORDER BY event_date DESC')
    .all();

  // Fetch top restaurant
  const topRestaurantResult = await db
    .prepare(`
      SELECT
        rs.name,
        rs.address,
        COUNT(rv.id) as vote_count
      FROM restaurant_suggestions rs
      LEFT JOIN restaurant_votes rv ON rs.id = rv.suggestion_id
      GROUP BY rs.id
      ORDER BY vote_count DESC
      LIMIT 1
    `)
    .first();

  // Fetch top date
  const topDateResult = await db
    .prepare(`
      SELECT
        ds.suggested_date,
        COUNT(dv.id) as vote_count
      FROM date_suggestions ds
      LEFT JOIN date_votes dv ON ds.id = dv.suggestion_id
      GROUP BY ds.id
      ORDER BY vote_count DESC
      LIMIT 1
    `)
    .first();

  return {
    events: eventsResult.results || [],
    topRestaurant: topRestaurantResult || null,
    topDate: topDateResult || null,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create') {
    const restaurant_name = formData.get('restaurant_name');
    const restaurant_address = formData.get('restaurant_address');
    const event_date = formData.get('event_date');

    if (!restaurant_name || !event_date) {
      return { error: 'Restaurant name and date are required' };
    }

    try {
      await db
        .prepare('INSERT INTO events (restaurant_name, restaurant_address, event_date, status) VALUES (?, ?, ?, ?)')
        .bind(restaurant_name, restaurant_address || null, event_date, 'upcoming')
        .run();

      return redirect('/dashboard/admin/events');
    } catch (err) {
      return { error: 'Failed to create event' };
    }
  }

  if (actionType === 'update') {
    const id = formData.get('id');
    const restaurant_name = formData.get('restaurant_name');
    const restaurant_address = formData.get('restaurant_address');
    const event_date = formData.get('event_date');
    const status = formData.get('status');

    if (!id || !restaurant_name || !event_date) {
      return { error: 'ID, restaurant name and date are required' };
    }

    try {
      await db
        .prepare('UPDATE events SET restaurant_name = ?, restaurant_address = ?, event_date = ?, status = ? WHERE id = ?')
        .bind(restaurant_name, restaurant_address || null, event_date, status, id)
        .run();

      return redirect('/dashboard/admin/events');
    } catch (err) {
      return { error: 'Failed to update event' };
    }
  }

  return { error: 'Invalid action' };
}

export default function AdminEventsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { events, topRestaurant, topDate } = loaderData;
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    id: 0,
    restaurant_name: '',
    restaurant_address: '',
    event_date: '',
    status: '',
  });

  function startEditing(event: any) {
    setEditingId(event.id);
    setEditData({
      id: event.id,
      restaurant_name: event.restaurant_name,
      restaurant_address: event.restaurant_address || '',
      event_date: event.event_date,
      status: event.status,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditData({
      id: 0,
      restaurant_name: '',
      restaurant_address: '',
      event_date: '',
      status: '',
    });
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        to="/dashboard/admin"
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
              onClick={() => {
                setShowCreateForm(true);
                // Auto-fill form with vote winners
                const form = document.getElementById('create-form') as HTMLFormElement;
                if (form) {
                  setTimeout(() => {
                    (form.elements.namedItem('restaurant_name') as HTMLInputElement).value = topRestaurant.name;
                    (form.elements.namedItem('restaurant_address') as HTMLInputElement).value = topRestaurant.address || '';
                    (form.elements.namedItem('event_date') as HTMLInputElement).value = topDate.suggested_date;
                  }, 0);
                }
              }}
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

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
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
          <Form method="post" id="create-form" className="space-y-4">
            <input type="hidden" name="_action" value="create" />

            <div>
              <label
                htmlFor="restaurant_name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Restaurant Name *
              </label>
              <input
                id="restaurant_name"
                name="restaurant_name"
                type="text"
                required
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
                name="restaurant_address"
                type="text"
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
                name="event_date"
                type="date"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
            >
              Create Event
            </button>
          </Form>
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
            {events.map((event: any) => (
              <div key={event.id} className="p-6">
                {editingId === event.id ? (
                  <Form method="post" className="space-y-4">
                    <input type="hidden" name="_action" value="update" />
                    <input type="hidden" name="id" value={editData.id} />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Restaurant Name *
                      </label>
                      <input
                        name="restaurant_name"
                        type="text"
                        required
                        value={editData.restaurant_name}
                        onChange={(e) =>
                          setEditData({ ...editData, restaurant_name: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Restaurant Address
                      </label>
                      <input
                        name="restaurant_address"
                        type="text"
                        value={editData.restaurant_address}
                        onChange={(e) =>
                          setEditData({ ...editData, restaurant_address: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Event Date *
                      </label>
                      <input
                        name="event_date"
                        type="date"
                        required
                        value={editData.event_date}
                        onChange={(e) =>
                          setEditData({ ...editData, event_date: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status *
                      </label>
                      <select
                        name="status"
                        value={editData.status}
                        onChange={(e) =>
                          setEditData({ ...editData, status: e.target.value })
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
                        className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </Form>
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
    </main>
  );
}
