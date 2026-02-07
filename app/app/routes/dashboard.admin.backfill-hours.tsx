import { useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/dashboard.admin.backfill-hours";
import { requireAdmin } from "../lib/auth.server";
import { Alert, Button, Card, PageHeader } from "../components/ui";

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
      FROM restaurants
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
              .prepare(`UPDATE restaurants SET opening_hours = ? WHERE id = ?`)
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
        className="inline-flex items-center text-accent hover:text-accent-strong mb-6 font-medium"
      >
        ← Back to Admin
      </Link>

      <Card className="p-8">
        <PageHeader title="Backfill Opening Hours" />

        <Alert variant="warning" className="mb-6">
          <p className="font-medium mb-2">One-Time Operation</p>
          <p className="text-sm">
            This will fetch opening hours from Google Places API for all existing restaurants
            that have a Google Place ID but no opening hours data.
          </p>
        </Alert>

        {actionData?.results && (
          <Alert variant="success" className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Backfill Complete</h2>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Total restaurants found:</strong> {actionData.results.total}
              </p>
              <p>
                <strong>Successfully updated:</strong> {actionData.results.updated}
              </p>
              {actionData.results.failed.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium">Failed to update:</p>
                  <ul className="list-disc list-inside mt-1">
                    {actionData.results.failed.map((name: string, idx: number) => (
                      <li key={idx}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Alert>
        )}

        <Form method="post" onSubmit={() => setIsRunning(true)}>
          <Button
            type="submit"
            size="lg"
            disabled={isRunning || !!actionData?.results}
            className="w-full"
          >
            {isRunning ? 'Running Backfill...' : 'Run Backfill'}
          </Button>
        </Form>

        {actionData?.results && (
          <div className="mt-6 text-center">
            <Link
              to="/dashboard/polls"
              className="btn-primary inline-flex items-center justify-center px-6 py-3"
            >
              View Polls
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
