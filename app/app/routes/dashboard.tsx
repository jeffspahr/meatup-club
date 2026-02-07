import { Outlet, isRouteErrorResponse, Link } from "react-router";
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
        {/* Top amber glow */}
        <div className="absolute top-0 left-1/4 w-[800px] h-[400px] bg-accent/[0.04] blur-[120px] rounded-full" />
        {/* Bottom burgundy glow */}
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[300px] bg-burgundy/[0.03] blur-[100px] rounded-full" />
        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
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
          <div className="text-4xl mb-4">
            {isRouteErrorResponse(error) && error.status === 404 ? "🔍" : "⚠️"}
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
