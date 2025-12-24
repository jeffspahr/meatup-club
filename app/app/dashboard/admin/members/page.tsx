'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardNav from '@/components/DashboardNav';

export const runtime = 'edge';

interface Member {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  is_admin: number;
  status: string;
  created_at: string;
}

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);

  const [newMember, setNewMember] = useState({
    email: '',
    name: '',
  });

  const [editMember, setEditMember] = useState({
    user_id: 0,
    name: '',
    is_admin: false,
  });

  useEffect(() => {
    checkAdminAndFetchMembers();
  }, []);

  async function checkAdminAndFetchMembers() {
    try {
      setLoading(true);
      setError(null);

      // Check if user is admin
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (!meData.is_admin) {
          router.push('/dashboard');
          return;
        }
      } else {
        router.push('/dashboard');
        return;
      }

      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function fetchMembers() {
    try {
      setError(null);

      const res = await fetch('/api/members');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch members');
      }

      const data = await res.json();
      setMembers(data.members || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();

    if (!newMember.email.trim()) {
      setError('Email is required');
      return;
    }

    try {
      setAdding(true);
      setError(null);

      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add member');
      }

      setNewMember({ email: '', name: '' });
      setShowAddForm(false);
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteMember(memberId: number) {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      setDeleting(memberId);
      setError(null);

      const res = await fetch(`/api/members?user_id=${memberId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove member');
      }

      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setDeleting(null);
    }
  }

  function startEditing(member: Member) {
    setEditingId(member.id);
    setEditMember({
      user_id: member.id,
      name: member.name || '',
      is_admin: member.is_admin === 1,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditMember({
      user_id: 0,
      name: '',
      is_admin: false,
    });
  }

  async function handleUpdateMember(e: React.FormEvent) {
    e.preventDefault();

    try {
      setUpdating(true);
      setError(null);

      const res = await fetch('/api/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editMember),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update member');
      }

      cancelEditing();
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-8">Member Management</h1>
          <p className="text-gray-600">Loading members...</p>
        </div>
      </div>
    );
  }

  if (error && members.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-8">Member Management</h1>
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <div className="max-w-6xl mx-auto p-8">
        <Link
          href="/dashboard/admin"
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Invite User Form */}
        {showAddForm && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Invite New User</h2>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email *
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={newMember.email}
                  onChange={(e) =>
                    setNewMember({ ...newMember, email: e.target.value })
                  }
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
                  type="text"
                  value={newMember.name}
                  onChange={(e) =>
                    setNewMember({ ...newMember, name: e.target.value })
                  }
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                />
              </div>

              <button
                type="submit"
                disabled={adding}
                className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? 'Sending Invite...' : 'Send Invite'}
              </button>
            </form>
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
              {members.map((member) => (
                <tr key={member.id}>
                  {editingId === member.id ? (
                    <td colSpan={6} className="px-6 py-4">
                      <form onSubmit={handleUpdateMember} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Name
                            </label>
                            <input
                              type="text"
                              value={editMember.name}
                              onChange={(e) =>
                                setEditMember({ ...editMember, name: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Role
                            </label>
                            <select
                              value={editMember.is_admin ? 'admin' : 'member'}
                              onChange={(e) =>
                                setEditMember({ ...editMember, is_admin: e.target.value === 'admin' })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            type="submit"
                            disabled={updating}
                            className="px-6 py-2 bg-meat-red text-white rounded-md font-medium hover:bg-meat-brown disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                          >
                            {updating ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
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
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => startEditing(member)}
                          className="text-meat-red hover:text-meat-brown font-medium mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteMember(member.id)}
                          disabled={deleting === member.id}
                          className="text-red-600 hover:text-red-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deleting === member.id ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
