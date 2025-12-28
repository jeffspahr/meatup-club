import { Form, Link, redirect, useSubmit } from "react-router";
import { formatDateForDisplay } from "../lib/dateUtils";
import { useState } from "react";
import type { Route } from "./+types/dashboard.admin.members";
import { requireAdmin } from "../lib/auth.server";
import { sendInviteEmail } from "../lib/email.server";
import { forceUserReauth } from "../lib/db.server";

interface Member {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  is_admin: number;
  status: string;
  created_at: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  // Fetch all members
  const membersResult = await db
    .prepare('SELECT * FROM users ORDER BY created_at DESC')
    .all();

  // Fetch email templates for invite form
  const templatesResult = await db
    .prepare('SELECT id, name, is_default FROM email_templates ORDER BY is_default DESC, name ASC')
    .all();

  return {
    members: membersResult.results || [],
    templates: templatesResult.results || []
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'invite') {
    const email = formData.get('email');
    const name = formData.get('name');
    const templateId = formData.get('template_id');

    if (!email) {
      return { error: 'Email is required' };
    }

    try {
      // Check if user already exists
      const existingUser = await db
        .prepare('SELECT id FROM users WHERE email = ?')
        .bind(email)
        .first();

      if (existingUser) {
        return { error: 'User with this email already exists' };
      }

      // Create invited user
      const result = await db
        .prepare('INSERT INTO users (email, name, status) VALUES (?, ?, ?)')
        .bind(email, name || null, 'invited')
        .run();

      // Send invitation email if Resend API key is configured
      const resendApiKey = context.cloudflare.env.RESEND_API_KEY;

      if (resendApiKey) {
        // Fetch the selected template (or default if none selected)
        let template;
        if (templateId) {
          template = await db
            .prepare('SELECT * FROM email_templates WHERE id = ?')
            .bind(templateId)
            .first();
        } else {
          template = await db
            .prepare('SELECT * FROM email_templates WHERE is_default = 1 LIMIT 1')
            .first();
        }

        if (!template) {
          return { error: 'Email template not found' };
        }

        const url = new URL(request.url);
        const acceptLink = `${url.origin}/accept-invite?email=${encodeURIComponent(email as string)}`;

        const emailResult = await sendInviteEmail({
          to: email as string,
          inviteeName: (name as string) || null,
          inviterName: admin.name || admin.email,
          acceptLink,
          resendApiKey,
          template: {
            subject: template.subject,
            html: template.html_body,
            text: template.text_body,
          },
        });

        if (!emailResult.success) {
          console.error('Failed to send invitation email:', emailResult.error);
          // Still continue - user was created, just email failed
          return {
            success: true,
            warning: 'User invited but email failed to send. Share the invite link manually.',
            inviteLink: acceptLink
          };
        }
      }

      return redirect('/dashboard/admin/members');
    } catch (err) {
      console.error('Invite error:', err);
      return { error: 'Failed to invite member' };
    }
  }

  if (actionType === 'update') {
    const user_id = formData.get('user_id');
    const name = formData.get('name');
    const is_admin = formData.get('is_admin') === 'true';

    if (!user_id) {
      return { error: 'User ID is required' };
    }

    try {
      await db
        .prepare('UPDATE users SET name = ?, is_admin = ? WHERE id = ?')
        .bind(name || null, is_admin ? 1 : 0, user_id)
        .run();

      return redirect('/dashboard/admin/members');
    } catch (err) {
      return { error: 'Failed to update member' };
    }
  }

  if (actionType === 'delete') {
    const user_id = formData.get('user_id');

    if (!user_id) {
      return { error: 'User ID is required' };
    }

    try {
      // Delete user's votes and suggestions first (cascade)
      await db
        .prepare('DELETE FROM restaurant_votes WHERE user_id = ?')
        .bind(user_id)
        .run();

      await db
        .prepare('DELETE FROM date_votes WHERE user_id = ?')
        .bind(user_id)
        .run();

      // Note: Restaurants are global and persist even when user is deleted
      // The created_by field will remain to preserve history

      await db
        .prepare('DELETE FROM date_suggestions WHERE user_id = ?')
        .bind(user_id)
        .run();

      // Delete the user
      await db
        .prepare('DELETE FROM users WHERE id = ?')
        .bind(user_id)
        .run();

      return redirect('/dashboard/admin/members');
    } catch (err) {
      return { error: 'Failed to remove member' };
    }
  }

  if (actionType === 'force_reauth') {
    const user_id = formData.get('user_id');

    if (!user_id) {
      return { error: 'User ID is required' };
    }

    try {
      await forceUserReauth(db, Number(user_id));
      return { success: 'User will be forced to re-login on their next page load' };
    } catch (err) {
      return { error: 'Failed to force re-authentication' };
    }
  }

  return { error: 'Invalid action' };
}

export default function AdminMembersPage({ loaderData, actionData }: Route.ComponentProps) {
  const { members, templates } = loaderData;
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    user_id: 0,
    name: '',
    is_admin: false,
  });
  const submit = useSubmit();

  function startEditing(member: any) {
    setEditingId(member.id);
    setEditData({
      user_id: member.id,
      name: member.name || '',
      is_admin: member.is_admin === 1,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditData({
      user_id: 0,
      name: '',
      is_admin: false,
    });
  }

  function handleDelete(memberId: number) {
    if (!confirm('Are you sure you want to remove this member? This will also delete all their votes and suggestions.')) {
      return;
    }

    const formData = new FormData();
    formData.append('_action', 'delete');
    formData.append('user_id', memberId.toString());
    submit(formData, { method: 'post' });
  }

  function handleForceReauth(memberId: number, memberName: string) {
    if (!confirm(`Force ${memberName} to re-login? Their session will be invalidated and they'll need to sign in again with Google OAuth.`)) {
      return;
    }

    const formData = new FormData();
    formData.append('_action', 'force_reauth');
    formData.append('user_id', memberId.toString());
    submit(formData, { method: 'post' });
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        to="/dashboard/admin"
        className="inline-flex items-center text-meat-red hover:text-meat-brown mb-6 font-medium"
      >
        ← Back to Admin
      </Link>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Member Management</h1>
          <p className="text-gray-600 mt-1">
            Total members: {members.length}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Invite User'}
        </button>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
          {actionData.error}
        </div>
      )}

      {actionData?.success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-6">
          {actionData.success}
        </div>
      )}

      {actionData?.warning && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-6">
          <p className="font-semibold mb-2">{actionData.warning}</p>
          {actionData.inviteLink && (
            <div className="mt-2">
              <p className="text-sm mb-1">Share this link with the invitee:</p>
              <code className="bg-yellow-100 px-2 py-1 rounded text-xs break-all">
                {actionData.inviteLink}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Invite User Form */}
      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Invite New User</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="invite" />

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="member@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
              />
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Name (Optional)
              </label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="John Doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
              />
            </div>

            <div>
              <label
                htmlFor="template_id"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email Template
              </label>
              <select
                id="template_id"
                name="template_id"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
              >
                {templates.map((template: any) => (
                  <option
                    key={template.id}
                    value={template.id}
                    selected={template.is_default === 1}
                  >
                    {template.name}{template.is_default === 1 ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Choose which email template to send. <Link to="/dashboard/admin/email-templates" className="text-meat-red hover:underline">Manage templates</Link>
              </p>
            </div>

            <button
              type="submit"
              className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown transition-colors"
            >
              Send Invite
            </button>
          </Form>
        </div>
      )}

      {/* Members List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members.map((member: any) => (
              <tr key={member.id}>
                {editingId === member.id ? (
                  <td colSpan={6} className="px-6 py-4">
                    <Form method="post" className="space-y-4">
                      <input type="hidden" name="_action" value="update" />
                      <input type="hidden" name="user_id" value={editData.user_id} />

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Name
                          </label>
                          <input
                            name="name"
                            type="text"
                            value={editData.name}
                            onChange={(e) =>
                              setEditData({ ...editData, name: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Role
                          </label>
                          <select
                            name="is_admin"
                            value={editData.is_admin ? 'true' : 'false'}
                            onChange={(e) =>
                              setEditData({ ...editData, is_admin: e.target.value === 'true' })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                          >
                            <option value="false">Member</option>
                            <option value="true">Admin</option>
                          </select>
                        </div>
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
                  </td>
                ) : (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {member.picture ? (
                          <img
                            src={member.picture}
                            alt={member.name || ''}
                            className="w-10 h-10 rounded-full mr-3"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 mr-3 flex items-center justify-center text-gray-600 font-semibold">
                            {(member.name || member.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div className="font-medium text-gray-900">
                          {member.name || 'No name'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {member.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {member.is_admin ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-meat-red text-white">
                          Admin
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-700">
                          Member
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {member.status === 'active' ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Invited
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDateForDisplay(member.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => startEditing(member)}
                        className="text-meat-red hover:text-meat-brown font-medium mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleForceReauth(member.id, member.name || member.email)}
                        className="text-blue-600 hover:text-blue-900 font-medium mr-4"
                        title="Force user to re-login with OAuth"
                      >
                        Re-login
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
                        className="text-red-600 hover:text-red-900 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
