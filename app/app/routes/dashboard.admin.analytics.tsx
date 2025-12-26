import { useState } from "react";
import type { Route } from "./+types/dashboard.admin.analytics";
import { requireActiveUser } from "../lib/auth.server";
import { getAllActivity, getActivityStats } from "../lib/activity.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);

  if (user.is_admin !== 1) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const [activities, stats] = await Promise.all([
    getAllActivity(db, limit, offset),
    getActivityStats(db),
  ]);

  return { activities, stats, page };
}

export default function AdminAnalyticsPage({ loaderData }: Route.ComponentProps) {
  const { activities, stats, page } = loaderData;
  const [filterType, setFilterType] = useState<string>('all');

  const filteredActivities = filterType === 'all'
    ? activities
    : activities.filter((a: any) => a.action_type === filterType);

  // Get unique action types for filter dropdown
  const actionTypes = Array.from(new Set(activities.map((a: any) => a.action_type)));

  function formatActionType(type: string): string {
    return type.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function parseActionDetails(details: string | null): any {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return details;
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">User Analytics</h1>
        <p className="text-gray-600">Track user activity and engagement</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Activities</div>
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Logins (Last 7 Days)</div>
          <div className="text-3xl font-bold text-gray-900">{stats.recentLogins}</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Active Users (30d)</div>
          <div className="text-3xl font-bold text-gray-900">{stats.mostActiveUsers.length}</div>
        </div>
      </div>

      {/* Activity Breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.byType.map((item: any) => (
            <div key={item.action_type} className="border border-gray-100 rounded p-3">
              <div className="text-xs text-gray-600 mb-1">
                {formatActionType(item.action_type)}
              </div>
              <div className="text-2xl font-bold text-gray-900">{item.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Most Active Users */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Most Active Users (Last 30 Days)</h2>
        <div className="space-y-2">
          {stats.mostActiveUsers.map((user: any) => (
            <div key={user.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <div className="font-medium text-gray-900">{user.name || user.email}</div>
                <div className="text-sm text-gray-500">{user.email}</div>
              </div>
              <div className="text-lg font-semibold text-gray-700">{user.activity_count} actions</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Log */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>

          <div className="flex items-center gap-2">
            <label htmlFor="filter" className="text-sm text-gray-600">Filter:</label>
            <select
              id="filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              <option value="all">All Actions</option>
              {actionTypes.map((type) => (
                <option key={type} value={type}>
                  {formatActionType(type)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No activity found
                  </td>
                </tr>
              ) : (
                filteredActivities.map((activity: any) => {
                  const details = parseActionDetails(activity.action_details);

                  return (
                    <tr key={activity.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatTimestamp(activity.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">
                          {activity.user_name || activity.user_email}
                        </div>
                        <div className="text-xs text-gray-500">{activity.user_email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {formatActionType(activity.action_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {details ? (
                          typeof details === 'object' ? (
                            <pre className="text-xs bg-gray-50 p-2 rounded max-w-md overflow-x-auto">
                              {JSON.stringify(details, null, 2)}
                            </pre>
                          ) : (
                            <span>{details}</span>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {activity.ip_address || <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {page} · Showing {filteredActivities.length} of {activities.length} activities
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/dashboard/admin/analytics?page=${page - 1}`}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium"
              >
                Previous
              </a>
            )}
            {activities.length === 50 && (
              <a
                href={`/dashboard/admin/analytics?page=${page + 1}`}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium"
              >
                Next
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
