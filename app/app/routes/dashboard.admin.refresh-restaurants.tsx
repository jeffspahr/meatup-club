import { useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/dashboard.admin.refresh-restaurants";
import { requireAdmin } from "../lib/auth.server";
import { fetchPlaceDetails, type PlaceDetails } from "../lib/places.server";
import { Alert, Button, Card, PageHeader } from "../components/ui";
import { AdminLayout } from "../components/AdminLayout";

interface RestaurantRow {
  id: number;
  name: string;
  google_place_id: string;
}

interface RefreshDetail {
  name: string;
  fieldsUpdated: string[];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  return {};
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const apiKey = context.cloudflare.env.GOOGLE_PLACES_API_KEY;

  const restaurants = await db
    .prepare(`
      SELECT id, name, google_place_id
      FROM restaurants
      WHERE google_place_id IS NOT NULL AND google_place_id != ''
    `)
    .all();

  const results = {
    total: restaurants.results?.length || 0,
    updated: 0,
    unchanged: 0,
    failed: [] as string[],
    details: [] as RefreshDetail[],
  };

  if (!apiKey) {
    return {
      results: {
        ...results,
        failed: ["Places API is not configured"],
      },
    };
  }

  const restaurantRows = (restaurants.results || []) as unknown as RestaurantRow[];
  for (const restaurant of restaurantRows) {
    try {
      const details = await fetchPlaceDetails(restaurant.google_place_id, apiKey);
      const { sql, binds, fieldsUpdated } = buildUpdate(details);

      if (fieldsUpdated.length === 0) {
        results.unchanged++;
        continue;
      }

      await db
        .prepare(`UPDATE restaurants SET ${sql} WHERE id = ?`)
        .bind(...binds, restaurant.id)
        .run();

      results.updated++;
      results.details.push({ name: restaurant.name, fieldsUpdated });
    } catch (error) {
      results.failed.push(restaurant.name);
    }
  }

  return { results };
}

function buildUpdate(details: PlaceDetails): {
  sql: string;
  binds: unknown[];
  fieldsUpdated: string[];
} {
  const setClauses: string[] = [];
  const binds: unknown[] = [];
  const fieldsUpdated: string[] = [];

  const push = (column: string, value: unknown) => {
    setClauses.push(`${column} = ?`);
    binds.push(value);
    fieldsUpdated.push(column);
  };

  if (details.address) push("address", details.address);
  if (details.rating > 0) push("google_rating", details.rating);
  if (details.ratingCount > 0) push("rating_count", details.ratingCount);
  if (details.priceLevel > 0) push("price_level", details.priceLevel);
  if (details.cuisine && details.cuisine !== "Restaurant") push("cuisine", details.cuisine);
  if (details.phone) push("phone_number", details.phone);
  if (details.googleMapsUrl) push("google_maps_url", details.googleMapsUrl);
  if (details.photoUrl) push("photo_url", details.photoUrl);
  if (details.openingHours) push("opening_hours", details.openingHours);

  return { sql: setClauses.join(", "), binds, fieldsUpdated };
}

export default function RefreshRestaurantsPage({ actionData }: Route.ComponentProps) {
  const [isRunning, setIsRunning] = useState(false);

  return (
    <AdminLayout>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="p-8">
          <PageHeader title="Refresh Restaurant Metadata" />

          <Alert variant="info" className="mb-6">
            <p className="text-sm">
              Re-fetches address, rating, price level, cuisine, phone number, photo, hours,
              and Google Maps URL from Google Places for every restaurant with a Place ID.
              Existing values are overwritten when Google returns one. Safe to run any time
              metadata may have drifted (ratings, hours, etc.).
            </p>
          </Alert>

          {actionData?.results && (
            <Alert variant="success" className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Refresh Complete</h2>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Total restaurants:</strong> {actionData.results.total}
                </p>
                <p>
                  <strong>Updated:</strong> {actionData.results.updated}
                </p>
                <p>
                  <strong>Unchanged:</strong> {actionData.results.unchanged}
                </p>
                {actionData.results.details.length > 0 && (
                  <div className="mt-3">
                    <p className="font-medium">Field-level changes:</p>
                    <ul className="list-disc list-inside mt-1">
                      {actionData.results.details.map((detail, idx) => (
                        <li key={idx}>
                          <strong>{detail.name}:</strong> {detail.fieldsUpdated.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {actionData.results.failed.length > 0 && (
                  <div className="mt-3">
                    <p className="font-medium">Failed:</p>
                    <ul className="list-disc list-inside mt-1">
                      {actionData.results.failed.map((name, idx) => (
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
              {isRunning ? "Running Refresh..." : "Run Refresh"}
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
    </AdminLayout>
  );
}
