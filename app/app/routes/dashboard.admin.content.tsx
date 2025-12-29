import { Form, Link, redirect } from "react-router";
import { formatDateForDisplay } from "../lib/dateUtils";
import { useState } from "react";
import type { Route } from "./+types/dashboard.admin.content";
import { requireAdmin } from "../lib/auth.server";
import ReactMarkdown from 'react-markdown';

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
  const [showPreview, setShowPreview] = useState(false);

  function startEditing(item: any) {
    setEditingId(item.id);
    setEditContent(item.content);
    setShowPreview(false);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditContent('');
    setShowPreview(false);
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
        <p className="text-muted-foreground mt-1">
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
          <div key={item.id} className="bg-card border border-border rounded-lg overflow-hidden">
            {editingId === item.id ? (
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">{item.title}</h2>
                <Form method="post" className="space-y-4">
                  <input type="hidden" name="_action" value="update" />
                  <input type="hidden" name="id" value={item.id} />

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-foreground">
                        Content *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                        className="text-sm text-meat-red hover:text-meat-brown font-medium"
                      >
                        {showPreview ? 'Edit' : 'Preview'}
                      </button>
                    </div>

                    {showPreview ? (
                      <div className="w-full px-4 py-3 border border-border rounded-md bg-muted min-h-[240px]">
                        <ReactMarkdown
                          components={{
                            ul: ({ children }) => <ul className="space-y-2 list-disc ml-6">{children}</ul>,
                            ol: ({ children }) => <ol className="space-y-2 list-decimal ml-6">{children}</ol>,
                            li: ({ children }) => <li className="text-foreground">{children}</li>,
                            p: ({ children }) => <p className="mb-3">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 text-foreground">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-xl font-bold mb-2 text-foreground">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 text-foreground">{children}</h3>,
                          }}
                        >
                          {editContent}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <textarea
                        name="content"
                        required
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={10}
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red font-mono text-sm"
                        placeholder="Enter content here..."
                      />
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Full markdown support: **bold**, *italic*, lists, headings, etc.
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
                      className="px-6 py-2 bg-muted text-foreground rounded-md font-medium hover:bg-muted/80 transition-colors"
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
                    <h2 className="text-xl font-semibold text-foreground">{item.title}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Last updated: {formatDateForDisplay(item.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => startEditing(item)}
                    className="px-4 py-2 text-sm font-medium text-meat-red hover:bg-red-50 rounded-md transition-colors"
                  >
                    Edit
                  </button>
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <div className="prose prose-gray max-w-none text-foreground">
                    <ReactMarkdown
                      components={{
                        ul: ({ children }) => <ul className="space-y-2 list-disc ml-6">{children}</ul>,
                        ol: ({ children }) => <ol className="space-y-2 list-decimal ml-6">{children}</ol>,
                        li: ({ children }) => <li className="text-foreground">{children}</li>,
                        p: ({ children }) => <p className="mb-3">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 text-foreground">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl font-bold mb-2 text-foreground">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 text-foreground">{children}</h3>,
                      }}
                    >
                      {item.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
