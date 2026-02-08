import { Outlet, isRouteErrorResponse, Link } from "react-router";
import { MagnifyingGlassIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/dashboard";
import { requireActiveUser } from "../lib/auth.server";
import DashboardNav from "../components/DashboardNav";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  return { user };
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const isAdmin = user.is_admin === 1;

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Ambient background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        {/* Top indigo glow */}
        <div className="absolute top-0 left-1/4 w-[800px] h-[400px] bg-accent/[0.04] blur-[120px] rounded-full" />
        {/* Bottom indigo glow */}
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[300px] bg-accent-strong/[0.03] blur-[100px] rounded-full" />
      </div>

      <DashboardNav isAdmin={isAdmin} />
      <Outlet />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred. Please try again.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    details = error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="card-shell p-8">
          <div className="mb-4 flex justify-center">
            <div className="icon-container-lg">
              {isRouteErrorResponse(error) && error.status === 404
                ? <MagnifyingGlassIcon className="w-6 h-6" />
                : <ExclamationTriangleIcon className="w-6 h-6" />}
            </div>
          </div>
          <h1 className="text-display-md mb-2">{message}</h1>
          <p className="text-muted-foreground mb-6">{details}</p>
          <div className="flex justify-center gap-3">
            <Link to="/dashboard" className="btn-primary">
              Back to Dashboard
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              Retry
            </button>
          </div>
          {import.meta.env.DEV && error instanceof Error && error.stack && (
            <pre className="mt-6 text-left text-xs bg-muted rounded-lg p-4 overflow-x-auto text-muted-foreground">
              <code>{error.stack}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
