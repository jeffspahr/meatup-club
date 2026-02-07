import { Form, Link, redirect, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/dashboard.admin.email-templates";
import { requireAdmin } from "../lib/auth.server";
import { Alert, Badge, Button, Card, PageHeader } from "../components/ui";
import type { EmailTemplate } from "../lib/types";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  // Fetch all email templates
  const templatesResult = await db
    .prepare('SELECT * FROM email_templates ORDER BY is_default DESC, created_at DESC')
    .all();

  return { templates: templatesResult.results || [] };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'create' || actionType === 'update') {
    const id = formData.get('id');
    const name = formData.get('name');
    const subject = formData.get('subject');
    const html_body = formData.get('html_body');
    const text_body = formData.get('text_body');
    const is_default = formData.get('is_default') === 'true';

    if (!name || !subject || !html_body || !text_body) {
      return { error: 'All fields are required' };
    }

    try {
      // If setting as default, unset all other defaults
      if (is_default) {
        await db
          .prepare('UPDATE email_templates SET is_default = 0')
          .run();
      }

      if (actionType === 'create') {
        await db
          .prepare('INSERT INTO email_templates (name, subject, html_body, text_body, is_default) VALUES (?, ?, ?, ?, ?)')
          .bind(name, subject, html_body, text_body, is_default ? 1 : 0)
          .run();
      } else {
        await db
          .prepare('UPDATE email_templates SET name = ?, subject = ?, html_body = ?, text_body = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(name, subject, html_body, text_body, is_default ? 1 : 0, id)
          .run();
      }

      return redirect('/dashboard/admin/email-templates');
    } catch (err) {
      console.error('Template save error:', err);
      return { error: 'Failed to save template' };
    }
  }

  if (actionType === 'delete') {
    const id = formData.get('id');

    if (!id) {
      return { error: 'Template ID is required' };
    }

    try {
      // Check if it's the default template
      const template = await db
        .prepare('SELECT is_default FROM email_templates WHERE id = ?')
        .bind(id)
        .first();

      if (template && template.is_default === 1) {
        return { error: 'Cannot delete the default template' };
      }

      await db
        .prepare('DELETE FROM email_templates WHERE id = ?')
        .bind(id)
        .run();

      return redirect('/dashboard/admin/email-templates');
    } catch (err) {
      return { error: 'Failed to delete template' };
    }
  }

  if (actionType === 'set_default') {
    const id = formData.get('id');

    if (!id) {
      return { error: 'Template ID is required' };
    }

    try {
      // Unset all defaults
      await db
        .prepare('UPDATE email_templates SET is_default = 0')
        .run();

      // Set new default
      await db
        .prepare('UPDATE email_templates SET is_default = 1 WHERE id = ?')
        .bind(id)
        .run();

      return redirect('/dashboard/admin/email-templates');
    } catch (err) {
      return { error: 'Failed to set default template' };
    }
  }

  return { error: 'Invalid action' };
}

export default function AdminEmailTemplatesPage({ loaderData, actionData }: Route.ComponentProps) {
  const { templates } = loaderData;
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    html_body: '',
    text_body: '',
    is_default: false,
  });
  const navigation = useNavigation();
  const submittedActionRef = useRef<string | null>(null);

  function startCreate() {
    setEditingTemplate(null);
    setFormData({
      name: '',
      subject: '',
      html_body: '',
      text_body: '',
      is_default: false,
    });
    setShowForm(true);
  }

  function startEdit(template: EmailTemplate) {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      html_body: template.html_body,
      text_body: template.text_body,
      is_default: template.is_default === 1,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingTemplate(null);
    setFormData({
      name: '',
      subject: '',
      html_body: '',
      text_body: '',
      is_default: false,
    });
  }

  useEffect(() => {
    if (navigation.state === 'submitting' && navigation.formData) {
      const action = navigation.formData.get('_action');
      if (action === 'create' || action === 'update') {
        submittedActionRef.current = action;
      }
    }
  }, [navigation.state, navigation.formData]);

  useEffect(() => {
    if (navigation.state === 'idle' && submittedActionRef.current) {
      submittedActionRef.current = null;
      if (!actionData?.error) {
        cancelForm();
      }
    }
  }, [actionData, navigation.state]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        to="/dashboard/admin"
        className="inline-flex items-center text-accent hover:text-accent-strong mb-6 font-medium"
      >
        ← Back to Admin
      </Link>

      <PageHeader
        title="Email Templates"
        description={`Manage invitation email templates. Use ${'{{inviteeName}}'}, ${'{{inviterName}}'}, and ${'{{acceptLink}}'} as variables.`}
        actions={
          <Button onClick={() => startCreate()}>
            + New Template
          </Button>
        }
      />

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      {/* Template Form */}
      {showForm && (
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">
            {editingTemplate ? 'Edit Template' : 'Create New Template'}
          </h2>
          <Form method="post" className="space-y-4">
            <input
              type="hidden"
              name="_action"
              value={editingTemplate ? 'update' : 'create'}
            />
            {editingTemplate && (
              <input type="hidden" name="id" value={editingTemplate.id} />
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
                Template Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Default Invitation"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-foreground mb-1">
                Email Subject *
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="🥩 You're invited to join Meatup.Club!"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="html_body" className="block text-sm font-medium text-foreground mb-1">
                HTML Body *
              </label>
              <textarea
                id="html_body"
                name="html_body"
                required
                value={formData.html_body}
                onChange={(e) => setFormData({ ...formData, html_body: e.target.value })}
                rows={15}
                placeholder="HTML email template..."
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
              />
            </div>

            <div>
              <label htmlFor="text_body" className="block text-sm font-medium text-foreground mb-1">
                Plain Text Body *
              </label>
              <textarea
                id="text_body"
                name="text_body"
                required
                value={formData.text_body}
                onChange={(e) => setFormData({ ...formData, text_body: e.target.value })}
                rows={10}
                placeholder="Plain text email template..."
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
              />
            </div>

            <div className="flex items-center">
              <input
                id="is_default"
                name="is_default"
                type="checkbox"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                value="true"
                className="w-4 h-4 text-accent border-border rounded focus:ring-accent"
              />
              <label htmlFor="is_default" className="ml-2 text-sm text-foreground">
                Set as default template
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit">
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={cancelForm}
              >
                Cancel
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* Templates List */}
      <div className="space-y-4">
        {templates.map((template: any) => (
          <Card key={template.id} className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{template.name}</h3>
                  {template.is_default === 1 && (
                    <Badge variant="accent">Default</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Subject: {template.subject}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Last updated: {new Date(template.updated_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                {template.is_default !== 1 && (
                  <Form method="post" className="inline">
                    <input type="hidden" name="_action" value="set_default" />
                    <input type="hidden" name="id" value={template.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      Set as Default
                    </Button>
                  </Form>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(template)}
                >
                  Edit
                </Button>
                {template.is_default !== 1 && (
                  <Form method="post" className="inline">
                    <input type="hidden" name="_action" value="delete" />
                    <input type="hidden" name="id" value={template.id} />
                    <Button
                      variant="danger"
                      size="sm"
                      type="submit"
                      onClick={(e) => {
                        if (!confirm('Are you sure you want to delete this template?')) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </Form>
                )}
              </div>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground hover:text-accent">
                Preview Template
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">HTML Preview:</h4>
                  <div
                    className="border border-border rounded p-3 bg-muted max-h-64 overflow-auto text-xs"
                    dangerouslySetInnerHTML={{ __html: template.html_body }}
                  />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Plain Text:</h4>
                  <pre className="border border-border rounded p-3 bg-muted max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                    {template.text_body}
                  </pre>
                </div>
              </div>
            </details>
          </Card>
        ))}
      </div>
    </main>
  );
}
