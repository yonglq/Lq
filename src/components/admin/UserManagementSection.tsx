import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  UserPlus,
  Users,
} from 'lucide-react';
import { authClient } from '../../services/authClient';
import {
  AuthUser,
  UserRole,
  formatUserRole,
  getUserRoleBadgeStyle,
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
  const isAdmin = currentUser.role === 'admin';
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<UserRole>('technician');
  const [password, setPassword] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [issuedReset, setIssuedReset] = useState<{
    email: string;
    fullName: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authClient.listUsers(authToken);
      setUsers(res.users);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load team accounts.'
      );
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await authClient.createUser(authToken, {
        full_name: fullName.trim(),
        email: email.trim(),
        role,
        password,
      });
      setUsers((prev) => [res.user, ...prev]);
      setFullName('');
      setEmail('');
      setRole('technician');
      setPassword('');
      setShowAddForm(false);
      onNotify({
        tone: 'success',
        title: `Created ${formatUserRole(res.user.role)} account`,
        description: `${res.user.full_name} (${res.user.email}) is now active.`,
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to create user.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (user: AuthUser, nextRole: UserRole) => {
    try {
      const res = await authClient.updateUser(authToken, user.id, {
        role: nextRole,
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      onNotify({
        tone: 'info',
        title: `Updated role for ${res.user.full_name}`,
        description: `Assigned role: ${formatUserRole(res.user.role)}.`,
      });
    } catch (err) {
      onNotify({
        tone: 'warning',
        title: 'Role update blocked',
        description:
          err instanceof Error ? err.message : 'Unable to update user role.',
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
          ? `Reactivated ${res.user.full_name}`
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

  const handleIssueResetToken = async (user: AuthUser) => {
    try {
      const res = await authClient.issueResetToken(authToken, user.id);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      setIssuedReset({
        email: user.email,
        fullName: user.full_name,
        token: res.resetToken,
        expiresAt: res.expiresAt,
      });
      setCopied(false);
    } catch (err) {
      onNotify({
        tone: 'warning',
        title: 'Could not issue reset token',
        description:
          err instanceof Error ? err.message : 'Please try again later.',
      });
    }
  };

  const handleCopyToken = async () => {
    if (!issuedReset) return;
    try {
      await navigator.clipboard.writeText(issuedReset.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-700" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Team Accounts & Access Roles
              </h2>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {isAdmin
                ? 'Manage Admin, Manager, and Technician accounts, active status, and one-time password resets.'
                : 'Read-only directory of active fleet personnel and access roles.'}
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setFormError(null);
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <UserPlus className="w-4 h-4" />
              <span>{showAddForm ? 'Close User Form' : 'Add Team Member'}</span>
            </button>
          )}
        </div>

        {/* Issued One-Time Reset Token Banner */}
        {issuedReset && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-900">
                One-time reset token for {issuedReset.fullName} (
                {issuedReset.email})
              </p>
              <button
                type="button"
                onClick={() => setIssuedReset(null)}
                className="text-xs font-semibold text-amber-800 hover:text-amber-950"
              >
                Dismiss
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-[200px] bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 break-all">
                {issuedReset.token}
              </code>
              <button
                type="button"
                onClick={handleCopyToken}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Token</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-amber-800">
              Valid for 30 minutes. Only the SHA-256 hash is stored on the
              server.
            </p>
          </div>
        )}

        {/* Admin Add Team Member Form */}
        {isAdmin && showAddForm && (
          <form
            onSubmit={handleCreateUser}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900">
              Create Team Member Account
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="new-user-fullname"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Full Name
                </label>
                <input
                  id="new-user-fullname"
                  type="text"
                  required
                  maxLength={150}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Jason Tan"
                  className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                />
              </div>
              <div>
                <label
                  htmlFor="new-user-email"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Email
                </label>
                <input
                  id="new-user-email"
                  type="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jason@company.com"
                  className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                />
              </div>
              <div>
                <label
                  htmlFor="new-user-role"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Role
                </label>
                <select
                  id="new-user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                >
                  <option value="technician">Technician</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="new-user-password"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Initial Password
                </label>
                <input
                  id="new-user-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                />
              </div>
            </div>
            {formError && (
              <p role="alert" className="text-xs font-medium text-rose-700">
                {formError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Loading team accounts...
        </div>
      ) : loadError ? (
        <div className="p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-rose-700">{loadError}</p>
          <button
            type="button"
            onClick={fetchUsers}
            className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6">Team Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 whitespace-nowrap">Created</th>
                {isAdmin && (
                  <th className="py-3 px-6 text-right whitespace-nowrap">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="py-3.5 px-6">
                    <p className="font-semibold text-slate-900">
                      {user.full_name}
                      {user.id === currentUser.id && (
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
                    {isAdmin ? (
                      <select
                        value={user.role}
                        onChange={(e) =>
                          handleRoleChange(user, e.target.value as UserRole)
                        }
                        aria-label={`Change role for ${user.full_name}`}
                        className="min-h-[40px] bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="technician">Technician</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${getUserRoleBadgeStyle(user.role)}`}
                      >
                        {formatUserRole(user.role)}
                      </span>
                    )}
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
                  {isAdmin && (
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleIssueResetToken(user)}
                          className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap"
                        >
                          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Reset Token</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(user)}
                          className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap"
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
