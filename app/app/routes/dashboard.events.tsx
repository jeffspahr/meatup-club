import type { Route } from "./+types/dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { formatDateForDisplay } from "../lib/dateUtils";

interface Event {
  id: number;
  restaurant_name: string;
  restaurant_address: string | null;
  event_date: string;
  status: string;
  created_at: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  const eventsResult = await db
    .prepare('SELECT * FROM events ORDER BY event_date DESC')
    .all();

  const events = eventsResult.results || [];

  // Separate upcoming and past events
  const now = new Date();
  const upcomingEvents = events.filter(
    (e: any) => new Date(e.event_date) >= now && e.status === 'upcoming'
  );
  const pastEvents = events.filter(
    (e: any) => new Date(e.event_date) < now || e.status !== 'upcoming'
  );

  return { upcomingEvents, pastEvents };
}

export default function EventsPage({ loaderData }: Route.ComponentProps) {
  const { upcomingEvents, pastEvents } = loaderData;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Events</h1>
        <p className="text-gray-600 mt-1">Upcoming and past Meatup.Club events</p>
      </div>

      {/* Upcoming Events */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
        {upcomingEvents.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-600">
            No upcoming events scheduled yet.
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingEvents.map((event: any) => (
              <div
                key={event.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {event.restaurant_name}
                      </h3>
                      <span className="px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
                        Upcoming
                      </span>
                    </div>
                    {event.restaurant_address && (
                      <p className="text-sm text-gray-600 mb-2">
                        📍 {event.restaurant_address}
                      </p>
                    )}
                    <p className="text-base text-gray-700 font-medium">
                      📅{' '}
                      {formatDateForDisplay(event.event_date, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Events */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Past Events</h2>
        {pastEvents.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-600">
            No past events yet.
          </div>
        ) : (
          <div className="space-y-4">
            {pastEvents.map((event: any) => (
              <div
                key={event.id}
                className="bg-white border border-gray-200 rounded-lg p-6 opacity-75"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {event.restaurant_name}
                      </h3>
                      <span
                        className={`px-3 py-1 text-sm font-semibold rounded-full ${
                          event.status === 'completed'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {event.status}
                      </span>
                    </div>
                    {event.restaurant_address && (
                      <p className="text-sm text-gray-600 mb-2">
                        📍 {event.restaurant_address}
                      </p>
                    )}
                    <p className="text-base text-gray-700">
                      📅{' '}
                      {formatDateForDisplay(event.event_date, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
