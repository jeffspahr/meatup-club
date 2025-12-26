import { useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/dashboard.admin.backfill-hours";
import { requireAdmin } from "../lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  return {};
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  // Get all restaurants with google_place_id but no opening_hours
  const restaurants = await db
    .prepare(`
      SELECT id, name, google_place_id
      FROM restaurant_suggestions
      WHERE google_place_id IS NOT NULL
      AND opening_hours IS NULL
    `)
    .all();

  const results = {
    total: restaurants.results?.length || 0,
    updated: 0,
    failed: [] as string[],
  };

  if (restaurants.results) {
    for (const restaurant of restaurants.results as any[]) {
      try {
        // Fetch place details from Google Places API
        const response = await fetch(
          `https://places.googleapis.com/v1/places/${restaurant.google_place_id}`,
          {
            headers: {
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "currentOpeningHours",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const openingHours = data.currentOpeningHours?.weekdayDescriptions
            ? JSON.stringify(data.currentOpeningHours.weekdayDescriptions)
            : null;

          if (openingHours) {
            await db
              .prepare(`UPDATE restaurant_suggestions SET opening_hours = ? WHERE id = ?`)
              .bind(openingHours, restaurant.id)
              .run();

            results.updated++;
          }
        } else {
          results.failed.push(restaurant.name);
        }
      } catch (error) {
        results.failed.push(restaurant.name);
      }
    }
  }

  return { results };
}

export default function BackfillHoursPage({ loaderData, actionData }: Route.ComponentProps) {
  const [isRunning, setIsRunning] = useState(false);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        to="/dashboard/admin"
        className="inline-flex items-center text-meat-red hover:text-meat-brown mb-6 font-medium"
      >
        ← Back to Admin
      </Link>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-4">Backfill Opening Hours</h1>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-900 font-medium mb-2">⚠️ One-Time Operation</p>
          <p className="text-sm text-yellow-800">
            This will fetch opening hours from Google Places API for all existing restaurants
            that have a Google Place ID but no opening hours data.
          </p>
        </div>

        {actionData?.results && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-green-900 mb-3">✓ Backfill Complete</h2>
            <div className="space-y-2 text-sm">
              <p className="text-green-800">
                <strong>Total restaurants found:</strong> {actionData.results.total}
              </p>
              <p className="text-green-800">
                <strong>Successfully updated:</strong> {actionData.results.updated}
              </p>
              {actionData.results.failed.length > 0 && (
                <div className="mt-3">
                  <p className="text-red-800 font-medium">Failed to update:</p>
                  <ul className="list-disc list-inside text-red-700 mt-1">
                    {actionData.results.failed.map((name: string, idx: number) => (
                      <li key={idx}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <Form method="post" onSubmit={() => setIsRunning(true)}>
          <button
            type="submit"
            disabled={isRunning || !!actionData?.results}
            className="w-full px-6 py-4 bg-meat-red text-white rounded-lg font-bold text-lg hover:bg-meat-brown transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? '⏳ Running Backfill...' : '🔄 Run Backfill'}
          </button>
        </Form>

        {actionData?.results && (
          <div className="mt-6 text-center">
            <Link
              to="/dashboard/polls"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              View Polls →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
