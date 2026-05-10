import { Link, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/dashboard.admin._index";
import { requireAdmin } from "../lib/auth.server";
import { Card, Alert } from "../components/ui";
import { ClipboardDocumentCheckIcon, CalendarDaysIcon, UserGroupIcon, EnvelopeIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { AdminLayout } from "../components/AdminLayout";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  return {};
}

export default function AdminPage() {
  return (
    <AdminLayout>
    <main className="page-main">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground mt-1">Manage events, polls, and members</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/dashboard/admin/polls">
          <Card hover className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center text-3xl">
                <ClipboardDocumentCheckIcon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Polls</h2>
                <p className="text-muted-foreground">Manage voting polls</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• View active poll status</li>
              <li>• See vote leaders</li>
              <li>• Close polls with winners</li>
              <li>• Create events from winners</li>
            </ul>
          </Card>
        </Link>

        <Link to="/dashboard/admin/events">
          <Card hover className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center text-3xl">
                <CalendarDaysIcon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Events</h2>
                <p className="text-muted-foreground">Manage meetup events</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Create events from vote winners</li>
              <li>• Manually create events</li>
              <li>• Edit event details and status</li>
              <li>• View all past and upcoming events</li>
            </ul>
          </Card>
        </Link>

        <Link to="/dashboard/admin/members">
          <Card hover className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center text-3xl">
                <UserGroupIcon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Members</h2>
                <p className="text-muted-foreground">Manage club members</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Invite new members</li>
              <li>• Edit member roles (Admin/Member)</li>
              <li>• View member status (Active/Invited)</li>
              <li>• Remove members</li>
            </ul>
          </Card>
        </Link>

        <Link to="/dashboard/admin/content">
          <Card hover className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center text-3xl">
                📝
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Content</h2>
                <p className="text-muted-foreground">Edit site content</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Edit club description</li>
              <li>• Update goals and guidelines</li>
              <li>• Manage membership info</li>
              <li>• Update safety reminders</li>
            </ul>
          </Card>
        </Link>

        <Link to="/dashboard/admin/email-templates">
          <Card hover className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center text-3xl">
                <EnvelopeIcon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Email Templates</h2>
                <p className="text-muted-foreground">Manage invitation emails</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Create custom email templates</li>
              <li>• Edit existing templates</li>
              <li>• Set default template</li>
              <li>• Preview before sending</li>
            </ul>
          </Card>
        </Link>

        <Link to="/dashboard/admin/analytics">
          <Card hover className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center text-3xl">
                📊
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Analytics</h2>
                <p className="text-muted-foreground">Track user activity</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• View user login history</li>
              <li>• Track voting and suggestions</li>
              <li>• See activity statistics</li>
              <li>• Monitor engagement metrics</li>
            </ul>
          </Card>
        </Link>
      </div>

      <Alert variant="info" className="mt-6">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><WrenchScrewdriverIcon className="w-5 h-5" /> Maintenance Tools</h3>
        <Link
          to="/dashboard/admin/refresh-restaurants"
          className="inline-flex items-center gap-2 text-accent hover:text-accent-strong font-medium"
        >
          <span>🔄</span>
          <span>Refresh Restaurant Metadata from Google</span>
          <span>→</span>
        </Link>
      </Alert>
    </main>
    </AdminLayout>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong loading the admin panel.";
  let details = "Please refresh and try again.";

  if (isRouteErrorResponse(error)) {
    message = `Unable to load admin panel (${error.status})`;
    details = error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <AdminLayout>
      <main className="page-main">
        <Alert variant="error">
          <div className="space-y-3">
            <p className="font-semibold">{message}</p>
            <p className="text-sm">{details}</p>
            <div className="pt-1">
              <Link to="/dashboard" className="btn-primary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </Alert>
      </main>
    </AdminLayout>
  );
}
