import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';
import { authClient } from '../services/authClient';
import { AuthSession, AuthStatus } from '../types/auth';

interface AuthScreenProps {
  status: AuthStatus;
  onAuthenticated: (session: AuthSession) => void;
  onRefreshStatus: () => void;
}

type AuthTab = 'setup' | 'login' | 'register' | 'reset';

export function AuthScreen({
  status,
  onAuthenticated,
  onRefreshStatus,
}: AuthScreenProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>(
    status.needsAdminSetup ? 'setup' : 'login'
  );
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [bootstrapPasscode, setBootstrapPasscode] = useState<string>('');
  const [resetToken, setResetToken] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const switchTab = (next: AuthTab) => {
    setActiveTab(next);
    setError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (activeTab === 'setup') {
        const session = await authClient.setupInitialAdmin({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          bootstrapPasscode: status.bootstrapPasscodeConfigured
            ? bootstrapPasscode
            : undefined,
        });
        onAuthenticated(session);
        onRefreshStatus();
      } else if (activeTab === 'login') {
        const session = await authClient.login({
          email: email.trim(),
          password,
        });
        onAuthenticated(session);
      } else if (activeTab === 'register') {
        const session = await authClient.registerTechnician({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        });
        onAuthenticated(session);
      } else if (activeTab === 'reset') {
        const res = await authClient.resetPassword({
          email: email.trim(),
          token: resetToken.trim(),
          newPassword: password,
        });
        setSuccessMsg(res.message);
        setPassword('');
        setResetToken('');
        setActiveTab('login');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Request failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { key: AuthTab; label: string }[] = status.needsAdminSetup
    ? [
        { key: 'setup', label: 'Admin Setup' },
        { key: 'login', label: 'Sign In' },
        { key: 'register', label: 'Technician Sign Up' },
      ]
    : [
        { key: 'login', label: 'Sign In' },
        { key: 'register', label: 'Technician Sign Up' },
        { key: 'reset', label: 'Reset Password' },
      ];

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto">
            <Truck className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
            VanSpare Sync
          </h1>
          <p className="text-sm text-slate-600">
            Field van inventory, restock claims, and role-based fleet access.
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          {/* Mode Switcher */}
          <div
            className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
            role="tablist"
            aria-label="Authentication mode"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => switchTab(tab.key)}
                className={`min-h-[40px] px-2 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  activeTab === tab.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'setup' && (
            <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 border border-blue-200 px-3.5 py-3 text-xs text-blue-900">
              <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Claim the initial <strong>Admin</strong> account to manage fleet
                par levels, managers, and technicians. This one-time setup locks
                automatically once created.
              </p>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-3 text-xs text-emerald-900"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {(activeTab === 'setup' || activeTab === 'register') && (
              <div>
                <label
                  htmlFor="auth-fullname"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User
                    aria-hidden="true"
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    maxLength={150}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Ah Meng Lim"
                    className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Work Email
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  id="auth-email"
                  type="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                />
              </div>
            </div>

            {activeTab === 'reset' && (
              <div>
                <label
                  htmlFor="auth-reset-token"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  One-Time Reset Token
                </label>
                <div className="relative">
                  <KeyRound
                    aria-hidden="true"
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    id="auth-reset-token"
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste token issued by Admin"
                    className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                {activeTab === 'reset' ? 'New Password' : 'Password'}
              </label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={activeTab === 'login' ? 1 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    activeTab === 'login'
                      ? 'Enter your password'
                      : 'Minimum 8 characters'
                  }
                  className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                />
              </div>
            </div>

            {activeTab === 'setup' && status.bootstrapPasscodeConfigured && (
              <div>
                <label
                  htmlFor="auth-bootstrap-passcode"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  Admin Bootstrap Passcode
                </label>
                <input
                  id="auth-bootstrap-passcode"
                  type="password"
                  required
                  value={bootstrapPasscode}
                  onChange={(e) => setBootstrapPasscode(e.target.value)}
                  placeholder="Enter configured server passcode"
                  className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                />
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-800"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white font-semibold text-sm transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {submitting
                ? 'Processing...'
                : activeTab === 'setup'
                  ? 'Create Admin Account'
                  : activeTab === 'register'
                    ? 'Create Technician Account'
                    : activeTab === 'reset'
                      ? 'Update Password'
                      : 'Sign In'}
            </button>
          </form>

          {activeTab === 'login' && !status.needsAdminSetup && (
            <div className="pt-2 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => switchTab('reset')}
                className="min-h-[40px] px-3 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-colors"
              >
                Have a reset token from Admin? Reset password
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
