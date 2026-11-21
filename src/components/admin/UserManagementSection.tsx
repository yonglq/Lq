import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { authClient } from '../../services/authClient';
import {
  AuthUser,
  UserLevel,
  formatUserLevel,
} from '../../types/auth';

interface UserManagementSectionProps {
  currentUser: AuthUser;
  authToken: string;
  onNotify: (toast: {
    tone: 'success' | 'info' | 'warning';
    title: string;
    description?: string;
  }) => void;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function UserManagementSection({
  currentUser,
  authToken,
  onNotify,
}: UserManagementSectionProps) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authClient.listUsers(authToken);
      setUsers(res.users);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load registered users.'
      );
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (currentUser.level === 1) {
      fetchUsers();
    }
  }, [currentUser.level, fetchUsers]);

  // Strict UI safeguard: never render User Management for Level 2 or Level 3
  if (currentUser.level !== 1) {
    return null;
  }

  const handleLevelChange = async (user: AuthUser, nextLevel: UserLevel) => {
    try {
      const res = await authClient.updateUser(authToken, user.id, {
        level: nextLevel,
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      onNotify({
        tone: 'info',
        title: `Updated access level for ${res.user.full_name}`,
        description: `Assigned ${formatUserLevel(res.user.level)}.`,
      });
    } catch (err) {
      onNotify({
        tone: 'warning',
        title: 'Level update blocked',
        description:
          err instanceof Error ? err.message : 'Unable to update user level.',
      });
    }
  };

  const handleToggleActive = async (user: AuthUser) => {
    try {
      const res = await authClient.updateUser(authToken, user.id, {
        is_active: !user.is_active,
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      onNotify({
        tone: 'info',
        title: res.user.is_active
          ? `Activated ${res.user.full_name}`
          : `Deactivated ${res.user.full_name}`,
      });
    } catch (err) {
      onNotify({
        tone: 'warning',
        title: 'Status update blocked',
        description:
          err instanceof Error ? err.message : 'Unable to change user status.',
      });
    }
  };

  const handleDeleteUser = async (user: AuthUser) => {
    try {
      await authClient.deleteUser(authToken, user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setConfirmDeleteId(null);
      onNotify({
        tone: 'info',
        title: `Deleted account for ${user.full_name}`,
        description: `${user.email} has been permanently removed.`,
      });
    } catch (err) {
      setConfirmDeleteId(null);
      onNotify({
        tone: 'warning',
        title: 'Delete blocked',
        description:
          err instanceof Error ? err.message : 'Unable to delete user account.',
      });
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="w-5 h-5 text-blue-700 shrink-0"
              aria-hidden="true"
            />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              User Management
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Level 1 Admin exclusive panel. Manage real, email-verified accounts across Levels 1–3.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </span>
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Loading registered users...
        </div>
      ) : loadError ? (
        <div className="p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-rose-700">{loadError}</p>
          <button
            type="button"
            onClick={fetchUsers}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      ) : users.length === 0 ? (
        <div className="p-10 text-center">
          <Users
            className="w-8 h-8 text-slate-300 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-slate-700">
            No registered users yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Only real, email-verified users appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-6">User</th>
                  <th className="py-3 px-4">Access Level</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 whitespace-nowrap">Joined</th>
                  <th className="py-3 px-6 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {users.map((user) => {
                  const isSelf = user.id === currentUser.id;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-6">
                        <p className="font-semibold text-slate-900">
                          {user.full_name}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              (You)
                            </span>
                          )}
                        </p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          {user.email}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={user.level}
                          onChange={(e) =>
                            handleLevelChange(
                              user,
                              Number(e.target.value) as UserLevel
                            )
                          }
                          aria-label={`Change access level for ${user.full_name}`}
                          className="min-h-[40px] bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                        >
                          <option value={1}>Level 1 — Admin</option>
                          <option value={2}>Level 2 — Manager</option>
                          <option value={3}>Level 3 — Technician</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                            user.is_active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(user)}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            {user.is_active ? 'Deactivate' : 'Activate'}
                          </button>

                          {!isSelf &&
                            (confirmDeleteId === user.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user)}
                                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold whitespace-nowrap"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 whitespace-nowrap"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(user.id)}
                                aria-label={`Delete ${user.full_name}`}
                                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y divide-slate-200">
            {users.map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <div key={user.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {user.full_name}
                        {isSelf && (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-xs font-mono text-slate-500 truncate mt-0.5">
                        {user.email}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
                        user.is_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={user.level}
                      onChange={(e) =>
                        handleLevelChange(
                          user,
                          Number(e.target.value) as UserLevel
                        )
                      }
                      aria-label={`Change access level for ${user.full_name}`}
                      className="flex-1 min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                    >
                      <option value={1}>Level 1 — Admin</option>
                      <option value={2}>Level 2 — Manager</option>
                      <option value={3}>Level 3 — Technician</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(user)}
                      className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 whitespace-nowrap"
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>

                    {!isSelf &&
                      (confirmDeleteId === user.id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          className="min-h-[44px] px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold whitespace-nowrap"
                        >
                          Confirm Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(user.id)}
                          aria-label={`Delete ${user.full_name}`}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
