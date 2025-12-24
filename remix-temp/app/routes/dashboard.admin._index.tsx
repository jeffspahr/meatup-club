import { Link } from "react-router";
import type { Route } from "./+types/dashboard.admin._index";
import { requireAdmin } from "../lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  return {};
}

export default function AdminPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-gray-600 mt-1">Manage events and members</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/dashboard/admin/events">
          <div className="bg-white border-2 border-gray-200 rounded-lg p-8 hover:border-meat-red hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-meat-red rounded-full flex items-center justify-center text-3xl">
                📅
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Events</h2>
                <p className="text-gray-600">Manage meetup events</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Create events from vote winners</li>
              <li>• Manually create events</li>
              <li>• Edit event details and status</li>
              <li>• View all past and upcoming events</li>
            </ul>
          </div>
        </Link>

        <Link to="/dashboard/admin/members">
          <div className="bg-white border-2 border-gray-200 rounded-lg p-8 hover:border-meat-red hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-meat-red rounded-full flex items-center justify-center text-3xl">
                👥
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Members</h2>
                <p className="text-gray-600">Manage club members</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Invite new members</li>
              <li>• Edit member roles (Admin/Member)</li>
              <li>• View member status (Active/Invited)</li>
              <li>• Remove members</li>
            </ul>
          </div>
        </Link>
      </div>
    </main>
  );
}
