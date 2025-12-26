import { Form, Link, redirect } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/dashboard.admin.content";
import { requireAdmin } from "../lib/auth.server";

interface ContentItem {
  id: number;
  key: string;
  title: string;
  content: string;
  updated_at: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  const contentResult = await db
    .prepare('SELECT * FROM site_content ORDER BY id ASC')
    .all();

  return {
    content: contentResult.results || [],
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const action = formData.get('_action');

  if (action === 'update') {
    const id = formData.get('id');
    const content = formData.get('content');

    if (!id || !content) {
      return { error: 'ID and content are required' };
    }

    try {
      await db
        .prepare('UPDATE site_content SET content = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?')
        .bind(content, user.id, id)
        .run();

      return redirect('/dashboard/admin/content');
    } catch (err) {
      return { error: 'Failed to update content' };
    }
  }

  return { error: 'Invalid action' };
}

export default function AdminContentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { content } = loaderData;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  function startEditing(item: any) {
    setEditingId(item.id);
    setEditContent(item.content);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditContent('');
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        to="/dashboard/admin"
        className="inline-flex items-center text-meat-red hover:text-meat-brown mb-6 font-medium"
      >
        ← Back to Admin
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Site Content Management</h1>
        <p className="text-gray-600 mt-1">
          Edit the club's description, goals, guidelines, and other information
        </p>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      <div className="space-y-6">
        {content.map((item: any) => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {editingId === item.id ? (
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">{item.title}</h2>
                <Form method="post" className="space-y-4">
                  <input type="hidden" name="_action" value="update" />
                  <input type="hidden" name="id" value={item.id} />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Content *
                    </label>
                    <textarea
                      name="content"
                      required
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red font-mono text-sm"
                      placeholder="Enter content here..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Supports markdown-style formatting. Use * for bullet points.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </Form>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{item.title}</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Last updated: {new Date(item.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => startEditing(item)}
                    className="px-4 py-2 text-sm font-medium text-meat-red hover:bg-red-50 rounded-md transition-colors"
                  >
                    Edit
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">
                    {item.content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
