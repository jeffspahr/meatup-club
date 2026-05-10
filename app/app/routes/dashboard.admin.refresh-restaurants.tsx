import { useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/dashboard.admin.refresh-restaurants";
import { requireAdmin } from "../lib/auth.server";
import {
  fetchPlaceDetails,
  placeDetailsToRestaurantFields,
  PLACE_MAPPER_COLUMNS,
  type RestaurantFieldsFromPlace,
} from "../lib/places.server";
import { Alert, Button, Card, PageHeader } from "../components/ui";
import { AdminLayout } from "../components/AdminLayout";

type MapperColumn = keyof RestaurantFieldsFromPlace;

type RestaurantRow = { id: number; google_place_id: string } & {
  [K in MapperColumn]: string | number | null;
};

interface RefreshDetail {
  name: string;
  fieldsUpdated: string[];
}

function valuesEqual(mapperValue: unknown, dbValue: unknown): boolean {
  if (dbValue === null || dbValue === undefined) return false;
  if (typeof mapperValue === "number") {
    return typeof dbValue === "number" && mapperValue === dbValue;
  }
  return String(dbValue) === String(mapperValue);
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
      SELECT id, google_place_id, ${PLACE_MAPPER_COLUMNS.join(", ")}
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
      const fields = placeDetailsToRestaurantFields(details);
      const changedFields = (Object.keys(fields) as MapperColumn[]).filter(
        (column) => !valuesEqual(fields[column], restaurant[column]),
      );

      if (changedFields.length === 0) {
        results.unchanged++;
        continue;
      }

      const setClause = changedFields.map((column) => `${column} = ?`).join(", ");
      const binds = changedFields.map((column) => fields[column]);

      await db
        .prepare(`UPDATE restaurants SET ${setClause} WHERE id = ?`)
        .bind(...binds, restaurant.id)
        .run();

      const reportedName =
        fields.name ??
        (typeof restaurant.name === "string" && restaurant.name ? restaurant.name : "(unnamed)");

      results.updated++;
      results.details.push({ name: reportedName, fieldsUpdated: changedFields });
    } catch (error) {
      const fallbackName =
        typeof restaurant.name === "string" && restaurant.name
          ? restaurant.name
          : `place ${restaurant.id}`;
      results.failed.push(fallbackName);
    }
  }

  return { results };
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
              Re-fetches every Google-sourced field for each restaurant with a Place ID and
              overwrites the stored values when Google returns one. Stays in sync with whatever
              the add-restaurant flow collects, so it's safe to run any time metadata drifts
              (ratings, hours, etc.).
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
