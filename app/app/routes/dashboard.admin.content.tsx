import { Form, Link, redirect, useNavigation } from "react-router";
import { formatDateForDisplay } from "../lib/dateUtils";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/dashboard.admin.content";
import { requireAdmin } from "../lib/auth.server";
import ReactMarkdown from 'react-markdown';
import type { ContentItem } from "../lib/types";
import { Alert, Button, Card, PageHeader } from "../components/ui";
import { AdminLayout } from "../components/AdminLayout";

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
  const navigation = useNavigation();
  const submittedActionRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (navigation.state === 'submitting' && navigation.formData) {
      const action = navigation.formData.get('_action');
      if (action === 'update') {
        submittedActionRef.current = 'update';
      }
    }
  }, [navigation.state, navigation.formData]);

  useEffect(() => {
    if (navigation.state === 'idle' && submittedActionRef.current === 'update') {
      submittedActionRef.current = null;
      if (!actionData?.error) {
        cancelEditing();
      }
    }
  }, [actionData, navigation.state]);

  return (
    <AdminLayout>
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Site Content Management"
        description="Edit the club's description, goals, guidelines, and other information"
      />

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      <div className="space-y-6">
        {content.map((item: any) => (
          <Card key={item.id} className="overflow-hidden">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                      >
                        {showPreview ? 'Edit' : 'Preview'}
                      </Button>
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
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                        placeholder="Enter content here..."
                      />
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Full markdown support: **bold**, *italic*, lists, headings, etc.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button type="submit">
                      Save Changes
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </Button>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing(item)}
                  >
                    Edit
                  </Button>
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
          </Card>
        ))}
      </div>
    </main>
    </AdminLayout>
  );
}
